import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: [6, 'Project key cannot exceed 6 characters'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: ['Planning', 'Active', 'In Progress', 'On Hold', 'Completed', 'Archived'],
      default: 'Planning',
    },
    deadline: {
      type: String,
      default: '',
    },
    // Project Manager who created/owns the project
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Developers assigned to this project
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    tasksCount: {
      type: Number,
      default: 0,
    },
    scheduleVersion: {
      type: Number,
      default: 1,
    },
    unavailabilities: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        userName: { type: String, default: '' },
        fromDate: { type: String, default: '' },
        fromTime: { type: String, default: '09:00' },
        toDate: { type: String, default: '' },
        toTime: { type: String, default: '18:00' },
        reason: { type: String, default: 'Absence / Leave' },
        status: { type: String, default: 'unavailable' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Virtual: total members including manager
projectSchema.virtual('totalMembers').get(function () {
  return this.members.length + 1;
});

const Project = mongoose.model('Project', projectSchema);
export default Project;
