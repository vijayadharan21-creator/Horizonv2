/**
 * TaskForge AI — AI-SENSE Uncertainty Catalog
 * Comprehensive taxonomy covering 7 categories of software project uncertainty.
 */

export const UNCERTAINTY_CATEGORIES = {
  AVAILABILITY: 'AVAILABILITY',
  TASK_EXECUTION: 'TASK_EXECUTION',
  DEPENDENCY_SCHEDULING: 'DEPENDENCY_SCHEDULING',
  SKILL_RESOURCE: 'SKILL_RESOURCE',
  REQUIREMENTS: 'REQUIREMENTS',
  EXTERNAL_INFRASTRUCTURE: 'EXTERNAL_INFRASTRUCTURE',
  DATA_AI_RELIABILITY: 'DATA_AI_RELIABILITY',
};

export const UNCERTAINTY_TAXONOMY = {
  // ── Category A: Availability Uncertainty ────────────────────────────────────
  UPCOMING_LEAVE: {
    category: UNCERTAINTY_CATEGORIES.AVAILABILITY,
    name: 'Planned / Upcoming Leave',
    detectionMethod: 'deterministic_predictive',
    requiredEvidence: ['workerId', 'leaveInterval', 'assignedTasks', 'availableHoursBeforeLeave'],
    defaultSeverity: 'HIGH',
    impactCalculation: (taskHours, availableHours) => Math.max(0, taskHours - availableHours),
    recoveryAction: 'PRE_LEAVE_HANDOFF_OR_REASSIGN',
    status: 'IMPLEMENTED',
  },
  ABSENCE_STARTED: {
    category: UNCERTAINTY_CATEGORIES.AVAILABILITY,
    name: 'Unexpected / Active Absence Started',
    detectionMethod: 'event_driven',
    requiredEvidence: ['workerId', 'currentDate', 'overlappingUnfinishedTasks'],
    defaultSeverity: 'CRITICAL',
    impactCalculation: (activeTasks) => activeTasks.reduce((sum, t) => sum + (t.effortHours || 0), 0),
    recoveryAction: 'ENFORCE_ABSENCE_AND_REALLOCATE',
    status: 'IMPLEMENTED',
  },
  WORKER_RETURNED: {
    category: UNCERTAINTY_CATEGORIES.AVAILABILITY,
    name: 'Worker Returned (Early or Scheduled)',
    detectionMethod: 'event_driven',
    requiredEvidence: ['workerId', 'returnDate', 'previouslyReassignedTasks'],
    defaultSeverity: 'LOW',
    impactCalculation: () => 0,
    recoveryAction: 'POST_LEAVE_TRANSFER_EVALUATION',
    status: 'IMPLEMENTED',
  },
  EXTENDED_LEAVE: {
    category: UNCERTAINTY_CATEGORIES.AVAILABILITY,
    name: 'Extended Leave Window',
    detectionMethod: 'event_driven',
    requiredEvidence: ['workerId', 'originalToDate', 'newToDate', 'affectedTasks'],
    defaultSeverity: 'HIGH',
    impactCalculation: (newAffectedTasks) => newAffectedTasks.length * 8,
    recoveryAction: 'EXTEND_REASSIGNMENT_HORIZON',
    status: 'IMPLEMENTED',
  },
  PARTIAL_DAY_AVAILABILITY: {
    category: UNCERTAINTY_CATEGORIES.AVAILABILITY,
    name: 'Partial-Day Working Hours',
    detectionMethod: 'deterministic',
    requiredEvidence: ['workerId', 'availableHoursPerDay', 'taskDuration'],
    defaultSeverity: 'MEDIUM',
    impactCalculation: (needed, avail) => Math.max(0, needed - avail),
    recoveryAction: 'SPLIT_OR_RESCHEDULE_WINDOW',
    status: 'IMPLEMENTED',
  },

  // ── Category B: Task Execution Uncertainty ──────────────────────────────────
  DURATION_OVERRUN: {
    category: UNCERTAINTY_CATEGORIES.TASK_EXECUTION,
    name: 'Task Duration Overrun',
    detectionMethod: 'statistical_predictive',
    requiredEvidence: ['taskId', 'elapsedTime', 'progressPercent', 'originalEstimate'],
    defaultSeverity: 'HIGH',
    impactCalculation: (original, multiplier) => original * (multiplier - 1),
    recoveryAction: 'RESCHEDULE_DOWNSTREAM_AND_REBALANCE',
    status: 'IMPLEMENTED',
  },
  PROGRESS_STAGNATION: {
    category: UNCERTAINTY_CATEGORIES.TASK_EXECUTION,
    name: 'Stalled / Stagnant Progress',
    detectionMethod: 'statistical',
    requiredEvidence: ['taskId', 'daysWithoutProgress', 'dueDate'],
    defaultSeverity: 'MEDIUM',
    impactCalculation: (stalledDays) => stalledDays * 6,
    recoveryAction: 'PROMPT_CHECKIN_OR_REALLOCATE',
    status: 'IMPLEMENTED',
  },
  QUALITY_REWORK: {
    category: UNCERTAINTY_CATEGORIES.TASK_EXECUTION,
    name: 'Review Rejection / Rework Required',
    detectionMethod: 'event_driven',
    requiredEvidence: ['taskId', 'reworkEffortHours', 'dueDate'],
    defaultSeverity: 'HIGH',
    impactCalculation: (reworkHours) => reworkHours,
    recoveryAction: 'INJECT_REWORK_HOURS_AND_CASCADE',
    status: 'IMPLEMENTED',
  },

  // ── Category C: Dependency & Scheduling Uncertainty ─────────────────────────
  DEPENDENCY_DELAY: {
    category: UNCERTAINTY_CATEGORIES.DEPENDENCY_SCHEDULING,
    name: 'Predecessor Task Delayed',
    detectionMethod: 'deterministic',
    requiredEvidence: ['taskId', 'prerequisiteTaskId', 'predecessorDueDate', 'successorStartDate'],
    defaultSeverity: 'CRITICAL',
    impactCalculation: (gapDays) => Math.max(0, gapDays),
    recoveryAction: 'CASCADE_START_DATES_DOWNSTREAM',
    status: 'IMPLEMENTED',
  },
  DEADLINE_BREACH: {
    category: UNCERTAINTY_CATEGORIES.DEPENDENCY_SCHEDULING,
    name: 'Project Deadline Conflict',
    detectionMethod: 'deterministic',
    requiredEvidence: ['taskId', 'taskDueDate', 'projectDeadline'],
    defaultSeverity: 'CRITICAL',
    impactCalculation: (taskDue, projDue) => (new Date(taskDue) - new Date(projDue)) / 86400000,
    recoveryAction: 'COMPRESS_BUFFER_OR_REALLOCATE_FAST_WORKER',
    status: 'IMPLEMENTED',
  },

  // ── Category D: Skill & Resource Uncertainty ────────────────────────────────
  SKILL_MISMATCH: {
    category: UNCERTAINTY_CATEGORIES.SKILL_RESOURCE,
    name: 'Worker Lacks Required Sub-Skill',
    detectionMethod: 'deterministic',
    requiredEvidence: ['taskId', 'workerId', 'requiredSkills', 'workerSkills'],
    defaultSeverity: 'HIGH',
    impactCalculation: () => 10,
    recoveryAction: 'REASSIGN_TO_MATCHED_SKILLED_PEER',
    status: 'IMPLEMENTED',
  },
  CAPACITY_CONFLICT: {
    category: UNCERTAINTY_CATEGORIES.SKILL_RESOURCE,
    name: 'Worker Overloaded / Overlapping Assignments',
    detectionMethod: 'deterministic',
    requiredEvidence: ['workerId', 'overlappingTaskIds', 'interval'],
    defaultSeverity: 'MEDIUM',
    impactCalculation: (numTasks) => (numTasks - 1) * 8,
    recoveryAction: 'STAGGER_ASSIGNMENTS_OR_REALLOCATE',
    status: 'IMPLEMENTED',
  },
  NO_ELIGIBLE_REPLACEMENT: {
    category: UNCERTAINTY_CATEGORIES.SKILL_RESOURCE,
    name: 'No Eligible Replacement Worker in Project',
    detectionMethod: 'deterministic',
    requiredEvidence: ['taskId', 'requiredSkills', 'availableWorkers'],
    defaultSeverity: 'CRITICAL',
    impactCalculation: () => 24,
    recoveryAction: 'MARK_BLOCKED_AND_ALERT_PM',
    status: 'IMPLEMENTED',
  },

  // ── Category E: Requirements Uncertainty ────────────────────────────────────
  SCOPE_CHANGE: {
    category: UNCERTAINTY_CATEGORIES.REQUIREMENTS,
    name: 'Scope Expanded / Requirements Modified',
    detectionMethod: 'event_driven',
    requiredEvidence: ['taskId', 'addedEffortHours'],
    defaultSeverity: 'MEDIUM',
    impactCalculation: (addedHours) => addedHours,
    recoveryAction: 'RECOMPUTE_SPRINT_CAPACITY',
    status: 'IMPLEMENTED',
  },

  // ── Category F & G: Compound Disruptions & Reliability ──────────────────────
  MULTIPLE_DISRUPTIONS: {
    category: UNCERTAINTY_CATEGORIES.DATA_AI_RELIABILITY,
    name: 'Simultaneous Concurrent Disruptions',
    detectionMethod: 'compound_aggregation',
    requiredEvidence: ['eventIds', 'disruptionTypes', 'affectedTaskCount'],
    defaultSeverity: 'CRITICAL',
    impactCalculation: (events) => events.length * 12,
    recoveryAction: 'HOLISTIC_SNAPSHOT_REPLANNING',
    status: 'IMPLEMENTED',
  },
  DATA_CONFLICT: {
    category: UNCERTAINTY_CATEGORIES.DATA_AI_RELIABILITY,
    name: 'Conflicting Schedule Version / Stale Snapshot',
    detectionMethod: 'deterministic',
    requiredEvidence: ['clientVersion', 'serverVersion'],
    defaultSeverity: 'HIGH',
    impactCalculation: () => 0,
    recoveryAction: 'REFRESH_SNAPSHOT_AND_RETRY',
    status: 'IMPLEMENTED',
  },
};
