import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    // Short human-readable task ID (e.g. T-101)
    taskId: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Task title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    // Kanban-style group (e.g. "To Do", "In Progress", "Completed")
    group: {
      type: String,
      default: 'To Do',
    },
    status: {
      type: String,
      enum: ['Pending', 'To Do', 'In Progress', 'In Review', 'Completed', 'Blocked'],
      default: 'Pending',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    // Developer assigned to this task
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // For display purposes — denormalized name from assignee
    assigneeName: {
      type: String,
      default: 'Unassigned',
    },
    effortHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    dueDate: {
      type: String,
      default: '',
    },
    startDate: {
      type: String,
      default: '',
    },
    // Task this depends on
    dependency: {
      type: String,
      default: null,
    },
    // Who created this task
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    tags: {
      type: [String],
      default: [],
    },
    lastUpdated: {
      type: String,
      default: 'Just now',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate "lastUpdated" relative string helper
taskSchema.pre('save', function () {
  this.lastUpdated = 'Just now';
});

// Counter model for auto-incrementing task IDs per project
const counterSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', unique: true },
  seq: { type: Number, default: 100 },
});

export const TaskCounter = mongoose.model('TaskCounter', counterSchema);

const Task = mongoose.model('Task', taskSchema);
export default Task;
