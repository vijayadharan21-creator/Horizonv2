import React, { useState, useEffect, useCallback } from 'react';
import ProjectSelector from './ProjectSelector';
import { invitationsApi } from '../api/index.js';

export const TopNav = ({
  searchQuery,
  onSearchChange,
  onCreateTaskClick,
  user,
  currentProject,
  projects,
  onSelectProject,
  onAddProject,
  isPM = false,
  tasks = [],
  onProjectJoined,
  onNavigateToProfile,
  onOpenSrsModal,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [dismissedTaskNotifs, setDismissedTaskNotifs] = useState(new Set());

  // Fetch pending invitations for logged-in developer
  const loadInvitations = useCallback(async () => {
    if (isPM) return;
    try {
      setLoadingInvites(true);
      const res = await invitationsApi.getMy();
      if (res.success) {
        setInvitations(res.invitations || []);
      }
    } catch {
      // Silently ignore if offline
    } finally {
      setLoadingInvites(false);
    }
  }, [isPM]);

  useEffect(() => {
    loadInvitations();
    // Poll every 30 seconds for new invitations
    const interval = setInterval(loadInvitations, 30000);
    return () => clearInterval(interval);
  }, [loadInvitations]);

  // Handle Accept Invitation
  const handleAcceptInvite = async (invId) => {
    setActionLoadingId(invId);
    setActionMessage(null);
    try {
      const res = await invitationsApi.accept(invId);
      if (res.success) {
        setActionMessage(res.message || 'Joined project successfully!');
        setInvitations((prev) => prev.filter((i) => i.id !== invId));
        if (onProjectJoined) {
          await onProjectJoined();
        }
      }
    } catch (err) {
      setActionMessage(err.response?.data?.message || 'Failed to accept invitation.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Decline Invitation
  const handleDeclineInvite = async (invId) => {
    setActionLoadingId(invId);
    setActionMessage(null);
    try {
      const res = await invitationsApi.decline(invId);
      if (res.success) {
        setInvitations((prev) => prev.filter((i) => i.id !== invId));
      }
    } catch (err) {
      setActionMessage(err.response?.data?.message || 'Failed to decline invitation.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Generate dynamic task-based notifications from database tasks
  const dynamicTaskNotifications = tasks
    .slice(0, 4)
    .filter((t) => !dismissedTaskNotifs.has(t.id))
    .map((t) => ({
      id: t.id,
      title: `${t.taskId || t.id}: ${t.title}`,
      subtitle: `Status: ${t.status} • Assignee: ${t.assignee}`,
      time: t.lastUpdated || 'Recently',
      isTask: true,
    }));

  const totalUnreadCount = invitations.length + dynamicTaskNotifications.length;

  const handleMarkAllRead = () => {
    setDismissedTaskNotifs(new Set(tasks.map((t) => t.id)));
  };

  return (
    <header className="h-16 min-h-[64px] max-h-[64px] shrink-0 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-30 shadow-xs">
      {/* Left side: Project Selector in Header */}
      <div className="flex items-center gap-4 flex-1 max-w-2xl h-9">
        <div className="shrink-0">
          <ProjectSelector
            currentProject={currentProject}
            projects={projects}
            onSelectProject={onSelectProject}
            onAddProject={onAddProject}
            isPM={isPM}
            onOpenSrsModal={onOpenSrsModal}
          />
        </div>

        {/* Global Search Input */}
        <div className="flex-1 max-w-sm hidden sm:block">
          <div className="relative">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tasks, members, or projects..."
              className="w-full h-9 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl pl-9 pr-3.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 h-9">
        {/* Dynamic Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) loadInvitations();
            }}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50/70 transition cursor-pointer shrink-0"
            title="Notifications"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {totalUnreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {totalUnreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-88 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3.5 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Notifications</span>
                  {invitations.length > 0 && (
                    <span className="text-[10px] bg-violet-50 text-violet-700 font-bold px-1.5 py-0.2 rounded border border-violet-200">
                      {invitations.length} Invites
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  Clear task alerts
                </button>
              </div>

              {actionMessage && (
                <div className="mb-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  {actionMessage}
                </div>
              )}

              <div className="space-y-2">
                {/* 1. Pending In-App Project Invitations */}
                {invitations.length > 0 && (
                  <div className="space-y-2">
                    {invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 rounded-xl bg-violet-50/70 border border-violet-200 text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                              Project Invitation
                            </span>
                            <div className="font-bold text-slate-900 mt-0.5">
                              {inv.project?.name || 'Project'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Invited by {inv.invitedBy?.name} ({inv.invitedBy?.email})
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                          <button
                            type="button"
                            disabled={actionLoadingId === inv.id}
                            onClick={() => handleAcceptInvite(inv.id)}
                            className="flex-1 py-1 px-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer text-center"
                          >
                            {actionLoadingId === inv.id ? 'Joining...' : 'Accept & Join'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === inv.id}
                            onClick={() => handleDeclineInvite(inv.id)}
                            className="py-1 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium transition cursor-pointer text-center"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Dynamic Task Notifications from Database */}
                {dynamicTaskNotifications.length > 0 && (
                  <div className="space-y-1.5">
                    {dynamicTaskNotifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-0.5"
                      >
                        <div className="font-semibold text-slate-800">{n.title}</div>
                        <div className="text-[11px] text-slate-500">{n.subtitle}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{n.time}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {invitations.length === 0 && dynamicTaskNotifications.length === 0 && (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No new notifications or invitations.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Project from SRS Button — ONLY for Project Manager */}
        {isPM && (
          <button
            type="button"
            onClick={onOpenSrsModal}
            className="h-9 flex items-center gap-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer shrink-0"
            title="Form team, upload SRS document, and generate project with AI task allocation"
          >
            <span>✨</span>
            <span className="hidden sm:inline">+ Create Project</span>
          </button>
        )}

        {/* Create Task Button — ONLY for Project Manager */}
        {isPM && (
          <button
            type="button"
            onClick={onCreateTaskClick}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer shrink-0"
          >
            <span className="text-base leading-none">+</span>
            <span>Create Task</span>
          </button>
        )}

        {/* User Avatar — click to go to Profile */}
        <button
          type="button"
          title="My Profile"
          onClick={() => onNavigateToProfile && onNavigateToProfile()}
          className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs ring-2 ring-blue-100 hover:ring-blue-400 transition cursor-pointer shrink-0"
        >
          {user?.name ? user.name.slice(0, 2).toUpperCase() : 'TF'}
        </button>
      </div>
    </header>
  );
};

export default TopNav;
