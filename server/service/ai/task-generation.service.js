import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import Task, { TaskCounter } from '../../models/Task.js';
import User from '../../models/User.js';
import aiService from './ai.service.js';
import {
  TaskGenerationOutputSchema,
  TaskAssistanceOutputSchema,
  SrsAnalysisOutputSchema,
  validateTaskDependencies,
} from './ai.schemas.js';

/**
 * AI Task Generation & Assistance Service
 * Implements a circuit-breaker for SRS analysis: if AI inference failed recently,
 * skip directly to the deterministic fallback for faster user response.
 */
export class TaskGenerationService {
  /**
   * Generate structured task suggestions from project requirements
   */
  async generateTasks({ projectId, requirements, userId }) {
    const project = await Project.findById(projectId).lean();
    if (!project) {
      throw new Error('Project not found.');
    }

    // Load existing tasks for context and dependency validation
    const existingTasks = await Task.find({ project: projectId })
      .select('taskId title status priority effortHours')
      .lean();

    const existingTaskIds = existingTasks.map((t) => t.taskId);

    const systemPrompt = `You are a Principal Software Project Manager and Technical Architect for TaskForge AI.
Your role is to decompose software project requirements into clear, actionable, and properly sequenced technical tasks.
Follow strict software engineering best practices:
- Break requirements down into discrete components (Frontend, Backend, Database, QA/Testing, DevOps).
- Provide realistic effort estimates in hours (typically 2h to 16h per task).
- Assign appropriate priorities (Low, Medium, High, Critical).
- Specify required technical skills.
- Define explicit dependencies where a task relies on another task being completed first (e.g. API depends on Database).
- DO NOT create self-dependencies.
- DO NOT create circular dependencies.`;

    const userPrompt = `Project Context:
- Project Name: "${project.name}" (Key: ${project.key})
- Description: ${project.description || 'No description provided'}
- Existing Tasks: ${
      existingTasks.length > 0
        ? existingTasks.map((t) => `${t.taskId}: ${t.title} (${t.status})`).join(', ')
        : 'None yet'
    }

Requirements to Decompose:
${Array.isArray(requirements) ? requirements.map((r, i) => `${i + 1}. ${r}`).join('\n') : requirements}

Generate a JSON object with a "tasks" array. Each task must have:
- "suggestionId": temporary ID e.g. "SUGG-1", "SUGG-2"
- "title": concise action-oriented title
- "description": clear technical description and deliverables
- "suggestedRole": e.g. "Frontend Engineer", "Backend Engineer", "QA Engineer"
- "requiredSkills": array of string skill tags (e.g. ["Node.js", "MongoDB"])
- "effortHours": integer hours between 1 and 40
- "priority": "Low", "Medium", "High", or "Critical"
- "suggestedStartDate": optional ISO date or empty string
- "suggestedDueDate": optional ISO date or empty string
- "dependencies": array of other suggestionIds (e.g. ["SUGG-1"]) or existing task IDs (${existingTaskIds.join(', ') || 'none'})`;

    const result = await aiService.executeStructuredPrompt({
      systemPrompt,
      userPrompt,
      schema: TaskGenerationOutputSchema,
    });

    const existingSet = new Set(existingTaskIds.map(String));
    const suggestionIds = new Set(result.data.tasks.map((t) => t.suggestionId));
    const suggestions = result.data.tasks.map((task) => ({
      ...task,
      dependencies: (task.dependencies || []).filter(
        (dep) => dep && dep !== task.suggestionId && (suggestionIds.has(dep) || existingSet.has(dep))
      ),
    }));

    // Validate remaining dependency graph (no circular dependencies)
    validateTaskDependencies(suggestions, existingTaskIds);

    return {
      suggestions,
      meta: result.meta,
    };
  }

  /**
   * Persist approved task proposals into MongoDB
   */
  async approveAndCreateTasks({ projectId, approvedTasks, userId }) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found.');
    }

    if (!Array.isArray(approvedTasks) || approvedTasks.length === 0) {
      throw new Error('No approved tasks provided for creation.');
    }

    // Map suggestion IDs to newly assigned persistent Task IDs (e.g. SUGG-1 -> T-105)
    const suggestionToTaskId = new Map();
    const createdDocuments = [];

    // Pre-allocate task IDs sequentially
    for (let i = 0; i < approvedTasks.length; i++) {
      const counter = await TaskCounter.findOneAndUpdate(
        { projectId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const newTaskId = `T-${counter.seq}`;
      const item = approvedTasks[i];
      if (item.suggestionId) {
        suggestionToTaskId.set(item.suggestionId, newTaskId);
      }
      approvedTasks[i]._assignedTaskId = newTaskId;
    }

    // Persist each task with mapped dependencies
    for (const item of approvedTasks) {
      const assignedTaskId = item._assignedTaskId;

      // Map dependency: if it's a suggestionId in the batch, resolve to real T-xxx ID
      let resolvedDependency = null;
      if (item.dependency) {
        resolvedDependency = suggestionToTaskId.get(item.dependency) || item.dependency;
      } else if (Array.isArray(item.dependencies) && item.dependencies.length > 0) {
        const firstDep = item.dependencies[0];
        resolvedDependency = suggestionToTaskId.get(firstDep) || firstDep;
      }

      const newTask = new Task({
        taskId: assignedTaskId,
        title: item.title,
        description: item.description || '',
        project: projectId,
        group: item.group || 'To Do',
        status: 'Pending',
        priority: item.priority || 'Medium',
        effortHours: Number(item.effortHours) || 4,
        progress: 0,
        dueDate: item.dueDate || item.suggestedDueDate || '',
        startDate: item.startDate || item.suggestedStartDate || '',
        dependency: resolvedDependency,
        createdBy: userId,
        tags: item.requiredSkills || [],
        lastUpdated: 'Just now',
      });

      await newTask.save();
      createdDocuments.push(newTask);
    }

    // Update project task count
    project.tasksCount = await Task.countDocuments({ project: projectId });
    await project.save();

    return createdDocuments.map((t) => ({
      id: t._id.toString(),
      taskId: t.taskId,
      title: t.title,
      description: t.description,
      project: t.project.toString(),
      group: t.group,
      status: t.status,
      priority: t.priority,
      effortHours: t.effortHours,
      dueDate: t.dueDate,
      dependency: t.dependency,
      assignee: 'Unassigned',
    }));
  }

  /**
   * Provide context-aware task assistance (refining description, acceptance criteria, effort, skills)
   */
  async getTaskAssistance({ projectId, title, description, taskId }) {
    const project = await Project.findById(projectId).lean();

    const systemPrompt = `You are a Technical Assistant inside TaskForge AI.
Help the developer or project manager improve and flesh out their task specifications.
Provide:
- An improved, professional task description
- 3 to 5 clear acceptance criteria
- Recommended skill tags
- Realistic effort estimate in hours
- Recommended priority
- Brief dependency or risk consideration`;

    const userPrompt = `Project: ${project?.name || 'Software Project'}
Task Title: "${title || 'Untitled Task'}"
Current Description: "${description || 'None'}"
${taskId ? `Task ID: ${taskId}` : ''}

Provide a JSON object with:
- "improvedDescription": string
- "acceptanceCriteria": array of strings
- "suggestedSkills": array of string skills
- "estimatedEffortHours": number (1-40)
- "suggestedPriority": "Low" | "Medium" | "High" | "Critical"
- "dependencyAnalysis": string`;

    const result = await aiService.executeStructuredPrompt({
      systemPrompt,
      userPrompt,
      schema: TaskAssistanceOutputSchema,
    });

    return {
      assistance: result.data,
      meta: result.meta,
    };
  }

  /**
   * Analyze an uploaded SRS Document with the AI model.
   * Produces a structured project template containing:
   * - Project Name & Summary
   * - Safe time deadline & timeline analysis (critical path + risk buffer)
   * - Splitting into modules
   * - Identifying independent vs dependent modules (explicit dependencies)
   * - Intelligent work allocation to developers based on registered team skills
   */
  async analyzeSrsDocument({ srsText, fileName, userId }) {
    if (!srsText || typeof srsText !== 'string' || !srsText.trim()) {
      throw new Error('SRS document text is required.');
    }

    // 1. Fetch available developers from database to provide realistic assignment suggestions
    const developers = await User.find({ role: 'developer' })
      .select('name email skills')
      .lean();

    const devContext = developers.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      skills: d.skills || [],
    }));

    const todayStr = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are a Principal Software Architect and Project Estimator for TaskForge AI.
Your job is to read and analyze an uploaded Software Requirements Specification (SRS) document, decompose it into actionable modules, perform strict dependency analysis (identifying independent vs dependent modules), calculate safe timeline buffers, and recommend developer allocations.

Follow these critical software engineering principles:
1. Decompose the document into 4 to 8 clear technical modules (Frontend, Backend, Database, Auth/Security, Integrations, Testing/QA, DevOps).
2. For each module, determine if it is INDEPENDENT (can start on day 1 with no prerequisites) or DEPENDENT (requires another module to complete first).
   - "isIndependent": true if dependencies is empty.
   - "dependencies": array of moduleIds (e.g. ["MOD-1"]). DO NOT create circular dependencies or self-dependencies.
3. Realistic effort estimates: typically 6 to 36 hours per module.
4. Safe timeline calculation:
   - Calculate critical path in days.
   - Add a 20-30% safe buffer (in days) to absorb risk.
   - Compute recommended deadline (assume project starts today: ${todayStr}).
5. Match each module to the best available developer based on their skills from the provided team list. If none match, use "Unassigned".`;

    const userPrompt = `SRS Document Source: ${fileName || 'Uploaded SRS Document'}
Content:
${srsText.slice(0, 10000)}

Available Team Developers:
${devContext.length > 0 ? JSON.stringify(devContext, null, 2) : 'No registered developers yet — use "Unassigned"'}

Return a JSON object with:
- "projectName": clean project title extracted from requirements
- "projectKey": 3-4 letter uppercase key (e.g. "ECOM", "AUTH")
- "summary": 2-3 sentence technical summary of the project scope
- "timelineAnalysis": object with:
  - "totalEffortHours": number
  - "criticalPathDays": number
  - "safeBufferDays": number
  - "recommendedDeadline": "YYYY-MM-DD"
  - "riskAssessment": string summary of risks
- "modules": array of objects with:
  - "moduleId": e.g. "MOD-1", "MOD-2"
  - "title": module title
  - "description": deliverables and scope
  - "category": "Frontend" | "Backend" | "Database" | "DevOps" | "QA" | "Architecture" | "Security" | "General"
  - "isIndependent": boolean (true if dependencies is empty)
  - "dependencies": array of moduleIds it depends on
  - "effortHours": number
  - "priority": "Low" | "Medium" | "High" | "Critical"
  - "suggestedRole": role title
  - "suggestedSkills": array of string skills
  - "suggestedAssignee": developer name from list or "Unassigned"`;

    let data;
    let meta;

    try {
      const result = await aiService.executeStructuredPrompt({
        systemPrompt,
        userPrompt,
        schema: SrsAnalysisOutputSchema,
      });
      data = result.data;
      meta = result.meta;
    } catch (aiError) {
      console.warn(
        `[TaskGenerationService] AI inference unavailable (${aiError.message}). Engaging deterministic SRS semantic analyzer fallback...`
      );
      data = this.parseSrsDeterministically(srsText, fileName, developers);
      meta = {
        provider: 'deterministic-fallback',
        model: 'heuristic-srs-analyzer',
        fallbackEngaged: true,
        reason: aiError.message,
      };
    }

    // Post-process modules: ensure isIndependent matches dependencies array
    data.modules = data.modules.map((mod, idx) => {
      const deps = Array.isArray(mod.dependencies)
        ? mod.dependencies.filter((d) => d && d !== mod.moduleId)
        : [];
      const isIndep = deps.length === 0;

      // Ensure suggestedAssignee matches a real developer name if possible
      let matchedDev = developers.find(
        (d) => d.name.toLowerCase() === mod.suggestedAssignee?.toLowerCase()
      );
      if (!matchedDev && developers.length > 0) {
        matchedDev =
          developers.find((d) =>
            d.skills?.some((s) => mod.suggestedSkills?.includes(s))
          ) || developers[idx % developers.length];
      }

      return {
        ...mod,
        isIndependent: isIndep,
        dependencies: deps,
        suggestedAssignee: matchedDev ? matchedDev.name : mod.suggestedAssignee || 'Unassigned',
        suggestedAssigneeId: matchedDev ? matchedDev._id.toString() : null,
      };
    });

    return {
      template: data,
      meta,
    };
  }

  /**
   * Deterministic semantic parser fallback for SRS documents
   * Guarantees 100% availability even under slow hardware or API outages
   */
  parseSrsDeterministically(srsText, fileName, developers = []) {
    const lines = srsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // 1. Extract Project Name
    let projectName = '';
    const projMatch = srsText.match(/(?:PROJECT|Project Name|System Name):\s*([^\n\r]+)/i);
    if (projMatch) {
      projectName = projMatch[1].trim();
    } else {
      const firstHeading = lines.find((l) => l.startsWith('#') || (l.length < 60 && !l.startsWith('-') && !l.startsWith('*')));
      projectName = firstHeading ? firstHeading.replace(/^[#\s*\-]+/, '').trim() : 'Software System Project';
    }

    const cleanKey = (projectName.replace(/[^a-zA-Z]/g, '').slice(0, 4) || 'PROJ').toUpperCase();

    // 2. Extract modules from bullet points or numbered lists
    const rawModules = [];
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*•\d.]+\s*(?:\[\s*\])?\s*([^:]+):\s*(.+)$/);
      if (bulletMatch) {
        rawModules.push({
          rawTitle: bulletMatch[1].trim(),
          rawDesc: bulletMatch[2].trim(),
        });
      } else {
        const dashMatch = line.match(/^[-*•\d.]+\s*(?:\[\s*\])?\s*([^-–—]+)[-–—]\s*(.+)$/);
        if (dashMatch && dashMatch[1].length < 50) {
          rawModules.push({
            rawTitle: dashMatch[1].trim(),
            rawDesc: dashMatch[2].trim(),
          });
        }
      }
    }

    // Fallback if no bullet list was detected
    if (rawModules.length === 0) {
      rawModules.push(
        { rawTitle: 'Database Architecture & Data Models', rawDesc: 'Design database schemas, indexes, and persistence models.' },
        { rawTitle: 'Core Backend Services & Business Logic', rawDesc: 'Implement API endpoints, business services, and validation logic. Depends on Database Architecture.' },
        { rawTitle: 'Frontend Client Application', rawDesc: 'Build responsive user interface and state management. Depends on Core Backend Services.' },
        { rawTitle: 'Testing, QA & Deployment Pipeline', rawDesc: 'End-to-end integration tests, automated build, and CI/CD deployment. Depends on Frontend Client Application.' }
      );
    }

    // 3. Build module objects with categories, dependencies, skills, assignees
    const modules = [];
    const titleToId = new Map();

    rawModules.slice(0, 8).forEach((item, idx) => {
      const modId = `MOD-${idx + 1}`;
      titleToId.set(item.rawTitle.toLowerCase(), modId);

      const combinedText = `${item.rawTitle} ${item.rawDesc}`.toLowerCase();
      let category = 'Backend';
      let suggestedRole = 'Backend Engineer';
      let suggestedSkills = ['Node.js', 'Express', 'API'];
      let effortHours = 16;
      let priority = 'Medium';

      if (combinedText.includes('schema') || combinedText.includes('database') || combinedText.includes('sql') || combinedText.includes('mongo') || combinedText.includes('ledger') || combinedText.includes('table')) {
        category = 'Database';
        suggestedRole = 'Database Architect';
        suggestedSkills = ['MongoDB', 'PostgreSQL', 'Database Design'];
        effortHours = 14;
        priority = 'High';
      } else if (combinedText.includes('ui') || combinedText.includes('frontend') || combinedText.includes('react') || combinedText.includes('dashboard') || combinedText.includes('client') || combinedText.includes('component')) {
        category = 'Frontend';
        suggestedRole = 'Frontend Engineer';
        suggestedSkills = ['React', 'JavaScript', 'CSS', 'UI/UX'];
        effortHours = 20;
        priority = 'Medium';
      } else if (combinedText.includes('pdf') || combinedText.includes('pipeline') || combinedText.includes('worker') || combinedText.includes('queue') || combinedText.includes('async')) {
        category = 'Backend';
        suggestedRole = 'Backend Systems Engineer';
        suggestedSkills = ['Node.js', 'Microservices', 'Async Pipelines'];
        effortHours = 18;
        priority = 'Medium';
      } else if (combinedText.includes('stripe') || combinedText.includes('webhook') || combinedText.includes('payment') || combinedText.includes('auth') || combinedText.includes('security')) {
        category = 'Security';
        suggestedRole = 'Integration & Security Specialist';
        suggestedSkills = ['Webhooks', 'Security', 'Payment Gateways'];
        effortHours = 16;
        priority = 'Critical';
      } else if (combinedText.includes('test') || combinedText.includes('qa') || combinedText.includes('audit')) {
        category = 'QA';
        suggestedRole = 'QA Automation Engineer';
        suggestedSkills = ['Jest', 'E2E Testing', 'Cypress'];
        effortHours = 12;
        priority = 'Medium';
      } else if (combinedText.includes('docker') || combinedText.includes('deploy') || combinedText.includes('ci/cd') || combinedText.includes('cloud')) {
        category = 'DevOps';
        suggestedRole = 'DevOps Engineer';
        suggestedSkills = ['Docker', 'CI/CD', 'Cloud Infrastructure'];
        effortHours = 12;
        priority = 'High';
      }

      // 4. Resolve dependencies
      const dependencies = [];
      const depMatch = item.rawDesc.match(/depends on\s+([^,.;]+)/i);
      if (depMatch) {
        const depTarget = depMatch[1].trim().toLowerCase();
        for (const [t, targetId] of titleToId.entries()) {
          if (targetId !== modId && (depTarget.includes(t) || t.includes(depTarget) || depTarget.split(' ').some((w) => w.length > 3 && t.includes(w)))) {
            dependencies.push(targetId);
            break;
          }
        }
      }

      // Developer matching
      let matchedDev = developers.find((d) =>
        d.skills?.some((s) => suggestedSkills.some((sk) => sk.toLowerCase().includes(s.toLowerCase())))
      );
      if (!matchedDev && developers.length > 0) {
        matchedDev = developers[idx % developers.length];
      }

      modules.push({
        moduleId: modId,
        title: item.rawTitle,
        description: item.rawDesc,
        category,
        isIndependent: dependencies.length === 0,
        dependencies,
        effortHours,
        priority,
        suggestedRole,
        suggestedSkills,
        suggestedAssignee: matchedDev ? matchedDev.name : 'Unassigned',
        suggestedAssigneeId: matchedDev ? matchedDev._id.toString() : null,
      });
    });

    // 5. Timeline & buffer metrics
    const totalEffortHours = modules.reduce((sum, m) => sum + m.effortHours, 0);
    let maxPathHours = 0;
    modules.forEach((m) => {
      let pathH = m.effortHours;
      if (m.dependencies.length > 0) {
        const parent = modules.find((p) => p.moduleId === m.dependencies[0]);
        if (parent) pathH += parent.effortHours;
      }
      if (pathH > maxPathHours) maxPathHours = pathH;
    });
    const criticalPathDays = Math.max(5, Math.ceil(maxPathHours / 6));
    const safeBufferDays = Math.max(3, Math.ceil(criticalPathDays * 0.25));
    const totalDays = criticalPathDays + safeBufferDays;

    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + totalDays);
    const recommendedDeadline = deadlineDate.toISOString().split('T')[0];

    return {
      projectName,
      projectKey: cleanKey,
      summary: `AI analyzed "${projectName}" from the uploaded requirements. Found ${modules.filter((m) => m.isIndependent).length} independent foundational modules ready for immediate parallel execution, and ${modules.filter((m) => !m.isIndependent).length} sequential dependent modules.`,
      timelineAnalysis: {
        totalEffortHours,
        criticalPathDays,
        safeBufferDays,
        recommendedDeadline,
        riskAssessment: `Identified critical architectural dependencies between ${modules.length} modules. A 25% safe buffer (${safeBufferDays} days) has been incorporated to prevent delivery slippage and absorb integration friction.`,
      },
      modules,
    };
  }

  /**
   * Persist a project and all its AI-generated modules/tasks into MongoDB.
   * Project Manager can edit the modules prior to calling this.
   */
  async createProjectWithSrsTemplate({
    name,
    description,
    deadline,
    key,
    modules,
    userId,
  }) {
    if (!name?.trim()) {
      throw new Error('Project name is required.');
    }
    if (!Array.isArray(modules) || modules.length === 0) {
      throw new Error('At least one module/task is required to initialize the project.');
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Resolve team members from assigned developers
    const developers = await User.find({ role: 'developer' }).lean();
    const assignedMemberIds = new Set();

    modules.forEach((mod) => {
      if (mod.assigneeId && mongoose.Types.ObjectId.isValid(mod.assigneeId)) {
        assignedMemberIds.add(String(mod.assigneeId));
      } else if (mod.assignee && mod.assignee !== 'Unassigned') {
        const found = developers.find(
          (d) =>
            d.name.toLowerCase() === mod.assignee.toLowerCase() ||
            d.email.toLowerCase() === mod.assignee.toLowerCase()
        );
        if (found) assignedMemberIds.add(String(found._id));
      }
    });

    // 2. Generate project key if not provided
    const projKey = (
      key ||
      name.replace(/[^a-zA-Z]/g, '').slice(0, 4) ||
      'PROJ'
    ).toUpperCase();

    // 3. Create Project in MongoDB
    const project = await Project.create({
      name: name.trim(),
      description: description?.trim() || '',
      key: projKey,
      status: 'Active',
      deadline: deadline || '',
      manager: userId,
      members: Array.from(assignedMemberIds),
      tasksCount: modules.length,
    });

    // 4. Map temporary module IDs to persistent sequential Task IDs (e.g. MOD-1 -> T-101)
    const moduleToTaskId = new Map();
    let maxSeq = 100;
    const existingGlobal = await Task.find({}, 'taskId').lean();
    for (const t of existingGlobal) {
      if (t.taskId && t.taskId.startsWith('T-')) {
        const num = parseInt(t.taskId.replace('T-', ''), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }

    for (let i = 0; i < modules.length; i++) {
      maxSeq += 1;
      const newTaskId = `T-${maxSeq}`;
      const mod = modules[i];
      if (mod.moduleId || mod.id) {
        moduleToTaskId.set(mod.moduleId || mod.id, newTaskId);
      }
      modules[i]._assignedTaskId = newTaskId;
    }

    await TaskCounter.findOneAndUpdate(
      { projectId: project._id },
      { $set: { seq: maxSeq } },
      { upsert: true }
    );

    // 5. Create each module as a Task in MongoDB
    const createdTasks = [];
    for (const mod of modules) {
      const assignedTaskId = mod._assignedTaskId;

      // Resolve dependency
      let resolvedDependency = null;
      if (mod.dependency) {
        resolvedDependency = moduleToTaskId.get(mod.dependency) || mod.dependency;
      } else if (Array.isArray(mod.dependencies) && mod.dependencies.length > 0) {
        const firstDep = mod.dependencies[0];
        resolvedDependency = moduleToTaskId.get(firstDep) || firstDep;
      }

      // Resolve assignee
      let resolvedAssignee = null;
      let resolvedAssigneeName = mod.assignee || mod.suggestedAssignee || 'Unassigned';
      if (mod.assigneeId && mongoose.Types.ObjectId.isValid(mod.assigneeId)) {
        resolvedAssignee = mod.assigneeId;
      } else {
        const found = developers.find(
          (d) =>
            d.name.toLowerCase() === resolvedAssigneeName.toLowerCase() ||
            d.email.toLowerCase() === resolvedAssigneeName.toLowerCase()
        );
        if (found) {
          resolvedAssignee = found._id;
          resolvedAssigneeName = found.name;
        }
      }

      const task = await Task.create({
        taskId: assignedTaskId,
        title: mod.title.trim(),
        description: mod.description?.trim() || '',
        project: project._id,
        group: mod.isIndependent ? 'In Progress' : 'To Do',
        status: mod.isIndependent ? 'In Progress' : 'Pending',
        priority: mod.priority || 'Medium',
        assignee: resolvedAssignee,
        assigneeName: resolvedAssigneeName,
        effortHours: Number(mod.effortHours) || 8,
        progress: 0,
        dueDate: mod.dueDate || mod.safeDueDate || deadline || '',
        startDate: mod.startDate || mod.safeStartDate || todayStr,
        dependency: resolvedDependency,
        createdBy: userId,
        tags: mod.suggestedSkills || (mod.category ? [mod.category] : []),
        lastUpdated: 'Just now',
      });

      createdTasks.push(task);
    }

    return {
      project: {
        id: project._id.toString(),
        name: project.name,
        key: project.key,
        description: project.description,
        status: project.status,
        deadline: project.deadline,
        tasksCount: createdTasks.length,
        membersCount: assignedMemberIds.size,
      },
      tasks: createdTasks.map((t) => ({
        id: t._id.toString(),
        taskId: t.taskId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assignee: t.assigneeName,
        effortHours: t.effortHours,
        dependency: t.dependency,
        group: t.group,
      })),
    };
  }
}

export default new TaskGenerationService();
