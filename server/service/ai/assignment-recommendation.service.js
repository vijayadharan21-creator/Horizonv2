import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import Task from '../../models/Task.js';
import aiService from './ai.service.js';
import { AssignmentRecommendationOutputSchema } from './ai.schemas.js';

/**
 * Intelligent Developer Assignment Recommendation Service
 */
export class AssignmentRecommendationService {
  /**
   * Recommend developer assignments for one or more tasks based on skills, workload, and capacity
   */
  async recommendAssignments({ projectId, taskIds }) {
    const project = await Project.findById(projectId)
      .populate('members', 'name email role skills')
      .populate('manager', 'name email role skills')
      .lean();

    if (!project) {
      throw new Error('Project not found.');
    }

    // Eligible team members (members + manager)
    const eligibleDevelopers = [
      ...(project.members || []),
      ...(project.manager ? [project.manager] : []),
    ];

    if (eligibleDevelopers.length === 0) {
      throw new Error('No team members found in this project to assign tasks to.');
    }

    const objectIds = (taskIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const lookup = [{ taskId: { $in: taskIds } }];
    if (objectIds.length > 0) {
      lookup.unshift({ _id: { $in: objectIds } });
    }

    const tasks = await Task.find({
      project: projectId,
      $or: lookup,
    }).lean();

    if (tasks.length === 0) {
      throw new Error('No valid tasks found for recommendation in this project.');
    }

    // Compute live workload and capacity for each eligible developer from MongoDB
    const devWorkloadMap = new Map();

    for (const dev of eligibleDevelopers) {
      const devIdStr = dev._id.toString();
      // Count total effort hours for active tasks assigned to this developer
      const activeTasks = await Task.find({
        assignee: dev._id,
        status: { $in: ['In Progress', 'Pending', 'In Review', 'Blocked'] },
      })
        .select('effortHours priority title')
        .lean();

      const totalActiveHours = activeTasks.reduce(
        (sum, t) => sum + (Number(t.effortHours) || 0),
        0
      );

      const weeklyCapacity = 40; // 40 hours standard weekly capacity
      const availableCapacity = Math.max(0, weeklyCapacity - totalActiveHours);
      const workloadPercentage = Math.min(100, Math.round((totalActiveHours / weeklyCapacity) * 100));

      devWorkloadMap.set(devIdStr, {
        id: devIdStr,
        name: dev.name,
        role: dev.role,
        skills: dev.skills || [],
        totalActiveHours,
        weeklyCapacity,
        availableCapacity,
        workloadPercentage,
        activeTasksCount: activeTasks.length,
      });
    }

    // Prepare structured context for AI
    const devProfilesForPrompt = Array.from(devWorkloadMap.values()).map((d) => ({
      developerId: d.id,
      name: d.name,
      skills: d.skills,
      currentWorkloadHours: d.totalActiveHours,
      workloadPercentage: `${d.workloadPercentage}%`,
      availableHours: d.availableCapacity,
    }));

    const taskProfilesForPrompt = tasks.map((t) => ({
      taskId: t._id.toString(),
      code: t.taskId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      effortHours: t.effortHours,
      tagsOrSkillsRequired: t.tags || [],
      dependency: t.dependency || 'None',
    }));

    const systemPrompt = `You are an AI Resource Allocation Specialist for TaskForge AI.
Your objective is to recommend the optimal developer for technical tasks.
Match tasks based on:
1. Direct skill match (primary technical skills needed vs developer skills).
2. Workload balance (prioritize developers with available capacity; do not overload developers who are near 100%).
3. Task priority (Critical/High priority tasks should go to experienced and available team members).
4. Scheduling safety (ensure the developer has sufficient available hours for the task effort).

Return a JSON object containing a "recommendations" array. For each task, select the BEST developer among the eligible team members.`;

    const userPrompt = `Project: "${project.name}"
Eligible Developers:
${JSON.stringify(devProfilesForPrompt, null, 2)}

Tasks Needing Assignment:
${JSON.stringify(taskProfilesForPrompt, null, 2)}

For each task in "Tasks Needing Assignment", produce an entry in "recommendations" with:
- "taskId": MongoDB taskId
- "developerId": developer's ID
- "displayName": developer's name
- "skillMatchExplanation": clear description of why their skills match this task
- "currentWorkload": developer's workload percentage as a number (e.g. 65)
- "availableCapacity": available hours left as a number
- "suggestedAllocation": task effort hours
- "recommendationReason": holistic reason (skill alignment + capacity availability)
- "schedulingRisks": array of warnings (e.g. if workload is high, tight deadline, etc.)`;

    const result = await aiService.executeStructuredPrompt({
      systemPrompt,
      userPrompt,
      schema: AssignmentRecommendationOutputSchema,
    });

    // ── Deterministic Post-Validation ───────────────────────────────────────
    // Ensure every recommendation adheres to business constraints
    const eligibleIdSet = new Set(eligibleDevelopers.map((d) => d._id.toString()));
    const validatedRecommendations = [];

    for (const rec of result.data.recommendations) {
      // 1. Must be an eligible project member
      if (!eligibleIdSet.has(rec.developerId)) {
        console.warn(`[Assignment Validation] Recommended developer ${rec.developerId} is not a project member. Skipping.`);
        continue;
      }

      const devStats = devWorkloadMap.get(rec.developerId);
      if (!devStats) continue;

      // 2. Overwrite stats with true deterministic database figures to guarantee grounding
      const task = tasks.find(
        (t) => t._id.toString() === rec.taskId || t.taskId === rec.taskId
      );
      const taskEffort = task ? task.effortHours : rec.suggestedAllocation;

      const warnings = [...(rec.schedulingRisks || [])];
      if (devStats.availableCapacity < taskEffort) {
        warnings.push(
          `Over-capacity alert: Developer has ${devStats.availableCapacity}h available, but task requires ${taskEffort}h.`
        );
      }
      if (devStats.workloadPercentage > 85) {
        warnings.push(`Heavy workload warning: Developer is currently utilized at ${devStats.workloadPercentage}%.`);
      }

      validatedRecommendations.push({
        ...rec,
        displayName: devStats.name,
        currentWorkload: devStats.workloadPercentage,
        availableCapacity: devStats.availableCapacity,
        suggestedAllocation: taskEffort,
        schedulingRisks: warnings,
      });
    }

    return {
      recommendations: validatedRecommendations,
      teamStats: Array.from(devWorkloadMap.values()),
      meta: result.meta,
    };
  }
}

export default new AssignmentRecommendationService();
