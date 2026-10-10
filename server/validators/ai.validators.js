import mongoose from 'mongoose';

/**
 * Validates request payloads for AI endpoints
 */

export const validateProjectId = (projectId) => {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return 'A valid MongoDB projectId is required.';
  }
  return null;
};

export const validateGenerateTasksPayload = (req, res, next) => {
  const { projectId, requirements } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  if (!requirements || (Array.isArray(requirements) && requirements.length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Requirements are required to generate tasks.',
      code: 'MISSING_REQUIREMENTS',
    });
  }

  if (Array.isArray(requirements) && requirements.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'Too many requirements provided at once (maximum 20).',
      code: 'REQUIREMENTS_TOO_LARGE',
    });
  }

  next();
};

export const validateApproveTasksPayload = (req, res, next) => {
  const { projectId, approvedTasks } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  if (!Array.isArray(approvedTasks) || approvedTasks.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Approved tasks array cannot be empty.',
      code: 'MISSING_APPROVED_TASKS',
    });
  }

  next();
};

export const validateRecommendAssignmentsPayload = (req, res, next) => {
  const { projectId, taskIds } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'taskIds must be a non-empty array of task IDs.',
      code: 'MISSING_TASK_IDS',
    });
  }

  next();
};

export const validateRecoveryPayload = (req, res, next) => {
  const { projectId, scenario } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  if (!scenario || typeof scenario !== 'object' || !scenario.type) {
    return res.status(400).json({
      success: false,
      message: 'Scenario object with valid "type" is required.',
      code: 'INVALID_SCENARIO',
    });
  }

  next();
};

export const validateApplyRecoveryPayload = (req, res, next) => {
  const { projectId, actions, unavailableInfo } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  const hasActions = Array.isArray(actions) && actions.length > 0;
  const hasUnavailableInfo = unavailableInfo && unavailableInfo.userId;

  if (!hasActions && !hasUnavailableInfo) {
    return res.status(400).json({
      success: false,
      message: 'Either recovery actions or unavailable team member details are required.',
      code: 'MISSING_RECOVERY_DATA',
    });
  }

  next();
};

export const validateTaskAssistPayload = (req, res, next) => {
  const { projectId, title } = req.body;
  const projectError = validateProjectId(projectId);
  if (projectError) {
    return res.status(400).json({ success: false, message: projectError, code: 'INVALID_PROJECT_ID' });
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Task title is required for assistance.',
      code: 'MISSING_TITLE',
    });
  }

  next();
};
