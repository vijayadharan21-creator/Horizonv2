import api from './authApi.js';

// ─── Projects API ──────────────────────────────────────────────────────────────

export const projectsApi = {
  /** Get all projects (PM: own projects | Dev: member projects) */
  getAll: async () => {
    const response = await api.get('/api/projects');
    return response.data;
  },

  /** Get a project by ID */
  getById: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}`);
    return response.data;
  },

  /** Create a project (PM only) */
  create: async ({ name, description, status, deadline }) => {
    const response = await api.post('/api/projects', { name, description, status, deadline });
    return response.data;
  },

  /** Create project initialized from AI SRS template */
  createWithSrsTemplate: async ({ name, description, deadline, key, modules, teamMemberIds }) => {
    const response = await api.post('/api/projects/create-with-template', {
      name,
      description,
      deadline,
      key,
      modules,
      teamMemberIds,
    });
    return response.data;
  },

  /** Update a project (PM only) */
  update: async (projectId, updates) => {
    const response = await api.put(`/api/projects/${projectId}`, updates);
    return response.data;
  },

  /** Delete a project and all its tasks (PM only) */
  delete: async (projectId) => {
    const response = await api.delete(`/api/projects/${projectId}`);
    return response.data;
  },

  /** Get all members of a project */
  getMembers: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/members`);
    return response.data;
  },

  /** Invite a developer to a project (PM only) */
  inviteDeveloper: async (projectId, email) => {
    const response = await api.post(`/api/projects/${projectId}/invite`, { email });
    return response.data;
  },

  /** Get pending/accepted invitations for a project (PM only) */
  getInvitations: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/invitations`);
    return response.data;
  },

  /** Revoke a pending invitation by ID (PM only) */
  revokeInvitation: async (invitationId) => {
    const response = await api.delete(`/api/invitations/${invitationId}`);
    return response.data;
  },
};

// ─── Tasks API ─────────────────────────────────────────────────────────────────

export const tasksApi = {
  /** Get all tasks for a project */
  getByProject: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks`);
    return response.data;
  },

  /** Developer: get tasks assigned to me (cross-project) */
  getMyTasks: async () => {
    const response = await api.get('/api/tasks/my');
    return response.data;
  },

  /** Create a task in a project (PM only) */
  create: async (projectId, taskData) => {
    const response = await api.post(`/api/projects/${projectId}/tasks`, taskData);
    return response.data;
  },

  /** Update a task (PM: full | Developer: progress/status only) */
  update: async (taskId, updates) => {
    const response = await api.put(`/api/tasks/${taskId}`, updates);
    return response.data;
  },

  /** Delete a task (PM only) */
  delete: async (taskId) => {
    const response = await api.delete(`/api/tasks/${taskId}`);
    return response.data;
  },
};

// ─── Invitations API ───────────────────────────────────────────────────────────

export const invitationsApi = {
  /** Developer: get all pending invitations sent to me (in-app notifications) */
  getMy: async () => {
    const response = await api.get('/api/invitations/my');
    return response.data;
  },

  /** Developer: accept an invitation by ID → joins the project */
  accept: async (invitationId) => {
    const response = await api.post(`/api/invitations/${invitationId}/accept`);
    return response.data;
  },

  /** Developer: decline an invitation */
  decline: async (invitationId) => {
    const response = await api.post(`/api/invitations/${invitationId}/decline`);
    return response.data;
  },

  /** PM: revoke a pending invitation */
  revoke: async (invitationId) => {
    const response = await api.delete(`/api/invitations/${invitationId}`);
    return response.data;
  },
};

// ─── Users API ─────────────────────────────────────────────────────────────────

export const usersApi = {
  /** Get all developer accounts (PM only — for task assignment) */
  getDevelopers: async () => {
    const response = await api.get('/api/users/developers');
    return response.data;
  },

  /** Update logged-in user's profile (name, skills) */
  updateProfile: async (profileData) => {
    const response = await api.put('/api/users/profile', profileData);
    return response.data;
  },

  /** Change logged-in user's password */
  changePassword: async ({ currentPassword, newPassword }) => {
    const response = await api.put('/api/users/password', { currentPassword, newPassword });
    return response.data;
  },
};

// ─── AI API ────────────────────────────────────────────────────────────────────

export const aiApi = {
  /** Get AI operational status (PM/Admin only) */
  getStatus: async () => {
    const response = await api.get('/api/ai/status');
    return response.data;
  },

  /** Feature 1: Generate structured task proposals from requirements (PM only) */
  generateTasks: async (projectId, requirements) => {
    const response = await api.post('/api/ai/generate-tasks', {
      projectId,
      requirements,
    });
    return response.data;
  },

  /** Feature 1: Persist approved task proposals into MongoDB (PM only) */
  approveTasks: async (projectId, approvedTasks) => {
    const response = await api.post('/api/ai/approve-tasks', {
      projectId,
      approvedTasks,
    });
    return response.data;
  },

  /** Feature 2: Recommend intelligent developer assignments (PM only) */
  recommendAssignments: async (projectId, taskIds) => {
    const response = await api.post('/api/ai/recommend-assignments', {
      projectId,
      taskIds,
    });
    return response.data;
  },

  /** Feature 3: Get live AI sprint insights grounded in project data */
  getSprintInsights: async (projectId) => {
    const response = await api.get(`/api/ai/sprint-insights?projectId=${projectId}`);
    return response.data;
  },

  /** Feature 4: Generate recovery recommendations for unexpected disruptions (PM only) */
  getRecoveryRecommendations: async (projectId, scenario) => {
    const response = await api.post('/api/ai/recovery-recommendations', {
      projectId,
      scenario,
    });
    return response.data;
  },

  /** Feature 4: Apply approved recovery plan modifications to MongoDB (PM only) */
  applyRecoveryPlan: async (
    projectId,
    actions,
    unavailableInfo = null,
    expectedVersion = null,
    extraMeta = {}
  ) => {
    const response = await api.post('/api/ai/apply-recovery-plan', {
      projectId,
      actions,
      unavailableInfo,
      expectedVersion,
      ...extraMeta,
    });
    return response.data;
  },

  /** Feature 4: Clear unavailability and mark person as available again */
  clearUnavailability: async (projectId, userId) => {
    const response = await api.post('/api/ai/clear-unavailability', {
      projectId,
      userId,
    });
    return response.data;
  },

  /** AI-SENSE: Live uncertainty detection across 7 taxonomy categories */
  detectUncertainties: async (projectId) => {
    const response = await api.get(`/api/ai/uncertainties/${projectId}`);
    return response.data;
  },

  /** EDUR: Post-leave return evaluation and beneficial transfer-back */
  evaluatePostLeaveReturn: async (projectId, userId, returnDate) => {
    const response = await api.post('/api/ai/evaluate-return', {
      projectId,
      userId,
      returnDate,
    });
    return response.data;
  },

  /** EDUR: Audit trail history of all schedule versions and changes */
  getScheduleAuditHistory: async (projectId) => {
    const response = await api.get(`/api/ai/audit-history/${projectId}`);
    return response.data;
  },

  /** Feature 5: Context-aware task specification assistance */
  getTaskAssistance: async (projectId, taskData) => {
    const response = await api.post('/api/ai/task-assist', {
      projectId,
      ...taskData,
    });
    return response.data;
  },

  /** Feature 6: Analyze SRS Document / Text using AI model */
  analyzeSrs: async ({ srsText, fileName }) => {
    const response = await api.post('/api/ai/analyze-srs', { srsText, fileName });
    return response.data;
  },
};
