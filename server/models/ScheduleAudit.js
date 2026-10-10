import mongoose from 'mongoose';

const scheduleAuditSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    scheduleVersion: {
      type: Number,
      required: true,
    },
    previousScheduleVersion: {
      type: Number,
      default: null,
    },
    triggerType: {
      type: String,
      default: 'WORKER_UNAVAILABILITY',
    },
    strategy: {
      type: String,
      default: 'MIN_DISRUPTIONS',
    },
    candidateId: {
      type: String,
      default: 'CAND_OPTIMAL',
    },
    eventId: {
      type: String,
      default: null,
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actionsApplied: [
      {
        taskId: String,
        taskTitle: String,
        actionType: String,
        previousAssignee: String,
        newAssignee: String,
        previousDueDate: String,
        newDueDate: String,
        priorityAdjustment: String,
        reason: String,
      },
    ],
    validationResult: {
      valid: { type: Boolean, default: true },
      errors: { type: Array, default: [] },
      warnings: { type: Array, default: [] },
    },
    objectiveScore: {
      J: { type: Number, default: 0 },
      components: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    explanation: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    solverStatus: {
      type: String,
      enum: ['OPTIMAL', 'FEASIBLE', 'HEURISTIC_FEASIBLE', 'INFEASIBLE', 'TIMEOUT', 'MODEL_INVALID'],
      default: 'FEASIBLE',
    },
    status: {
      type: String,
      enum: ['COMMITTED', 'REJECTED', 'PENDING_APPROVAL'],
      default: 'COMMITTED',
    },
  },
  {
    timestamps: true,
  }
);

scheduleAuditSchema.index({ project: 1, scheduleVersion: -1 });

const ScheduleAudit = mongoose.model('ScheduleAudit', scheduleAuditSchema);
export default ScheduleAudit;
