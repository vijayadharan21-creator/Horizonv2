import React, { useState, useEffect } from 'react';
import { projectsApi } from '../api/index.js';

/**
 * InviteTeamModal
 * PM can invite developers to the current project via email.
 * Shows existing invitations and lets PM revoke pending ones.
 */
const InviteTeamModal = ({ isOpen, onClose, currentProject }) => {
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  useEffect(() => {
    if (isOpen && currentProject?.id) {
      loadInvitations();
    }
  }, [isOpen, currentProject]);

  const loadInvitations = async () => {
    if (!currentProject?.id) return;
    try {
      setLoadingInvites(true);
      const res = await projectsApi.getInvitations(currentProject.id);
      if (res.success) setInvitations(res.invitations || []);
    } catch {
      // Silently ignore
    } finally {
      setLoadingInvites(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || !currentProject?.id) return;

    setInviting(true);
    setInviteResult(null);
    try {
      const res = await projectsApi.inviteDeveloper(currentProject.id, email.trim());
      if (res.success) {
        setInviteResult({ type: 'success', message: res.message });
        setEmail('');
        await loadInvitations();
      } else {
        setInviteResult({ type: 'error', message: res.message });
      }
    } catch (err) {
      setInviteResult({
        type: 'error',
        message: err.response?.data?.message || 'Failed to send invitation.',
      });
    } finally {
      setInviting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: 'bg-amber-100 text-amber-700',
      accepted: 'bg-emerald-100 text-emerald-700',
      declined: 'bg-red-100 text-red-700',
      expired: 'bg-slate-100 text-slate-500',
    };
    return map[status] || 'bg-slate-100 text-slate-500';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Invite Team Members</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentProject?.name || 'Current Project'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Invite Form */}
        <div className="px-6 py-4 border-b border-slate-100">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Developer Email Address
          </label>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="developer@example.com"
              required
              className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-slate-50"
            />
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              {inviting ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>

          {/* Result message */}
          {inviteResult && (
            <div
              className={`mt-2 text-xs px-3 py-2 rounded-xl font-medium ${
                inviteResult.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {inviteResult.message}
            </div>
          )}
        </div>

        {/* Invitation History */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Invitation History
          </div>
          {loadingInvites ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No invitations sent yet.</p>
          ) : (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{inv.email}</p>
                    <p className="text-[10px] text-slate-400">
                      Sent {new Date(inv.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`ml-3 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusBadge(inv.status)}`}
                  >
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 rounded-b-2xl border-t border-slate-100">
          <p className="text-[10px] text-slate-400">
            Invited developers will receive an email with a link to join this project.
            In development mode, the invitation link is logged to the server console.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InviteTeamModal;
