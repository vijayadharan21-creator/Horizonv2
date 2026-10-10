import React, { useState, useEffect, useMemo } from 'react';
import { projectsApi } from '../../api/index.js';

// Safe date normalization helper to avoid UTC timezone day-shifting
const parseDateToIsoDay = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const s = dateInput.split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  const d = new Date(dateInput);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
};

// Calculate the exact date a developer restarts work (day after leave ends)
const getWorkRestartDate = (toDateStr) => {
  if (!toDateStr) return null;
  const parsed = parseDateToIsoDay(toDateStr);
  if (!parsed) return null;
  const [y, m, d] = parsed.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return parseDateToIsoDay(dt);
};

// Friendly format helper (e.g. "Oct 15")
const formatShortDate = (isoStr) => {
  if (!isoStr) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return `${months[m]} ${d}`;
};

export const GanttTimelineView = ({
  tasks = [],
  currentProject,
  onUpdateTask,
  onCreateTaskClick,
  isPM = false,
}) => {
  const [selectedTask, setSelectedTask] = useState(null);
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [unavailabilities, setUnavailabilities] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [viewMode, setViewMode] = useState('project'); // 'project' (all tasks fit), 'sprint' (14d), 'month' (30d)
  const [groupMode, setGroupMode] = useState('developer'); // 'developer' (swimlanes with leave/restart dates) or 'tasks' (flat list)

  const projectId = currentProject?.id || currentProject?._id;

  // Fetch project unavailabilities and members
  useEffect(() => {
    if (!projectId) return;
    const fetchUnavailabilities = async () => {
      try {
        const res = await projectsApi.getMembers(projectId);
        if (res.success) {
          setUnavailabilities(res.unavailabilities || currentProject?.unavailabilities || []);
          setProjectMembers(res.members || []);
        }
      } catch {
        if (currentProject?.unavailabilities) {
          setUnavailabilities(currentProject.unavailabilities);
        }
      }
    };
    fetchUnavailabilities();
  }, [projectId, currentProject?.unavailabilities, tasks]);

  // ── Calculate Dynamic Timeline Range Synchronized With Calendar & Project ──
  const {
    days,
    todayIndex,
    deadlineIndex,
    projectStartDateStr,
    projectDeadlineStr,
    visibleStartStr,
    visibleEndStr,
    totalEffortHours,
  } = useMemo(() => {
    const today = new Date();
    const todayIso = parseDateToIsoDay(today);

    // Collect all dates from tasks, unavailabilities, and project
    const allDates = [todayIso];
    let totalHours = 0;

    tasks.forEach((t) => {
      totalHours += t.effortHours || 0;
      const s = parseDateToIsoDay(t.startDate);
      const d = parseDateToIsoDay(t.dueDate);
      if (s) allDates.push(s);
      if (d) allDates.push(d);
    });

    const projectDeadlineIso = parseDateToIsoDay(currentProject?.deadline);
    if (projectDeadlineIso) allDates.push(projectDeadlineIso);

    const projectCreatedIso = parseDateToIsoDay(currentProject?.createdAt);
    if (projectCreatedIso) allDates.push(projectCreatedIso);

    unavailabilities.forEach((u) => {
      const uFrom = parseDateToIsoDay(u.fromDate);
      const uTo = parseDateToIsoDay(u.toDate);
      const uRestart = getWorkRestartDate(u.toDate);
      if (uFrom) allDates.push(uFrom);
      if (uTo) allDates.push(uTo);
      if (uRestart) allDates.push(uRestart);
    });

    const validSortedDates = Array.from(new Set(allDates.filter(Boolean))).sort();

    let startDate;
    let spanDays;

    if (viewMode === 'project') {
      // Fit all project tasks & deadlines dynamically
      const earliestStr = validSortedDates[0] || todayIso;
      const latestStr = validSortedDates[validSortedDates.length - 1] || todayIso;

      const [eY, eM, eD] = earliestStr.split('-').map(Number);
      const [lY, lM, lD] = latestStr.split('-').map(Number);

      const eDate = new Date(eY, eM - 1, eD);
      const lDate = new Date(lY, lM - 1, lD);

      // Pad 2 days before earliest, and 3 days after latest
      eDate.setDate(eDate.getDate() - 2 + dayOffset);
      lDate.setDate(lDate.getDate() + 3 + dayOffset);

      const diffMs = lDate.getTime() - eDate.getTime();
      const diffDays = Math.max(14, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

      // Clamp between 14 and 45 days for optimal visibility
      spanDays = Math.min(45, Math.max(14, diffDays));
      startDate = eDate;
    } else if (viewMode === 'sprint') {
      // 14 days centered around today
      spanDays = 14;
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      startDate.setDate(startDate.getDate() - 3 + dayOffset);
    } else {
      // 30 days month view
      spanDays = 30;
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      startDate.setDate(startDate.getDate() - 5 + dayOffset);
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const computedDays = [];

    for (let i = 0; i < spanDays; i++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + i);
      const iso = parseDateToIsoDay(cur);

      computedDays.push({
        dateStr: iso,
        label: `${months[cur.getMonth()]} ${cur.getDate()}`,
        dayOfWeek: weekdays[cur.getDay()],
        dayNum: cur.getDate(),
        monthName: months[cur.getMonth()],
        isToday: iso === todayIso,
        isDeadline: Boolean(projectDeadlineIso && iso === projectDeadlineIso),
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
      });
    }

    const tIdx = computedDays.findIndex((d) => d.isToday);
    const dIdx = computedDays.findIndex((d) => d.isDeadline);

    return {
      days: computedDays,
      todayIndex: tIdx,
      deadlineIndex: dIdx,
      projectStartDateStr: projectCreatedIso || computedDays[0]?.dateStr,
      projectDeadlineStr: projectDeadlineIso || 'Not Specified',
      visibleStartStr: computedDays[0]?.label || '',
      visibleEndStr: computedDays[computedDays.length - 1]?.label || '',
      totalEffortHours: totalHours,
    };
  }, [tasks, currentProject, unavailabilities, dayOffset, viewMode]);

  // Check if a task's assignee is currently on leave / unavailable
  const checkIsAssigneeUnavailable = (task) => {
    const taskAssignee = task.assigneeName || task.assignee;
    if (!taskAssignee) return false;

    const inProjectUnavail = unavailabilities.some(
      (u) =>
        u.userName?.toLowerCase() === String(taskAssignee).toLowerCase() ||
        String(u.userId) === String(task.assignee)
    );
    if (inProjectUnavail) return true;

    const memberMatch = projectMembers.find(
      (m) =>
        m.name?.toLowerCase() === String(taskAssignee).toLowerCase() ||
        String(m.id || m._id) === String(task.assignee)
    );
    return memberMatch?.availability?.status === 'unavailable';
  };

  const getUnavailabilityInfo = (taskOrAssignee) => {
    const assigneeStr = typeof taskOrAssignee === 'string'
      ? taskOrAssignee
      : taskOrAssignee.assigneeName || taskOrAssignee.assignee;

    if (!assigneeStr) return null;

    return unavailabilities.find(
      (u) =>
        u.userName?.toLowerCase() === String(assigneeStr).toLowerCase() ||
        String(u.userId) === String(assigneeStr)
    );
  };

  // ── Calculate Precise Grid Column Positioning for a Task ─────────────────
  const getTaskGridPosition = (task) => {
    if (!days || days.length === 0) return { startCol: 1, span: 2, outOfRange: false };

    const firstDay = days[0].dateStr;
    const lastDay = days[days.length - 1].dateStr;

    let tStart = parseDateToIsoDay(task.startDate);
    let tDue = parseDateToIsoDay(task.dueDate);

    const effortDays = Math.max(1, Math.ceil((task.effortHours || 8) / 8));

    if (!tStart && tDue) {
      const [y, m, d] = tDue.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - (effortDays - 1));
      tStart = parseDateToIsoDay(dt);
    } else if (!tDue && tStart) {
      const [y, m, d] = tStart.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + (effortDays - 1));
      tDue = parseDateToIsoDay(dt);
    } else if (!tStart && !tDue) {
      const dt = new Date();
      tStart = parseDateToIsoDay(dt);
      dt.setDate(dt.getDate() + (effortDays - 1));
      tDue = parseDateToIsoDay(dt);
    }

    if (tStart > tDue) {
      const temp = tStart;
      tStart = tDue;
      tDue = temp;
    }

    const isCompletelyBefore = tDue < firstDay;
    const isCompletelyAfter = tStart > lastDay;

    if (isCompletelyBefore) {
      return {
        startCol: 1,
        span: 1,
        outOfRange: 'past',
        tStart,
        tDue,
      };
    }

    if (isCompletelyAfter) {
      return {
        startCol: days.length,
        span: 1,
        outOfRange: 'future',
        tStart,
        tDue,
      };
    }

    const clampedStart = tStart < firstDay ? firstDay : tStart;
    const clampedEnd = tDue > lastDay ? lastDay : tDue;

    const sIdx = days.findIndex((d) => d.dateStr === clampedStart);
    const eIdx = days.findIndex((d) => d.dateStr === clampedEnd);

    const startCol = sIdx !== -1 ? sIdx + 1 : 1;
    const endCol = eIdx !== -1 ? eIdx + 1 : days.length;
    const span = Math.max(1, endCol - startCol + 1);

    return {
      startCol,
      span,
      outOfRange: false,
      clippedLeft: tStart < firstDay,
      clippedRight: tDue > lastDay,
      tStart,
      tDue,
    };
  };

  // ── Calculate Position for Leave / Absence Interval ───────────────────────
  const getLeaveGridPosition = (u) => {
    if (!days || days.length === 0 || !u) return null;
    const firstDay = days[0].dateStr;
    const lastDay = days[days.length - 1].dateStr;

    const lStart = parseDateToIsoDay(u.fromDate) || firstDay;
    const lEnd = parseDateToIsoDay(u.toDate) || lStart;
    const restartDate = getWorkRestartDate(lEnd);

    if (lEnd < firstDay || lStart > lastDay) {
      return null; // Not visible in current window
    }

    const clampedStart = lStart < firstDay ? firstDay : lStart;
    const clampedEnd = lEnd > lastDay ? lastDay : lEnd;

    const sIdx = days.findIndex((d) => d.dateStr === clampedStart);
    const eIdx = days.findIndex((d) => d.dateStr === clampedEnd);

    const startCol = sIdx !== -1 ? sIdx + 1 : 1;
    const endCol = eIdx !== -1 ? eIdx + 1 : days.length;

    // Also calculate restart column if inside window
    let restartCol = -1;
    if (restartDate) {
      const rIdx = days.findIndex((d) => d.dateStr === restartDate);
      if (rIdx !== -1) restartCol = rIdx + 1;
    }

    return {
      startCol,
      span: Math.max(1, endCol - startCol + 1),
      restartCol,
      restartDate,
      lStart,
      lEnd,
    };
  };

  const getBarColor = (task, isAssigneeUnavailable) => {
    // CRITICAL: Highlight in RED if assignee is on leave / unavailable
    if (isAssigneeUnavailable) {
      return 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-sm ring-2 ring-rose-400';
    }

    switch (task.status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700';
      case 'in progress':
        return 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700';
      case 'in review':
        return 'bg-sky-600 hover:bg-sky-700 text-white border-sky-700';
      case 'blocked':
        return 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600';
      default:
        return 'bg-slate-400 hover:bg-slate-500 text-white border-slate-500';
    }
  };

  const uniqueAssignees = Array.from(
    new Set(tasks.map((t) => t.assigneeName || t.assignee).filter(Boolean))
  );

  // ── Construct Developer Swimlanes with Exact Leave, Restart, and Task Dates ──
  const developerLanes = useMemo(() => {
    const devMap = new Map();

    // 1. Initialize from project members
    projectMembers.forEach((m) => {
      const devId = String(m.id || m._id);
      devMap.set(devId, {
        id: devId,
        name: m.name || 'Team Member',
        role: m.role || 'Developer',
        subSkills: m.subSkills || m.skills || [],
        tasks: [],
        unavailability: null,
      });
    });

    // 2. Attach unavailabilities
    unavailabilities.forEach((u) => {
      let matched = null;
      for (const [id, dev] of devMap.entries()) {
        if (
          String(id) === String(u.userId) ||
          dev.name.toLowerCase() === (u.userName || '').toLowerCase()
        ) {
          matched = dev;
          break;
        }
      }
      if (matched) {
        matched.unavailability = u;
      } else if (u.userName) {
        const fallbackId = String(u.userId || u.userName);
        devMap.set(fallbackId, {
          id: fallbackId,
          name: u.userName,
          role: 'Developer',
          subSkills: [],
          tasks: [],
          unavailability: u,
        });
      }
    });

    // 3. Assign tasks to each developer lane
    tasks.forEach((t) => {
      const tAssigneeName = t.assigneeName || '';
      const tAssigneeId = String(t.assignee || '');

      let matchedDev = null;
      for (const [id, dev] of devMap.entries()) {
        if (
          (tAssigneeId && String(id) === tAssigneeId) ||
          (tAssigneeName && dev.name.toLowerCase() === tAssigneeName.toLowerCase())
        ) {
          matchedDev = dev;
          break;
        }
      }

      if (matchedDev) {
        matchedDev.tasks.push(t);
      } else {
        const fallbackId = tAssigneeName || 'Unassigned';
        if (!devMap.has(fallbackId)) {
          devMap.set(fallbackId, {
            id: fallbackId,
            name: tAssigneeName || 'Unassigned',
            role: 'Team Member',
            subSkills: [],
            tasks: [],
            unavailability: null,
          });
        }
        devMap.get(fallbackId).tasks.push(t);
      }
    });

    // Filter by assignee filter if chosen
    let result = Array.from(devMap.values());
    if (assigneeFilter !== 'All') {
      result = result.filter(
        (dev) => dev.name.toLowerCase() === assigneeFilter.toLowerCase()
      );
    }

    return result;
  }, [projectMembers, unavailabilities, tasks, assigneeFilter]);

  const filteredTasks = tasks.filter((t) => {
    const assigneeName = t.assigneeName || t.assignee;
    return assigneeFilter === 'All' || assigneeName === assigneeFilter;
  });

  return (
    <div className="p-5 sm:p-7 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Timeline & Schedule
            </h1>
            {unavailabilities.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                <span>{unavailabilities.length} Member(s) on Leave (Red Alert)</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gantt schedule synchronized with developer leave intervals, work restart dates, and exact module durations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Grouping Toggle: Developer Swimlanes vs Flat Task List */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setGroupMode('developer')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                groupMode === 'developer'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>👥</span>
              <span>By Developer</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('tasks')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                groupMode === 'tasks'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>📋</span>
              <span>All Tasks</span>
            </button>
          </div>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="All">All Assignees ({tasks.length} tasks)</option>
            {uniqueAssignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── DEVELOPER LEAVE & RESTART WORK TRACKER BANNER ──────────────────── */}
      {unavailabilities.length > 0 && (
        <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-slate-900 text-white rounded-2xl p-4 shadow-sm border border-rose-700/60 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-rose-700/40">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌴</span>
              <h3 className="font-bold text-sm text-white">
                Developer Leave & Work Restart Schedule
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/40">
              Deterministic Recovery Available in Uncertainty Center
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unavailabilities.map((u, idx) => {
              const restartDate = getWorkRestartDate(u.toDate);
              return (
                <div
                  key={idx}
                  className="bg-black/30 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-white text-sm font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                      <span>{u.userName}</span>
                    </strong>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500 text-white">
                      {u.reason || 'Leave'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-rose-950/60 p-2 rounded-lg border border-rose-500/30">
                      <span className="text-rose-300 block text-[9px] uppercase font-bold">Leave Window</span>
                      <strong className="text-white font-mono text-xs block">
                        {formatShortDate(u.fromDate)} ➔ {formatShortDate(u.toDate)}
                      </strong>
                    </div>

                    <div className="bg-emerald-950/70 p-2 rounded-lg border border-emerald-500/30">
                      <span className="text-emerald-300 block text-[9px] uppercase font-bold flex items-center gap-1">
                        <span>🔄</span>
                        <span>Restarts Work</span>
                      </span>
                      <strong className="text-emerald-200 font-mono text-xs block">
                        {restartDate ? formatShortDate(restartDate) : 'Next Day'}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── PROJECT SYNCHRONIZATION & DATE CONTROLS BANNER ─────────────────── */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Project Name
            </span>
            <strong className="text-white text-sm font-bold truncate max-w-xs block">
              {currentProject?.name || 'TaskForge Project'}
            </strong>
          </div>

          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Today's Date
            </span>
            <strong className="text-blue-300 font-mono flex items-center gap-1">
              <span>📅</span>
              <span>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </strong>
          </div>

          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Project Milestone Deadline
            </span>
            <strong
              className={`font-mono flex items-center gap-1.5 ${
                projectDeadlineStr !== 'Not Specified' ? 'text-amber-300' : 'text-slate-400 italic'
              }`}
            >
              <span>🎯</span>
              <span>{projectDeadlineStr}</span>
            </strong>
          </div>

          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Visible Timeline
            </span>
            <span className="text-slate-200 font-mono text-[11px]">
              {visibleStartStr} ➔ {visibleEndStr} ({days.length} Days)
            </span>
          </div>

          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Total Workload
            </span>
            <span className="text-emerald-300 font-mono text-[11px] font-bold">
              {totalEffortHours}h ({tasks.length} Modules)
            </span>
          </div>
        </div>

        {/* View Mode & Time Panning Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('project');
                setDayOffset(0);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'project' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Project Fit
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('sprint');
                setDayOffset(0);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'sprint' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              2-Wk Sprint
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('month');
                setDayOffset(0);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'month' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Month (30d)
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDayOffset((prev) => prev - 7)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Previous Week"
            >
              ◀ -7d
            </button>
            <button
              type="button"
              onClick={() => setDayOffset(0)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Reset to Current Date"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDayOffset((prev) => prev + 7)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Next Week"
            >
              +7d ▶
            </button>
          </div>
        </div>
      </div>

      {/* ─── UNIFIED GANTT CHART (STICKY TASK COLUMN + SYNCHRONIZED CALENDAR GRID) ─── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50/70 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-500 font-semibold">Status Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span className="text-slate-600 font-medium">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span className="text-slate-600 font-medium">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              <span className="text-slate-600 font-medium">To Do / Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-300 animate-pulse"></span>
              <span className="text-rose-700 font-bold">On Leave / Conflict</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>
              <span className="text-emerald-700 font-bold">Work Restarts Date</span>
            </div>
            {deadlineIndex !== -1 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-600"></span>
                <span className="text-red-700 font-bold">Milestone Deadline</span>
              </div>
            )}
          </div>

          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <span>💡 Click any task bar to inspect start/end dates, dependencies, and absence impacts</span>
          </div>
        </div>

        {/* Unified Scroll Container */}
        <div className="overflow-x-auto">
          <div className="min-w-max flex flex-col divide-y divide-slate-100">
            {/* Header Row */}
            <div className="flex bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 select-none">
              {/* Sticky Task Header */}
              <div className="w-96 min-w-[24rem] sticky left-0 z-30 bg-slate-50 border-r border-slate-200 px-4 py-3 flex items-center justify-between shadow-2xs">
                <span>{groupMode === 'developer' ? 'Developer & Assigned Modules' : 'Task & Assignee'}</span>
                <span className="text-[10px] text-slate-400 font-mono">START ➔ END DATES</span>
              </div>

              {/* Day Headers Grid */}
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
              >
                {days.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`py-2 px-1 text-center border-r border-slate-100 transition ${
                      day.isToday
                        ? 'bg-blue-50/90 text-blue-800 font-bold border-r-blue-200'
                        : day.isDeadline
                        ? 'bg-amber-50/90 text-amber-900 font-bold border-r-amber-200'
                        : day.isWeekend
                        ? 'bg-slate-100/50 text-slate-400'
                        : 'text-slate-600'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">
                      {day.dayOfWeek}
                    </span>
                    <span className="text-xs font-semibold">{day.dayNum}</span>

                    {day.isToday && (
                      <span className="block text-[8px] uppercase tracking-wider text-blue-600 font-extrabold mt-0.5">
                        Today
                      </span>
                    )}
                    {day.isDeadline && (
                      <span className="block text-[8px] uppercase tracking-wider text-red-600 font-extrabold mt-0.5">
                        Target
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ─── MODE A: GROUP BY DEVELOPER (SWIMLANES WITH LEAVE & RESTART DATES) ─── */}
            {groupMode === 'developer' ? (
              developerLanes.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No developers found in this project.
                </div>
              ) : (
                developerLanes.map((dev) => {
                  const unavail = dev.unavailability;
                  const leavePos = getLeaveGridPosition(unavail);
                  const restartDate = unavail ? getWorkRestartDate(unavail.toDate) : null;
                  const devTotalHours = dev.tasks.reduce((sum, t) => sum + (t.effortHours || 0), 0);

                  return (
                    <div key={dev.id} className="divide-y divide-slate-100/70">
                      {/* Developer Lane Header Row */}
                      <div className="flex items-center bg-slate-100/80 border-y border-slate-200 py-2.5">
                        {/* Sticky Developer Info Header */}
                        <div className="w-96 min-w-[24rem] sticky left-0 z-25 bg-slate-100/95 border-r border-slate-200 px-4 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs">
                              {dev.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong className="text-slate-900 text-xs font-bold block">
                                {dev.name}
                              </strong>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {dev.role} • {dev.tasks.length} task(s) • {devTotalHours}h
                              </span>
                            </div>
                          </div>

                          {unavail ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              ON LEAVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              AVAILABLE
                            </span>
                          )}
                        </div>

                        {/* Developer Status Description across grid */}
                        <div className="px-4 text-xs">
                          {unavail ? (
                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                              <span className="font-bold text-rose-800 flex items-center gap-1">
                                <span>🚨 Leaves On:</span>
                                <span className="font-mono bg-rose-200/80 px-1.5 py-0.5 rounded text-rose-900 font-bold">
                                  {unavail.fromDate}
                                </span>
                                <span>➔ Returns:</span>
                                <span className="font-mono bg-rose-200/80 px-1.5 py-0.5 rounded text-rose-900 font-bold">
                                  {unavail.toDate}
                                </span>
                              </span>

                              <span className="font-bold text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-300">
                                <span>🔄 Restarts Work On:</span>
                                <span className="font-mono text-emerald-950 font-extrabold underline">
                                  {restartDate || 'Day After'}
                                </span>
                              </span>

                              <span className="text-slate-500 italic text-[10px]">
                                ({unavail.reason || 'Leave'})
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              <span>✓</span>
                              <span>Active full capacity across sprint</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Developer's Leave Interval Bar (if absent) */}
                      {unavail && leavePos && (
                        <div className="flex items-center text-xs py-1.5 bg-rose-50/50">
                          <div className="w-96 min-w-[24rem] sticky left-0 z-20 bg-rose-50/95 border-r border-rose-200 px-4 py-1 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 text-rose-900 font-bold">
                              <span>🚫</span>
                              <span>Absence Interval:</span>
                              <span className="font-mono text-[10px] text-rose-700">
                                {unavail.fromDate} ➔ {unavail.toDate}
                              </span>
                            </div>
                            <div className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300">
                              Restart: {restartDate}
                            </div>
                          </div>

                          <div
                            className="grid px-1 relative items-center"
                            style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
                          >
                            <div
                              className="h-6 rounded-lg px-2 flex items-center justify-between text-[10px] font-bold bg-rose-600 text-white shadow-2xs"
                              style={{
                                gridColumnStart: leavePos.startCol,
                                gridColumnEnd: `span ${leavePos.span}`,
                              }}
                            >
                              <span className="truncate">🚫 Out of Office ({unavail.reason || 'Leave'})</span>
                              <span className="text-[9px] font-mono shrink-0 ml-1.5 opacity-90">
                                {leavePos.lStart} ➔ {leavePos.lEnd}
                              </span>
                            </div>

                            {/* Restart Day Marker on Calendar Grid */}
                            {leavePos.restartCol !== -1 && (
                              <div
                                style={{ gridColumnStart: leavePos.restartCol, gridColumnEnd: leavePos.restartCol + 1 }}
                                className="h-6 rounded-lg px-1 flex items-center justify-center text-[9px] font-extrabold bg-emerald-600 text-white shadow-2xs animate-pulse"
                                title={`Developer ${dev.name} restarts work on ${restartDate}`}
                              >
                                <span>🔄 Resume</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Developer's Assigned Tasks */}
                      {dev.tasks.length === 0 ? (
                        <div className="flex items-center py-2.5 text-xs text-slate-400">
                          <div className="w-96 min-w-[24rem] sticky left-0 z-20 bg-white border-r border-slate-100 px-4 py-1 text-[11px] italic">
                            No tasks currently scheduled for {dev.name}.
                          </div>
                        </div>
                      ) : (
                        dev.tasks.map((task, tIdx) => {
                          const pos = getTaskGridPosition(task);
                          const isUnavailable = Boolean(unavail);
                          const barColor = getBarColor(task, isUnavailable);

                          // Check if task directly overlaps leave window
                          const isDirectLeaveOverlap =
                            unavail &&
                            pos.tStart &&
                            pos.tDue &&
                            pos.tStart <= unavail.toDate &&
                            pos.tDue >= unavail.fromDate;

                          return (
                            <div
                              key={task.id || task._id || tIdx}
                              className={`flex items-center hover:bg-slate-50/80 transition group text-xs min-h-[58px] ${
                                isDirectLeaveOverlap ? 'bg-rose-50/30' : ''
                              }`}
                            >
                              {/* Sticky Task Metadata Column (Showing explicit Start & Due Dates) */}
                              <div
                                className={`w-96 min-w-[24rem] sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-100 px-4 py-2 min-w-0 transition shadow-2xs ${
                                  isDirectLeaveOverlap ? 'bg-rose-50/40' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0">
                                      {task.taskId || task.id}
                                    </span>
                                    <span
                                      className="font-semibold text-slate-800 truncate"
                                      title={task.title}
                                    >
                                      {task.title}
                                    </span>
                                  </div>

                                  <span className="text-[10px] font-semibold text-slate-400 font-mono shrink-0">
                                    {task.effortHours}h
                                  </span>
                                </div>

                                {/* Explicit START DATE and END DATE Chips */}
                                <div className="flex items-center flex-wrap gap-2 text-[10px] mt-1.5">
                                  <div className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                                    <span className="text-emerald-700 font-bold">START:</span>
                                    <strong>{pos.tStart}</strong>
                                  </div>

                                  <div className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                                    <span className="text-blue-700 font-bold">END:</span>
                                    <strong>{pos.tDue}</strong>
                                  </div>

                                  {isDirectLeaveOverlap && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white animate-pulse">
                                      ⚠️ OVERLAPS LEAVE!
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Timeline Grid Cell with In-Grid Vertical Lines & Task Bar */}
                              <div
                                className="grid relative items-center py-2 px-1 h-full"
                                style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
                              >
                                {/* In-Grid Today Column Marker */}
                                {todayIndex !== -1 && (
                                  <div
                                    className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-dashed border-blue-400/80"
                                    style={{
                                      left: `${todayIndex * 48 + 24}px`,
                                    }}
                                  ></div>
                                )}

                                {/* In-Grid Milestone Deadline Marker */}
                                {deadlineIndex !== -1 && (
                                  <div
                                    className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-red-500 shadow-xs"
                                    style={{
                                      left: `${deadlineIndex * 48 + 24}px`,
                                    }}
                                  ></div>
                                )}

                                {/* Out of Range Notice (if past or future) */}
                                {pos.outOfRange === 'past' ? (
                                  <div
                                    style={{ gridColumnStart: 1, gridColumnEnd: 3 }}
                                    onClick={() => setSelectedTask(task)}
                                    className="h-7 rounded-lg px-2 flex items-center gap-1 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
                                  >
                                    <span>◀</span>
                                    <span className="truncate">Finished ({pos.tDue})</span>
                                  </div>
                                ) : pos.outOfRange === 'future' ? (
                                  <div
                                    style={{ gridColumnStart: Math.max(1, days.length - 2), gridColumnEnd: days.length + 1 }}
                                    onClick={() => setSelectedTask(task)}
                                    className="h-7 rounded-lg px-2 flex items-center justify-end gap-1 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
                                  >
                                    <span className="truncate">Starts {pos.tStart}</span>
                                    <span>▶</span>
                                  </div>
                                ) : (
                                  /* Standard Gantt Bar with explicit Start and End dates */
                                  <div
                                    onClick={() => setSelectedTask(task)}
                                    className={`h-8 rounded-xl px-2.5 flex items-center justify-between text-xs font-medium cursor-pointer shadow-2xs transition transform hover:scale-[1.01] ${barColor}`}
                                    style={{
                                      gridColumnStart: pos.startCol,
                                      gridColumnEnd: `span ${pos.span}`,
                                    }}
                                  >
                                    <div className="truncate font-semibold text-[11px] flex items-center gap-1.5">
                                      {pos.clippedLeft && <span className="text-[10px] opacity-80">◀</span>}
                                      {isDirectLeaveOverlap && <span>⚠️</span>}
                                      <span className="truncate">{task.title}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                      <span className="text-[9px] font-mono opacity-90 hidden sm:inline bg-black/20 px-1.5 py-0.5 rounded">
                                        {formatShortDate(pos.tStart)} ➔ {formatShortDate(pos.tDue)}
                                      </span>
                                      <span className="text-[10px] opacity-90 font-bold bg-black/20 px-1.5 py-0.5 rounded">
                                        {isDirectLeaveOverlap ? 'CONFLICT' : `${task.progress || 0}%`}
                                      </span>
                                      {pos.clippedRight && <span className="text-[10px] opacity-80">▶</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })
              )
            ) : (
              /* ─── MODE B: FLAT TASK LIST ─── */
              filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No tasks match the selected filter.
                </div>
              ) : (
                filteredTasks.map((task, idx) => {
                  const pos = getTaskGridPosition(task);
                  const isUnavailable = checkIsAssigneeUnavailable(task);
                  const barColor = getBarColor(task, isUnavailable);
                  const assigneeName = task.assigneeName || task.assignee || 'Unassigned';
                  const unavail = getUnavailabilityInfo(task);
                  const restartDate = unavail ? getWorkRestartDate(unavail.toDate) : null;

                  return (
                    <div
                      key={task.id || task._id || idx}
                      className={`flex items-center hover:bg-slate-50/80 transition group text-xs min-h-[58px] ${
                        isUnavailable ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Sticky Task Metadata Column */}
                      <div
                        className={`w-96 min-w-[24rem] sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-100 px-4 py-2 min-w-0 transition shadow-2xs ${
                          isUnavailable ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0">
                              {task.taskId || task.id}
                            </span>
                            <span
                              className="font-semibold text-slate-800 truncate"
                              title={task.title}
                            >
                              {task.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{task.effortHours}h</span>
                        </div>

                        <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-500 mt-1">
                          <span className={isUnavailable ? 'font-bold text-rose-700' : 'text-slate-700'}>
                            👤 {assigneeName}
                          </span>
                          <span>•</span>
                          <span className="bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                            <strong className="text-emerald-700">Start:</strong> {pos.tStart}
                          </span>
                          <span className="bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                            <strong className="text-blue-700">End:</strong> {pos.tDue}
                          </span>
                          {isUnavailable && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              ON LEAVE (Restarts {restartDate})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timeline Grid Cell */}
                      <div
                        className="grid relative items-center py-2 px-1 h-full"
                        style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
                      >
                        {todayIndex !== -1 && (
                          <div
                            className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-dashed border-blue-400/80"
                            style={{ left: `${todayIndex * 48 + 24}px` }}
                          ></div>
                        )}
                        {deadlineIndex !== -1 && (
                          <div
                            className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-red-500 shadow-xs"
                            style={{ left: `${deadlineIndex * 48 + 24}px` }}
                          ></div>
                        )}

                        <div
                          onClick={() => setSelectedTask(task)}
                          className={`h-8 rounded-xl px-2.5 flex items-center justify-between text-xs font-medium cursor-pointer shadow-2xs transition transform hover:scale-[1.01] ${barColor}`}
                          style={{
                            gridColumnStart: pos.startCol,
                            gridColumnEnd: `span ${pos.span}`,
                          }}
                        >
                          <div className="truncate font-semibold text-[11px] flex items-center gap-1.5">
                            {isUnavailable && <span>⚠️</span>}
                            <span className="truncate">{task.title}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="text-[9px] font-mono opacity-80 hidden sm:inline">
                              {formatShortDate(pos.tStart)} ➔ {formatShortDate(pos.tDue)}
                            </span>
                            <span className="text-[10px] opacity-90 font-bold bg-black/20 px-1.5 py-0.5 rounded">
                              {isUnavailable ? 'LEAVE' : `${task.progress || 0}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      </div>

      {/* Task Details Drawer when a bar is clicked */}
      {selectedTask && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-700 text-sm">
                {selectedTask.taskId || selectedTask.id}
              </span>
              <h4 className="text-sm font-bold text-slate-900">{selectedTask.title}</h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* If Assignee is on leave, show prominent red callout */}
          {checkIsAssigneeUnavailable(selectedTask) && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold block text-sm mb-0.5">
                  🚨 Assigned developer ({selectedTask.assigneeName || selectedTask.assignee}) is currently ON LEAVE!
                </span>
                <span className="text-xs text-rose-800">
                  Leave Interval:{' '}
                  <strong>
                    {getUnavailabilityInfo(selectedTask)?.fromDate} ➔ {getUnavailabilityInfo(selectedTask)?.toDate}
                  </strong>{' '}
                  ({getUnavailabilityInfo(selectedTask)?.reason || 'Absence'}).
                  <br />
                  <strong className="text-emerald-900 font-bold">
                    🔄 Scheduled Work Restart Date:{' '}
                    {getWorkRestartDate(getUnavailabilityInfo(selectedTask)?.toDate)}
                  </strong>
                </span>
              </div>
              <span className="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-[10px] shrink-0">
                Red Alert
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs mb-4">
            <div>
              <span className="text-slate-500 block mb-0.5">Assignee:</span>
              <strong className={checkIsAssigneeUnavailable(selectedTask) ? 'text-rose-700' : 'text-slate-800'}>
                {selectedTask.assigneeName || selectedTask.assignee || 'Unassigned'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Start Date:</span>
              <strong className="text-emerald-700 font-mono font-bold">
                {parseDateToIsoDay(selectedTask.startDate) || 'Auto-Scheduled'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">End / Due Date:</span>
              <strong className="text-blue-700 font-mono font-bold">
                {parseDateToIsoDay(selectedTask.dueDate) || 'Not set'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Effort:</span>
              <strong className="text-slate-800">{selectedTask.effortHours} Hours</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Predecessors:</span>
              <strong className="text-slate-800 font-mono">
                {selectedTask.dependency ? `Task ${selectedTask.dependency}` : 'None'}
              </strong>
            </div>
          </div>

          {selectedTask.description && (
            <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Description: </span>
              {selectedTask.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GanttTimelineView;
