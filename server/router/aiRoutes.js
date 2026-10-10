import express from 'express';
import {
  getStatus,
  generateTasks,
  approveTasks,
  recommendAssignments,
  getSprintInsights,
  getRecoveryRecommendations,
  applyRecoveryPlan,
  clearUnavailability,
  getTaskAssistance,
  analyzeSrs,
} from '../controllers/ai.controller.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';
import {
  validateGenerateTasksPayload,
  validateApproveTasksPayload,
  validateRecommendAssignmentsPayload,
  validateRecoveryPayload,
  validateApplyRecoveryPayload,
  validateTaskAssistPayload,
} from '../validators/ai.validators.js';

const router = express.Router();

// All AI endpoints require authenticated sessions
router.use(authenticateUser);

// ─── AI Service Operational Status ───────────────────────────────────────────
router.get('/status', authorizeRoles('project_manager', 'admin'), getStatus);

// ─── Feature 1: Requirements Task Generation & Approval Workflow ─────────────
router.post(
  '/generate-tasks',
  authorizeRoles('project_manager', 'admin'),
  validateGenerateTasksPayload,
  generateTasks
);

router.post(
  '/approve-tasks',
  authorizeRoles('project_manager', 'admin'),
  validateApproveTasksPayload,
  approveTasks
);

// ─── Feature 2: Intelligent Developer Assignment Recommendations ─────────────
router.post(
  '/recommend-assignments',
  authorizeRoles('project_manager', 'admin'),
  validateRecommendAssignmentsPayload,
  recommendAssignments
);

// ─── Feature 3: Live Sprint Insights ─────────────────────────────────────────
router.get('/sprint-insights', getSprintInsights);

// ─── Feature 4: Recovery Center & Intelligent Replanning ─────────────────────
router.post(
  '/recovery-recommendations',
  authorizeRoles('project_manager', 'admin'),
  validateRecoveryPayload,
  getRecoveryRecommendations
);

router.post(
  '/apply-recovery-plan',
  authorizeRoles('project_manager', 'admin'),
  validateApplyRecoveryPayload,
  applyRecoveryPlan
);

router.post(
  '/clear-unavailability',
  authorizeRoles('project_manager', 'admin'),
  clearUnavailability
);

// ─── Feature 5: Context-Aware Task Assistance ────────────────────────────────
router.post('/task-assist', validateTaskAssistPayload, getTaskAssistance);

// ─── Feature 6: SRS Document Analysis & Project Template Generation ─────────
router.post(
  '/analyze-srs',
  authorizeRoles('project_manager', 'admin'),
  analyzeSrs
);

export default router;
