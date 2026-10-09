import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  getSeedAccounts,
} from '../controllers/authController.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public auth endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/demo-accounts', getSeedAccounts);

// Protected profile endpoint
router.get('/me', authenticateUser, getCurrentUser);

// Role-protected endpoints
router.get('/pm-dashboard', authenticateUser, authorizeRoles('project_manager'), (req, res) => {
  res.json({
    success: true,
    message: 'Project Manager Workspace active',
    user: req.user,
    project: {
      name: 'TaskForge AI Core',
      status: 'Active',
      tasks: 5,
    },
  });
});

router.get('/dev-dashboard', authenticateUser, authorizeRoles('developer'), (req, res) => {
  res.json({
    success: true,
    message: 'Developer Workspace active',
    user: req.user,
    tasksAssigned: [
      { id: 'T2', title: 'Backend API & Dual-Token Auth', status: 'In Progress' },
    ],
  });
});

export default router;
