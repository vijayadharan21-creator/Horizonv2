import { UNCERTAINTY_TAXONOMY } from './uncertaintyCatalog.js';

/**
 * TaskForge AI — AI-SENSE Uncertainty Detection Engine
 * Inspects real project, task, worker, and calendar state to detect risks
 * BEFORE they cause schedule collapse.
 */
export class UncertaintyDetector {
  /**
   * Observe project state and extract all detected uncertainties.
   *
   * @param {object} params
   * @param {object} params.project          - Project document
   * @param {object[]} params.tasks          - Array of task documents
   * @param {object[]} params.workers        - Array of user documents (project members)
   * @param {object} [params.config]         - Configuration: bufferHours, workingHoursPerDay
   * @returns {object[]} Array of structured risk events
   */
  detectProjectUncertainties({ project, tasks = [], workers = [], config = {} }) {
    const bufferHours = config.bufferHours ?? 4; // Configurable safety buffer (default 4 hours)
    const workingHoursPerDay = config.workingHoursPerDay ?? 8;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const detectedRisks = [];
    const unavailabilities = project?.unavailabilities || [];
    const activeTasks = tasks.filter((t) => t.status !== 'Completed');

    // Worker lookup map
    const workerMap = new Map();
    workers.forEach((w) => {
      workerMap.set(String(w._id || w.id), w);
      if (w.name) workerMap.set(w.name.toLowerCase(), w);
    });

    // ── 1. Availability Uncertainty Detections ──────────────────────────────
    for (const unavail of unavailabilities) {
      if (!unavail.userId && !unavail.userName) continue;

      const worker =
        (unavail.userId ? workerMap.get(String(unavail.userId)) : null) ||
        (unavail.userName ? workerMap.get(unavail.userName.toLowerCase()) : null);

      const workerIdStr = unavail.userId ? String(unavail.userId) : null;
      const workerName = unavail.userName || worker?.name || 'Worker';

      const fromDate = unavail.fromDate || todayStr;
      const toDate = unavail.toDate || fromDate;

      // Check worker's assigned active tasks
      const workerActiveTasks = activeTasks.filter((t) => {
        const matchesId = workerIdStr && t.assignee && String(t.assignee) === workerIdStr;
        const matchesName = t.assigneeName && t.assigneeName.toLowerCase() === workerName.toLowerCase();
        return matchesId || matchesName;
      });

      const isUpcoming = fromDate > todayStr;
      const isCurrentlyActive = fromDate <= todayStr && toDate >= todayStr;

      if (isCurrentlyActive) {
        // Find tasks scheduled during active leave
        const conflictingTasks = workerActiveTasks.filter((t) => {
          if (!t.dueDate) return true; // Undated tasks assigned to absent worker
          const start = t.startDate || todayStr;
          const due = t.dueDate;
          return start <= toDate && due >= fromDate;
        });

        if (conflictingTasks.length > 0) {
          detectedRisks.push({
            type: 'ABSENCE_STARTED',
            classification: 'OBSERVED',
            severity: 'CRITICAL',
            confidence: 1.0,
            idempotencyKey: `absence-${workerIdStr || workerName}-${fromDate}-${toDate}`,
            affectedTaskIds: conflictingTasks.map((t) => t.taskId),
            affectedWorkerIds: workerIdStr ? [workerIdStr] : [],
            evidence: {
              workerName,
              leaveInterval: { fromDate, toDate, fromTime: unavail.fromTime, toTime: unavail.toTime },
              reason: unavail.reason || 'Absence',
              conflictingTaskCount: conflictingTasks.length,
            },
            estimatedImpact: {
              totalAtRiskHours: conflictingTasks.reduce((s, t) => s + (t.effortHours || 8), 0),
              taskIds: conflictingTasks.map((t) => t.taskId),
            },
            recommendedAction: `Enforce absence: Reassign ${conflictingTasks.length} active module(s) to eligible peers.`,
            detectionRule: 'RULE_V07_ACTIVE_ABSENCE_OVERLAP',
          });
        }
      } else if (isUpcoming) {
        // Predictive Pre-leave evaluation:
        // SafeToFinish = AvailableWorkingHoursBeforeLeave >= ConservativeRemainingEffort + ConfiguredBuffer
        const daysUntilLeave = Math.max(
          0,
          Math.ceil((new Date(fromDate).getTime() - now.getTime()) / 86400000)
        );
        const availableHoursBeforeLeave = daysUntilLeave * workingHoursPerDay;

        for (const task of workerActiveTasks) {
          const remainingEffort = this.calculateConservativeRemainingEffort(task);
          const safeToFinish = availableHoursBeforeLeave >= remainingEffort + bufferHours;

          // If task due date is after leave start OR cannot finish safely before leave
          const dueDateOverlaps = task.dueDate && task.dueDate >= fromDate;

          if (!safeToFinish || dueDateOverlaps) {
            detectedRisks.push({
              type: 'UPCOMING_LEAVE',
              classification: 'PREDICTED',
              severity: 'HIGH',
              confidence: 0.95,
              idempotencyKey: `preleave-${task.taskId}-${workerIdStr || workerName}-${fromDate}`,
              affectedTaskIds: [task.taskId],
              affectedWorkerIds: workerIdStr ? [workerIdStr] : [],
              evidence: {
                taskTitle: task.title,
                workerName,
                leaveStartDate: fromDate,
                availableHoursBeforeLeave,
                remainingEffort,
                bufferHours,
                safeToFinish,
                dueDate: task.dueDate,
              },
              estimatedImpact: {
                hoursShortfall: Math.max(0, remainingEffort + bufferHours - availableHoursBeforeLeave),
                dueDateOverlaps,
              },
              recommendedAction: `Pre-leave preparation: Reassign task ${task.taskId} before leave starts to prevent delivery slippage.`,
              detectionRule: 'RULE_PREDICTIVE_SAFE_TO_FINISH',
            });
          }
        }
      }
    }

    // ── 2. Task Execution Uncertainty (Overrun & Stagnation) ─────────────────
    for (const task of activeTasks) {
      const effort = Number(task.effortHours) || 8;
      const progress = Number(task.progress) || 0;

      // Check if task is In Progress but has exceeded reasonable time
      if (task.status === 'In Progress' && task.startDate && task.dueDate) {
        const startMs = new Date(task.startDate).getTime();
        const dueMs = new Date(task.dueDate).getTime();
        const nowMs = now.getTime();

        if (dueMs > startMs) {
          const elapsedFraction = (nowMs - startMs) / (dueMs - startMs);
          const progressFraction = progress / 100;

          // Significant pace divergence: > 70% elapsed with < 30% progress
          if (elapsedFraction > 0.7 && progressFraction < 0.3) {
            detectedRisks.push({
              type: 'DURATION_OVERRUN',
              classification: 'PREDICTED',
              severity: 'HIGH',
              confidence: 0.85,
              idempotencyKey: `overrun-${task.taskId}-${task.dueDate}`,
              affectedTaskIds: [task.taskId],
              affectedWorkerIds: task.assignee ? [String(task.assignee)] : [],
              evidence: {
                taskTitle: task.title,
                elapsedFraction: Math.round(elapsedFraction * 100) + '%',
                progress: progress + '%',
                effortHours: effort,
              },
              estimatedImpact: {
                predictedOverrunHours: Math.ceil(effort * 0.5),
              },
              recommendedAction: `Adjust remaining effort or rebalance downstream dependencies of ${task.taskId}.`,
              detectionRule: 'RULE_PACE_DIVERGENCE_OVERRUN',
            });
          }
        }
      }
    }

    // ── 3. Dependency & Scheduling Uncertainty ──────────────────────────────
    const taskByTaskId = new Map(tasks.map((t) => [t.taskId, t]));

    for (const task of activeTasks) {
      if (task.dependency && task.dependency !== 'None') {
        const parent = taskByTaskId.get(task.dependency);
        if (parent && parent.status !== 'Completed') {
          // Predecessor Due Date vs Successor Start Date
          if (parent.dueDate && task.startDate && parent.dueDate > task.startDate) {
            detectedRisks.push({
              type: 'DEPENDENCY_DELAY',
              classification: 'OBSERVED',
              severity: 'HIGH',
              confidence: 1.0,
              idempotencyKey: `depdelay-${parent.taskId}-${task.taskId}`,
              affectedTaskIds: [task.taskId, parent.taskId],
              affectedWorkerIds: [],
              evidence: {
                predecessorTaskId: parent.taskId,
                predecessorDueDate: parent.dueDate,
                successorTaskId: task.taskId,
                successorStartDate: task.startDate,
              },
              estimatedImpact: {
                overlapDays: Math.ceil(
                  (new Date(parent.dueDate).getTime() - new Date(task.startDate).getTime()) / 86400000
                ),
              },
              recommendedAction: `Cascade start date of ${task.taskId} to follow ${parent.taskId} completion.`,
              detectionRule: 'RULE_V05_DEPENDENCY_TIMING',
            });
          }
        }
      }

      // Check Project Deadline Conflict
      if (project?.deadline && task.dueDate && task.dueDate > project.deadline) {
        detectedRisks.push({
          type: 'DEADLINE_BREACH',
          classification: 'OBSERVED',
          severity: 'CRITICAL',
          confidence: 1.0,
          idempotencyKey: `deadline-${task.taskId}-${task.dueDate}`,
          affectedTaskIds: [task.taskId],
          affectedWorkerIds: [],
          evidence: {
            taskDueDate: task.dueDate,
            projectDeadline: project.deadline,
          },
          estimatedImpact: {
            breachDays: Math.ceil(
              (new Date(task.dueDate).getTime() - new Date(project.deadline).getTime()) / 86400000
            ),
          },
          recommendedAction: `Task ${task.taskId} breaches project deadline. Fast-track with top-skilled developer.`,
          detectionRule: 'RULE_PROJECT_DEADLINE_BREACH',
        });
      }
    }

    // ── 4. Resource Overload & Skill Mismatches ─────────────────────────────
    const workerTaskIntervals = new Map();
    for (const task of activeTasks) {
      if (!task.assignee && (!task.assigneeName || task.assigneeName === 'Unassigned')) {
        detectedRisks.push({
          type: 'SKILL_MISMATCH',
          classification: 'OBSERVED',
          severity: 'MEDIUM',
          confidence: 1.0,
          idempotencyKey: `unassigned-${task.taskId}`,
          affectedTaskIds: [task.taskId],
          affectedWorkerIds: [],
          evidence: { taskTitle: task.title },
          estimatedImpact: { effortHours: task.effortHours || 8 },
          recommendedAction: `Assign task ${task.taskId} to an available team member.`,
          detectionRule: 'RULE_UNASSIGNED_TASK',
        });
        continue;
      }

      const wid = task.assignee ? String(task.assignee) : task.assigneeName.toLowerCase();
      if (!workerTaskIntervals.has(wid)) workerTaskIntervals.set(wid, []);
      workerTaskIntervals.get(wid).push(task);
    }

    // Check for worker overlaps
    for (const [wid, tList] of workerTaskIntervals.entries()) {
      if (tList.length > 1) {
        for (let i = 0; i < tList.length; i++) {
          for (let j = i + 1; j < tList.length; j++) {
            const t1 = tList[i];
            const t2 = tList[j];
            if (t1.startDate && t1.dueDate && t2.startDate && t2.dueDate) {
              if (t1.startDate <= t2.dueDate && t2.startDate <= t1.dueDate) {
                detectedRisks.push({
                  type: 'CAPACITY_CONFLICT',
                  classification: 'OBSERVED',
                  severity: 'MEDIUM',
                  confidence: 1.0,
                  idempotencyKey: `overlap-${wid}-${t1.taskId}-${t2.taskId}`,
                  affectedTaskIds: [t1.taskId, t2.taskId],
                  affectedWorkerIds: t1.assignee ? [String(t1.assignee)] : [],
                  evidence: {
                    worker: t1.assigneeName || wid,
                    task1: { id: t1.taskId, start: t1.startDate, due: t1.dueDate },
                    task2: { id: t2.taskId, start: t2.startDate, due: t2.dueDate },
                  },
                  estimatedImpact: {
                    concurrencyHours: (t1.effortHours || 0) + (t2.effortHours || 0),
                  },
                  recommendedAction: `Stagger tasks ${t1.taskId} and ${t2.taskId} sequentially to eliminate overload.`,
                  detectionRule: 'RULE_V06_WORKER_CONCURRENCY_OVERLAP',
                });
              }
            }
          }
        }
      }
    }

    // ── 5. Compound Multiple Disruptions Aggregation ────────────────────────
    if (detectedRisks.length >= 2) {
      const distinctTypes = Array.from(new Set(detectedRisks.map((r) => r.type)));
      detectedRisks.unshift({
        type: 'MULTIPLE_DISRUPTIONS',
        classification: 'INFERRED',
        severity: 'CRITICAL',
        confidence: 0.98,
        idempotencyKey: `compound-${project?._id || 'proj'}-${todayStr}-${detectedRisks.length}`,
        affectedTaskIds: Array.from(new Set(detectedRisks.flatMap((r) => r.affectedTaskIds))),
        affectedWorkerIds: Array.from(new Set(detectedRisks.flatMap((r) => r.affectedWorkerIds))),
        evidence: {
          distinctDisruptionCount: distinctTypes.length,
          disruptionTypes: distinctTypes,
          totalEventCount: detectedRisks.length,
        },
        estimatedImpact: {
          compoundRiskScore: detectedRisks.length * 10,
        },
        recommendedAction: 'Engage holistic EDUR replanning: Solve all interacting disruptions in a single planning pass.',
        detectionRule: 'RULE_COMPOUND_DISRUPTION_AGGREGATION',
      });
    }

    return detectedRisks;
  }

  /**
   * Calculate conservative remaining effort accounting for reported progress
   * and a non-linear completion tail.
   */
  calculateConservativeRemainingEffort(task) {
    const totalEffort = Number(task.effortHours) || 8;
    const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));

    if (task.status === 'Completed' || progress >= 100) return 0;

    // Software engineering principle: unstarted tasks carry estimation buffer (15%), and lagging progress carries inflation
    const linearRemaining = totalEffort * (1 - progress / 100);
    const uncertaintyInflation = progress < 50 ? 1.15 : 1.1;
    return Math.max(1, Math.round(linearRemaining * uncertaintyInflation * 10) / 10);
  }
}

export default new UncertaintyDetector();
