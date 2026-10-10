import React, { useState, useEffect, useCallback } from 'react';
import { aiApi, projectsApi } from '../../api/index.js';

export const OverviewView = ({
  tasks = [],
  currentProject,
  onCreateTaskClick,
  onNavigateToTab,
  isPM = false,
}) => {
  const [sprintInsights, setSprintInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!currentProject?.id) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await aiApi.getSprintInsights(currentProject.id);
      if (res.success) {
        setSprintInsights({
          ...res.data,
          meta: res.meta,
        });
      }
    } catch (err) {
      console.warn('[OverviewView] Failed to load sprint insights:', err.message);
      setInsightsError(err.response?.data?.message || err.message || 'AI service temporarily unavailable.');
    } finally {
      setInsightsLoading(false);
    }
  }, [currentProject?.id]);

  const fetchMembers = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoadingMembers(true);
    try {
      const res = await projectsApi.getMembers(currentProject.id);
      if (res.success) {
        const list = res.members || [];
        if (res.manager && !list.some((m) => m.id === res.manager.id || m.email === res.manager.email)) {
          list.unshift({ ...res.manager, role: 'Project Manager' });
        }
        setMembers(list);
      }
    } catch (err) {
      console.warn('[OverviewView] Failed to load members:', err.message);
    } finally {
      setLoadingMembers(false);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    fetchInsights();
    fetchMembers();
  }, [fetchInsights, fetchMembers]);

  const totalTasks = tasks.length;
  const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
  const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
  const pendingTasks = tasks.filter((t) => t.status === 'Pending' || t.status === 'To Do').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Dynamic Team Capacity calculated from real database tasks and members
  const dynamicTeam = (() => {
    if (members.length > 0) {
      return members.map((m) => {
        const memberTasks = tasks.filter(
          (t) =>
            (t.assigneeId && t.assigneeId === m.id) ||
            (t.assignee && (t.assignee.toLowerCase() === m.name?.toLowerCase() || t.assignee.toLowerCase() === m.email?.toLowerCase()))
        );
        const activeTasks = memberTasks.filter((t) => t.status !== 'Completed');
        const activeHours = activeTasks.reduce((sum, t) => sum + (Number(t.effortHours) || 8), 0);
        // Base utilization on standard 40h work week
        const workloadPct = Math.min(100, Math.max(0, Math.round((activeHours / 40) * 100)));
        return {
          id: m.id,
          name: m.name,
          role: m.role || (m.skills?.length ? m.skills.slice(0, 2).join(', ') : 'Developer'),
          initial: m.name ? m.name.charAt(0).toUpperCase() : 'U',
          taskCount: memberTasks.length,
          activeCount: activeTasks.length,
          workloadPct: workloadPct > 0 ? workloadPct : memberTasks.length > 0 ? 30 : 0,
        };
      });
    }

    // Fallback: derive dynamically from distinct task assignees
    const distinctAssignees = Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean)));
    if (distinctAssignees.length > 0) {
      return distinctAssignees.map((name, idx) => {
        const memberTasks = tasks.filter((t) => t.assignee === name);
        const activeTasks = memberTasks.filter((t) => t.status !== 'Completed');
        const activeHours = activeTasks.reduce((sum, t) => sum + (Number(t.effortHours) || 8), 0);
        const workloadPct = Math.min(100, Math.max(0, Math.round((activeHours / 40) * 100)));
        return {
          id: `assignee-${idx}`,
          name,
          role: 'Team Member',
          initial: name.charAt(0).toUpperCase(),
          taskCount: memberTasks.length,
          activeCount: activeTasks.length,
          workloadPct: workloadPct > 0 ? workloadPct : 35,
        };
      });
    }

    return [];
  })();

  // Dynamic 7-day timeline window centered on today
  const timelineDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 3 + i);
    return {
      date: d,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: i === 3,
    };
  });

  // Dynamic recent activities generated from tasks
  const dynamicActivities = tasks.slice(0, 4).map((t) => {
    const isCompleted = t.status === 'Completed';
    const isInProgress = t.status === 'In Progress';
    return {
      id: t.id,
      title: isCompleted
        ? `${t.taskId || t.id} marked as Completed`
        : isInProgress
        ? `${t.taskId || t.id} status in progress`
        : `Task scheduled: ${t.taskId || t.id}`,
      description: isCompleted
        ? `${t.assignee || 'Developer'} completed ${t.title}`
        : isInProgress
        ? `${t.title} is currently active (${t.assignee || 'Assigned'})`
        : `${t.title} (${t.priority} priority, assigned to ${t.assignee || 'Unassigned'})`,
      dotColor: isCompleted ? 'bg-emerald-500' : isInProgress ? 'bg-blue-500' : 'bg-amber-500',
      time: t.lastUpdated || 'Recently',
    };
  });

  const priorityBadge = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'high':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'medium':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'low':
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const statusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'in progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'pending':
      case 'to do':
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Project Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track progress, team workload, and upcoming deadlines at a glance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Current Date Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-600">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'long' })}</span>
          </div>

          {/* PM quick action: Invite Developer */}
          {isPM && (
            <button
              type="button"
              onClick={() => onNavigateToTab?.('team')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-violet-500/25 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Developer
            </button>
          )}
        </div>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Total Tasks</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{totalTasks}</span>
              <span className="text-[11px] font-semibold text-blue-600 flex items-center">
                {completionRate}% completed
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Across current workflow</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">In Progress</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{inProgressTasks}</span>
              <span className="text-[11px] font-semibold text-sky-600 flex items-center">
                {totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0}% active
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Currently being executed</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Completed</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{completedTasks}</span>
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                {completedTasks}/{totalTasks} done
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Preserved completed work</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Pending</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{pendingTasks}</span>
              <span className="text-[11px] font-semibold text-slate-500 flex items-center">
                {totalTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) : 0}% queued
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Awaiting action</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Middle Row: Task Allocation Table & Team Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Allocation (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </span>
                  <span>Task Allocation</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Current task distribution and progress
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab(isPM ? 'main-table' : 'task-allocation')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <span>→</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Task ID</th>
                    <th className="py-2.5 px-3">Task Name</th>
                    <th className="py-2.5 px-3">Assignee</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.slice(0, 5).map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-mono font-medium text-slate-500">
                        {task.id}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {task.title}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {task.assignee?.slice(0, 1) || 'A'}
                          </div>
                          <span className="font-medium text-slate-700">{task.assignee}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityBadge(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 w-32">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${task.progress || 0}%` }}
                            ></div>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 w-8 text-right">
                            {task.progress || 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Team Capacity & AI Insights */}
        <div className="space-y-6">
          {/* Team Capacity */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </span>
                  <span>Team Capacity</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Team workload utilization</p>
              </div>
              <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full border border-blue-100">
                {dynamicTeam.length} {dynamicTeam.length === 1 ? 'Member' : 'Members'}
              </span>
            </div>

            {loadingMembers ? (
              <div className="space-y-3 py-2 animate-pulse">
                <div className="h-8 bg-slate-100 rounded-xl"></div>
                <div className="h-8 bg-slate-100 rounded-xl"></div>
                <div className="h-8 bg-slate-100 rounded-xl"></div>
              </div>
            ) : dynamicTeam.length === 0 ? (
              <div className="text-center py-5 space-y-2">
                <p className="text-xs text-slate-500">No members or assignees recorded yet.</p>
                {isPM && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab?.('team')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    + Invite developer to project
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {dynamicTeam.slice(0, 4).map((member, idx) => {
                  const avatarColors = [
                    'bg-blue-100 text-blue-700',
                    'bg-sky-100 text-sky-700',
                    'bg-indigo-100 text-indigo-700',
                    'bg-emerald-100 text-emerald-700',
                  ];
                  const barColors = ['bg-blue-600', 'bg-sky-500', 'bg-indigo-600', 'bg-emerald-500'];
                  const avColor = avatarColors[idx % avatarColors.length];
                  const barColor = barColors[idx % barColors.length];

                  return (
                    <div key={member.id || idx}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${avColor} font-bold text-[10px] flex items-center justify-center`}>
                            {member.initial}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{member.name}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{member.role}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-800 text-xs">{member.workloadPct}%</span>
                          <span className="text-[10px] text-slate-400 block font-normal">{member.activeCount} active</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-300`}
                          style={{ width: `${Math.min(100, member.workloadPct)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Insights Card (Royal Blue) */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4.5 shadow-md shadow-blue-500/20 relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-100">
                    <span>✨</span>
                    <span>AI Insights</span>
                    {sprintInsights?.meta?.provider && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-white/15 text-blue-100 border border-white/20">
                        {sprintInsights.meta.provider}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={fetchInsights}
                    disabled={insightsLoading}
                    className="text-blue-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                    title="Refresh AI Insights"
                  >
                    <svg
                      className={`w-3.5 h-3.5 ${insightsLoading ? 'animate-spin' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                {insightsLoading ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-4 bg-white/20 rounded w-3/4"></div>
                    <div className="h-3 bg-white/15 rounded w-full"></div>
                    <div className="h-3 bg-white/15 rounded w-5/6"></div>
                  </div>
                ) : insightsError ? (
                  <div className="text-xs text-blue-100 space-y-1.5 py-1">
                    <p className="opacity-90">{insightsError}</p>
                    <button
                      type="button"
                      onClick={fetchInsights}
                      className="text-[11px] underline font-semibold text-white hover:text-blue-200"
                    >
                      Retry analysis
                    </button>
                  </div>
                ) : sprintInsights ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white leading-snug">
                      {sprintInsights.summary}
                    </h4>

                    {sprintInsights.insights && sprintInsights.insights.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        {sprintInsights.insights.slice(0, 2).map((ins, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] text-blue-100/95 bg-white/10 rounded-xl p-2 border border-white/10 space-y-0.5"
                          >
                            <div className="font-semibold text-white flex items-center justify-between">
                              <span>{ins.title}</span>
                              <span className="text-[9px] uppercase px-1 rounded bg-white/20 font-bold">
                                {ins.severity}
                              </span>
                            </div>
                            <p className="line-clamp-2 leading-relaxed opacity-90">{ins.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4 className="text-sm font-bold text-white">Workflow is on track!</h4>
                    <p className="text-xs text-blue-100 leading-relaxed">
                      No critical bottlenecks detected. All team members operating within scheduled capacity limits.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigateToTab('timeline')}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition cursor-pointer shrink-0 mt-1"
                title="View Gantt Timeline"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Project Timeline & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Timeline (Gantt chart preview) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
                <span>Project Timeline</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Task schedule and dependencies
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('timeline')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
            >
              <span>Full Gantt</span>
              <span>→</span>
            </button>
          </div>

          {/* Mini Gantt Grid */}
          <div className="overflow-x-auto">
            {/* Days header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 border-b border-slate-100 pb-2 mb-3">
              {timelineDays.map((day, dIdx) => (
                <div
                  key={dIdx}
                  className={day.isToday ? 'text-blue-600 font-bold bg-blue-50 py-0.5 rounded' : ''}
                >
                  {day.label} {day.isToday && '(Today)'}
                </div>
              ))}
            </div>

            {/* Task rows */}
            {tasks.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No tasks scheduled for timeline yet.
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                {tasks.slice(0, 5).map((t, idx) => {
                  const colors = [
                    'bg-blue-600 text-white',
                    'bg-sky-500 text-white',
                    'bg-indigo-600 text-white',
                    'bg-blue-500 text-white',
                    'bg-emerald-500 text-white',
                  ];
                  const offsets = [
                    'col-start-1 col-span-3',
                    'col-start-2 col-span-3',
                    'col-start-3 col-span-2',
                    'col-start-4 col-span-2',
                    'col-start-4 col-span-3',
                  ];

                  return (
                    <div key={t.id} className="grid grid-cols-7 gap-1 items-center">
                      <div className="col-span-2 text-xs font-medium text-slate-700 truncate pr-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span className="truncate">{t.title}</span>
                      </div>
                      <div className="col-span-5 grid grid-cols-5 gap-1">
                        <div
                          className={`${offsets[idx % offsets.length]} ${
                            colors[idx % colors.length]
                          } rounded-lg px-2 py-1 text-[11px] font-medium truncate shadow-xs flex items-center justify-between`}
                        >
                          <span className="truncate">{t.taskId || t.id}</span>
                          <span className="text-[10px] opacity-90">{t.effortHours || 5}h</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <span>Recent Activities</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab?.(isPM ? 'main-table' : 'task-allocation')}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          <div className="space-y-3.5 text-xs">
            {dynamicActivities.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No recent activity recorded yet.
              </div>
            ) : (
              dynamicActivities.map((act) => (
                <div key={act.id} className="flex items-start gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${act.dotColor} mt-1 shrink-0`}></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{act.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{act.description}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{act.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;
