import mongoose from 'mongoose';
import crypto from 'crypto';

const invitationSchema = new mongoose.Schema(
  {
    // Email of the invited developer
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    // Project manager who sent the invitation
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // If the invited user is already registered, link them
    invitedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast email/project lookups
invitationSchema.index({ email: 1, project: 1 });

// Virtual to check if expired
invitationSchema.virtual('isExpired').get(function () {
  return this.expiresAt < new Date();
});

const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;
