import React, { useState, useEffect, useCallback } from 'react';
import { projectsApi } from '../../api/index.js';

/* ── Status badge colours ──────────────────────────────────── */
const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  declined: 'bg-red-100 text-red-700 border-red-200',
  expired:  'bg-slate-100 text-slate-500 border-slate-200',
};

/* ── Avatar initials helper ────────────────────────────────── */
function Avatar({ name, color = 'bg-blue-600' }) {
  return (
    <div className={`w-9 h-9 rounded-xl ${color} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm`}>
      {name ? name.slice(0, 2).toUpperCase() : '??'}
    </div>
  );
}

const AVATAR_COLORS = [
  'bg-violet-600', 'bg-blue-600', 'bg-emerald-600',
  'bg-amber-600',  'bg-rose-600',  'bg-cyan-600',
];

/* ── Main TeamView ─────────────────────────────────────────── */
export const TeamView = ({ currentProject, onInviteSent }) => {
  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [invEmail,    setInvEmail]    = useState('');
  const [sending,     setSending]     = useState(false);
  const [result,      setResult]      = useState(null); // { type: 'success'|'error', message }

  /* ── Load members + invitations ───────────────────────────── */
  const load = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [memRes, invRes] = await Promise.all([
        projectsApi.getMembers(currentProject.id),
        projectsApi.getInvitations(currentProject.id),
      ]);
      if (memRes.success)  setMembers(memRes.members || []);
      if (invRes.success)  setInvitations(invRes.invitations || []);
    } catch {
      // Silently ignore — first load may fail before server restart
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Send invite ──────────────────────────────────────────── */
  const handleInvite = async (e) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await projectsApi.inviteDeveloper(currentProject.id, invEmail.trim());
      setResult({ type: 'success', message: res.message || 'Invitation sent!' });
      setInvEmail('');
      onInviteSent?.();
      await load(); // Refresh invitation list
    } catch (err) {
      setResult({
        type: 'error',
        message: err.response?.data?.message || 'Failed to send invitation.',
      });
    } finally {
      setSending(false);
    }
  };

  /* ── Revoke an invitation ─────────────────────────────────── */
  const handleRevoke = async (invId) => {
    try {
      await projectsApi.revokeInvitation(invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    } catch (err) {
      setResult({
        type: 'error',
        message: err.response?.data?.message || 'Failed to revoke invitation.',
      });
    }
  };

  if (!currentProject?.id) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Select a project to manage its team.
      </div>
    );
  }

  const pendingInvites = invitations.filter((i) => i.status === 'pending');
  const pastInvites    = invitations.filter((i) => i.status !== 'pending');

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">

      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team Management</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Invite developers, manage project members, and track invitations for{' '}
            <span className="font-semibold text-slate-700">{currentProject.name}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span><strong className="text-slate-700">{members.length}</strong> member{members.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── LEFT: Invite Panel ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Invite Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
              <div className="flex items-center gap-2 text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-bold text-sm">Invite Developer</span>
              </div>
              <p className="text-blue-100 text-[11px] mt-1">
                Enter the developer's email address to send them a project invitation.
              </p>
            </div>

            <form onSubmit={handleInvite} className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Developer Email Address
                </label>
                <input
                  type="email"
                  value={invEmail}
                  onChange={(e) => { setInvEmail(e.target.value); setResult(null); }}
                  placeholder="developer@example.com"
                  required
                  className="w-full text-xs border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder-slate-400"
                />
              </div>

              {/* Result feedback */}
              {result && (
                <div className={`text-xs px-3 py-2 rounded-xl font-medium border ${
                  result.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {result.message}
                </div>
              )}

              <button
                type="submit"
                disabled={sending || !invEmail.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-blue-500/25"
              >
                {sending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Invitation
                  </>
                )}
              </button>
            </form>

            <div className="px-5 pb-4">
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <svg className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  The developer will receive an email with a link to join this project. In development mode, the link is printed to the server console.
                </p>
              </div>
            </div>
          </div>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                Pending Invitations ({pendingInvites.length})
              </div>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{inv.email}</p>
                      <p className="text-[10px] text-slate-400">
                        Sent {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' · '}
                        Expires {new Date(inv.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      title="Revoke invitation"
                      className="shrink-0 text-slate-400 hover:text-red-600 transition cursor-pointer p-1 rounded-lg hover:bg-red-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Team Members + History ──────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Active Members */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Active Team Members</span>
              <span className="text-[10px] text-slate-400 font-semibold">{members.length} developer{members.length !== 1 ? 's' : ''}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-600 mb-1">No members yet</p>
                <p className="text-[11px] text-slate-400">Invite developers using the form on the left.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition">
                    <Avatar name={m.name} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800">{m.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{m.email}</div>
                    </div>
                    <div className="shrink-0 flex flex-wrap gap-1 justify-end max-w-[140px]">
                      {(m.skills || []).slice(0, 2).map((sk) => (
                        <span key={sk} className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
                          {sk}
                        </span>
                      ))}
                      {(m.skills || []).length > 2 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full">
                          +{m.skills.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invitation History */}
          {pastInvites.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">Invitation History</span>
              </div>
              <div className="divide-y divide-slate-100">
                {pastInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{inv.email}</p>
                      <p className="text-[10px] text-slate-400">
                        {inv.acceptedAt
                          ? `Accepted ${new Date(inv.acceptedAt).toLocaleDateString()}`
                          : `Sent ${new Date(inv.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize border ${STATUS_COLORS[inv.status] || 'bg-slate-100 text-slate-500'}`}>
                      {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamView;
