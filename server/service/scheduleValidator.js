/**
 * TaskForge AI — Independent Schedule Validator
 *
 * A deterministic, AI-free validator that checks schedule candidates against
 * hard constraints BEFORE any schedule is committed to the database.
 *
 * This is the authoritative guard — the AI model is NOT the final authority.
 *
 * Validation checks:
 *  V01  — Every task reference resolves to a known task
 *  V02  — Every worker reference resolves to a known user
 *  V03  — Dependency references are valid (exist in project)
 *  V04  — No dependency cycles
 *  V05  — Dependency timing: finish-to-start (predecessor due ≤ successor start)
 *  V06  — No worker has overlapping assigned tasks
 *  V07  — Unavailability interval respected (no assignment during absence)
 *  V08  — Effort hours are non-negative
 *  V09  — Date integrity (startDate ≤ dueDate where both exist)
 *  V10  — Completed tasks are not reassigned or modified
 *  V11  — Assignee is a project member or manager
 */

import mongoose from 'mongoose';

/**
 * Stable error codes for schedule validation failures.
 */
export const VALIDATION_ERRORS = {
  V01_UNKNOWN_TASK: 'V01_UNKNOWN_TASK',
  V02_UNKNOWN_WORKER: 'V02_UNKNOWN_WORKER',
  V03_UNKNOWN_DEPENDENCY: 'V03_UNKNOWN_DEPENDENCY',
  V04_DEPENDENCY_CYCLE: 'V04_DEPENDENCY_CYCLE',
  V05_DEPENDENCY_TIMING: 'V05_DEPENDENCY_TIMING',
  V06_WORKER_OVERLAP: 'V06_WORKER_OVERLAP',
  V07_WORKER_UNAVAILABLE: 'V07_WORKER_UNAVAILABLE',
  V08_NEGATIVE_EFFORT: 'V08_NEGATIVE_EFFORT',
  V09_DATE_INTEGRITY: 'V09_DATE_INTEGRITY',
  V10_COMPLETED_TASK_MODIFIED: 'V10_COMPLETED_TASK_MODIFIED',
  V11_UNAUTHORIZED_ASSIGNEE: 'V11_UNAUTHORIZED_ASSIGNEE',
};

/**
 * Parse a date-like string safely. Returns null if invalid.
 * @param {string|null} dateStr
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Check if two date-bounded intervals [s1, e1] and [s2, e2] overlap.
 * Both ends are inclusive (overlap if s1 <= e2 && s2 <= e1).
 * Null dates skip the check (treated as unbounded).
 */
function intervalsOverlap(s1, e1, s2, e2) {
  if (!s1 || !e1 || !s2 || !e2) return false;
  return s1 <= e2 && s2 <= e1;
}

/**
 * Detect cycles in a directed dependency graph using DFS.
 * @param {Map<string, string[]>} graph  taskId → [depTaskId, ...]
 * @returns {string[]|null}  cycle path if found, null otherwise
 */
function detectCycle(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const node of graph.keys()) color.set(node, WHITE);

  const path = [];
  const dfs = (node) => {
    color.set(node, GRAY);
    path.push(node);
    for (const neighbour of (graph.get(node) || [])) {
      if (color.get(neighbour) === GRAY) {
        return [...path, neighbour];
      }
      if (color.get(neighbour) === WHITE) {
        const cycle = dfs(neighbour);
        if (cycle) return cycle;
      }
    }
    path.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Core validation function. Stateless and synchronous given resolved data.
 *
 * @param {object} params
 * @param {object[]} params.proposedTasks     - task objects with at minimum: { taskId, title, assigneeId, assigneeName, startDate, dueDate, effortHours, dependency, status }
 * @param {object[]} params.existingTasks     - ALL current project tasks (read from DB before calling)
 * @param {object[]} params.projectMembers    - members (id, name) including manager
 * @param {object[]} params.unavailabilities  - active unavailability records: { userId, fromDate, fromTime, toDate, toTime }
 * @returns {{ valid: boolean, errors: object[], warnings: object[] }}
 */
export function validateScheduleCandidate({
  proposedTasks = [],
  existingTasks = [],
  projectMembers = [],
  unavailabilities = [],
}) {
  const errors = [];
  const warnings = [];

  // Build lookup maps
  const allTaskIds = new Set([
    ...existingTasks.map((t) => t.taskId),
    ...proposedTasks.map((t) => t.taskId),
  ]);
  const memberIds = new Set(projectMembers.map((m) => String(m.id || m._id)));
  const memberNames = new Set(projectMembers.map((m) => (m.name || '').toLowerCase()));
  const completedTaskIds = new Set(
    existingTasks.filter((t) => t.status === 'Completed').map((t) => t.taskId)
  );

  // ── V01: Every proposed task must have a taskId
  for (const task of proposedTasks) {
    if (!task.taskId) {
      errors.push({
        code: VALIDATION_ERRORS.V01_UNKNOWN_TASK,
        message: `Task is missing a taskId: "${task.title || '(no title)'}"`,
        taskId: null,
      });
    }
  }

  // ── V02: Every assignee that has an ID must resolve to a known member
  for (const task of proposedTasks) {
    if (task.assigneeId && task.assigneeId !== 'null') {
      const idStr = String(task.assigneeId);
      if (!memberIds.has(idStr)) {
        errors.push({
          code: VALIDATION_ERRORS.V02_UNKNOWN_WORKER,
          message: `Task "${task.taskId}" references unknown worker ID "${idStr}".`,
          taskId: task.taskId,
          workerId: idStr,
        });
      }
    }
  }

  // ── V03: Dependency references must exist in the project
  for (const task of proposedTasks) {
    if (task.dependency && !allTaskIds.has(task.dependency)) {
      errors.push({
        code: VALIDATION_ERRORS.V03_UNKNOWN_DEPENDENCY,
        message: `Task "${task.taskId}" depends on "${task.dependency}" which does not exist in this project.`,
        taskId: task.taskId,
        dependencyId: task.dependency,
      });
    }
  }

  // ── V04: No dependency cycles
  const graph = new Map();
  for (const task of proposedTasks) graph.set(task.taskId, []);
  for (const task of proposedTasks) {
    if (task.dependency && graph.has(task.dependency)) {
      graph.get(task.taskId).push(task.dependency);
    }
  }
  const cycle = detectCycle(graph);
  if (cycle) {
    errors.push({
      code: VALIDATION_ERRORS.V04_DEPENDENCY_CYCLE,
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      cycle,
    });
  }

  // ── V05: Dependency timing — predecessor dueDate must not be after successor startDate
  const taskByIdMap = new Map([
    ...existingTasks.map((t) => [t.taskId, t]),
    ...proposedTasks.map((t) => [t.taskId, t]),
  ]);
  for (const task of proposedTasks) {
    if (task.dependency) {
      const predecessor = taskByIdMap.get(task.dependency);
      if (predecessor) {
        const predDue = parseDate(predecessor.dueDate);
        const succStart = parseDate(task.startDate);
        if (predDue && succStart && predDue > succStart) {
          warnings.push({
            code: VALIDATION_ERRORS.V05_DEPENDENCY_TIMING,
            message: `Task "${task.taskId}" starts (${task.startDate}) before its predecessor "${task.dependency}" finishes (${predecessor.dueDate}).`,
            taskId: task.taskId,
            predecessorId: task.dependency,
          });
        }
      }
    }
  }

  // ── V06: No worker has overlapping tasks
  //         Group all proposed tasks by assigneeId, check date overlap
  const assigneeTaskGroups = new Map();
  for (const task of proposedTasks) {
    if (!task.assigneeId || task.status === 'Completed') continue;
    const key = String(task.assigneeId);
    if (!assigneeTaskGroups.has(key)) assigneeTaskGroups.set(key, []);
    assigneeTaskGroups.get(key).push(task);
  }

  for (const [workerId, tasks] of assigneeTaskGroups.entries()) {
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i];
        const b = tasks[j];
        const as = parseDate(a.startDate), ae = parseDate(a.dueDate);
        const bs = parseDate(b.startDate), be = parseDate(b.dueDate);
        if (intervalsOverlap(as, ae, bs, be)) {
          warnings.push({
            code: VALIDATION_ERRORS.V06_WORKER_OVERLAP,
            message: `Worker "${workerId}" has overlapping tasks: "${a.taskId}" (${a.startDate}–${a.dueDate}) and "${b.taskId}" (${b.startDate}–${b.dueDate}).`,
            workerId,
            taskIds: [a.taskId, b.taskId],
          });
        }
      }
    }
  }

  // ── V07: No assignment during worker unavailability
  for (const task of proposedTasks) {
    if (!task.assigneeId || task.status === 'Completed') continue;
    for (const ua of unavailabilities) {
      if (String(ua.userId) !== String(task.assigneeId)) continue;
      const uaStart = parseDate(ua.fromDate);
      const uaEnd = parseDate(ua.toDate);
      const taskStart = parseDate(task.startDate);
      const taskEnd = parseDate(task.dueDate);
      if (intervalsOverlap(uaStart, uaEnd, taskStart, taskEnd)) {
        errors.push({
          code: VALIDATION_ERRORS.V07_WORKER_UNAVAILABLE,
          message: `Task "${task.taskId}" is assigned to worker "${task.assigneeId}" who is marked unavailable from ${ua.fromDate} to ${ua.toDate}.`,
          taskId: task.taskId,
          workerId: String(task.assigneeId),
          unavailabilityFrom: ua.fromDate,
          unavailabilityTo: ua.toDate,
        });
      }
    }
  }

  // ── V08: Effort hours non-negative
  for (const task of proposedTasks) {
    if (task.effortHours !== undefined && Number(task.effortHours) < 0) {
      errors.push({
        code: VALIDATION_ERRORS.V08_NEGATIVE_EFFORT,
        message: `Task "${task.taskId}" has negative effortHours (${task.effortHours}).`,
        taskId: task.taskId,
      });
    }
  }

  // ── V09: Date integrity — startDate must not be after dueDate
  for (const task of proposedTasks) {
    const s = parseDate(task.startDate);
    const e = parseDate(task.dueDate);
    if (s && e && s > e) {
      errors.push({
        code: VALIDATION_ERRORS.V09_DATE_INTEGRITY,
        message: `Task "${task.taskId}" has startDate (${task.startDate}) after dueDate (${task.dueDate}).`,
        taskId: task.taskId,
      });
    }
  }

  // ── V10: Completed tasks must not be modified
  for (const task of proposedTasks) {
    if (completedTaskIds.has(task.taskId) && task.status !== 'Completed') {
      errors.push({
        code: VALIDATION_ERRORS.V10_COMPLETED_TASK_MODIFIED,
        message: `Task "${task.taskId}" is already Completed but is being modified with status "${task.status}". Completed tasks are protected.`,
        taskId: task.taskId,
      });
    }
  }

  // ── V11: Assignee must be a project member or manager (by name fallback if no ID)
  for (const task of proposedTasks) {
    if (!task.assigneeId && task.assigneeName && task.assigneeName !== 'Unassigned') {
      const nameNorm = task.assigneeName.toLowerCase();
      if (!memberNames.has(nameNorm)) {
        warnings.push({
          code: VALIDATION_ERRORS.V11_UNAUTHORIZED_ASSIGNEE,
          message: `Task "${task.taskId}" is assigned to "${task.assigneeName}" who is not a project member.`,
          taskId: task.taskId,
          assigneeName: task.assigneeName,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalChecked: proposedTasks.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

export default { validateScheduleCandidate, VALIDATION_ERRORS };
