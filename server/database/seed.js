import User from '../models/User.js';
import Project from '../models/Project.js';
import Task, { TaskCounter } from '../models/Task.js';

/**
 * Seeds demo projects and tasks if none exist.
 * Runs after seedDefaultUsers so we can reference their IDs.
 */
export const seedDemoData = async () => {
  try {
    const existingProjects = await Project.countDocuments();
    if (existingProjects > 0) {
      console.log('[TaskForge Seeder] Demo projects already exist — skipping.');
      return;
    }

    // Find the seeded PM and Developer
    const pm = await User.findOne({ email: 'pm@taskforge.ai' });
    const dev = await User.findOne({ email: 'dev@taskforge.ai' });

    if (!pm) {
      console.warn('[TaskForge Seeder] PM user not found, skipping demo data.');
      return;
    }

    const devMembers = dev ? [dev._id] : [];

    // ── Create Demo Projects ───────────────────────────────────────────────────
    const project1 = await Project.create({
      name: 'TaskForge AI Core',
      key: 'TFAC',
      description: 'Core platform for AI-powered task allocation and scheduling.',
      status: 'Active',
      deadline: 'Oct 14, 2026',
      manager: pm._id,
      members: devMembers,
      tasksCount: 5,
    });

    const project2 = await Project.create({
      name: 'Autonomous Agent Engine',
      key: 'AAEG',
      description: 'Self-scheduling AI agent for distributed task execution.',
      status: 'Planning',
      deadline: 'Nov 01, 2026',
      manager: pm._id,
      members: devMembers,
      tasksCount: 3,
    });

    const project3 = await Project.create({
      name: 'Cloud Infrastructure v2',
      key: 'CLDV',
      description: 'Scalable cloud infrastructure upgrade with Kubernetes.',
      status: 'In Progress',
      deadline: 'Nov 15, 2026',
      manager: pm._id,
      members: devMembers,
      tasksCount: 4,
    });

    const devName = dev?.name || 'Alex Rivera';

    // ── Create Demo Tasks for Project 1 ───────────────────────────────────────
    const demoTasks = [
      {
        taskId: 'T-101',
        title: 'Database Design & Schema Modeling',
        description: 'Design and implement database schema with optimal indexing strategy.',
        project: project1._id,
        group: 'In Progress',
        status: 'In Progress',
        priority: 'High',
        assignee: dev?._id || null,
        assigneeName: devName,
        effortHours: 6,
        progress: 72,
        dueDate: '2026-10-08',
        startDate: '2026-10-01',
        dependency: null,
        createdBy: pm._id,
        lastUpdated: '10m ago',
      },
      {
        taskId: 'T-102',
        title: 'Backend API Development',
        description: 'Build RESTful API endpoints with authentication and business logic.',
        project: project1._id,
        group: 'In Progress',
        status: 'In Progress',
        priority: 'Critical',
        assignee: dev?._id || null,
        assigneeName: devName,
        effortHours: 5,
        progress: 48,
        dueDate: '2026-10-10',
        startDate: '2026-10-03',
        dependency: 'T-101',
        createdBy: pm._id,
        lastUpdated: '1h ago',
      },
      {
        taskId: 'T-103',
        title: 'Dependency Validation & Cycle Detection',
        description: 'Validate task dependencies and ensure no circular references exist.',
        project: project1._id,
        group: 'To Do',
        status: 'Pending',
        priority: 'High',
        assignee: dev?._id || null,
        assigneeName: devName,
        effortHours: 4,
        progress: 0,
        dueDate: '2026-10-12',
        startDate: '2026-10-08',
        dependency: 'T-102',
        createdBy: pm._id,
        lastUpdated: '2h ago',
      },
      {
        taskId: 'T-104',
        title: 'Schedule Recovery & Replanning',
        description: 'Implement disruption handling and automatic schedule recovery logic.',
        project: project1._id,
        group: 'To Do',
        status: 'Pending',
        priority: 'Medium',
        assignee: dev?._id || null,
        assigneeName: devName,
        effortHours: 5,
        progress: 0,
        dueDate: '2026-10-13',
        startDate: '2026-10-09',
        dependency: 'T-102',
        createdBy: pm._id,
        lastUpdated: '3h ago',
      },
      {
        taskId: 'T-105',
        title: 'Report Generation & UI Integration',
        description: 'Generate timeline snapshots and export audit-ready summary reports.',
        project: project1._id,
        group: 'Completed',
        status: 'Completed',
        priority: 'Low',
        assignee: dev?._id || null,
        assigneeName: devName,
        effortHours: 3,
        progress: 100,
        dueDate: '2026-10-09',
        startDate: '2026-09-28',
        dependency: null,
        createdBy: pm._id,
        lastUpdated: '10:24 AM',
      },
    ];

    // Use insertMany to skip the pre-save hook for seeded tasks
    await Task.insertMany(demoTasks);

    // Seed TaskCounter so new tasks start from T-106
    await TaskCounter.create({ projectId: project1._id, seq: 105 });
    await TaskCounter.create({ projectId: project2._id, seq: 100 });
    await TaskCounter.create({ projectId: project3._id, seq: 100 });

    console.log('[TaskForge Seeder] Demo projects and tasks created.');
  } catch (error) {
    console.error('[TaskForge Seeder] Demo data seed error:', error.message);
  }
};
