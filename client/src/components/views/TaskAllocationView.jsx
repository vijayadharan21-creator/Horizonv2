import React, { useMemo, useState, useEffect } from 'react';
import { aiApi, projectsApi } from '../../api/index.js';

/* ─────────────────────────────────────────────────────────
   Shared helpers
───────────────────────────────────────────────────────── */
const PRIORITY_COLORS = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

const STATUS_COLORS = {
  Completed: 'bg-emerald-100 text-emerald-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Pending: 'bg-amber-100 text-amber-700',
  'In Review': 'bg-purple-100 text-purple-700',
};

const AVATAR_COLORS = [
  'bg-violet-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
];

/* ─────────────────────────────────────────────────────────
   Mini Gantt bar (used inside Developer "My Tasks" view)
───────────────────────────────────────────────────────── */
function MiniGantt({ tasks }) {
  const now = new Date();
  const allDates = tasks.flatMap((t) => {
    const due = t.dueDate ? new Date(t.dueDate) : new Date();
    const start = new Date(due);
    start.setDate(start.getDate() - (t.effortHours || 4));
    return [start, due];
  });

  const minDate = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : now;
  const maxDate = allDates.length
    ? new Date(Math.max(...allDates.map((d) => d.getTime())))
    : new Date(now.getTime() + 14 * 86400000);

  const totalMs = maxDate.getTime() - minDate.getTime() || 1;

  const toPercent = (date) => {
    const ms = date.getTime() - minDate.getTime();
    return Math.min(100, Math.max(0, (ms / totalMs) * 100));
  };

  const labels = [];
  const cursor = new Date(minDate);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= maxDate) {
    labels.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 3);
  }

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs overflow-x-auto">
      <div className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Sprint Schedule Overview</span>
      </div>

      <div className="min-w-[500px]">
        {/* Timeline Header */}
        <div className="flex border-b border-slate-100 pb-2 mb-3 text-[10px] text-slate-400 font-semibold">
          {labels.map((d, i) => (
            <div key={i} className="flex-1 text-center">
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          ))}
        </div>

        {/* Task Bars */}
        <div className="space-y-2.5">
          {tasks.map((t) => {
            const due = t.dueDate ? new Date(t.dueDate) : new Date(now.getTime() + 3 * 86400000);
            const start = new Date(due);
            start.setDate(start.getDate() - (t.effortHours || 4));

            const left = toPercent(start);
            const right = toPercent(due);
            const width = Math.max(right - left, 5);

            const isDone = t.status === 'Completed';
            const isOverdue = !isDone && due < now;

            return (
              <div key={t.id} className="flex items-center text-xs">
                <div className="w-32 truncate font-semibold text-slate-700 pr-2 shrink-0">
                  {t.taskId || t.id}
                </div>
                <div className="flex-1 relative h-6 bg-slate-50 rounded-lg overflow-hidden">
                  <div
                    className={`absolute top-1 bottom-1 rounded-md text-[10px] font-bold text-white flex items-center px-2 truncate transition-all ${
                      isDone
                        ? 'bg-emerald-500'
                        : isOverdue
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                  >
                    {width > 15 ? t.status : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-[10px] font-semibold text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-blue-500 inline-block"></span>Active</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-emerald-500 inline-block"></span>Done</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-red-500 inline-block"></span>Overdue</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Developer View — only their own tasks + timeline
───────────────────────────────────────────────────────── */
function DeveloperMyTasksView({ tasks }) {
  const myTasks = tasks;

  const stats = useMemo(() => ({
    total: myTasks.length,
    completed: myTasks.filter((t) => t.status === 'Completed').length,
    inProgress: myTasks.filter((t) => t.status === 'In Progress').length,
    pending: myTasks.filter((t) => t.status === 'Pending').length,
  }), [myTasks]);

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            My Tasks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Your assigned sprint tasks and personal schedule for this sprint.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-slate-50 border-slate-200' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        ].map((s) => (
          <div key={s.label} className={`border rounded-2xl p-4 flex flex-col items-center ${s.bg}`}>
            <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Task List */}
      {myTasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl bg-white">
          <div className="text-4xl mb-3">🎉</div>
          No tasks assigned to you yet.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider grid grid-cols-12 gap-2">
            <span className="col-span-1">ID</span>
            <span className="col-span-4">Task</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-2">Priority</span>
            <span className="col-span-2">Due Date</span>
            <span className="col-span-1">Effort</span>
          </div>
          {myTasks.map((t, i) => (
            <div
              key={t.id}
              className={`px-5 py-3.5 grid grid-cols-12 gap-2 items-center text-xs transition hover:bg-slate-50/70 ${
                i < myTasks.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <span className="col-span-1 font-mono text-slate-500 font-semibold">{t.taskId || t.id}</span>
              <div className="col-span-4 min-w-0">
                <div className="font-semibold text-slate-800 truncate">{t.title}</div>
                {t.dependency && (
                  <div className="text-[10px] text-slate-400">Depends on: {t.dependency}</div>
                )}
              </div>
              <span className="col-span-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>
                  {t.status}
                </span>
              </span>
              <span className="col-span-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority] || 'bg-slate-100 text-slate-600'}`}>
                  {t.priority}
                </span>
              </span>
              <span className="col-span-2 text-slate-600 font-medium">{t.dueDate || '—'}</span>
              <span className="col-span-1 text-slate-500">{t.effortHours}h</span>
            </div>
          ))}
        </div>
      )}

      {/* Mini Gantt */}
      {myTasks.length > 0 && <MiniGantt tasks={myTasks} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PM View — full team allocation board with AI Recommendations
───────────────────────────────────────────────────────── */
function PMAllocationView({
  tasks,
  currentProject,
  onUpdateTask,
  onCreateTaskClick,
  onInviteClick,
}) {
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [assignTaskId, setAssignTaskId] = useState('');

  // AI Assignment recommendation state
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [recError, setRecError] = useState(null);

  // Load real team members from API
  useEffect(() => {
    let isMounted = true;
    const loadMembers = async () => {
      if (!currentProject?.id) return;
      try {
        const res = await projectsApi.getMembers(currentProject.id);
        if (res.success && isMounted) {
          const membersList = (res.members || []).map((m, idx) => ({
            id: m.id || m._id,
            name: m.name,
            role: m.role === 'project_manager' ? 'Project Lead' : 'Software Engineer',
            skills: m.skills || ['JavaScript', 'React'],
            subSkills: m.subSkills || [],
            color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
            capacity: 8,
            availability: m.availability,
            isUnavailable: m.availability?.status === 'unavailable',
          }));
          setTeamMembers(membersList);
        }
      } catch {
        // Fallback
      }
    };

    loadMembers();
    setRecommendations(null);
    return () => {
      isMounted = false;
    };
  }, [currentProject?.id]);

  // Compute live workload for each member based on real assigned tasks
  const teamWithTasks = teamMembers.map((m) => {
    const assigned = tasks.filter(
      (t) =>
        t.assigneeId === m.id ||
        (t.assignee && t.assignee.toLowerCase() === m.name.toLowerCase())
    );
    const activeAssigned = assigned.filter((t) => t.status !== 'Completed');
    const totalHours = activeAssigned.reduce(
      (sum, t) => sum + (Number(t.effortHours) || 0),
      0
    );
    const workload = Math.min(100, Math.round((totalHours / 40) * 100));

    return {
      ...m,
      assignedTasks: assigned,
      workload,
      totalHours,
    };
  });

  const unassigned = tasks.filter((t) => {
    if (!t.assignee || t.assignee === 'Unassigned') return true;
    return !teamMembers.some(
      (m) =>
        m.name.toLowerCase() === t.assignee.toLowerCase() ||
        m.id === t.assigneeId
    );
  });

  const handleManualAssign = () => {
    if (!selectedMember || !assignTaskId) return;
    const memberObj = teamMembers.find((m) => m.name === selectedMember || m.id === selectedMember);
    onUpdateTask(assignTaskId, {
      assignee: memberObj?.id || selectedMember,
      assigneeName: memberObj?.name || selectedMember,
    });
    setAssignTaskId('');
    setSelectedMember('');
  };

  // Feature 2: Call AI Assignment recommendation endpoint
  const handleAiRecommend = async () => {
    if (unassigned.length === 0 || !currentProject?.id) return;
    setIsRecommending(true);
    setRecError(null);
    setRecommendations(null);

    const targetIds = unassigned.slice(0, 5).map((t) => t.id);

    try {
      const res = await aiApi.recommendAssignments(currentProject.id, targetIds);
      if (res.success && res.data) {
        setRecommendations(res.data.recommendations);
      }
    } catch (err) {
      setRecError(
        err.response?.data?.message || err.message || 'Failed to fetch AI assignment recommendations.'
      );
    } finally {
      setIsRecommending(false);
    }
  };

  const handleApplyAiRecommendation = (rec) => {
    const matchedTask = tasks.find((t) => t.id === rec.taskId || t.taskId === rec.taskId);
    if (!matchedTask) return;

    onUpdateTask(matchedTask.id, {
      assignee: rec.developerId,
      assigneeName: rec.displayName,
    });

    // Remove applied recommendation from list
    setRecommendations((prev) => prev.filter((r) => r.taskId !== rec.taskId));
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Task Allocation
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage team workload, assign tasks, and utilize intelligent allocation.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onInviteClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-violet-500/25 transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Invite Member</span>
          </button>
          <button
            type="button"
            onClick={onCreateTaskClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Quick Assign & AI Recommendation Panel */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Unassigned Tasks ({unassigned.length})
              </div>
              <p className="text-xs text-amber-900 mt-0.5">
                Assign manually or request AI recommendations grounded in developer skills and capacity.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAiRecommend}
              disabled={isRecommending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              {isRecommending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Matching Skills & Workload...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>AI Recommend Assignments</span>
                </>
              )}
            </button>
          </div>

          {/* Manual Quick Assign Row */}
          <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-amber-200/60">
            <div>
              <label className="block text-[10px] font-semibold text-amber-800 mb-1">
                Select Task
              </label>
              <select
                value={assignTaskId}
                onChange={(e) => setAssignTaskId(e.target.value)}
                className="text-xs border border-amber-300 bg-white rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select unassigned task...</option>
                {unassigned.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.taskId || t.id}: {t.title} ({t.effortHours}h)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-amber-800 mb-1">
                Assign To
              </label>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="text-xs border border-amber-300 bg-white rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select team member...</option>
                {teamWithTasks.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name} — {m.workload}% workload ({m.totalHours}h)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleManualAssign}
              disabled={!selectedMember || !assignTaskId}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Assign →
            </button>
          </div>

          {/* Recommendation Error */}
          {recError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {recError}
            </div>
          )}

          {/* AI Recommendations Cards List */}
          {recommendations && recommendations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-amber-200 space-y-2 animate-in fade-in">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>AI Recommendations ({recommendations.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  Review reasons and confirm to apply
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendations.map((rec) => {
                  const taskObj = tasks.find(
                    (t) => t.id === rec.taskId || t.taskId === rec.taskId
                  );

                  return (
                    <div
                      key={rec.taskId}
                      className="p-3 bg-white rounded-xl border border-blue-200 shadow-xs text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono text-blue-600 font-bold text-[11px]">
                            {taskObj?.taskId || 'Task'}
                          </span>
                          <h4 className="font-semibold text-slate-900 line-clamp-1">
                            {taskObj?.title || 'Unassigned Task'}
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {rec.suggestedAllocation}h
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Recommended Developer:</span>
                          <span className="font-bold text-slate-900">{rec.displayName}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Current Workload:</span>
                          <span className="font-semibold text-slate-700">{rec.currentWorkload}% ({rec.availableCapacity}h avail)</span>
                        </div>
                        <p className="text-[10px] text-slate-600 pt-0.5 italic">
                          {rec.skillMatchExplanation}
                        </p>
                      </div>

                      {rec.schedulingRisks?.length > 0 && (
                        <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded">
                          ⚠️ {rec.schedulingRisks[0]}
                        </div>
                      )}

                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleApplyAiRecommendation(rec)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                        >
                          Confirm Assignment →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teamWithTasks.map((member) => {
          const capacityBar = Math.min(member.workload, 100);
          const barColor =
            member.workload > 85
              ? 'bg-red-400'
              : member.workload > 60
              ? 'bg-amber-400'
              : 'bg-emerald-500';

          return (
            <div
              key={member.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col gap-4"
            >
              {/* Member Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl ${member.color} text-white font-bold flex items-center justify-center text-sm shadow-xs`}
                  >
                    {member.name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{member.name}</h3>
                      {member.isUnavailable && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          Unavailable
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{member.role}</div>
                    {member.isUnavailable && member.availability?.from && (
                      <div className="text-[10px] text-rose-600 font-mono mt-0.5">
                        Off: {member.availability.from.split('T')[0]} ➔ {member.availability.to?.split('T')[0]}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-800">{member.workload}%</span>
                  <div className="text-[10px] text-slate-400">Capacity Used</div>
                </div>
              </div>

              {/* Capacity Bar */}
              <div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${capacityBar}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{member.totalHours}h assigned</span>
                  <span>40h / week</span>
                </div>
              </div>

              {/* Skills & Sub-Skills */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Core Skills & Sub-Skills
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {member.skills.map((sk) => (
                    <span
                      key={sk}
                      className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md"
                    >
                      ● {sk}
                    </span>
                  ))}
                  {(member.subSkills || []).map((sub) => (
                    <span
                      key={sub}
                      className="text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              {/* Assigned Tasks */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Assigned Tasks ({member.assignedTasks.length})
                </div>
                {member.assignedTasks.length > 0 ? (
                  <div className="space-y-2">
                    {member.assignedTasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-800 truncate">
                            {t.taskId || t.id}: {t.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Effort: {t.effortHours}h • Due: {t.dueDate || 'N/A'} •{' '}
                            <span
                              className={`font-semibold ${
                                PRIORITY_COLORS[t.priority]?.split(' ')[1]
                              }`}
                            >
                              {t.priority}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-3 text-center border border-dashed border-slate-200 rounded-xl">
                    No active tasks assigned
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Total Active Effort: {member.totalHours}h</span>
                <span
                  className={
                    member.workload < 70
                      ? 'text-emerald-600 font-semibold'
                      : 'text-amber-600 font-semibold'
                  }
                >
                  {member.workload}% utilized
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Main Export: Route based on role
───────────────────────────────────────────────────────── */
export const TaskAllocationView = ({
  tasks,
  currentProject,
  onUpdateTask,
  onCreateTaskClick,
  onInviteClick,
  isPM = false,
  currentUserName = '',
}) => {
  if (isPM) {
    return (
      <PMAllocationView
        tasks={tasks}
        currentProject={currentProject}
        onUpdateTask={onUpdateTask}
        onCreateTaskClick={onCreateTaskClick}
        onInviteClick={onInviteClick}
      />
    );
  }

  return (
    <DeveloperMyTasksView
      tasks={tasks}
      currentUserName={currentUserName}
    />
  );
};

export default TaskAllocationView;
