import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import taskGenerationService from '../service/ai/task-generation.service.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Format a project document for API response
 */
const formatProject = (project) => ({
  id: project._id.toString(),
  name: project.name,
  key: project.key,
  description: project.description,
  status: project.status,
  deadline: project.deadline,
  manager: project.manager,
  members: project.members,
  tasksCount: project.tasksCount,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/projects
 * Project Manager: all their managed projects
 * Developer: all projects they are a member of
 */
export const getProjects = async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'project_manager') {
      projects = await Project.find({ manager: req.user.id })
        .sort({ createdAt: -1 })
        .lean();
    } else {
      projects = await Project.find({ members: req.user.id })
        .sort({ createdAt: -1 })
        .lean();
    }

    return res.status(200).json({
      success: true,
      projects: projects.map((p) => ({ ...p, id: p._id.toString() })),
    });
  } catch (error) {
    console.error('[Projects] getProjects error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch projects.' });
  }
};

/**
 * GET /api/projects/:id
 */
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('manager', 'name email')
      .populate('members', 'name email role skills');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Auth check — must be manager or member
    const userId = req.user.id;
    const isMember =
      project.manager._id.toString() === userId ||
      project.members.some((m) => m._id.toString() === userId);

    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, project: formatProject(project) });
  } catch (error) {
    console.error('[Projects] getProjectById error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch project.' });
  }
};

/**
 * POST /api/projects
 * PM only
 */
export const createProject = async (req, res) => {
  try {
    const { name, description, status, deadline } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required.' });
    }

    // Generate key from name (first 1-6 letters, uppercase)
    const key = name
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase() || 'PROJ';

    const project = await Project.create({
      name: name.trim(),
      key,
      description: description?.trim() || '',
      status: status || 'Planning',
      deadline: deadline || '',
      manager: req.user.id,
      members: [],
      tasksCount: 0,
    });

    return res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      project: { ...project.toObject(), id: project._id.toString() },
    });
  } catch (error) {
    console.error('[Projects] createProject error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create project.' });
  }
};

/**
 * PUT /api/projects/:id
 * PM only (own project)
 */
export const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (project.manager.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the project manager can edit this project.' });
    }

    const { name, description, status, deadline } = req.body;

    if (name) {
      project.name = name.trim();
      project.key = name
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4)
        .toUpperCase() || project.key;
    }
    if (description !== undefined) project.description = description.trim();
    if (status) project.status = status;
    if (deadline !== undefined) project.deadline = deadline;

    await project.save();

    return res.status(200).json({
      success: true,
      message: 'Project updated.',
      project: { ...project.toObject(), id: project._id.toString() },
    });
  } catch (error) {
    console.error('[Projects] updateProject error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update project.' });
  }
};

/**
 * DELETE /api/projects/:id
 * PM only (own project)
 */
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (project.manager.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the project manager can delete this project.' });
    }

    // Also remove associated tasks
    await Task.deleteMany({ project: project._id });
    await Project.findByIdAndDelete(project._id);

    return res.status(200).json({ success: true, message: 'Project and all tasks deleted.' });
  } catch (error) {
    console.error('[Projects] deleteProject error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete project.' });
  }
};

/**
 * GET /api/projects/:id/members
 * Returns all members (developers) of a project
 */
export const getProjectMembers = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('members', 'name email role skills subSkills availability createdAt')
      .populate('manager', 'name email role skills subSkills availability');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const userId = req.user.id;
    const hasAccess =
      project.manager._id.toString() === userId ||
      project.members.some((m) => m._id.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({
      success: true,
      members: project.members.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        role: m.role,
        skills: m.skills || [],
        subSkills: m.subSkills || [],
        availability: m.availability || { status: 'available', from: null, to: null, reason: '' },
      })),
      manager: {
        id: project.manager._id.toString(),
        name: project.manager.name,
        email: project.manager.email,
        role: project.manager.role,
        skills: project.manager.skills || [],
        subSkills: project.manager.subSkills || [],
        availability: project.manager.availability || { status: 'available', from: null, to: null, reason: '' },
      },
      unavailabilities: project.unavailabilities || [],
    });
  } catch (error) {
    console.error('[Projects] getProjectMembers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch team members.' });
  }
};

/**
 * POST /api/projects/create-with-template
 * PM initializes a project with AI-generated and PM-evaluated modules/tasks
 */
export const createProjectWithTemplate = async (req, res) => {
  try {
    const { name, description, deadline, key, modules, teamMemberIds } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required.' });
    }
    if (!Array.isArray(modules) || modules.length === 0) {
      return res.status(400).json({ success: false, message: 'Modules list cannot be empty.' });
    }

    const result = await taskGenerationService.createProjectWithSrsTemplate({
      name,
      description,
      deadline,
      key,
      modules,
      teamMemberIds: Array.isArray(teamMemberIds) ? teamMemberIds : [],
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: `Project "${result.project.name}" created with ${result.tasks.length} tasks.`,
      project: result.project,
      tasks: result.tasks,
    });
  } catch (error) {
    console.error('[Projects] createProjectWithTemplate error:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create project.' });
  }
};
