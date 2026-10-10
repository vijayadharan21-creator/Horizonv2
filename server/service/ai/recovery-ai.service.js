import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import Task from '../../models/Task.js';
import User from '../../models/User.js';
import aiService from './ai.service.js';
import { RecoveryRecommendationOutputSchema } from './ai.schemas.js';

// Helper to derive specialized sub-skills for a developer
const extractDeveloperSubSkills = (dev) => {
  if (dev.subSkills && dev.subSkills.length > 0) return dev.subSkills;
  if (dev.skills && dev.skills.length > 0) {
    const derived = [];
    dev.skills.forEach((s) => {
      const lower = s.toLowerCase();
      if (lower.includes('react') || lower.includes('frontend')) {
        derived.push('React State Management', 'Component Architecture', 'Tailwind CSS', 'UI Optimization');
      } else if (lower.includes('node') || lower.includes('backend')) {
        derived.push('REST API Optimization', 'Express Middleware', 'Backend Architecture');
      } else if (lower.includes('mongo') || lower.includes('database')) {
        derived.push('MongoDB Schema Modeling', 'Query Optimization', 'Database Indexing');
      } else if (lower.includes('python')) {
        derived.push('Data Processing', 'API Integration', 'Script Automation');
      } else if (lower.includes('plan') || lower.includes('agile')) {
        derived.push('Sprint Architecture', 'Capacity Planning', 'Risk Mitigation');
      } else {
        derived.push(`${s} Optimization`, `${s} Architecture`);
      }
    });
    return Array.from(new Set(derived));
  }
  return ['Fullstack Engineering', 'Component Design', 'Debugging & Testing'];
};

// Helper to derive required sub-skills for a specific task
const extractTaskRequiredSubSkills = (task) => {
  const text = `${task.title || ''} ${task.description || ''} ${(task.tags || []).join(' ')}`.toLowerCase();
  const required = [];
  if (text.includes('database') || text.includes('schema') || text.includes('mongo') || text.includes('index') || text.includes('sql')) {
    required.push('MongoDB Schema Modeling', 'Database Indexing', 'Data Modeling');
  }
  if (text.includes('api') || text.includes('backend') || text.includes('auth') || text.includes('server') || text.includes('rest')) {
    required.push('REST API Optimization', 'Express Middleware', 'Backend Architecture');
  }
  if (text.includes('ui') || text.includes('frontend') || text.includes('css') || text.includes('component') || text.includes('report') || text.includes('design')) {
    required.push('React State Management', 'Component Architecture', 'Tailwind CSS');
  }
  if (text.includes('schedule') || text.includes('dependency') || text.includes('recovery') || text.includes('cycle') || text.includes('validation')) {
    required.push('Algorithm Optimization', 'Testing & Validation', 'Sprint Architecture');
  }
  if (required.length === 0) {
    required.push('Component Design', 'Core Logic Implementation');
  }
  return required;
};

/**
 * Recovery Center & Intelligent Replanning Service
 * Handles uncertainty, developer unavailability, task re-allocation based on sub-skills, and schedule rebalancing
 */
export class RecoveryAiService {
  /**
   * Generate an optimized recovery plan for an unexpected disruption
   */
  async generateRecoveryPlan({ projectId, scenario }) {
    const project = await Project.findById(projectId)
      .populate('members', 'name email role skills subSkills availability')
      .populate('manager', 'name email role skills subSkills availability')
      .lean();

    if (!project) {
      throw new Error('Project not found.');
    }

    const eligibleDevelopers = [
      ...(project.members || []),
      ...(project.manager ? [project.manager] : []),
    ];

    // Load all tasks for the project
    const allTasks = await Task.find({ project: projectId }).lean();

    // MANDATORY RULE 1: Completed tasks are strictly preserved
    const completedTasks = allTasks.filter((t) => t.status === 'Completed');
    const preservedCompletedTaskNames = completedTasks.map(
      (t) => `${t.taskId}: ${t.title}`
    );

    const activeTasks = allTasks.filter((t) => t.status !== 'Completed');

    // Identify affected tasks based on disruption scenario
    let affectedTasks = [];
    let scenarioDescription = '';
    let unavailablePerson = null;

    const isUnavailability =
      scenario.type === 'worker_unavailability' ||
      scenario.type === 'worker_absence' ||
      scenario.type === 'team_member_absence';

    if (isUnavailability) {
      const absentUserId = scenario.userId;
      const targetDev = eligibleDevelopers.find(
        (d) => String(d._id || d.id) === String(absentUserId)
      );
      const absentName = scenario.workerName || targetDev?.name || 'Developer';

      const fromDate = scenario.fromDate || new Date().toISOString().split('T')[0];
      const fromTime = scenario.fromTime || '09:00';
      const toDate =
        scenario.toDate ||
        new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];
      const toTime = scenario.toTime || '18:00';
      const reason = scenario.reason || 'Medical / Emergency Leave';

      const devSubSkills = targetDev ? extractDeveloperSubSkills(targetDev) : ['Core Fullstack'];

      unavailablePerson = {
        userId: absentUserId,
        userName: absentName,
        fromDate,
        fromTime,
        toDate,
        toTime,
        reason,
        subSkills: devSubSkills,
        contextNotes: scenario.contextNotes || '',
      };

      affectedTasks = activeTasks.filter(
        (t) =>
          (absentUserId && t.assignee?.toString() === String(absentUserId)) ||
          (absentName && t.assigneeName?.toLowerCase() === absentName.toLowerCase())
      );

      scenarioDescription = `Team member "${absentName}" is marked UNAVAILABLE from ${fromDate} at ${fromTime} to ${toDate} at ${toTime} (Reason: ${reason}). Sub-skills: [${devSubSkills.join(
        ', '
      )}]. ${
        scenario.contextNotes ? `Context: ${scenario.contextNotes}. ` : ''
      }Found ${affectedTasks.length} active module(s) needing immediate reallocation and schedule rebalancing across the remaining team.`;
    } else if (scenario.type === 'effort_overrun' || scenario.type === 'task_overrun') {
      const targetTask =
        activeTasks.find(
          (t) => t.taskId === scenario.taskId || t._id.toString() === scenario.taskId
        ) || activeTasks[0];

      if (targetTask) affectedTasks = [targetTask];
      scenarioDescription = `Task "${targetTask?.taskId || 'Target Task'}" exceeded estimate by +${
        scenario.overrunHours || 4
      } hours. Downstream tasks and capacity need rebalancing.`;
    } else if (scenario.type === 'dependency_delay') {
      const targetTask =
        activeTasks.find(
          (t) => t.taskId === scenario.taskId || t._id.toString() === scenario.taskId
        ) || activeTasks[0];

      if (targetTask) {
        const downstream = activeTasks.filter((t) => t.dependency === targetTask.taskId);
        affectedTasks = [targetTask, ...downstream];
      }
      scenarioDescription = `Upstream dependency delayed by ${
        scenario.delayDays || 3
      } days. Downstream module schedule needs rescheduling to prevent delivery conflict.`;
    }

    // Available team candidates (excluding unavailable person)
    const availableDevelopers = eligibleDevelopers.filter((d) => {
      if (isUnavailability && unavailablePerson?.userId) {
        return String(d._id || d.id) !== String(unavailablePerson.userId);
      }
      return true;
    });

    // Compute baseline workload before replanning
    const baselineWorkload = {};
    eligibleDevelopers.forEach((d) => {
      const dName = d.name;
      const dId = String(d._id || d.id);
      const myTasks = activeTasks.filter(
        (t) =>
          String(t.assignee || '') === dId ||
          t.assigneeName?.toLowerCase() === dName.toLowerCase()
      );
      const hours = myTasks.reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);
      baselineWorkload[dName] = {
        name: dName,
        id: dId,
        subSkills: extractDeveloperSubSkills(d),
        beforeHours: hours,
        beforeTasks: myTasks.length,
        afterHours: hours,
        afterTasks: myTasks.length,
        isUnavailable: isUnavailability && unavailablePerson?.userId === dId,
      };
    });

    if (unavailablePerson?.userName && baselineWorkload[unavailablePerson.userName]) {
      baselineWorkload[unavailablePerson.userName].afterHours = 0;
      baselineWorkload[unavailablePerson.userName].afterTasks = 0;
    }

    let planData = null;
    let meta = null;

    // Fast AI Model Attempt with 3.5s timeout (prevents hanging on slow Ollama / quota errors)
    try {
      const systemPrompt = `You are the AI Uncertainty Recovery & Schedule Optimization Engine for TaskForge AI.
When a developer is marked Unavailable, reallocate their active modules to available developers based on SUB-SKILL alignment and balance workload.
MANDATORY RULES:
1. STRICT PRESERVATION: NEVER alter completed tasks: [${preservedCompletedTaskNames.join(', ')}]
2. UNAVAILABLE CONSTRAINT: Do not assign work to the unavailable developer.
3. SUB-SKILL MATCHING: Assign tasks based on matching developer sub-skills.
4. SAFE RESCHEDULING: Extend due dates safely to absorb handoff.`;

      const userPrompt = `Project: "${project.name}"
${scenarioDescription}

Active Incomplete Tasks:
${JSON.stringify(
  activeTasks.map((t) => ({
    id: t._id.toString(),
    code: t.taskId,
    title: t.title,
    assignee: t.assigneeName,
    dueDate: t.dueDate,
    effort: t.effortHours,
  }))
)}

Available Eligible Team Members:
${JSON.stringify(
  availableDevelopers.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    subSkills: extractDeveloperSubSkills(d),
  }))
)}`;

      // 3.5-second race timeout for instantaneous user response
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fast AI execution threshold reached')), 3500)
      );

      const aiCallPromise = aiService.executeStructuredPrompt({
        systemPrompt,
        userPrompt,
        schema: RecoveryRecommendationOutputSchema,
      });

      const aiResult = await Promise.race([aiCallPromise, timeoutPromise]);
      planData = aiResult.data;
      meta = aiResult.meta;
    } catch (aiError) {
      console.log(
        `[RecoveryAiService] Fast fallback engaged (${aiError.message}) -> Generating sub-skill matched rebalance plan.`
      );

      // Fast, mathematically grounded sub-skill rebalancing engine
      planData = this.generateDeterministicRebalancePlan({
        project,
        activeTasks,
        affectedTasks,
        availableDevelopers,
        unavailablePerson,
        scenario,
        preservedCompletedTaskNames,
      });

      meta = {
        provider: 'smart-heuristic-engine',
        model: 'sub-skill-rebalancer-v2',
        fallbackEngaged: true,
        reason: aiError.message,
      };
    }

    // Ensure all actions are populated with sub-skill details for BOTH persons
    const completedIdSet = new Set(completedTasks.map((t) => t._id.toString()));
    const completedCodeSet = new Set(completedTasks.map((t) => t.taskId));

    const enrichedActions = (planData.actions || [])
      .filter((a) => !completedIdSet.has(a.taskId) && !completedCodeSet.has(a.taskId))
      .map((act) => {
        const targetTask = activeTasks.find(
          (t) => t.taskId === act.taskId || t._id.toString() === act.taskId
        );
        const reqSubSkills = targetTask
          ? extractTaskRequiredSubSkills(targetTask)
          : ['Component Implementation'];

        const allocatedDev = availableDevelopers.find(
          (d) =>
            d.name?.toLowerCase() === act.recommendedAssigneeName?.toLowerCase() ||
            String(d._id) === String(act.recommendedAssigneeId)
        );

        const allocatedSubSkills = allocatedDev
          ? extractDeveloperSubSkills(allocatedDev)
          : ['Core Engineering'];
        const unavailableSubSkills = unavailablePerson?.subSkills || ['Fullstack Development'];

        // Determine matched subskills
        const matched = act.matchedSubSkills || allocatedSubSkills.filter(
          (as) =>
            reqSubSkills.some((rs) => rs.toLowerCase().includes(as.toLowerCase()) || as.toLowerCase().includes(rs.toLowerCase())) ||
            unavailableSubSkills.some((us) => us.toLowerCase().includes(as.toLowerCase()) || as.toLowerCase().includes(us.toLowerCase()))
        );

        return {
          ...act,
          taskRequiredSubSkills: reqSubSkills,
          unavailablePersonName: unavailablePerson?.userName || 'Unavailable Developer',
          unavailablePersonSubSkills: unavailableSubSkills,
          allocatedPersonSubSkills: allocatedSubSkills,
          matchedSubSkills: matched.length > 0 ? matched : [allocatedSubSkills[0] || 'Core Architecture'],
        };
      });

    // Calculate workload balancing delta
    enrichedActions.forEach((act) => {
      if (act.actionType === 'reassign' && act.recommendedAssigneeName) {
        const devName = act.recommendedAssigneeName;
        if (baselineWorkload[devName]) {
          const taskEffort =
            activeTasks.find((t) => t.taskId === act.taskId || t._id.toString() === act.taskId)
              ?.effortHours || 6;
          baselineWorkload[devName].afterHours += Number(taskEffort);
          baselineWorkload[devName].afterTasks += 1;
        }
      }
    });

    return {
      plan: {
        summary: planData.summary,
        unavailablePerson,
        actions: enrichedActions,
        preservedCompletedTasks: preservedCompletedTaskNames,
        risksAndWarnings: planData.risksAndWarnings || [],
        disruptionType: scenario.type,
        workloadBalance: Object.values(baselineWorkload),
      },
      meta,
    };
  }

  /**
   * Sub-Skill Grounded Uncertainty Rebalancing Engine
   * Matches candidate developers based on specialized sub-skills and balances capacity
   */
  generateDeterministicRebalancePlan({
    project,
    activeTasks,
    affectedTasks,
    availableDevelopers,
    unavailablePerson,
    scenario,
    preservedCompletedTaskNames,
  }) {
    const actions = [];
    const devs =
      availableDevelopers.length > 0
        ? availableDevelopers
        : [{ name: 'Team Pool', _id: null, skills: ['Fullstack'] }];

    // Track assigned load per available developer
    const devLoad = new Map();
    devs.forEach((d) => {
      const devTasks = activeTasks.filter(
        (t) =>
          String(t.assignee || '') === String(d._id) ||
          t.assigneeName?.toLowerCase() === d.name.toLowerCase()
      );
      const totalHours = devTasks.reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);
      devLoad.set(String(d._id || d.name), {
        dev: d,
        currentHours: totalHours,
        subSkills: extractDeveloperSubSkills(d),
      });
    });

    const unavailableSubSkills = unavailablePerson?.subSkills || ['Fullstack Development'];

    // Reallocate each affected task using sub-skill alignment
    affectedTasks.forEach((task, idx) => {
      const taskReqSubSkills = extractTaskRequiredSubSkills(task);

      let bestCandidate = null;
      let highestFitness = -Infinity;
      let bestMatchedSubSkills = [];

      devs.forEach((d) => {
        const info = devLoad.get(String(d._id || d.name));
        const candidateSubSkills = info?.subSkills || extractDeveloperSubSkills(d);
        const currentHours = info?.currentHours || 0;

        // Find matches with task requirements AND unavailable person's subskills
        const matchWithTask = candidateSubSkills.filter((cs) =>
          taskReqSubSkills.some(
            (ts) => ts.toLowerCase().includes(cs.toLowerCase()) || cs.toLowerCase().includes(ts.toLowerCase())
          )
        );

        const matchWithUnavailable = candidateSubSkills.filter((cs) =>
          unavailableSubSkills.some(
            (us) => us.toLowerCase().includes(cs.toLowerCase()) || cs.toLowerCase().includes(us.toLowerCase())
          )
        );

        const combinedMatched = Array.from(new Set([...matchWithTask, ...matchWithUnavailable]));

        // Fitness score: Sub-skill match is high priority, balanced with current workload
        const subSkillBonus = combinedMatched.length * 20;
        const workloadPenalty = currentHours * 1.5;
        const fitnessScore = subSkillBonus - workloadPenalty;

        if (fitnessScore > highestFitness) {
          highestFitness = fitnessScore;
          bestCandidate = d;
          bestMatchedSubSkills = combinedMatched.length > 0 ? combinedMatched : [candidateSubSkills[0]];
        }
      });

      if (!bestCandidate) {
        bestCandidate = devs[idx % devs.length];
        bestMatchedSubSkills = extractDeveloperSubSkills(bestCandidate).slice(0, 2);
      }

      // Update candidate's load
      const info = devLoad.get(String(bestCandidate._id || bestCandidate.name));
      if (info) {
        info.currentHours += Number(task.effortHours) || 6;
      }

      // Safe due date adjustment
      let adjustedDueDate = task.dueDate;
      if (task.dueDate) {
        const due = new Date(task.dueDate);
        due.setDate(due.getDate() + 3);
        adjustedDueDate = due.toISOString().split('T')[0];
      }

      actions.push({
        actionType: 'reassign',
        taskId: task.taskId || task._id.toString(),
        taskTitle: task.title,
        taskRequiredSubSkills: taskReqSubSkills,
        unavailablePersonName: unavailablePerson?.userName || 'Unavailable Member',
        unavailablePersonSubSkills: unavailableSubSkills,
        recommendedAssigneeId: bestCandidate._id ? bestCandidate._id.toString() : null,
        recommendedAssigneeName: bestCandidate.name,
        allocatedPersonSubSkills: extractDeveloperSubSkills(bestCandidate),
        matchedSubSkills: bestMatchedSubSkills,
        proposedDueDate: adjustedDueDate,
        reason: `Re-allocated to ${bestCandidate.name} based on matching sub-skills [${bestMatchedSubSkills.join(
          ', '
        )}] with balanced capacity.`,
      });

      // Also reschedule downstream dependent tasks safely
      const dependents = activeTasks.filter((t) => t.dependency === task.taskId);
      dependents.forEach((dep) => {
        if (!actions.some((a) => a.taskId === dep.taskId)) {
          let depDueDate = dep.dueDate;
          if (dep.dueDate) {
            const d = new Date(dep.dueDate);
            d.setDate(d.getDate() + 4);
            depDueDate = d.toISOString().split('T')[0];
          }
          actions.push({
            actionType: 'reschedule',
            taskId: dep.taskId,
            taskTitle: dep.title,
            proposedDueDate: depDueDate,
            reason: `Rescheduled downstream task due date to absorb handoff for dependency ${task.taskId}.`,
          });
        }
      });
    });

    const unavailStr = unavailablePerson
      ? `Developer "${unavailablePerson.userName}" marked Unavailable from ${unavailablePerson.fromDate} to ${unavailablePerson.toDate} (${unavailablePerson.reason}).`
      : 'Disruption analyzed.';

    const summary = `${unavailStr} Re-allocated ${affectedTasks.length} active module(s) via sub-skill matching and balanced team capacity across ${devs.length} available developers.`;

    const risks = [
      `Absorbed ${affectedTasks.reduce((s, t) => s + (Number(t.effortHours) || 0), 0)}h of handoff work matching sub-skills across active developers.`,
      'All completed project modules remain 100% preserved without modification.',
      'Delivery buffers adjusted to protect the final release milestone.',
    ];

    return {
      summary,
      actions,
      preservedCompletedTasks: preservedCompletedTaskNames,
      risksAndWarnings: risks,
    };
  }

  /**
   * Apply approved recovery plan actions to MongoDB
   */
  async applyRecoveryPlan({ projectId, actions = [], userId, unavailableInfo }) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Project not found.');

    // 1. Mark user as Unavailable in MongoDB
    if (unavailableInfo?.userId) {
      await User.findByIdAndUpdate(unavailableInfo.userId, {
        availability: {
          status: 'unavailable',
          from: unavailableInfo.fromDate
            ? `${unavailableInfo.fromDate}T${unavailableInfo.fromTime || '09:00'}`
            : null,
          to: unavailableInfo.toDate
            ? `${unavailableInfo.toDate}T${unavailableInfo.toTime || '18:00'}`
            : null,
          reason: unavailableInfo.reason || 'Leave / Unavailable',
          updatedAt: new Date(),
        },
      });

      // 2. Remove any previous unavailabilities for this user and push new record
      await Project.findByIdAndUpdate(projectId, {
        $pull: { unavailabilities: { userId: unavailableInfo.userId } },
      });

      await Project.findByIdAndUpdate(projectId, {
        $push: {
          unavailabilities: {
            userId: unavailableInfo.userId,
            userName: unavailableInfo.userName,
            fromDate: unavailableInfo.fromDate,
            fromTime: unavailableInfo.fromTime || '09:00',
            toDate: unavailableInfo.toDate,
            toTime: unavailableInfo.toTime || '18:00',
            reason: unavailableInfo.reason || 'Absence / Leave',
            status: 'unavailable',
            createdAt: new Date(),
          },
        },
      });
    }

    const modifiedTasks = [];

    // 3. Apply task re-allocations and reschedules
    for (const act of (actions || [])) {
      const query = [{ taskId: act.taskId }];
      if (act.taskId && mongoose.Types.ObjectId.isValid(act.taskId)) {
        query.unshift({ _id: act.taskId });
      }
      const task = await Task.findOne({
        project: projectId,
        $or: query,
      });

      if (!task) continue;

      // RULE: Never alter completed task
      if (task.status === 'Completed') continue;

      if (act.actionType === 'reassign' && act.recommendedAssigneeId) {
        const newAssignee = await User.findById(act.recommendedAssigneeId);
        if (newAssignee) {
          task.assignee = newAssignee._id;
          task.assigneeName = newAssignee.name;
        } else if (act.recommendedAssigneeName) {
          task.assigneeName = act.recommendedAssigneeName;
        }
      } else if (act.actionType === 'reassign' && act.recommendedAssigneeName) {
        task.assigneeName = act.recommendedAssigneeName;
      }

      if (act.proposedDueDate) {
        task.dueDate = act.proposedDueDate;
      }

      if (act.actionType === 'adjust_priority' && act.priorityAdjustment) {
        task.priority = act.priorityAdjustment;
      }

      task.lastUpdated = 'Just now (AI Rebalance)';
      await task.save();
      modifiedTasks.push(task);
    }

    return {
      appliedCount: modifiedTasks.length,
      unavailablePerson: unavailableInfo?.userName || null,
      modifiedTasks: modifiedTasks.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        assignee: t.assigneeName,
        dueDate: t.dueDate,
        priority: t.priority,
      })),
    };
  }

  /**
   * Restore a team member's status to Available
   */
  async clearUnavailability({ projectId, userId }) {
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        availability: {
          status: 'available',
          from: null,
          to: null,
          reason: '',
          updatedAt: new Date(),
        },
      });
    }

    if (projectId) {
      await Project.findByIdAndUpdate(projectId, {
        $pull: { unavailabilities: { userId: userId } },
      });
    }

    return {
      success: true,
      message: 'Team member marked as Available again.',
    };
  }
}

export default new RecoveryAiService();
