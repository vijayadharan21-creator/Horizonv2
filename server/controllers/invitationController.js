import Invitation from '../models/Invitation.js';
import Project from '../models/Project.js';
import User from '../models/User.js';

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/invite
 * PM invites a developer by their registered email.
 * No email is sent — the developer sees it as an in-app notification.
 */
export const inviteDeveloper = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email } = req.body;

    const rawInput = (email || req.body.developerId || req.body.userId || '').trim();
    if (!rawInput) {
      return res.status(400).json({ success: false, message: 'Developer email or ID is required.' });
    }

    const project = await Project.findById(projectId).populate('manager', 'name email');
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // PM or Admin authorization
    const isManager = project.manager && project.manager._id.toString() === req.user.id;
    const isPM = req.user.role === 'project_manager' || req.user.role === 'admin';
    if (!isManager && !isPM) {
      return res.status(403).json({
        success: false,
        message: 'Only a project manager can send invitations.',
      });
    }

    // Find developer by ID, email, or name
    let invitedUser = null;
    if (rawInput.match(/^[0-9a-fA-F]{24}$/)) {
      invitedUser = await User.findById(rawInput);
    }
    if (!invitedUser) {
      invitedUser = await User.findOne({ email: rawInput.toLowerCase() });
    }
    if (!invitedUser) {
      invitedUser = await User.findOne({
        name: new RegExp(`^${rawInput}$`, 'i'),
        role: 'developer',
      });
    }

    if (!invitedUser) {
      return res.status(404).json({
        success: false,
        message: `No registered developer found matching "${rawInput}". They must sign up first.`,
      });
    }

    if (invitedUser.role !== 'developer') {
      return res.status(400).json({
        success: false,
        message: 'You can only invite users with the Developer role.',
      });
    }

    const normalizedEmail = invitedUser.email.toLowerCase();

    // Check if already a member
    const isAlreadyMember =
      project.members.map((m) => m.toString()).includes(invitedUser._id.toString()) ||
      (project.manager && (project.manager._id || project.manager).toString() === invitedUser._id.toString());

    if (isAlreadyMember) {
      return res.status(409).json({
        success: false,
        message: 'This developer is already a member of the project.',
      });
    }

    // Check for existing pending invitation
    const existingInvite = await Invitation.findOne({
      $or: [
        { email: normalizedEmail },
        { invitedUser: invitedUser._id }
      ],
      project: project._id,
      status: 'pending',
    });

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      return res.status(409).json({
        success: false,
        message: 'A pending invitation has already been sent to this developer.',
      });
    }

    // Create invitation — link to the registered user immediately
    const invitation = await Invitation.create({
      email: normalizedEmail,
      project: project._id,
      invitedBy: req.user.id,
      invitedUser: invitedUser._id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    console.log(
      `[TaskForge] In-app invite: ${project.manager?.name || 'Manager'} → ${invitedUser.name} (${normalizedEmail}) for "${project.name}"`
    );

    return res.status(201).json({
      success: true,
      message: `Invitation sent to ${invitedUser.name}. They will see it in their dashboard.`,
      invitation: {
        id: invitation._id,
        email: invitation.email,
        developerName: invitedUser.name,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
    });
  } catch (error) {
    console.error('[Invitation] inviteDeveloper error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send invitation.' });
  }
};

/**
 * GET /api/invitations/my
 * Developer: get all pending invitations sent to the logged-in user.
 * This powers the in-app notification badge.
 */
export const getMyInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({
      $or: [
        { invitedUser: req.user.id },
        { email: (req.user.email || '').toLowerCase() }
      ],
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .populate('project', 'name description status deadline')
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: invitations.length,
      invitations: invitations
        .filter((inv) => inv.project) // Guard against dangling deleted project
        .map((inv) => ({
          id: inv._id.toString(),
          project: {
            id: (inv.project._id || inv.project).toString(),
            name: inv.project.name,
            description: inv.project.description,
            status: inv.project.status,
            deadline: inv.project.deadline,
          },
          invitedBy: {
            name: inv.invitedBy?.name || 'Project Manager',
            email: inv.invitedBy?.email || '',
          },
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        })),
    });
  } catch (error) {
    console.error('[Invitation] getMyInvitations error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch invitations.' });
  }
};

/**
 * POST /api/invitations/:id/accept
 * Developer accepts an invitation → gets added to the project.
 */
export const acceptInvitation = async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id).populate('project');
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found.' });
    }

    // Must be the invited user (match by user ID or email)
    const isTargetUser =
      (invitation.invitedUser && invitation.invitedUser.toString() === req.user.id) ||
      (invitation.email && invitation.email.toLowerCase() === req.user.email?.toLowerCase());

    if (!isTargetUser) {
      return res.status(403).json({ success: false, message: 'This invitation is not for you.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Invitation has already been ${invitation.status}.`,
      });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ success: false, message: 'This invitation has expired.' });
    }

    const project = invitation.project;

    // Add user to project members
    if (!project.members.map((m) => m.toString()).includes(req.user.id)) {
      project.members.push(req.user.id);
      await project.save();
    }

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    return res.status(200).json({
      success: true,
      message: `You've joined "${project.name}"! It will appear in your projects.`,
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        status: project.status,
      },
    });
  } catch (error) {
    console.error('[Invitation] acceptInvitation error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to accept invitation.' });
  }
};

/**
 * POST /api/invitations/:id/decline
 * Developer declines an invitation.
 */
export const declineInvitation = async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found.' });
    }

    if (invitation.invitedUser.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This invitation is not for you.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Invitation has already been ${invitation.status}.`,
      });
    }

    invitation.status = 'declined';
    await invitation.save();

    return res.status(200).json({ success: true, message: 'Invitation declined.' });
  } catch (error) {
    console.error('[Invitation] declineInvitation error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to decline invitation.' });
  }
};

/**
 * GET /api/projects/:projectId/invitations
 * PM only — list all invitations for a project.
 */
export const getProjectInvitations = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (project.manager.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const invitations = await Invitation.find({ project: projectId })
      .populate('invitedUser', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      invitations: invitations.map((inv) => ({
        id: inv._id.toString(),
        email: inv.email,
        developerName: inv.invitedUser?.name || null,
        status: inv.status,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Invitation] getProjectInvitations error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch invitations.' });
  }
};

/**
 * DELETE /api/invitations/:id
 * PM can revoke a pending invitation.
 */
export const revokeInvitation = async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id).populate('project');
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found.' });
    }

    if (invitation.project.manager.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot revoke a ${invitation.status} invitation.`,
      });
    }

    await Invitation.findByIdAndDelete(invitation._id);
    return res.status(200).json({ success: true, message: 'Invitation revoked.' });
  } catch (error) {
    console.error('[Invitation] revokeInvitation error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to revoke invitation.' });
  }
};
