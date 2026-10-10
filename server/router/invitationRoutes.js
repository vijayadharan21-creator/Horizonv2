import express from 'express';
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  revokeInvitation,
} from '../controllers/invitationController.js';
import { authenticateUser, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Developer: get all pending invitations for me (in-app notifications)
router.get('/my', authenticateUser, getMyInvitations);

// Developer: accept an invitation → joins the project
router.post('/:id/accept', authenticateUser, authorizeRoles('developer'), acceptInvitation);

// Developer: decline an invitation
router.post('/:id/decline', authenticateUser, authorizeRoles('developer'), declineInvitation);

// PM: revoke a pending invitation
router.delete('/:id', authenticateUser, authorizeRoles('project_manager'), revokeInvitation);

export default router;
