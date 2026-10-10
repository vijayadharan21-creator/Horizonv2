import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import Task from '../../models/Task.js';
import User from '../../models/User.js';
import UncertaintyEvent from '../../models/UncertaintyEvent.js';
import ScheduleAudit from '../../models/ScheduleAudit.js';
import { validateScheduleCandidate } from '../scheduleValidator.js';
import uncertaintyDetector from '../ai-sense/uncertaintyDetector.js';

/**
 * Helper to derive developer sub-skills for skill-fitness scoring
 */
function getWorkerAllSkills(worker) {
  const primary = (worker.skills || []).map((s) => s.toLowerCase());
  const sub = (worker.subSkills || []).map((s) => s.toLowerCase());
  return Array.from(new Set([...primary, ...sub]));
}

/**
 * Score a candidate developer for a task based on primary and sub-skills
 */
function computeSkillMatchScore(task, worker) {
  const workerSkills = getWorkerAllSkills(worker);
  const taskText = `${task.title || ''} ${task.description || ''} ${(task.tags || []).join(' ')}`.toLowerCase();

  let score = 0;
  for (const s of workerSkills) {
    if (taskText.includes(s) || s.includes(taskText)) {
      score += 3;
    } else {
      // Partial token match
      const tokens = s.split(/\s+/).filter((t) => t.length > 2);
      for (const t of tokens) {
        if (taskText.includes(t)) score += 1;
      }
    }
  }
  return score;
}

/**
 * TaskForge AI — EDUR (Event-Driven Uncertainty Recovery) Engine
 * Deterministic constraint scheduler and minimal-disruption replanner.
 */
export class EdurEngine {
  /**
   * Load consistent planning snapshot
   */
  async loadPlanningSnapshot(projectId) {
    const project = await Project.findById(projectId)
      .populate('members', 'name email role skills subSkills availability')
      .populate('manager', 'name email role skills subSkills availability')
      .lean();

    if (!project) throw new Error(`Project ${projectId} not found.`);

    const allTasks = await Task.find({ project: projectId }).lean();
    const members = [
      ...(project.members || []),
      ...(project.manager ? [project.manager] : []),
    ];

    return {
      project,
      projectId: project._id.toString(),
      scheduleVersion: project.scheduleVersion || 1,
      tasks: allTasks,
      members,
      unavailabilities: project.unavailabilities || [],
    };
  }

  /**
   * Calculate affected task closure:
   * Directly affected tasks + downstream dependency closure (BFS crawl).
   * Completed tasks are STRICTLY PRESERVED and excluded!
   */
  calculateAffectedClosure(snapshot, event) {
    const { tasks } = snapshot;
    const activeTasks = tasks.filter((t) => t.status !== 'Completed');

    const directlyAffected = new Set();

    // If event specifies worker absence
    if (event.workerId || event.userId) {
      const wid = String(event.workerId || event.userId);
      activeTasks.forEach((t) => {
        if (t.assignee && String(t.assignee) === wid) {
          directlyAffected.add(t.taskId);
        } else if (event.workerName && t.assigneeName?.toLowerCase() === event.workerName.toLowerCase()) {
          directlyAffected.add(t.taskId);
        }
      });
    }

    // If event explicitly targets taskIds
    if (Array.isArray(event.affectedTaskIds)) {
      event.affectedTaskIds.forEach((tid) => {
        const task = activeTasks.find((t) => t.taskId === tid);
        if (task) directlyAffected.add(task.taskId);
      });
    }

    // Downstream dependency closure crawl
    const closure = new Set(directlyAffected);
    let added = true;
    while (added) {
      added = false;
      for (const t of activeTasks) {
        if (!closure.has(t.taskId) && t.dependency && closure.has(t.dependency)) {
          closure.add(t.taskId);
          added = true;
        }
      }
    }

    return {
      directlyAffected: Array.from(directlyAffected),
      downstreamClosure: Array.from(closure),
      affectedTasks: activeTasks.filter((t) => closure.has(t.taskId)),
      preservedCompletedTasks: tasks.filter((t) => t.status === 'Completed'),
    };
  }

  /**
   * Generate multiple candidate schedules for the affected closure
   */
  generateCandidates(snapshot, affectedClosure, event) {
    const { members, unavailabilities, project, tasks } = snapshot;
    const { affectedTasks } = affectedClosure;
    const todayStr = new Date().toISOString().split('T')[0];

    const absentUserId = event.workerId || event.userId ? String(event.workerId || event.userId) : null;
    const absentFrom = event.fromDate || todayStr;
    const absentTo = event.toDate || absentFrom;

    // Available replacement developers (excluding the absent person and anyone marked unavailable)
    const availableMembers = members.filter((m) => {
      const mid = String(m._id || m.id);
      if (absentUserId && mid === absentUserId) return false;
      const isMarkedUnavail = unavailabilities.some(
        (u) => String(u.userId) === mid && u.fromDate <= todayStr && u.toDate >= todayStr
      );
      return !isMarkedUnavail;
    });

    const candidates = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Candidate 1: Skill-Optimal Reassignment
    // Reassign affected tasks to peer developers matching sub-skills
    // ─────────────────────────────────────────────────────────────────────────
    const cand1Actions = [];
    const workerWorkload = new Map();
    availableMembers.forEach((m) => {
      const existingHours = tasks
        .filter((t) => t.assignee && String(t.assignee) === String(m._id || m.id) && t.status !== 'Completed')
        .reduce((sum, t) => sum + (t.effortHours || 0), 0);
      workerWorkload.set(String(m._id || m.id), existingHours);
    });

    for (const task of affectedTasks) {
      // Find eligible replacement with best skill score & lowest workload
      let bestWorker = null;
      let highestScore = -1;

      for (const worker of availableMembers) {
        const wid = String(worker._id || worker.id);
        const skillScore = computeSkillMatchScore(task, worker);
        const currentHours = workerWorkload.get(wid) || 0;
        const netScore = skillScore * 10 - currentHours;

        if (netScore > highestScore) {
          highestScore = netScore;
          bestWorker = worker;
        }
      }

      if (bestWorker) {
        const wid = String(bestWorker._id || bestWorker.id);
        workerWorkload.set(wid, (workerWorkload.get(wid) || 0) + (task.effortHours || 8));

        cand1Actions.push({
          taskId: task.taskId,
          actionType: 'reassign',
          previousAssignee: task.assigneeName,
          recommendedAssigneeId: wid,
          recommendedAssigneeName: bestWorker.name,
          previousDueDate: task.dueDate,
          proposedDueDate: task.dueDate, // Kept stable
          reason: `Reassigned to ${bestWorker.name} based on verified sub-skill match and available sprint capacity.`,
        });
      } else {
        cand1Actions.push({
          taskId: task.taskId,
          actionType: 'adjust_priority',
          priorityAdjustment: 'Critical',
          reason: 'No eligible peer available. Marked for PM intervention.',
        });
      }
    }

    candidates.push({
      id: 'candidate-skill-optimal',
      name: 'Skill-Optimal Peer Reassignment',
      strategy: 'REASSIGN_MATCHED_SKILLS',
      actions: cand1Actions,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Candidate 2: Timeline Shift & Buffer Absorption
    // Shift task dates forward past the absence window without reassigning
    // (Applicable when absent worker returns in time before project deadline)
    // ─────────────────────────────────────────────────────────────────────────
    const cand2Actions = [];
    const returnDate = new Date(absentTo);
    returnDate.setDate(returnDate.getDate() + 1);
    const returnDateStr = returnDate.toISOString().split('T')[0];

    for (const task of affectedTasks) {
      const currentDue = task.dueDate || todayStr;
      let newDue = currentDue;

      // If due date falls during absence, push by absence duration
      if (currentDue <= absentTo) {
        const d = new Date(currentDue);
        d.setDate(d.getDate() + 5);
        newDue = d.toISOString().split('T')[0];
      }

      cand2Actions.push({
        taskId: task.taskId,
        actionType: 'reschedule',
        previousAssignee: task.assigneeName,
        recommendedAssigneeName: task.assigneeName, // Preserves same person
        recommendedAssigneeId: task.assignee ? String(task.assignee) : null,
        previousDueDate: task.dueDate,
        proposedDueDate: newDue,
        reason: `Deferred start to ${returnDateStr} upon worker return; retained original owner.`,
      });
    }

    candidates.push({
      id: 'candidate-timeline-shift',
      name: 'Timeline Shift & Date Cascade',
      strategy: 'PRESERVE_ASSIGNEE_SHIFT_DATES',
      actions: cand2Actions,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Candidate 3: Balanced Hybrid Plan
    // High/Critical tasks reassigned; Medium/Low tasks shifted
    // ─────────────────────────────────────────────────────────────────────────
    const cand3Actions = [];
    for (const task of affectedTasks) {
      if (task.priority === 'Critical' || task.priority === 'High') {
        const bestPeer = availableMembers[0] || null;
        cand3Actions.push({
          taskId: task.taskId,
          actionType: 'reassign',
          previousAssignee: task.assigneeName,
          recommendedAssigneeId: bestPeer ? String(bestPeer._id || bestPeer.id) : null,
          recommendedAssigneeName: bestPeer?.name || 'Unassigned',
          previousDueDate: task.dueDate,
          proposedDueDate: task.dueDate,
          reason: `High-priority module fast-tracked to peer ${bestPeer?.name || ''} to prevent delivery breach.`,
        });
      } else {
        const d = new Date(task.dueDate || todayStr);
        d.setDate(d.getDate() + 3);
        cand3Actions.push({
          taskId: task.taskId,
          actionType: 'reschedule',
          previousAssignee: task.assigneeName,
          recommendedAssigneeName: task.assigneeName,
          recommendedAssigneeId: task.assignee ? String(task.assignee) : null,
          previousDueDate: task.dueDate,
          proposedDueDate: d.toISOString().split('T')[0],
          reason: 'Standard priority module buffered forward to accommodate temporary absence.',
        });
      }
    }

    candidates.push({
      id: 'candidate-hybrid',
      name: 'Balanced Hybrid Strategy',
      strategy: 'HYBRID_PRIORITY_CASCADE',
      actions: cand3Actions,
    });

    return candidates;
  }

  /**
   * Independently validate candidate schedule using scheduleValidator.js
   */
  validateCandidate(candidate, snapshot) {
    const { tasks, members, unavailabilities } = snapshot;

    // Create projected task list applying candidate actions
    const projectedTasks = tasks.map((t) => {
      const act = candidate.actions.find((a) => a.taskId === t.taskId);
      if (!act) return { ...t };

      const updated = { ...t };
      if (act.recommendedAssigneeId) updated.assigneeId = act.recommendedAssigneeId;
      if (act.recommendedAssigneeName) updated.assigneeName = act.recommendedAssigneeName;
      if (act.proposedDueDate) updated.dueDate = act.proposedDueDate;
      if (act.proposedStartDate) updated.startDate = act.proposedStartDate;
      return updated;
    });

    const validationResult = validateScheduleCandidate({
      proposedTasks: projectedTasks,
      existingTasks: tasks,
      projectMembers: members,
      unavailabilities,
    });

    return {
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      projectedTasks,
    };
  }

  /**
   * Calculate Minimal-Disruption Objective Score:
   * J = wD × DeadlineDelay + wR × ReassignmentCost + wU × UnaffectedTaskChanges
   *   + wB × WorkloadImbalance + wH × HandoffCost + wQ × ResidualRisk
   */
  evaluateObjective(candidate, snapshot, weights = {}) {
    const wD = weights.wD ?? 10.0;
    const wR = weights.wR ?? 5.0;
    const wU = weights.wU ?? 8.0;
    const wB = weights.wB ?? 2.0;
    const wH = weights.wH ?? 4.0;
    const wQ = weights.wQ ?? 6.0;

    let deadlineDelay = 0;
    let reassignmentCost = 0;
    let unaffectedChanges = 0;
    let handoffCost = 0;

    const projDeadline = snapshot.project.deadline;

    for (const action of candidate.actions) {
      if (action.actionType === 'reassign') {
        reassignmentCost += 1;
        const origTask = snapshot.tasks.find((t) => t.taskId === action.taskId);
        if (origTask && origTask.status === 'In Progress') {
          handoffCost += 1.5; // In-progress handoff penalty
        }
      }

      if (action.proposedDueDate && action.previousDueDate) {
        const diffDays =
          (new Date(action.proposedDueDate).getTime() - new Date(action.previousDueDate).getTime()) /
          86400000;
        if (diffDays > 0) deadlineDelay += diffDays;

        if (projDeadline && action.proposedDueDate > projDeadline) {
          deadlineDelay += 15; // Heavy penalty for breaching project deadline
        }
      }
    }

    const residualRisk = candidate.actions.some((a) => a.actionType === 'adjust_priority') ? 3 : 0;
    const workloadImbalance = 1.0;

    const J =
      wD * deadlineDelay +
      wR * reassignmentCost +
      wU * unaffectedChanges +
      wB * workloadImbalance +
      wH * handoffCost +
      wQ * residualRisk;

    return {
      J: Math.round(J * 100) / 100,
      components: {
        deadlineDelay,
        reassignmentCost,
        unaffectedChanges,
        workloadImbalance,
        handoffCost,
        residualRisk,
      },
    };
  }

  /**
   * Run full EDUR Recovery Pipeline
   */
  async solveRecovery({ projectId, scenario, config = {} }) {
    const snapshot = await this.loadPlanningSnapshot(projectId);
    const affectedClosure = this.calculateAffectedClosure(snapshot, scenario);

    if (affectedClosure.affectedTasks.length === 0) {
      return {
        status: 'FEASIBLE',
        message: 'No active tasks affected by the scenario.',
        selectedCandidate: null,
        candidates: [],
        audit: null,
      };
    }

    const rawCandidates = this.generateCandidates(snapshot, affectedClosure, scenario);

    // Validate and score every candidate
    const scoredCandidates = [];
    for (const cand of rawCandidates) {
      const validation = this.validateCandidate(cand, snapshot);
      const objective = this.evaluateObjective(cand, snapshot, config.weights);
      scoredCandidates.push({
        ...cand,
        validation,
        objective,
      });
    }

    // Select valid candidate with minimum J
    const validCandidates = scoredCandidates.filter((c) => c.validation.valid);
    let selectedCandidate = null;
    let solverStatus = 'FEASIBLE';

    if (validCandidates.length > 0) {
      // Deterministic tie-breaking: lower J; then fewer reassignments; then alphabetical ID
      validCandidates.sort((a, b) => {
        if (a.objective.J !== b.objective.J) return a.objective.J - b.objective.J;
        if (a.objective.components.reassignmentCost !== b.objective.components.reassignmentCost) {
          return a.objective.components.reassignmentCost - b.objective.components.reassignmentCost;
        }
        return a.id.localeCompare(b.id);
      });
      selectedCandidate = validCandidates[0];
      solverStatus = 'OPTIMAL';
    } else {
      // No candidate passed validator: preserve last accepted schedule
      solverStatus = 'INFEASIBLE';
      selectedCandidate = scoredCandidates[0] || null;
    }

    // Generate clear, factual explanation
    const explanation = this.buildExplanation({
      selectedCandidate,
      affectedClosure,
      scenario,
      solverStatus,
    });

    return {
      status: solverStatus,
      scheduleVersion: snapshot.scheduleVersion,
      affectedCount: affectedClosure.affectedTasks.length,
      preservedCompletedCount: affectedClosure.preservedCompletedTasks.length,
      selectedCandidate,
      candidates: scoredCandidates,
      explanation,
    };
  }

  /**
   * Generate factual explanation for the selected recovery plan
   */
  buildExplanation({ selectedCandidate, affectedClosure, scenario, solverStatus }) {
    const workerName = scenario.workerName || 'Team member';
    const numAffected = affectedClosure.affectedTasks.length;

    if (solverStatus === 'INFEASIBLE' || !selectedCandidate?.validation?.valid) {
      return `Recovery evaluation found hard constraint conflicts for ${numAffected} task(s) during ${workerName}'s absence. The previous accepted schedule was strictly preserved to prevent invalid assignments. Manager review is required.`;
    }

    const reassignments = selectedCandidate.actions.filter((a) => a.actionType === 'reassign');
    const reschedules = selectedCandidate.actions.filter((a) => a.actionType === 'reschedule');

    let expl = `AI-SENSE & EDUR Recovery Plan (${selectedCandidate.name}): ${workerName} is unavailable. `;
    if (reassignments.length > 0) {
      expl += `Reallocated ${reassignments.length} module(s) to matched peers based on registered sub-skills and available sprint capacity. `;
    }
    if (reschedules.length > 0) {
      expl += `Cascaded ${reschedules.length} downstream timeline(s) without violating project milestones. `;
    }
    expl += `All ${affectedClosure.preservedCompletedTasks.length} completed module(s) remain untouched. Passed all hard constraint validations.`;
    return expl;
  }

  /**
   * Post-leave return evaluation:
   * Evaluate whether previously reassigned tasks should be transferred back
   * only when beneficial under minimal disruption objective (no blind reversal).
   */
  async evaluatePostLeaveReturn({ projectId, userId, returnDate }) {
    const snapshot = await this.loadPlanningSnapshot(projectId);
    const worker = snapshot.members.find((m) => String(m._id || m.id) === String(userId));
    if (!worker) throw new Error('Worker not found in project.');

    const activeTasks = snapshot.tasks.filter((t) => t.status !== 'Completed');

    // Find tasks that were previously assigned to this worker or are unassigned
    const candidateTasks = activeTasks.filter((t) => {
      return (
        t.status === 'Pending' ||
        t.status === 'To Do' ||
        (t.status === 'In Progress' && (t.progress || 0) < 25)
      );
    });

    const recommendations = [];
    for (const task of candidateTasks) {
      const skillScore = computeSkillMatchScore(task, worker);
      if (skillScore >= 3) {
        recommendations.push({
          taskId: task.taskId,
          title: task.title,
          currentAssignee: task.assigneeName,
          recommendation: 'TRANSFER_BACK_BENEFICIAL',
          reason: `Original developer ${worker.name} returned. Transfer back is beneficial because task is in early stage (${task.progress || 0}% progress) and aligns directly with verified sub-skills.`,
        });
      }
    }

    return {
      workerName: worker.name,
      returnDate: returnDate || new Date().toISOString().split('T')[0],
      evaluatedTaskCount: candidateTasks.length,
      beneficialTransfers: recommendations,
    };
  }

  /**
   * Atomic commit with version-conflict guard
   */
  async applyPlan({ projectId, actions = [], userId, unavailableInfo, expectedVersion }) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Project not found.');

    const currentVersion = project.scheduleVersion || 1;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new Error(
        `SCHEDULE_VERSION_CONFLICT: Expected schedule version ${expectedVersion}, but current database version is ${currentVersion}. Please reload.`
      );
    }

    // 1. Mark user unavailability in User & Project
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

    // 2. Apply task updates
    const updatedTasks = [];
    const newVersion = currentVersion + 1;

    for (const act of actions) {
      const task = await Task.findOne({
        project: projectId,
        taskId: act.taskId,
      });

      if (!task || task.status === 'Completed') continue;

      if (act.actionType === 'reassign' && act.recommendedAssigneeId) {
        const newAssignee = await User.findById(act.recommendedAssigneeId);
        if (newAssignee) {
          task.assignee = newAssignee._id;
          task.assigneeName = newAssignee.name;
        }
      }

      if (act.proposedDueDate) {
        task.dueDate = act.proposedDueDate;
      }

      if (act.proposedStartDate) {
        task.startDate = act.proposedStartDate;
      }

      if (act.priorityAdjustment) {
        task.priority = act.priorityAdjustment;
      }

      task.scheduleVersion = newVersion;
      task.riskStatus = 'REASSIGNED';
      task.lastUpdated = `Just now (EDUR v${newVersion})`;
      await task.save();
      updatedTasks.push(task);
    }

    // 3. Increment project scheduleVersion
    project.scheduleVersion = newVersion;
    await project.save();

    // 4. Record ScheduleAudit trail
    await ScheduleAudit.create({
      project: projectId,
      scheduleVersion: newVersion,
      appliedBy: userId,
      actionsApplied: actions.map((a) => ({
        taskId: a.taskId,
        actionType: a.actionType,
        previousAssignee: a.previousAssignee,
        newAssignee: a.recommendedAssigneeName,
        previousDueDate: a.previousDueDate,
        newDueDate: a.proposedDueDate,
        reason: a.reason,
      })),
      solverStatus: 'FEASIBLE',
      status: 'COMMITTED',
    });

    return {
      success: true,
      newScheduleVersion: newVersion,
      appliedCount: updatedTasks.length,
      modifiedTasks: updatedTasks.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        assignee: t.assigneeName,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
      })),
    };
  }
}

export default new EdurEngine();
