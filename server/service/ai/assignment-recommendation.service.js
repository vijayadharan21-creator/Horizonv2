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
      .populate('members', 'name email role skills subSkills availability')
      .populate('manager', 'name email role skills subSkills')
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
        subSkills: dev.subSkills || [],
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
      primarySkills: d.skills,
      subSkills: d.subSkills,
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
Your objective is to recommend the optimal developer for each technical task.
Match tasks STRICTLY based on:
1. Skill match: compare "requiredSkills" on the task against the developer's "primarySkills" AND "subSkills". A developer with matching sub-skills gets priority.
2. Workload balance: prefer developers with more available hours. Never assign to a developer at 100% capacity if alternatives exist.
3. Task priority: Critical/High priority tasks go to the most skilled AND available developer.
4. Scheduling safety: total allocated hours must not exceed availableHours.

Return a JSON object containing a "recommendations" array. For each task, select the BEST developer among eligible team members.`;

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

    let result = { data: { recommendations: [] }, meta: {} };
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fast AI execution threshold reached')), 3500)
      );
      const aiCallPromise = aiService.executeStructuredPrompt({
        systemPrompt,
        userPrompt,
        schema: AssignmentRecommendationOutputSchema,
      });
      result = await Promise.race([aiCallPromise, timeoutPromise]);
    } catch (aiError) {
      console.log(`[AssignmentRecommendationService] Fast fallback engaged (${aiError.message}) -> Generating deterministic assignments.`);
      result.meta = { provider: 'deterministic-heuristic-engine', fallbackEngaged: true, reason: aiError.message };
    }

    // ── Deterministic Post-Validation & Load Balancing ───────────────────────────────────────
    // Ensure every task is assigned and no developer receives all tasks unconditionally
    const eligibleIdSet = new Set(eligibleDevelopers.map((d) => d._id.toString()));
    const validatedRecommendations = [];

    // Clone devWorkloadMap to track running capacity across the current batch of tasks
    const runningDevStats = new Map();
    for (const [key, val] of devWorkloadMap.entries()) {
      runningDevStats.set(key, { ...val });
    }

    for (const task of tasks) {
      const taskIdStr = task._id.toString();
      const taskCode = task.taskId;
      const effort = Number(task.effortHours) || 4;

      const aiRec = result.data?.recommendations?.find(
        (r) => r.taskId === taskIdStr || r.taskId === taskCode
      );

      let chosenDevId = aiRec?.developerId;
      let reason = aiRec?.recommendationReason || 'Optimal skill and capacity match.';

      // Fallback: If AI gave an invalid dev, or the dev is now overloaded from previous loop iterations
      if (!chosenDevId || !eligibleIdSet.has(chosenDevId)) {
        chosenDevId = null;
      } else {
        const stats = runningDevStats.get(chosenDevId);
        if (stats && stats.availableCapacity < effort) {
          chosenDevId = null; // Force deterministic fallback for this task
        }
      }

      if (!chosenDevId) {
        let bestCandidate = null;
        let highestFitness = -Infinity;

        for (const d of eligibleDevelopers) {
          const stats = runningDevStats.get(d._id.toString());
          if (!stats) continue;

          let skillMatchCount = 0;
          const requiredSkills = task.tags || [];
          const allDevSkills = [
            ...(stats.skills || []),
            ...(stats.subSkills || []),
          ];
          for (const rs of requiredSkills) {
            if (allDevSkills.some(
              (s) => s.toLowerCase().includes(rs.toLowerCase()) ||
                     rs.toLowerCase().includes(s.toLowerCase())
            )) {
              skillMatchCount++;
            }
          }

          const skillBonus = skillMatchCount * 20;
          const capacityBonus = stats.availableCapacity;
          const fitness = skillBonus + capacityBonus;

          if (fitness > highestFitness && stats.availableCapacity >= effort) {
            highestFitness = fitness;
            bestCandidate = stats;
          }
        }

        if (bestCandidate) {
          chosenDevId = bestCandidate.id;
          reason = 'Deterministically assigned for workload balancing and skill matching (AI recommendation overridden or unavailable).';
        } else {
          // If everyone is overloaded, pick the one with the MOST available capacity (least overloaded)
          let leastOverloaded = null;
          let maxAvail = -Infinity;
          for (const d of eligibleDevelopers) {
            const stats = runningDevStats.get(d._id.toString());
            if (stats && stats.availableCapacity > maxAvail) {
              maxAvail = stats.availableCapacity;
              leastOverloaded = stats;
            }
          }
          if (leastOverloaded) {
            chosenDevId = leastOverloaded.id;
            reason = 'Assigned to the least overloaded developer (Team is at maximum capacity).';
          }
        }
      }

      const finalStats = runningDevStats.get(chosenDevId);

      const warnings = [];
      if (finalStats.availableCapacity < effort) {
        warnings.push(`Over-capacity alert: Developer has ${finalStats.availableCapacity}h available, but task requires ${effort}h.`);
      }
      if (finalStats.workloadPercentage > 85) {
        warnings.push(`Heavy workload warning: Developer is currently utilized at ${finalStats.workloadPercentage}%.`);
      }

      validatedRecommendations.push({
        taskId: taskIdStr,
        developerId: finalStats.id,
        displayName: finalStats.name,
        skillMatchExplanation: aiRec?.skillMatchExplanation || 'Matched required task skills.',
        currentWorkload: finalStats.workloadPercentage,
        availableCapacity: finalStats.availableCapacity,
        suggestedAllocation: effort,
        recommendationReason: reason,
        schedulingRisks: warnings,
      });

      // Decrement available capacity for the NEXT task in the loop
      finalStats.availableCapacity -= effort;
      finalStats.totalActiveHours += effort;
      finalStats.workloadPercentage = Math.min(100, Math.round((finalStats.totalActiveHours / finalStats.weeklyCapacity) * 100));
      runningDevStats.set(chosenDevId, finalStats);
    }

    return {
      recommendations: validatedRecommendations,
      teamStats: Array.from(devWorkloadMap.values()), // Return original baseline for UI rendering
      meta: result.meta,
    };

  }
}

export default new AssignmentRecommendationService();
