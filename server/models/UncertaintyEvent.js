import mongoose from 'mongoose';

const uncertaintyEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'UPCOMING_LEAVE',
        'ABSENCE_STARTED',
        'WORKER_RETURNED',
        'DURATION_OVERRUN',
        'PROGRESS_STAGNATION',
        'DEPENDENCY_DELAY',
        'CAPACITY_CONFLICT',
        'SKILL_MISMATCH',
        'SCOPE_CHANGE',
        'QUALITY_REWORK',
        'DATA_CONFLICT',
        'MULTIPLE_DISRUPTIONS',
      ],
      required: true,
    },
    classification: {
      type: String,
      enum: ['OBSERVED', 'INFERRED', 'PREDICTED'],
      default: 'OBSERVED',
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.9,
    },
    affectedTaskIds: {
      type: [String],
      default: [],
    },
    affectedWorkerIds: {
      type: [String],
      default: [],
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    estimatedImpact: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    recommendedAction: {
      type: String,
      default: '',
    },
    detectionRule: {
      type: String,
      default: 'AI_SENSE_DETERMINISTIC',
    },
    status: {
      type: String,
      enum: ['DETECTED', 'EVALUATED', 'RECOVERED', 'DISMISSED', 'PENDING_APPROVAL'],
      default: 'DETECTED',
    },
    scheduleVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast idempotency lookups per project
uncertaintyEventSchema.index({ project: 1, idempotencyKey: 1 });

const UncertaintyEvent = mongoose.model('UncertaintyEvent', uncertaintyEventSchema);
export default UncertaintyEvent;
