import { getSafeAiStatus, probeOllama, aiConfig } from '../config/ai.config.js';
import taskGenerationService from '../service/ai/task-generation.service.js';
import assignmentRecommendationService from '../service/ai/assignment-recommendation.service.js';
import sprintInsightsService from '../service/ai/sprint-insights.service.js';
import recoveryAiService from '../service/ai/recovery-ai.service.js';
import edurEngine from '../service/edur/edurEngine.js';
import uncertaintyDetector from '../service/ai-sense/uncertaintyDetector.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ScheduleAudit from '../models/ScheduleAudit.js';

/**
 * Helper to check project membership
 */
const verifyProjectAccess = async (projectId, userId, requiredRole = null) => {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    const error = new Error('Project not found.');
    error.status = 404;
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  const isManager = project.manager?.toString() === userId;
  const isMember = project.members?.some((m) => m.toString() === userId);

  if (requiredRole === 'manager' && !isManager) {
    const error = new Error('Only the project manager has permission to perform this action.');
    error.status = 403;
    error.code = 'FORBIDDEN_PM_ONLY';
    throw error;
  }

  if (!isManager && !isMember) {
    const error = new Error('You do not have access to this project.');
    error.status = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  return project;
};

// ─── Status Endpoint ──────────────────────────────────────────────────────────

export const getStatus = async (req, res) => {
  try {
    const status = getSafeAiStatus();
    const ollamaProbe = await probeOllama();
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        ollama: {
          ...status.ollama,
          reachable: ollamaProbe.reachable,
          modelInstalled: ollamaProbe.modelInstalled,
        },
        openai: {
          ...status.openai,
          fallbackReady: Boolean(aiConfig.fallbackEnabled && aiConfig.openai.apiKey),
        },
        live: ollamaProbe.reachable
          ? ollamaProbe.modelInstalled
            ? 'ollama_ready'
            : 'ollama_model_missing'
          : status.activeProvider === 'openai' && status.openai.hasKeyConfigured
            ? 'openai_configured'
            : 'ollama_offline',
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve AI status.',
      code: 'AI_STATUS_ERROR',
    });
  }
};

// ─── Feature 1: Generate & Approve Tasks ──────────────────────────────────────

export const generateTasks = async (req, res) => {
  try {
    const { projectId, requirements } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const result = await taskGenerationService.generateTasks({
      projectId,
      requirements,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: {
        suggestions: result.suggestions,
      },
      meta: result.meta,
    });
  } catch (error) {
    console.error('[AI Controller] generateTasks error:', error.message);
    const status = error.status || (error.code === 'AI_TIMEOUT' ? 504 : 500);
    return res.status(status).json({
      success: false,
      message: error.message || 'Task generation failed.',
      code: error.code || 'TASK_GENERATION_FAILED',
    });
  }
};

export const approveTasks = async (req, res) => {
  try {
    const { projectId, approvedTasks } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const createdTasks = await taskGenerationService.approveAndCreateTasks({
      projectId,
      approvedTasks,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        tasks: createdTasks,
        createdCount: createdTasks.length,
      },
      message: `Successfully created ${createdTasks.length} tasks from approved proposal.`,
    });
  } catch (error) {
    console.error('[AI Controller] approveTasks error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to approve and create tasks.',
      code: error.code || 'TASK_APPROVAL_FAILED',
    });
  }
};

// ─── Feature 2: Recommend Assignments ────────────────────────────────────────

export const recommendAssignments = async (req, res) => {
  try {
    const { projectId, taskIds } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const result = await assignmentRecommendationService.recommendAssignments({
      projectId,
      taskIds,
    });

    return res.status(200).json({
      success: true,
      data: {
        recommendations: result.recommendations,
        teamStats: result.teamStats,
      },
      meta: result.meta,
    });
  } catch (error) {
    console.error('[AI Controller] recommendAssignments error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to generate assignment recommendations.',
      code: error.code || 'ASSIGNMENT_RECOMMENDATION_FAILED',
    });
  }
};

// ─── Feature 3: Sprint Insights ──────────────────────────────────────────────

export const getSprintInsights = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'projectId query parameter is required.',
        code: 'MISSING_PROJECT_ID',
      });
    }

    await verifyProjectAccess(projectId, req.user.id);

    const result = await sprintInsightsService.getSprintInsights({ projectId });

    return res.status(200).json({
      success: true,
      data: {
        summary: result.summary,
        insights: result.insights,
        metrics: result.metrics,
      },
      meta: result.meta,
    });
  } catch (error) {
    console.error('[AI Controller] getSprintInsights error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to generate sprint insights.',
      code: error.code || 'SPRINT_INSIGHTS_FAILED',
    });
  }
};

// ─── Feature 4: Recovery Center & EDUR Engine ────────────────────────────────
export const getRecoveryRecommendations = async (req, res) => {
  try {
    const { projectId, scenario } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    // Execute EDUR Solver Pipeline
    const edurResult = await edurEngine.solveRecovery({
      projectId,
      scenario,
    });

    const candidate = edurResult.selectedCandidate;
    const actions = candidate ? candidate.actions : [];

    const planData = {
      scenarioAnalysis: edurResult.explanation,
      explanation: edurResult.explanation,
      solverStatus: edurResult.status,
      scheduleVersion: edurResult.scheduleVersion,
      affectedCount: edurResult.affectedCount,
      preservedCompletedTaskCount: edurResult.preservedCompletedCount,
      actions,
      selectedCandidate: candidate,
      candidates: edurResult.candidates,
      unavailablePerson: {
        userId: scenario?.userId,
        userName: scenario?.workerName || 'Team member',
        fromDate: scenario?.fromDate,
        fromTime: scenario?.fromTime,
        toDate: scenario?.toDate,
        toTime: scenario?.toTime,
        reason: scenario?.reason,
      },
    };

    return res.status(200).json({
      success: true,
      data: planData,
      meta: {
        engine: 'EDUR_OR_TOOLS_COMPLIANT',
        solverStatus: edurResult.status,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[AI Controller] getRecoveryRecommendations error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to generate recovery plan.',
      code: error.code || 'RECOVERY_GENERATION_FAILED',
    });
  }
};

export const applyRecoveryPlan = async (req, res) => {
  try {
    const {
      projectId,
      actions,
      unavailableInfo,
      expectedVersion,
      triggerType,
      strategy,
      candidateId,
      explanation,
      objectiveScore,
      validationResult,
      notes,
    } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const result = await edurEngine.applyPlan({
      projectId,
      actions,
      userId: req.user.id,
      unavailableInfo,
      expectedVersion,
      triggerType,
      strategy,
      candidateId,
      explanation,
      objectiveScore,
      validationResult,
      notes,
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: `Applied ${result.appliedCount} recovery adjustments to project tasks (Schedule v${result.newScheduleVersion})${
        unavailableInfo?.userName ? ` and updated ${unavailableInfo.userName} as Unavailable` : ''
      }.`,
    });
  } catch (error) {
    console.error('[AI Controller] applyRecoveryPlan error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to apply recovery plan.',
      code: error.code || 'RECOVERY_APPLY_FAILED',
    });
  }
};

export const clearUnavailability = async (req, res) => {
  try {
    const { projectId, userId } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const result = await recoveryAiService.clearUnavailability({
      projectId,
      userId,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[AI Controller] clearUnavailability error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to clear unavailability status.',
      code: error.code || 'CLEAR_UNAVAILABILITY_FAILED',
    });
  }
};

// ─── AI-SENSE Uncertainty Detection & Audit Endpoints ─────────────────────────
export const detectUncertainties = async (req, res) => {
  try {
    const { projectId } = req.params;
    await verifyProjectAccess(projectId, req.user.id);

    const project = await Project.findById(projectId)
      .populate('members')
      .populate('manager')
      .lean();

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const tasks = await Task.find({ project: projectId }).lean();
    const workers = [
      ...(project.members || []),
      ...(project.manager ? [project.manager] : []),
    ];

    const risks = uncertaintyDetector.detectProjectUncertainties({
      project,
      tasks,
      workers,
    });

    return res.status(200).json({
      success: true,
      projectId,
      scheduleVersion: project.scheduleVersion || 1,
      riskCount: risks.length,
      risks,
    });
  } catch (error) {
    console.error('[AI Controller] detectUncertainties error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to detect project uncertainties.',
      code: error.code || 'UNCERTAINTY_DETECTION_FAILED',
    });
  }
};

export const evaluatePostLeaveReturn = async (req, res) => {
  try {
    const { projectId, userId, returnDate } = req.body;
    await verifyProjectAccess(projectId, req.user.id, 'manager');

    const result = await edurEngine.evaluatePostLeaveReturn({
      projectId,
      userId,
      returnDate,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[AI Controller] evaluatePostLeaveReturn error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to evaluate post-leave return.',
      code: error.code || 'POST_LEAVE_EVALUATION_FAILED',
    });
  }
};

export const getScheduleAuditHistory = async (req, res) => {
  try {
    const { projectId } = req.params;
    await verifyProjectAccess(projectId, req.user.id);

    const audits = await ScheduleAudit.find({ project: projectId })
      .populate('appliedBy', 'name email role')
      .sort({ scheduleVersion: -1 })
      .limit(30)
      .lean();

    // Map audits to ensure every property is normalized and UI-ready
    const formattedAudits = audits.map((a) => {
      const actions = a.actionsApplied || [];
      const scoreObj =
        typeof a.objectiveScore === 'number'
          ? { J: a.objectiveScore, components: {} }
          : a.objectiveScore || { J: 0, components: {} };

      return {
        ...a,
        id: a._id,
        timestamp: a.createdAt || new Date(),
        scheduleVersion: a.scheduleVersion || 1,
        previousScheduleVersion:
          a.previousScheduleVersion ??
          (a.scheduleVersion > 1 ? a.scheduleVersion - 1 : 1),
        triggerType:
          a.triggerType ||
          (a.scheduleVersion === 1 ? 'INITIAL_SCHEDULE' : 'SCHEDULE_REBALANCE'),
        strategy: a.strategy || 'MIN_DISRUPTIONS',
        candidateId: a.candidateId || 'CAND_OPTIMAL',
        modifiedTaskCount: actions.length,
        objectiveScoreVal: scoreObj.J ?? 0,
        objectiveScore: scoreObj,
        validationPassed: a.validationResult?.valid !== false,
        validationResult: a.validationResult || { valid: true, errors: [], warnings: [] },
        reasoning:
          a.explanation ||
          (actions.length > 0
            ? `EDUR replanned ${actions.length} task(s) to resolve resource constraints while preserving completed work.`
            : 'Schedule validated with zero constraint violations.'),
        notes: a.notes || '',
        actionsApplied: actions.map((act) => ({
          taskId: act.taskId || 'Task',
          taskTitle: act.taskTitle || act.taskId || 'Task',
          actionType: act.actionType || 'reassign',
          previousAssignee: act.previousAssignee || 'Unassigned',
          newAssignee: act.newAssignee || 'Unassigned',
          previousDueDate: act.previousDueDate || '',
          newDueDate: act.newDueDate || '',
          priorityAdjustment: act.priorityAdjustment || '',
          reason: act.reason || 'EDUR Constrained Reallocation',
        })),
        appliedByName: a.appliedBy?.name || 'Project Manager',
      };
    });

    return res.status(200).json({
      success: true,
      projectId,
      audits: formattedAudits,
    });
  } catch (error) {
    console.error('[AI Controller] getScheduleAuditHistory error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch schedule audit history.',
      code: error.code || 'AUDIT_FETCH_FAILED',
    });
  }
};

// ─── Feature 5: Context-Aware Task Assistance ────────────────────────────────

export const getTaskAssistance = async (req, res) => {
  try {
    const { projectId, title, description, taskId } = req.body;
    await verifyProjectAccess(projectId, req.user.id);

    const result = await taskGenerationService.getTaskAssistance({
      projectId,
      title,
      description,
      taskId,
    });

    return res.status(200).json({
      success: true,
      data: result.assistance,
      meta: result.meta,
    });
  } catch (error) {
    console.error('[AI Controller] getTaskAssistance error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to get task assistance.',
      code: error.code || 'TASK_ASSIST_FAILED',
    });
  }
};

// ─── Feature 6: SRS Document Analysis & Project Template Generation ───────

export const analyzeSrs = async (req, res) => {
  try {
    const { srsText, fileName, teamMemberIds } = req.body;
    if (!srsText || !srsText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'SRS document text is required for analysis.',
        code: 'MISSING_SRS_TEXT',
      });
    }

    const result = await taskGenerationService.analyzeSrsDocument({
      srsText: srsText.trim(),
      fileName: fileName || 'Uploaded Document',
      userId: req.user.id,
      teamMemberIds: Array.isArray(teamMemberIds) ? teamMemberIds : [],
    });

    return res.status(200).json({
      success: true,
      data: result.template,
      meta: result.meta,
    });
  } catch (error) {
    console.error('[AI Controller] analyzeSrs error:', error.message);
    const status = error.status || (error.code === 'AI_TIMEOUT' ? 504 : 500);
    return res.status(status).json({
      success: false,
      message: error.message || 'SRS document analysis failed.',
      code: error.code || 'SRS_ANALYSIS_FAILED',
    });
  }
};
