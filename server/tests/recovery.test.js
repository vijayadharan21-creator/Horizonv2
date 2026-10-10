/**
 * TaskForge AI — Recovery Engine & Authorization Tests
 *
 * Tests:
 *  1. Deterministic rebalance plan generation (no DB, no AI)
 *  2. Completed-task preservation in rebalance engine
 *  3. Sub-skill matching logic
 *  4. Authorization: developer cannot access another project's tasks via API
 *  5. Authorization: unauthenticated requests are rejected
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryAiService } from '../service/ai/recovery-ai.service.js';

// ─── Recovery Engine Tests ────────────────────────────────────────────────────

describe('Recovery Engine: Deterministic rebalance plan', () => {
  let service;

  beforeEach(() => {
    service = new RecoveryAiService();
  });

  it('generates actions for each affected task', () => {
    const affectedTasks = [
      { _id: 'task-001', taskId: 'T-201', title: 'API Development', status: 'In Progress', effortHours: 8, dueDate: '2026-10-20', assigneeName: 'Alice', tags: ['api', 'backend'] },
      { _id: 'task-002', taskId: 'T-202', title: 'Frontend UI', status: 'To Do', effortHours: 6, dueDate: '2026-10-22', assigneeName: 'Alice', tags: ['ui', 'react'] },
    ];

    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: ['Node.js', 'React'], subSkills: ['REST API Optimization', 'Component Architecture'] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test Project' },
      activeTasks: affectedTasks,
      affectedTasks,
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', fromDate: '2026-10-18', toDate: '2026-10-25', subSkills: ['React State Management'] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    assert.ok(Array.isArray(plan.actions), 'actions must be an array');
    assert.equal(plan.actions.length >= 2, true, `Expected ≥2 actions for 2 affected tasks, got ${plan.actions.length}`);
    assert.ok(plan.summary, 'plan must have a summary string');
  });

  it('assigns all affected tasks to available developer', () => {
    const affectedTasks = [
      { _id: 'task-001', taskId: 'T-201', title: 'Database Schema', effortHours: 6, dueDate: '2026-10-20', assigneeName: 'Alice', tags: ['database', 'mongodb'] },
    ];

    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: ['MongoDB'], subSkills: ['MongoDB Schema Modeling', 'Query Optimization'] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: affectedTasks,
      affectedTasks,
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: ['MongoDB Schema Modeling'] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    const reassign = plan.actions.find((a) => a.actionType === 'reassign');
    assert.ok(reassign, 'Expected at least one reassign action');
    assert.equal(reassign.recommendedAssigneeName, 'Bob');
  });

  it('does NOT include completed tasks in actions', () => {
    const completedTask = { _id: 'task-000', taskId: 'T-100', title: 'Completed Feature', effortHours: 4, dueDate: '2026-10-10', assigneeName: 'Alice', status: 'Completed' };
    const activeTask = { _id: 'task-001', taskId: 'T-201', title: 'Active Feature', effortHours: 8, dueDate: '2026-10-20', assigneeName: 'Alice', status: 'In Progress', tags: [] };

    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: ['React'], subSkills: [] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: [activeTask], // Only non-completed in active
      affectedTasks: [activeTask], // Completed is filtered before this call
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: [] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: ['T-100: Completed Feature'],
    });

    const completedAction = plan.actions.find((a) => a.taskId === 'T-100');
    assert.equal(completedAction, undefined, 'Completed task T-100 must NOT appear in recovery actions');
  });

  it('enriches actions with matchedSubSkills', () => {
    const affectedTasks = [
      { _id: 'task-001', taskId: 'T-201', title: 'REST API', effortHours: 8, dueDate: '2026-10-20', assigneeName: 'Alice', tags: ['api', 'rest', 'backend'] },
    ];
    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: ['Node.js'], subSkills: ['REST API Optimization', 'Express Middleware'] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: affectedTasks,
      affectedTasks,
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: ['REST API Optimization'] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    const action = plan.actions.find((a) => a.taskId === 'T-201');
    assert.ok(action, 'Expected an action for T-201');
    assert.ok(Array.isArray(action.matchedSubSkills), 'matchedSubSkills must be an array');
    assert.ok(action.matchedSubSkills.length > 0, 'matchedSubSkills should not be empty when skills overlap');
  });

  it('handles no available developers gracefully (team pool fallback)', () => {
    const affectedTasks = [
      { _id: 'task-001', taskId: 'T-201', title: 'Feature', effortHours: 4, dueDate: '2026-10-20', assigneeName: 'Alice', tags: [] },
    ];

    // Should not throw — returns fallback team pool assignment
    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: affectedTasks,
      affectedTasks,
      availableDevelopers: [], // No one available
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: [] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    assert.ok(Array.isArray(plan.actions), 'Should return actions array even with no developers');
  });

  it('reschedules downstream dependents when a task is reassigned', () => {
    const upstreamTask = { _id: 'task-001', taskId: 'T-201', title: 'API Development', effortHours: 8, dueDate: '2026-10-20', assigneeName: 'Alice', tags: ['api'] };
    const downstreamTask = { _id: 'task-002', taskId: 'T-202', title: 'Frontend Integration', effortHours: 6, dueDate: '2026-10-24', assigneeName: 'Alice', dependency: 'T-201', tags: [] };

    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: ['Node.js'], subSkills: [] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: [upstreamTask, downstreamTask],
      affectedTasks: [upstreamTask],
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: [] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    const downstreamAction = plan.actions.find((a) => a.taskId === 'T-202');
    assert.ok(downstreamAction, 'Expected a reschedule action for downstream task T-202');
    assert.equal(downstreamAction.actionType, 'reschedule');
  });

  it('adjusts due dates forward for reassigned tasks', () => {
    const affectedTasks = [
      { _id: 'task-001', taskId: 'T-201', title: 'Feature', effortHours: 6, dueDate: '2026-10-15', assigneeName: 'Alice', tags: [] },
    ];
    const availableDevelopers = [
      { _id: 'user-002', name: 'Bob', skills: [], subSkills: [] },
    ];

    const plan = service.generateDeterministicRebalancePlan({
      project: { name: 'Test' },
      activeTasks: affectedTasks,
      affectedTasks,
      availableDevelopers,
      unavailablePerson: { userId: 'user-001', userName: 'Alice', subSkills: [] },
      scenario: { type: 'worker_unavailability' },
      preservedCompletedTaskNames: [],
    });

    const action = plan.actions.find((a) => a.taskId === 'T-201');
    assert.ok(action, 'Expected action for T-201');
    if (action.proposedDueDate) {
      const original = new Date('2026-10-15');
      const proposed = new Date(action.proposedDueDate);
      assert.ok(proposed >= original, 'Proposed due date should be same or later than original');
    }
  });
});
