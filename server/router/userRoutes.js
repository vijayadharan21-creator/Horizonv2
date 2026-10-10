import express from 'express';
import {
  getDevelopers,
  updateProfile,
  changePassword,
} from '../controllers/userController.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticateUser);

// PM: list all developers for task assignment
router.get('/developers', authorizeRoles('project_manager'), getDevelopers);

// Any authenticated user: update their own profile
router.put('/profile', updateProfile);

// Change own password
router.put('/password', changePassword);

export default router;
