import Project from '../../models/Project.js';
import Task from '../../models/Task.js';
import aiService from './ai.service.js';
import { SprintInsightsOutputSchema } from './ai.schemas.js';

/**
 * Sprint Insights & Bottleneck Detection Service
 */
export class SprintInsightsService {
  /**
   * Deterministic calculation of project metrics from database documents
   */
  _calculateDeterministicMetrics(tasks, project) {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
    const blocked = tasks.filter((t) => t.status === 'Blocked').length;
    const pending = tasks.filter((t) => t.status === 'Pending' || t.status === 'To Do').length;

    const criticalTasks = tasks.filter((t) => t.priority === 'Critical' && t.status !== 'Completed');
    const highTasks = tasks.filter((t) => t.priority === 'High' && t.status !== 'Completed');

    const totalEffort = tasks.reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);
    const completedEffort = tasks
      .filter((t) => t.status === 'Completed')
      .reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Detect overdue tasks
    const todayStr = new Date().toISOString().split('T')[0];
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && t.dueDate < todayStr && t.status !== 'Completed'
    );

    // Detect dependency bottlenecks (tasks waiting on an unfinished dependency)
    const taskByCode = new Map(tasks.map((t) => [t.taskId, t]));
    const bottleneckTasks = [];

    for (const t of tasks) {
      if (t.dependency && t.status !== 'Completed') {
        const parent = taskByCode.get(t.dependency);
        if (parent && parent.status !== 'Completed') {
          bottleneckTasks.push({ task: t, waitingOn: parent });
        }
      }
    }

    return {
      total,
      completed,
      inProgress,
      blocked,
      pending,
      completionRate,
      totalEffort,
      completedEffort,
      criticalTasks,
      highTasks,
      overdueTasks,
      bottleneckTasks,
    };
  }

  /**
   * Generate AI-powered sprint insights grounded in real project data
   */
  async getSprintInsights({ projectId }) {
    const project = await Project.findById(projectId).lean();
    if (!project) {
      throw new Error('Project not found.');
    }

    const tasks = await Task.find({ project: projectId })
      .populate('assignee', 'name email skills')
      .lean();

    const metrics = this._calculateDeterministicMetrics(tasks, project);

    // If project has no tasks, return empty insight set
    if (tasks.length === 0) {
      return {
        summary: `Project "${project.name}" has no tasks created yet. Add tasks or generate them using AI to begin sprint tracking.`,
        insights: [],
        metrics: { total: 0, completed: 0, completionRate: 0 },
        meta: {
          provider: 'deterministic_fallback',
          isAiGenerated: false,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const taskSummaries = tasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      effortHours: t.effortHours,
      progress: t.progress,
      dueDate: t.dueDate || 'None',
      dependency: t.dependency || 'None',
      assignee: t.assigneeName || 'Unassigned',
    }));

    const systemPrompt = `You are a Senior Technical Project Manager analyzing live sprint metrics for TaskForge AI.
Analyze the provided real task data and generate structured insights.
Rules:
1. STRICT GROUNDING: ONLY reference tasks, assignees, dates, and numbers provided in the input. DO NOT fabricate tasks or statistics.
2. Focus on actionable insights:
   - "risk": approaching due dates, overdue items, unassigned high-priority work.
   - "bottleneck": unfinished dependencies holding up dependent tasks.
   - "workload": uneven distribution across developers.
   - "progress": overall velocity and completed milestones.
   - "optimization": concrete recommendations to improve velocity.
3. Keep titles concise and recommendations practical.`;

    const userPrompt = `Project: "${project.name}" (Status: ${project.status})
Deadline: ${project.deadline || 'None'}
Metrics Summary:
- Total Tasks: ${metrics.total}
- Completed: ${metrics.completed} (${metrics.completionRate}%)
- In Progress: ${metrics.inProgress}
- Blocked: ${metrics.blocked}
- Critical Incomplete: ${metrics.criticalTasks.length}
- Overdue Incomplete: ${metrics.overdueTasks.length}
- Unfinished Dependency Blockers: ${metrics.bottleneckTasks.length}

Tasks List:
${JSON.stringify(taskSummaries, null, 2)}

Produce a JSON object matching the schema:
- "summary": one concise executive summary sentence
- "insights": array of insight objects each with:
  - "type": "risk" | "bottleneck" | "optimization" | "progress" | "workload"
  - "title": short header
  - "description": specific description referencing real tasks by ID
  - "severity": "low" | "medium" | "high" | "critical"
  - "relatedTaskIds": array of task codes (e.g. ["T-102"])
  - "recommendation": concrete next action`;

    try {
      const result = await aiService.executeStructuredPrompt({
        systemPrompt,
        userPrompt,
        schema: SprintInsightsOutputSchema,
      });

      return {
        summary: result.data.summary,
        insights: result.data.insights,
        metrics: {
          total: metrics.total,
          completed: metrics.completed,
          inProgress: metrics.inProgress,
          completionRate: metrics.completionRate,
          totalEffort: metrics.totalEffort,
          completedEffort: metrics.completedEffort,
        },
        meta: result.meta,
      };
    } catch (aiError) {
      // Deterministic fallback when AI is unavailable
      console.warn(`[Sprint Insights] AI generation failed (${aiError.message}). Generating deterministic grounded summary.`);

      const fallbackInsights = [];

      if (metrics.overdueTasks.length > 0) {
        fallbackInsights.push({
          type: 'risk',
          title: 'Deadline Violation Detected',
          description: `${metrics.overdueTasks.length} task(s) have passed their due dates without being marked completed.`,
          severity: 'high',
          relatedTaskIds: metrics.overdueTasks.map((t) => t.taskId),
          recommendation: 'Reassess scope and adjust target dates or allocate additional capacity.',
        });
      }

      if (metrics.criticalTasks.length > 0) {
        fallbackInsights.push({
          type: 'risk',
          title: 'Critical Priority Incomplete Work',
          description: `There are ${metrics.criticalTasks.length} critical tasks still pending or in progress.`,
          severity: 'critical',
          relatedTaskIds: metrics.criticalTasks.map((t) => t.taskId),
          recommendation: 'Ensure senior developers are actively driving critical path deliverables.',
        });
      }

      if (metrics.bottleneckTasks.length > 0) {
        fallbackInsights.push({
          type: 'bottleneck',
          title: 'Dependency Chain Blockers',
          description: `${metrics.bottleneckTasks.length} task(s) are waiting on preceding tasks that are not yet completed.`,
          severity: 'medium',
          relatedTaskIds: metrics.bottleneckTasks.map((b) => b.task.taskId),
          recommendation: 'Expedite parent tasks to unblock downstream execution.',
        });
      }

      if (fallbackInsights.length === 0) {
        fallbackInsights.push({
          type: 'progress',
          title: 'Sprint Workflow On Track',
          description: `Project progress is at ${metrics.completionRate}% with ${metrics.completed} of ${metrics.total} tasks completed.`,
          severity: 'low',
          relatedTaskIds: [],
          recommendation: 'Continue scheduled sprint iterations.',
        });
      }

      return {
        summary: `Sprint is at ${metrics.completionRate}% completion (${metrics.completed}/${metrics.total} tasks completed).`,
        insights: fallbackInsights,
        metrics: {
          total: metrics.total,
          completed: metrics.completed,
          inProgress: metrics.inProgress,
          completionRate: metrics.completionRate,
          totalEffort: metrics.totalEffort,
          completedEffort: metrics.completedEffort,
        },
        meta: {
          provider: 'deterministic_fallback',
          isAiGenerated: false,
          fallbackReason: aiError.message,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  }
}

export default new SprintInsightsService();
