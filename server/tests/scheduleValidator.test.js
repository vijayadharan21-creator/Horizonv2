/**
 * TaskForge AI — Schedule Validator Unit Tests
 *
 * Tests the independent deterministic schedule validator.
 * No database or AI dependencies — all inputs are constructed inline.
 *
 * Coverage:
 *  - Valid schedule passes with zero errors
 *  - Dependency cycle detection (V04)
 *  - Unknown dependency reference (V03)
 *  - Worker unavailability constraint (V07)
 *  - Date integrity (V09)
 *  - Negative effort (V08)
 *  - Completed-task protection (V10)
 *  - Dependency timing warning (V05)
 *  - Worker overlap warning (V06)
 *  - Unknown worker ID (V02)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateScheduleCandidate, VALIDATION_ERRORS } from '../service/scheduleValidator.js';

// ─── Shared Fixtures ──────────────────────────────────────────────────────────

const MEMBERS = [
  { id: 'user-001', name: 'Alice' },
  { id: 'user-002', name: 'Bob' },
];

const mkTask = (overrides = {}) => ({
  taskId: 'T-200',
  title: 'Default Task',
  assigneeId: 'user-001',
  assigneeName: 'Alice',
  startDate: '2026-10-15',
  dueDate: '2026-10-20',
  effortHours: 8,
  dependency: null,
  status: 'In Progress',
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Schedule Validator: Valid schedule', () => {
  it('passes with zero errors for a well-formed schedule', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-200', dependency: null }),
        mkTask({ taskId: 'T-201', assigneeId: 'user-002', assigneeName: 'Bob', dependency: 'T-200', startDate: '2026-10-21', dueDate: '2026-10-25' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    assert.equal(result.valid, true, `Expected valid=true, got errors: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
  });

  it('returns summary with correct task count', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask(), mkTask({ taskId: 'T-201', assigneeId: 'user-002' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });
    assert.equal(result.summary.totalChecked, 2);
  });
});

describe('Schedule Validator: Dependency checks', () => {
  it('V03 — rejects unknown dependency reference', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-200', dependency: 'T-NONEXISTENT' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V03_UNKNOWN_DEPENDENCY);
    assert.ok(err, 'Expected V03 error for unknown dependency');
    assert.equal(err.taskId, 'T-200');
  });

  it('V03 — accepts dependency that exists in existingTasks', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-201', dependency: 'T-100' })],
      existingTasks: [{ taskId: 'T-100', status: 'Completed' }],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V03_UNKNOWN_DEPENDENCY);
    assert.equal(err, undefined, 'Should NOT raise V03 when dependency exists in existing tasks');
  });

  it('V04 — detects a 2-node dependency cycle', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-200', dependency: 'T-201' }),
        mkTask({ taskId: 'T-201', dependency: 'T-200', assigneeId: 'user-002' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V04_DEPENDENCY_CYCLE);
    assert.ok(err, 'Expected V04 cycle detection error');
    assert.ok(Array.isArray(err.cycle), 'Cycle should be an array');
  });

  it('V04 — detects a 3-node dependency cycle', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-A', dependency: 'T-B' }),
        mkTask({ taskId: 'T-B', dependency: 'T-C', assigneeId: 'user-002' }),
        mkTask({ taskId: 'T-C', dependency: 'T-A', assigneeId: 'user-001', startDate: '2026-10-22', dueDate: '2026-10-26' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V04_DEPENDENCY_CYCLE);
    assert.ok(err, 'Expected V04 error for 3-node cycle');
  });

  it('V04 — does NOT raise cycle for valid linear chain', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-A', dependency: null }),
        mkTask({ taskId: 'T-B', dependency: 'T-A', assigneeId: 'user-002', startDate: '2026-10-21', dueDate: '2026-10-25' }),
        mkTask({ taskId: 'T-C', dependency: 'T-B', startDate: '2026-10-26', dueDate: '2026-10-30' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V04_DEPENDENCY_CYCLE);
    assert.equal(err, undefined, 'Should NOT detect a cycle in a valid chain');
  });

  it('V05 — warns when successor starts before predecessor finishes', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-A', startDate: '2026-10-15', dueDate: '2026-10-22' }),
        mkTask({ taskId: 'T-B', dependency: 'T-A', assigneeId: 'user-002', startDate: '2026-10-18', dueDate: '2026-10-25' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const warn = result.warnings.find((w) => w.code === VALIDATION_ERRORS.V05_DEPENDENCY_TIMING);
    assert.ok(warn, 'Expected V05 timing warning');
    assert.equal(warn.taskId, 'T-B');
  });
});

describe('Schedule Validator: Worker constraints', () => {
  it('V02 — rejects unknown worker ID', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ assigneeId: 'user-999' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V02_UNKNOWN_WORKER);
    assert.ok(err, 'Expected V02 error for unknown worker ID');
    assert.equal(err.workerId, 'user-999');
  });

  it('V07 — blocks assignment during worker unavailability (exact overlap)', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-200', assigneeId: 'user-001', startDate: '2026-10-15', dueDate: '2026-10-20' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [
        { userId: 'user-001', fromDate: '2026-10-14', toDate: '2026-10-21' },
      ],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V07_WORKER_UNAVAILABLE);
    assert.ok(err, 'Expected V07 error when task overlaps unavailability');
    assert.equal(err.workerId, 'user-001');
  });

  it('V07 — allows assignment outside unavailability window', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-200', assigneeId: 'user-001', startDate: '2026-10-25', dueDate: '2026-10-30' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [
        { userId: 'user-001', fromDate: '2026-10-14', toDate: '2026-10-21' },
      ],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V07_WORKER_UNAVAILABLE);
    assert.equal(err, undefined, 'Should NOT raise V07 when task is outside unavailability');
  });

  it('V06 — warns about overlapping assignments for same worker', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-200', assigneeId: 'user-001', startDate: '2026-10-15', dueDate: '2026-10-20' }),
        mkTask({ taskId: 'T-201', assigneeId: 'user-001', startDate: '2026-10-18', dueDate: '2026-10-25' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const warn = result.warnings.find((w) => w.code === VALIDATION_ERRORS.V06_WORKER_OVERLAP);
    assert.ok(warn, 'Expected V06 warning for overlapping worker tasks');
    assert.ok(warn.taskIds.includes('T-200'));
    assert.ok(warn.taskIds.includes('T-201'));
  });

  it('V06 — does NOT warn when same worker has sequential non-overlapping tasks', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-200', assigneeId: 'user-001', startDate: '2026-10-15', dueDate: '2026-10-18' }),
        mkTask({ taskId: 'T-201', assigneeId: 'user-001', startDate: '2026-10-19', dueDate: '2026-10-25' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const warn = result.warnings.find((w) => w.code === VALIDATION_ERRORS.V06_WORKER_OVERLAP);
    assert.equal(warn, undefined, 'Sequential tasks should NOT trigger V06');
  });
});

describe('Schedule Validator: Data integrity checks', () => {
  it('V08 — rejects negative effort hours', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ effortHours: -5 })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V08_NEGATIVE_EFFORT);
    assert.ok(err, 'Expected V08 for negative effortHours');
  });

  it('V08 — accepts zero effort hours', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ effortHours: 0 })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V08_NEGATIVE_EFFORT);
    assert.equal(err, undefined, 'Zero effort should be allowed');
  });

  it('V09 — rejects task with startDate after dueDate', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ startDate: '2026-10-25', dueDate: '2026-10-15' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V09_DATE_INTEGRITY);
    assert.ok(err, 'Expected V09 when startDate > dueDate');
  });

  it('V09 — accepts task with only one date set', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ startDate: '', dueDate: '2026-10-20' })],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V09_DATE_INTEGRITY);
    assert.equal(err, undefined, 'Should NOT raise V09 with only one date');
  });

  it('V10 — blocks modification of a completed task', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-100', status: 'In Progress' })],
      existingTasks: [{ taskId: 'T-100', status: 'Completed' }],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V10_COMPLETED_TASK_MODIFIED);
    assert.ok(err, 'Expected V10 error when completed task is modified');
  });

  it('V10 — allows completed task to appear in proposed with status Completed', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [mkTask({ taskId: 'T-100', status: 'Completed' })],
      existingTasks: [{ taskId: 'T-100', status: 'Completed' }],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    const err = result.errors.find((e) => e.code === VALIDATION_ERRORS.V10_COMPLETED_TASK_MODIFIED);
    assert.equal(err, undefined, 'Completed task staying Completed should be allowed');
  });
});

describe('Schedule Validator: Multiple errors', () => {
  it('collects multiple independent errors in one pass', () => {
    const result = validateScheduleCandidate({
      proposedTasks: [
        mkTask({ taskId: 'T-300', effortHours: -1, startDate: '2026-10-25', dueDate: '2026-10-10' }),
        mkTask({ taskId: 'T-301', assigneeId: 'user-999', dependency: 'T-MISSING' }),
      ],
      existingTasks: [],
      projectMembers: MEMBERS,
      unavailabilities: [],
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, `Expected ≥3 errors, got ${result.errors.length}: ${JSON.stringify(result.errors.map((e) => e.code))}`);
  });
});
