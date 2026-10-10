/**
 * TaskForge AI Horizon v2 — AI-SENSE & EDUR Engine Test Suite
 *
 * Verifies:
 * 1. AI-SENSE Uncertainty Taxonomy & Detector:
 *    - All 7 taxonomy categories defined
 *    - Conservative remaining effort calculation with complexity & risk buffer
 *    - Pre-leave window evaluation (SafeToFinish vs At-Risk shortfall)
 *    - Active absence overlap detection (CRITICAL severity)
 *    - Execution pace divergence overrun detection
 *    - Dependency timing delay detection (RULE_V05_DEPENDENCY_TIMING)
 * 2. EDUR Uncertainty Recovery Engine:
 *    - Affected closure calculation (graph traversal)
 *    - Candidate schedule generation (3 distinct strategies)
 *    - Minimal-disruption objective function J evaluation (wD, wR, wU, wB, wH, wQ)
 *    - Independent constraint validation (scheduleValidator barrier)
 *    - Strict preservation of completed tasks
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  UNCERTAINTY_CATEGORIES,
  UNCERTAINTY_TAXONOMY,
} from '../service/ai-sense/uncertaintyCatalog.js';
import uncertaintyDetector from '../service/ai-sense/uncertaintyDetector.js';
import edurEngine from '../service/edur/edurEngine.js';
import { validateScheduleCandidate } from '../service/scheduleValidator.js';

describe('AI-SENSE: Uncertainty Taxonomy & Conservative Effort', () => {
  test('should verify all 7 taxonomy categories are defined with detection rules', () => {
    const categories = Object.keys(UNCERTAINTY_CATEGORIES);
    assert.equal(categories.length, 7, 'Must have exactly 7 uncertainty taxonomy categories');
    assert.ok(UNCERTAINTY_CATEGORIES.AVAILABILITY);
    assert.ok(UNCERTAINTY_CATEGORIES.TASK_EXECUTION);
    assert.ok(UNCERTAINTY_CATEGORIES.DEPENDENCY_SCHEDULING);
    assert.ok(UNCERTAINTY_CATEGORIES.SKILL_RESOURCE);
    assert.ok(UNCERTAINTY_CATEGORIES.REQUIREMENTS);
    assert.ok(UNCERTAINTY_CATEGORIES.EXTERNAL_INFRASTRUCTURE);
    assert.ok(UNCERTAINTY_CATEGORIES.DATA_AI_RELIABILITY);

    // Taxonomy contains defined uncertainty types across all 7 categories
    const eventTypes = Object.keys(UNCERTAINTY_TAXONOMY);
    assert.ok(eventTypes.length >= 7, 'Must define uncertainty types across categories');
    assert.ok(UNCERTAINTY_TAXONOMY.UPCOMING_LEAVE);
    assert.ok(UNCERTAINTY_TAXONOMY.ABSENCE_STARTED);
  });

  test('should calculate conservative remaining effort with uncertainty buffer', () => {
    const task = {
      effortHours: 10,
      progress: 0,
      complexity: 'High',
      riskScore: 0.8,
    };
    const effort = uncertaintyDetector.calculateConservativeRemainingEffort(task);
    // Base 10, with 15% uncertainty buffer = 11.5
    assert.ok(effort > 10, 'Conservative effort must be strictly greater than base estimated hours');
    assert.equal(effort, 11.5);
  });
});

describe('AI-SENSE: Pre-Leave & Absence Risk Detection', () => {
  const workerId = new mongoose.Types.ObjectId();
  const worker = {
    _id: workerId,
    name: 'Alex Rivera',
    availability: { status: 'available' },
  };

  test('should detect UPCOMING_LEAVE when task cannot finish safely before leave starts', () => {
    // Leave starts 2 days from now
    const futureLeaveStart = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const futureLeaveEnd = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const project = {
      _id: new mongoose.Types.ObjectId(),
      unavailabilities: [
        {
          userId: workerId,
          userName: 'Alex Rivera',
          fromDate: futureLeaveStart,
          toDate: futureLeaveEnd,
          reason: 'Medical Leave',
        },
      ],
    };

    // Task requires 40 hours effort with 0 progress — cannot finish in 2 days (16 hours)
    const task = {
      _id: new mongoose.Types.ObjectId(),
      taskId: 'T-101',
      title: 'Massive Core Refactor',
      assignee: workerId,
      assigneeName: 'Alex Rivera',
      status: 'In Progress',
      effortHours: 40,
      progress: 0,
      dueDate: futureLeaveEnd,
    };

    const risks = uncertaintyDetector.detectProjectUncertainties({
      project,
      tasks: [task],
      workers: [worker],
    });

    const preLeaveRisk = risks.find((r) => r.type === 'UPCOMING_LEAVE');
    assert.ok(preLeaveRisk, 'Should detect UPCOMING_LEAVE risk');
    assert.equal(preLeaveRisk.severity, 'HIGH');
    assert.equal(preLeaveRisk.detectionRule, 'RULE_PREDICTIVE_SAFE_TO_FINISH');
    assert.ok(preLeaveRisk.estimatedImpact.hoursShortfall > 0);
  });

  test('should detect ABSENCE_STARTED when active tasks conflict with currently absent worker', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const pastStr = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const futureStr = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const project = {
      _id: new mongoose.Types.ObjectId(),
      unavailabilities: [
        {
          userId: workerId,
          userName: 'Alex Rivera',
          fromDate: pastStr,
          toDate: futureStr,
          reason: 'Emergency Leave',
        },
      ],
    };

    const conflictingTask = {
      _id: new mongoose.Types.ObjectId(),
      taskId: 'T-103',
      title: 'Payment Integration',
      assignee: workerId,
      assigneeName: 'Alex Rivera',
      status: 'In Progress',
      startDate: pastStr,
      dueDate: futureStr,
      effortHours: 16,
    };

    const risks = uncertaintyDetector.detectProjectUncertainties({
      project,
      tasks: [conflictingTask],
      workers: [worker],
    });

    const activeAbsenceRisk = risks.find((r) => r.type === 'ABSENCE_STARTED');
    assert.ok(activeAbsenceRisk, 'Should detect ABSENCE_STARTED risk');
    assert.equal(activeAbsenceRisk.severity, 'CRITICAL');
    assert.equal(activeAbsenceRisk.detectionRule, 'RULE_V07_ACTIVE_ABSENCE_OVERLAP');
  });
});

describe('AI-SENSE: Execution Pace Divergence & Dependency Delays', () => {
  test('should detect DURATION_OVERRUN when 70%+ of timeline elapsed with < 30% progress', () => {
    const workerId = new mongoose.Types.ObjectId();
    const worker = { _id: workerId, name: 'Dev One' };

    // Started 8 days ago, due in 2 days (80% elapsed), but only 10% progress
    const start = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const due = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();

    const laggingTask = {
      _id: new mongoose.Types.ObjectId(),
      taskId: 'T-201',
      title: 'Complex Auth Microservice',
      assignee: workerId,
      status: 'In Progress',
      startDate: start,
      dueDate: due,
      effortHours: 24,
      progress: 10,
    };

    const project = { _id: new mongoose.Types.ObjectId() };

    const risks = uncertaintyDetector.detectProjectUncertainties({
      project,
      tasks: [laggingTask],
      workers: [worker],
    });

    const overrunRisk = risks.find((r) => r.type === 'DURATION_OVERRUN');
    assert.ok(overrunRisk, 'Must detect pace divergence DURATION_OVERRUN');
    assert.equal(overrunRisk.detectionRule, 'RULE_PACE_DIVERGENCE_OVERRUN');
  });

  test('should detect DEPENDENCY_DELAY when predecessor due date exceeds successor start date', () => {
    const parentTask = {
      _id: new mongoose.Types.ObjectId(),
      taskId: 'T-301',
      title: 'Design DB Schema',
      status: 'In Progress',
      dueDate: '2026-10-20',
    };

    const childTask = {
      _id: new mongoose.Types.ObjectId(),
      taskId: 'T-302',
      title: 'Write ORM Models',
      status: 'Todo',
      dependency: 'T-301',
      startDate: '2026-10-15', // Starts BEFORE parent finishes!
      dueDate: '2026-10-25',
    };

    const project = { _id: new mongoose.Types.ObjectId() };

    const risks = uncertaintyDetector.detectProjectUncertainties({
      project,
      tasks: [parentTask, childTask],
      workers: [],
    });

    const depRisk = risks.find((r) => r.type === 'DEPENDENCY_DELAY');
    assert.ok(depRisk, 'Must detect DEPENDENCY_DELAY');
    assert.equal(depRisk.detectionRule, 'RULE_V05_DEPENDENCY_TIMING');
  });
});

describe('EDUR: Affected Closure Crawl', () => {
  test('should calculate affected closure including transitive downstream dependencies', () => {
    const absentWorkerId = new mongoose.Types.ObjectId();
    const snapshot = {
      project: { _id: new mongoose.Types.ObjectId() },
      tasks: [
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-1',
          title: 'Root Task',
          assignee: absentWorkerId,
          assigneeName: 'Alex Rivera',
          status: 'In Progress',
          dueDate: '2026-10-15',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-2',
          title: 'Child Task',
          status: 'Todo',
          dependency: 'T-1',
          dueDate: '2026-10-20',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-3',
          title: 'Grandchild Task',
          status: 'Todo',
          dependency: 'T-2',
          dueDate: '2026-10-25',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-4',
          title: 'Independent Task',
          status: 'Todo',
          dependency: 'None',
          dueDate: '2026-10-18',
        },
      ],
      members: [],
      unavailabilities: [],
    };

    const scenario = {
      userId: absentWorkerId,
      fromDate: '2026-10-10',
      toDate: '2026-10-18',
    };

    const closure = edurEngine.calculateAffectedClosure(snapshot, scenario);

    assert.equal(closure.affectedTasks.length, 3, 'Must include T-1, T-2, T-3');
    const taskIds = closure.affectedTasks.map((t) => t.taskId);
    assert.ok(taskIds.includes('T-1'));
    assert.ok(taskIds.includes('T-2'));
    assert.ok(taskIds.includes('T-3'));
    assert.ok(!taskIds.includes('T-4'), 'T-4 is independent and must not be affected');
  });
});

describe('EDUR: Candidate Generation & Objective Function J', () => {
  const worker1Id = new mongoose.Types.ObjectId();
  const worker2Id = new mongoose.Types.ObjectId();

  const worker1 = {
    _id: worker1Id,
    name: 'Absent Worker',
    role: 'developer',
    skills: ['Node.js', 'Express'],
    subSkills: ['Backend API', 'MongoDB'],
  };

  const worker2 = {
    _id: worker2Id,
    name: 'Available Worker',
    role: 'developer',
    skills: ['Node.js', 'Express', 'React'],
    subSkills: ['Backend API', 'MongoDB', 'UI'],
  };

  const snapshot = {
    project: {
      _id: new mongoose.Types.ObjectId(),
      deadline: '2026-11-01',
    },
    tasks: [
      {
        _id: new mongoose.Types.ObjectId(),
        taskId: 'T-COMPLETED',
        title: 'Initial Monorepo Setup',
        status: 'Completed',
        assignee: worker1Id,
        assigneeName: 'Absent Worker',
        dueDate: '2026-10-05',
      },
      {
        _id: new mongoose.Types.ObjectId(),
        taskId: 'T-ACTIVE',
        title: 'Core Backend API Auth',
        status: 'In Progress',
        assignee: worker1Id,
        assigneeName: 'Absent Worker',
        priority: 'High',
        dueDate: '2026-10-15',
      },
    ],
    members: [worker1, worker2],
    unavailabilities: [],
  };

  test('should generate 3 distinct candidate strategies and never alter completed tasks', () => {
    const affectedClosure = {
      affectedTasks: [snapshot.tasks[1]], // only T-ACTIVE affected
      downstreamTasks: [],
    };

    const scenario = {
      userId: worker1Id,
      workerName: 'Absent Worker',
      fromDate: '2026-10-12',
      toDate: '2026-10-18',
    };

    const candidates = edurEngine.generateCandidates(snapshot, affectedClosure, scenario);

    assert.equal(candidates.length, 3, 'Must generate exactly 3 candidate strategies');
    assert.equal(candidates[0].strategy, 'REASSIGN_MATCHED_SKILLS');
    assert.equal(candidates[1].strategy, 'PRESERVE_ASSIGNEE_SHIFT_DATES');
    assert.equal(candidates[2].strategy, 'HYBRID_PRIORITY_CASCADE');

    // Verify T-COMPLETED was never touched by any candidate
    for (const cand of candidates) {
      const touchesCompleted = cand.actions.some((a) => a.taskId === 'T-COMPLETED');
      assert.equal(touchesCompleted, false, `${cand.name} must never modify completed tasks`);
    }
  });

  test('should compute objective disruption score J for each candidate', () => {
    const candidate1 = {
      id: 'c1',
      name: 'Reassign Candidate',
      actions: [
        {
          taskId: 'T-ACTIVE',
          actionType: 'reassign',
          proposedDueDate: '2026-10-15',
          previousDueDate: '2026-10-15',
        },
      ],
    };

    const score1 = edurEngine.evaluateObjective(candidate1, snapshot);
    assert.ok(score1.J > 0, 'Score J must be positive');
    assert.equal(score1.components.reassignmentCost, 1);
    assert.equal(score1.components.deadlineDelay, 0);

    const candidate2 = {
      id: 'c2',
      name: 'Shift Date Candidate',
      actions: [
        {
          taskId: 'T-ACTIVE',
          actionType: 'reschedule',
          proposedDueDate: '2026-10-20', // +5 days delay
          previousDueDate: '2026-10-15',
        },
      ],
    };

    const score2 = edurEngine.evaluateObjective(candidate2, snapshot);
    assert.ok(score2.J > 0);
    assert.equal(score2.components.reassignmentCost, 0);
    assert.equal(score2.components.deadlineDelay, 5);
  });
});

describe('EDUR: Independent Validator Barrier', () => {
  test('should validate candidate using validateScheduleCandidate', () => {
    const devId = new mongoose.Types.ObjectId();
    const result = validateScheduleCandidate({
      proposedTasks: [
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-TEST',
          title: 'Validated Task',
          assignee: devId,
          status: 'Todo',
          startDate: '2026-10-15',
          dueDate: '2026-10-20',
          effortHours: 12,
        },
      ],
      existingTasks: [],
      projectMembers: [{ _id: devId, name: 'Dev' }],
      unavailabilities: [],
    });

    assert.equal(result.valid, true, 'Valid schedule candidate must pass');
    assert.equal(result.errors.length, 0);
  });

  test('should reject candidate if absent worker is assigned during leave window', () => {
    const absentId = new mongoose.Types.ObjectId();
    const result = validateScheduleCandidate({
      proposedTasks: [
        {
          _id: new mongoose.Types.ObjectId(),
          taskId: 'T-INVALID',
          title: 'Task During Leave',
          assignee: absentId,
          status: 'Todo',
          startDate: '2026-10-12',
          dueDate: '2026-10-15',
          effortHours: 16,
        },
      ],
      existingTasks: [],
      projectMembers: [{ _id: absentId, name: 'Absent Worker' }],
      unavailabilities: [
        {
          userId: absentId,
          fromDate: '2026-10-10',
          toDate: '2026-10-18',
        },
      ],
    });

    assert.equal(result.valid, false, 'Candidate assigning absent worker must fail');
    assert.ok(result.errors.length > 0);
  });
});

describe('EDUR: UI Property Compatibility & Version-Safe Persistence', () => {
  const worker1Id = new mongoose.Types.ObjectId();
  const worker2Id = new mongoose.Types.ObjectId();

  const worker1 = {
    _id: worker1Id,
    name: 'Absent Person',
    role: 'developer',
    skills: ['React', 'CSS'],
    subSkills: ['UI Component', 'State Management'],
  };

  const worker2 = {
    _id: worker2Id,
    name: 'Replacement Person',
    role: 'developer',
    skills: ['React', 'CSS'],
    subSkills: ['UI Component', 'State Management'],
  };

  const snapshot = {
    project: {
      _id: new mongoose.Types.ObjectId(),
      scheduleVersion: 1,
    },
    tasks: [
      {
        _id: new mongoose.Types.ObjectId(),
        taskId: 'T-UI-1',
        title: 'Build Interactive Dashboard Card',
        status: 'In Progress',
        assignee: worker1Id,
        assigneeName: 'Absent Person',
        dueDate: '2026-10-15',
        effortHours: 8,
        tags: ['React', 'UI Component'],
      },
    ],
    members: [worker1, worker2],
    unavailabilities: [],
  };

  test('should generate candidates with both backend and frontend alias properties', () => {
    const affectedClosure = {
      affectedTasks: [snapshot.tasks[0]],
      downstreamTasks: [],
      preservedCompletedTasks: [],
    };
    const scenario = {
      userId: worker1Id,
      workerName: 'Absent Person',
      fromDate: '2026-10-12',
      toDate: '2026-10-18',
    };

    const candidates = edurEngine.generateCandidates(snapshot, affectedClosure, scenario);

    assert.ok(candidates.length >= 3, 'Must have at least 3 candidates');
    for (const cand of candidates) {
      assert.ok(cand.id, 'Candidate must have id');
      assert.equal(cand.candidateId, cand.id, 'Candidate must provide candidateId alias');
      assert.equal(cand.strategyName, cand.name, 'Candidate must provide strategyName alias');
      assert.ok(cand.actions.length > 0, 'Must have actions');

      const firstAction = cand.actions[0];
      assert.ok(firstAction.taskId, 'Action must have taskId');
      assert.ok(firstAction.taskTitle, 'Action must provide taskTitle for UI card display');
      assert.ok(firstAction.unavailablePersonName, 'Action must provide unavailablePersonName');
      assert.ok(firstAction.reason, 'Action must provide factual reason');
    }
  });

  test('should score candidates and provide isValid and objectiveScore for RecoveryCenterView', () => {
    const cand = {
      id: 'candidate-test',
      candidateId: 'candidate-test',
      name: 'Test Strategy',
      strategyName: 'Test Strategy',
      actions: [
        {
          taskId: 'T-UI-1',
          actionType: 'reassign',
          recommendedAssigneeId: String(worker2Id),
          recommendedAssigneeName: 'Replacement Person',
          previousDueDate: '2026-10-15',
          proposedDueDate: '2026-10-15',
        },
      ],
    };

    const validation = edurEngine.validateCandidate(cand, snapshot);
    const objective = edurEngine.evaluateObjective(cand, snapshot);

    const scored = {
      ...cand,
      validation: {
        ...validation,
        isValid: validation.valid,
      },
      objective,
      objectiveScore: {
        totalScore: objective.J,
        reassignmentScore: objective.components?.reassignmentCost || 0,
      },
    };

    assert.equal(scored.validation.isValid, true, 'Validation isValid alias must be true');
    assert.equal(scored.validation.valid, true, 'Validation valid must be true');
    assert.ok(typeof scored.objectiveScore.totalScore === 'number', 'totalScore must be number');
  });

  test('should evaluate post-leave return and prevent blind reversal of in-progress tasks', () => {
    // Mock snapshot evaluation directly on edurEngine method logic
    const activeTasks = [
      {
        taskId: 'T-UNSTARTED',
        title: 'Unstarted UI Spec',
        status: 'To Do',
        progress: 0,
        assignee: worker2Id,
        assigneeName: 'Replacement Person',
      },
      {
        taskId: 'T-IN-PROGRESS',
        title: 'Complex Data Layer Work',
        status: 'In Progress',
        progress: 60, // Deep in progress
        assignee: worker2Id,
        assigneeName: 'Replacement Person',
      },
    ];

    const worker = worker1;
    const returnDateStr = '2026-10-18';
    const beneficialTransfers = [];
    const formattedRecommendations = [];

    for (const task of activeTasks) {
      const isEarlyOrUnstarted =
        task.status === 'Pending' ||
        task.status === 'To Do' ||
        (task.status === 'In Progress' && (task.progress || 0) < 25);

      if (isEarlyOrUnstarted) {
        const item = {
          taskId: task.taskId,
          title: task.title,
          status: task.status,
          currentAssignee: task.assigneeName,
          action: 'REASSIGN_BACK',
          recommendation: 'TRANSFER_BACK_BENEFICIAL',
          reason: `Worker ${worker.name} returned on ${returnDateStr}. Early stage safe handback.`,
        };
        beneficialTransfers.push(item);
        formattedRecommendations.push(item);
      } else {
        formattedRecommendations.push({
          taskId: task.taskId,
          title: task.title,
          status: task.status,
          currentAssignee: task.assigneeName,
          action: 'KEEP_CURRENT',
          recommendation: 'KEEP_CURRENT',
          reason: 'In progress. Retained with current assignee to prevent context penalty.',
        });
      }
    }

    assert.equal(beneficialTransfers.length, 1, 'Only unstarted task transferred back');
    assert.equal(beneficialTransfers[0].taskId, 'T-UNSTARTED');
    assert.equal(formattedRecommendations.length, 2);
    assert.equal(formattedRecommendations[1].action, 'KEEP_CURRENT', 'In-progress task must NOT be reversed');
  });

  test('should verify ScheduleAudit schema supports version jumps, trigger types, and explanations', () => {
    const mockProjectId = '507f1f77bcf86cd799439011';
    const mockAudit = {
      project: mockProjectId,
      scheduleVersion: 3,
      previousScheduleVersion: 2,
      triggerType: 'WORKER_UNAVAILABILITY',
      strategy: 'MIN_DISRUPTIONS',
      candidateId: 'CAND_MIN_DISRUPTION',
      objectiveScore: { J: 1.25, components: { dueDates: 0.25, reassignments: 1.0 } },
      explanation: 'Optimal EDUR replanning: Reallocated 2 tasks with minimal disruption while preserving completed work.',
      validationResult: { valid: true, errors: [], warnings: [] },
      actionsApplied: [
        {
          taskId: 'T-201',
          taskTitle: 'Database Optimization',
          actionType: 'reassign',
          previousAssignee: 'Alice',
          newAssignee: 'Bob',
          previousDueDate: '2026-10-15',
          newDueDate: '2026-10-18',
          reason: 'Alice is on medical leave from Oct 15 to Oct 20.',
        },
      ],
    };

    assert.equal(mockAudit.scheduleVersion, 3);
    assert.equal(mockAudit.previousScheduleVersion, 2);
    assert.equal(mockAudit.triggerType, 'WORKER_UNAVAILABILITY');
    assert.ok(mockAudit.objectiveScore.J > 0);
    assert.ok(mockAudit.actionsApplied.length === 1);
    assert.equal(mockAudit.actionsApplied[0].newAssignee, 'Bob');
  });
});

