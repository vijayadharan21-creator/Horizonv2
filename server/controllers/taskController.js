import Task, { TaskCounter } from '../models/Task.js';
import Project from '../models/Project.js';
import User from '../models/User.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Generate the next task ID for a project (e.g. T-106, T-107 ...)
 * Inspects all existing taskIds in MongoDB to guarantee global uniqueness against duplicates.
 */
const getNextTaskId = async (projectId) => {
  const existingTasks = await Task.find({}, 'taskId').lean();
  let maxSeq = 105;
  for (const t of existingTasks) {
    if (t.taskId && t.taskId.startsWith('T-')) {
      const num = parseInt(t.taskId.replace('T-', ''), 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  await TaskCounter.findOneAndUpdate(
    { projectId },
    { $set: { seq: nextSeq } },
    { upsert: true, new: true }
  );
  return `T-${nextSeq}`;
};

/**
 * Check if the requesting user can access the project
 */
const canAccessProject = async (projectId, userId) => {
  const project = await Project.findById(projectId).lean();
  if (!project) return false;
  return (
    project.manager?.toString() === userId ||
    project.members?.map((m) => m.toString()).includes(userId)
  );
};

/**
 * Format task document for API response
 */
const formatTask = (task) => ({
  id: task._id ? task._id.toString() : task.id,
  taskId: task.taskId,
  title: task.title,
  description: task.description,
  project: task.project?.toString?.() || task.project,
  group: task.group,
  status: task.status,
  priority: task.priority,
  assignee: task.assigneeName || 'Unassigned',
  assigneeName: task.assigneeName || 'Unassigned',
  assigneeId: task.assignee?.toString?.() || null,
  effortHours: task.effortHours,
  progress: task.progress,
  dueDate: task.dueDate,
  startDate: task.startDate,
  dependency: task.dependency,
  tags: task.tags,
  lastUpdated: task.lastUpdated,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/tasks
 * Developers only see their own assigned tasks
 * PM sees all tasks
 */
export const getTasksByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const hasAccess = await canAccessProject(projectId, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied to this project.' });
    }

    let query = { project: projectId };
    // Developers only see tasks for their assigned role / identity
    if (req.user.role === 'developer') {
      query.$or = [
        { assignee: req.user.id },
        { assigneeName: req.user.name },
      ];
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      tasks: tasks.map(formatTask),
    });
  } catch (error) {
    console.error('[Tasks] getTasksByProject error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch tasks.' });
  }
};

/**
 * GET /api/tasks/my
 * Returns all tasks assigned to the logged-in developer (across all projects)
 */
export const getMyTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [
        { assignee: req.user.id },
        { assigneeName: req.user.name },
      ],
    })
      .sort({ createdAt: -1 })
      .populate('project', 'name key status')
      .lean();

    return res.status(200).json({
      success: true,
      tasks: tasks.map(formatTask),
    });
  } catch (error) {
    console.error('[Tasks] getMyTasks error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch your tasks.' });
  }
};

/**
 * POST /api/projects/:projectId/tasks
 * PM only
 */
export const createTask = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const isManager = project.manager?.toString() === req.user.id;
    const isPMOrAdmin = req.user.role === 'project_manager' || req.user.role === 'admin';
    if (!isManager && !isPMOrAdmin) {
      return res.status(403).json({ success: false, message: 'Only a project manager can create tasks.' });
    }

    const {
      title,
      description,
      group,
      status,
      priority,
      assigneeId,
      assigneeName,
      effortHours,
      dueDate,
      startDate,
      dependency,
      tags,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: 'Task title is required.' });
    }

    const taskId = await getNextTaskId(project._id);

    let resolvedAssignee = null;
    let resolvedAssigneeName = assigneeName || req.body.assignee || 'Unassigned';
    if (assigneeId && String(assigneeId).match(/^[0-9a-fA-F]{24}$/)) {
      const assignedUser = await User.findById(assigneeId).select('name').lean();
      if (assignedUser) {
        resolvedAssignee = assignedUser._id;
        resolvedAssigneeName = assignedUser.name;
      }
    } else if (resolvedAssigneeName && resolvedAssigneeName !== 'Unassigned') {
      const assignedUser = await User.findOne({
        name: new RegExp(`^${resolvedAssigneeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      })
        .select('name')
        .lean();
      if (assignedUser) {
        resolvedAssignee = assignedUser._id;
        resolvedAssigneeName = assignedUser.name;
      }
    }

    const task = await Task.create({
      taskId,
      title: title.trim(),
      description: description?.trim() || '',
      project: project._id,
      group: group || 'To Do',
      status: status || 'Pending',
      priority: priority || 'Medium',
      assignee: resolvedAssignee,
      assigneeName: resolvedAssigneeName,
      effortHours: Number(effortHours) || 0,
      progress: 0,
      dueDate: dueDate || '',
      startDate: startDate || '',
      dependency: dependency || null,
      tags: tags || [],
      createdBy: req.user.id,
      lastUpdated: 'Just now',
    });

    // Increment project task count
    await Project.findByIdAndUpdate(project._id, { $inc: { tasksCount: 1 } });

    return res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      task: formatTask(task),
    });
  } catch (error) {
    console.error('[Tasks] createTask error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create task.' });
  }
};

/**
 * PUT /api/tasks/:id
 * PM: can update anything
 * Developer: can only update progress/status of their own tasks
 */
export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const project = await Project.findById(task.project).lean();
    const isManager = project?.manager && (project.manager._id || project.manager).toString() === req.user.id;
    const isPM = isManager || req.user.role === 'project_manager' || req.user.role === 'admin';
    const isDeveloperOwner =
      req.user.role === 'developer' && (
        (task.assignee && task.assignee.toString() === req.user.id) ||
        (task.assigneeName && req.user.name && task.assigneeName.toLowerCase() === req.user.name.toLowerCase())
      );

    if (!isPM && !isDeveloperOwner) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Developers can update progress, status, and workflow group to progress tasks
    if (isDeveloperOwner && !isPM) {
      const { progress, status, group } = req.body;
      const updates = { lastUpdated: 'Just now' };

      if (status) {
        updates.status = status;
        if (status === 'Completed') updates.group = 'Completed';
        else if (status === 'In Review') updates.group = 'In Review';
        else if (status === 'In Progress') updates.group = 'In Progress';
        else if (status === 'To Do' || status === 'Pending') updates.group = 'To Do';
        else if (status === 'Blocked') updates.group = 'Blocked';
      }
      if (group) updates.group = group;
      if (progress !== undefined) {
        updates.progress = Math.min(100, Math.max(0, Number(progress)));
      } else if (status === 'Completed') {
        updates.progress = 100;
      }
      if (!task.assignee) {
        updates.assignee = req.user.id;
      }

      const updatedTask = await Task.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      );
      return res.status(200).json({ success: true, task: formatTask(updatedTask) });
    }

    // PM can update everything
    const {
      title, description, group, status, priority,
      assigneeId, assigneeName, effortHours, progress,
      dueDate, startDate, dependency, tags, assignee,
    } = req.body;

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (group !== undefined) task.group = group;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;

    // Safely resolve assignee
    if (assignee !== undefined) {
      if (assignee && String(assignee).match(/^[0-9a-fA-F]{24}$/)) {
        task.assignee = assignee;
      } else {
        task.assigneeName = assignee || 'Unassigned';
        if (assignee === 'Unassigned') task.assignee = null;
      }
    }
    if (assigneeId !== undefined) {
      task.assignee = (assigneeId && String(assigneeId).match(/^[0-9a-fA-F]{24}$/)) ? assigneeId : null;
    }
    if (assigneeName !== undefined) task.assigneeName = assigneeName || 'Unassigned';

    if (effortHours !== undefined) task.effortHours = Number(effortHours) || 0;
    if (progress !== undefined) task.progress = Math.min(100, Math.max(0, progress));
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (startDate !== undefined) task.startDate = startDate;
    if (dependency !== undefined) task.dependency = dependency || null;
    if (tags !== undefined) task.tags = tags;
    task.lastUpdated = 'Just now';

    await task.save();

    return res.status(200).json({
      success: true,
      message: 'Task updated.',
      task: formatTask(task),
    });
  } catch (error) {
    console.error('[Tasks] updateTask error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update task.' });
  }
};

/**
 * DELETE /api/tasks/:id
 * PM only
 */
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('project');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const project = task.project;
    const isManager = project?.manager && (project.manager._id || project.manager).toString() === req.user.id;
    const isPM = isManager || req.user.role === 'project_manager' || req.user.role === 'admin';
    if (!isPM) {
      return res.status(403).json({ success: false, message: 'Only the project manager can delete tasks.' });
    }

    await Task.findByIdAndDelete(task._id);
    if (project?._id) {
      await Project.findByIdAndUpdate(project._id, {
        $inc: { tasksCount: -1 },
      });
    }

    return res.status(200).json({ success: true, message: 'Task deleted.' });
  } catch (error) {
    console.error('[Tasks] deleteTask error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete task.' });
  }
};
