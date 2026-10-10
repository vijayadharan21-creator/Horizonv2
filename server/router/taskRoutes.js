import express from 'express';
import {
  updateTask,
  deleteTask,
  getMyTasks,
} from '../controllers/taskController.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All task routes require authentication
router.use(authenticateUser);

// Developer: get all tasks assigned to them (cross-project)
router.get('/my', getMyTasks);

// Update a task (PM: full update; Developer: progress/status only)
router.put('/:id', updateTask);

// Delete a task (PM only)
router.delete('/:id', authorizeRoles('project_manager'), deleteTask);

export default router;
