import { z } from 'zod';

const PRIORITY_VALUES = ['Low', 'Medium', 'High', 'Critical'];

const coercedNumber = (min, max, fallback) =>
  z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().min(min).max(max).default(fallback));

const coercedPriority = z.preprocess((value) => {
  if (typeof value !== 'string') return value || 'Medium';
  const normalized = value.trim().toLowerCase();
  const match = PRIORITY_VALUES.find((item) => item.toLowerCase() === normalized);
  return match || 'Medium';
}, z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'));

const stringArray = z.preprocess((value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}, z.array(z.string()).default([]));

// ─── Task Generation Schema ───────────────────────────────────────────────────

export const TaskSuggestionSchema = z.object({
  suggestionId: z.string().default(() => `SUGG-${Math.floor(100 + Math.random() * 900)}`),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().default(''),
  suggestedRole: z.string().default('Full Stack Developer'),
  requiredSkills: stringArray,
  effortHours: coercedNumber(1, 80, 4),
  priority: coercedPriority,
  suggestedStartDate: z.string().optional().default(''),
  suggestedDueDate: z.string().optional().default(''),
  dependencies: stringArray,
});

export const TaskGenerationOutputSchema = z.object({
  tasks: z.array(TaskSuggestionSchema).min(1, 'At least one task suggestion is required'),
});

/**
 * Validates dependencies between generated tasks and existing tasks:
 * 1. No self-dependencies
 * 2. All dependency references exist either in generated suggestions or in existing project tasks
 * 3. No circular dependency loops (DFS cycle detection)
 */
export const validateTaskDependencies = (tasks, existingTaskIds = []) => {
  const existingSet = new Set(existingTaskIds.map(String));
  const suggestionIds = new Set(tasks.map((t) => t.suggestionId));

  // Build adjacency list for cycle detection
  const graph = new Map();
  tasks.forEach((t) => graph.set(t.suggestionId, []));

  for (const task of tasks) {
    for (const dep of task.dependencies || []) {
      // 1. Check self-dependency
      if (dep === task.suggestionId) {
        throw new Error(`Self-dependency detected: Task "${task.title}" cannot depend on itself.`);
      }

      // 2. Check existence
      if (!suggestionIds.has(dep) && !existingSet.has(dep)) {
        throw new Error(
          `Invalid dependency reference "${dep}" in task "${task.title}". Must refer to an existing task or a proposal item.`
        );
      }

      // If it refers to another task within the proposal, add edge
      if (suggestionIds.has(dep)) {
        graph.get(task.suggestionId).push(dep);
      }
    }
  }

  // 3. Cycle detection using DFS (0 = unvisited, 1 = visiting, 2 = visited)
  const visited = new Map();
  tasks.forEach((t) => visited.set(t.suggestionId, 0));

  const hasCycle = (node, path = []) => {
    visited.set(node, 1);
    path.push(node);

    for (const neighbor of graph.get(node) || []) {
      if (visited.get(neighbor) === 1) {
        const cycle = [...path, neighbor].join(' -> ');
        throw new Error(`Circular dependency chain detected: ${cycle}`);
      }
      if (visited.get(neighbor) === 0) {
        if (hasCycle(neighbor, path)) return true;
      }
    }

    visited.set(node, 2);
    path.pop();
    return false;
  };

  for (const task of tasks) {
    if (visited.get(task.suggestionId) === 0) {
      hasCycle(task.suggestionId);
    }
  }

  return true;
};

// ─── Assignment Recommendation Schema ─────────────────────────────────────────

export const AssignmentCandidateSchema = z.object({
  taskId: z.string(),
  developerId: z.string(),
  displayName: z.string(),
  skillMatchExplanation: z.string(),
  currentWorkload: coercedNumber(0, 1000, 0),
  availableCapacity: coercedNumber(0, 1000, 0),
  suggestedAllocation: coercedNumber(1, 80, 4),
  recommendationReason: z.string(),
  schedulingRisks: stringArray,
});

export const AssignmentRecommendationOutputSchema = z.object({
  recommendations: z.array(AssignmentCandidateSchema),
});

// ─── Sprint Insights Schema ───────────────────────────────────────────────────

export const SprintInsightItemSchema = z.object({
  type: z.enum(['risk', 'bottleneck', 'optimization', 'progress', 'workload']).default('risk'),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  relatedTaskIds: stringArray,
  recommendation: z.string(),
});

export const SprintInsightsOutputSchema = z.object({
  summary: z.string(),
  insights: z.array(SprintInsightItemSchema).default([]),
});

// ─── Recovery Recommendations Schema ──────────────────────────────────────────

export const RecoveryActionSchema = z.object({
  actionType: z.enum(['reassign', 'reschedule', 'adjust_priority']),
  taskId: z.string(),
  taskTitle: z.string().optional(),
  currentAssigneeId: z.string().nullable().optional(),
  recommendedAssigneeId: z.string().nullable().optional(),
  recommendedAssigneeName: z.string().optional(),
  originalDueDate: z.string().optional(),
  proposedDueDate: z.string().optional(),
  priorityAdjustment: z.string().optional(),
  reason: z.string(),
});

export const RecoveryRecommendationOutputSchema = z.object({
  summary: z.string(),
  actions: z.array(RecoveryActionSchema).default([]),
  preservedCompletedTasks: z.array(z.string()).default([]),
  risksAndWarnings: z.array(z.string()).default([]),
});

// ─── Task Assistance Schema ───────────────────────────────────────────────────

export const TaskAssistanceOutputSchema = z.object({
  improvedDescription: z.string().default(''),
  acceptanceCriteria: stringArray,
  suggestedSkills: stringArray,
  estimatedEffortHours: coercedNumber(1, 80, 4),
  suggestedPriority: coercedPriority,
  dependencyAnalysis: z.string().optional().default(''),
  progressSummary: z.string().optional().default(''),
});

// ─── SRS Document Analysis & Template Schema ──────────────────────────────────

export const SrsModuleSchema = z.object({
  moduleId: z.string().default(() => `MOD-${Math.floor(100 + Math.random() * 900)}`),
  title: z.string().min(2),
  description: z.string().default(''),
  category: z.string().default('General'),
  isIndependent: z.boolean().default(true),
  dependencies: stringArray,
  effortHours: coercedNumber(1, 120, 8),
  priority: coercedPriority,
  suggestedRole: z.string().default('Software Engineer'),
  suggestedSkills: stringArray,
  suggestedAssignee: z.string().optional().default('Unassigned'),
});

export const SrsAnalysisOutputSchema = z.object({
  projectName: z.string().default('New Software Project'),
  projectKey: z.string().default('PROJ'),
  summary: z.string().default('Decomposed requirements for implementation.'),
  timelineAnalysis: z.object({
    totalEffortHours: coercedNumber(1, 10000, 40),
    criticalPathDays: coercedNumber(1, 365, 10),
    safeBufferDays: coercedNumber(0, 120, 5),
    recommendedDeadline: z.string().default(''),
    riskAssessment: z.string().default('Low scheduling risk under standard velocity.'),
  }),
  modules: z.array(SrsModuleSchema).min(1, 'At least one module must be extracted.'),
});
