import express from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectMembers,
  createProjectWithTemplate,
} from '../controllers/projectController.js';
import {
  getTasksByProject,
  createTask,
} from '../controllers/taskController.js';
import {
  inviteDeveloper,
  getProjectInvitations,
} from '../controllers/invitationController.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All project routes require authentication
router.use(authenticateUser);

// ─── Projects ─────────────────────────────────────────────────────────────────
router.get('/', getProjects);
router.post('/create-with-template', authorizeRoles('project_manager'), createProjectWithTemplate);
router.get('/:id', getProjectById);
router.post('/', authorizeRoles('project_manager'), createProject);
router.put('/:id', authorizeRoles('project_manager'), updateProject);
router.delete('/:id', authorizeRoles('project_manager'), deleteProject);

// ─── Project Members ──────────────────────────────────────────────────────────
router.get('/:id/members', getProjectMembers);

// ─── Project Tasks ────────────────────────────────────────────────────────────
router.get('/:projectId/tasks', getTasksByProject);
router.post('/:projectId/tasks', authorizeRoles('project_manager'), createTask);

// ─── Project Invitations (PM only) ────────────────────────────────────────────
router.post('/:projectId/invite', authorizeRoles('project_manager'), inviteDeveloper);
router.get('/:projectId/invitations', authorizeRoles('project_manager'), getProjectInvitations);

export default router;
