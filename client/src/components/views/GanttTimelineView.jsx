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
  const [groupMode, setGroupMode] = useState('developer'); // 'developer' (swimlanes) or 'tasks' (flat list)

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

  // Lookup map for fast dependency cross-referencing
  const taskMap = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (t.taskId) map.set(t.taskId, t);
      if (t.id) map.set(t.id, t);
      if (t._id) map.set(String(t._id), t);
    });
    return map;
  }, [tasks]);

  // ── Calculate Dynamic Timeline Range Synchronized With Calendar & Project ──
  const {
    days,
    todayIndex,
    deadlineIndex,
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

    return unavailabilities.some(
      (u) =>
        u.userName?.toLowerCase() === String(taskAssignee).toLowerCase() ||
        String(u.userId) === String(task.assignee)
    );
  };

  const getUnavailabilityInfo = (taskOrAssignee) => {
    const assigneeStr = typeof taskOrAssignee === 'string'
      ? taskOrAssignee
      : taskOrAssignee?.assigneeName || taskOrAssignee?.assignee;

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
      return { startCol: 1, span: 1, outOfRange: 'past', tStart, tDue, durationDays: effortDays };
    }

    if (isCompletelyAfter) {
      return { startCol: days.length, span: 1, outOfRange: 'future', tStart, tDue, durationDays: effortDays };
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
      durationDays: effortDays,
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
      return null;
    }

    const clampedStart = lStart < firstDay ? firstDay : lStart;
    const clampedEnd = lEnd > lastDay ? lastDay : lEnd;

    const sIdx = days.findIndex((d) => d.dateStr === clampedStart);
    const eIdx = days.findIndex((d) => d.dateStr === clampedEnd);

    const startCol = sIdx !== -1 ? sIdx + 1 : 1;
    const endCol = eIdx !== -1 ? eIdx + 1 : days.length;

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

  const getBarColor = (task, isAssigneeUnavailable, isOverlappingLeave) => {
    if (isOverlappingLeave || isAssigneeUnavailable) {
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

    // Initialize from project members
    projectMembers.forEach((m) => {
      const devId = String(m.id || m._id);
      devMap.set(devId, {
        id: devId,
        name: m.name || 'Team Member',
        role: m.role || 'Developer',
        tasks: [],
        unavailability: null,
      });
    });

    // Attach unavailabilities
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
          tasks: [],
          unavailability: u,
        });
      }
    });

    // Assign tasks to each developer lane
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
            tasks: [],
            unavailability: null,
          });
        }
        devMap.get(fallbackId).tasks.push(t);
      }
    });

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
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* ─── SLEEK UNIFIED TOOLBAR (REPLACES CLUTTERED DOUBLE BANNERS) ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        {/* Left: Project identity & Milestone */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                {currentProject?.name || 'Project'} Timeline
              </h1>
              <span className="text-[11px] text-slate-500 font-medium">
                {tasks.length} tasks • {totalEffortHours}h total
              </span>
            </div>
          </div>

          {/* Project Deadline Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <span>🎯 Deadline:</span>
            <span className="font-mono text-amber-950 font-bold">{projectDeadlineStr}</span>
          </div>

          {/* Absent Member Alert Badge */}
          {unavailabilities.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
              <span>
                {unavailabilities.length} Member on Leave (Restarts {getWorkRestartDate(unavailabilities[0]?.toDate)})
              </span>
            </div>
          )}
        </div>

        {/* Center: Range presets & Week navigation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => {
                setViewMode('project');
                setDayOffset(0);
              }}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'project' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Fit Project
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('sprint');
                setDayOffset(0);
              }}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'sprint' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'hover:text-slate-900'
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
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'month' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Month (30d)
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDayOffset((prev) => prev - 7)}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200 transition cursor-pointer"
              title="Previous Week"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => setDayOffset(0)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDayOffset((prev) => prev + 7)}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200 transition cursor-pointer"
              title="Next Week"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Right: View mode toggle & Assignee filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setGroupMode('developer')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                groupMode === 'developer' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>👥</span>
              <span>By Developer</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('tasks')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                groupMode === 'tasks' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>📋</span>
              <span>All Tasks</span>
            </button>
          </div>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="All">All Assignees</option>
            {uniqueAssignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── GANTT TIMELINE CONTAINER ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Subtle Legend Bar */}
        <div className="flex flex-wrap items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50/70 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span className="text-slate-600 font-medium">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span className="text-slate-600 font-medium">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span className="text-slate-600 font-medium">To Do</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600 ring-2 ring-rose-300"></span>
              <span className="text-rose-700 font-bold">Leave Conflict</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-emerald-600"></span>
              <span className="text-emerald-700 font-bold">Work Resumes</span>
            </div>
          </div>

          <span className="text-slate-400 text-[11px]">
            Scope: <strong className="text-slate-700 font-mono">{visibleStartStr} ➔ {visibleEndStr}</strong>
          </span>
        </div>

        {/* Scrollable Timeline Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-max flex flex-col divide-y divide-slate-100">
            {/* Header Row */}
            <div className="flex bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 select-none">
              {/* Sticky Column Header (compact w-80) */}
              <div className="w-80 min-w-[20rem] sticky left-0 z-30 bg-slate-50 border-r border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-2xs">
                <span>{groupMode === 'developer' ? 'Developer / Task' : 'Task & Assignee'}</span>
                <span className="text-[10px] text-slate-400 font-mono">EFFORT</span>
              </div>

              {/* Day Columns Header */}
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

            {/* ─── GROUP BY DEVELOPER (SWIMLANES) ─── */}
            {groupMode === 'developer' ? (
              developerLanes.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">No developers in project.</div>
              ) : (
                developerLanes.map((dev) => {
                  const unavail = dev.unavailability;
                  const leavePos = getLeaveGridPosition(unavail);
                  const restartDate = unavail ? getWorkRestartDate(unavail.toDate) : null;
                  const devTotalHours = dev.tasks.reduce((sum, t) => sum + (t.effortHours || 0), 0);

                  return (
                    <div key={dev.id} className="divide-y divide-slate-100/60">
                      {/* Swimlane Header Row */}
                      <div className="flex items-center bg-slate-50/80 border-y border-slate-200/80 py-2">
                        {/* Sticky Developer Info */}
                        <div className="w-80 min-w-[20rem] sticky left-0 z-25 bg-slate-50/95 border-r border-slate-200 px-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shadow-2xs">
                              {dev.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <strong className="text-slate-800 text-xs font-bold block truncate">
                                {dev.name}
                              </strong>
                              <span className="text-[10px] text-slate-400">
                                {dev.role} • {dev.tasks.length} task(s)
                              </span>
                            </div>
                          </div>

                          {unavail ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              ON LEAVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Swimlane Status Tag */}
                        <div className="px-4 text-xs">
                          {unavail ? (
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-rose-700 font-semibold">
                                🌴 Leave: <strong>{formatShortDate(unavail.fromDate)} ➔ {formatShortDate(unavail.toDate)}</strong>
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                🔄 Restarts: {formatShortDate(restartDate)}
                              </span>
                              <span className="text-slate-400 italic text-[10px]">({unavail.reason || 'Leave'})</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Full sprint capacity ({devTotalHours}h total)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Developer Leave Band on Calendar */}
                      {unavail && leavePos && (
                        <div className="flex items-center text-xs py-1 bg-rose-50/40">
                          <div className="w-80 min-w-[20rem] sticky left-0 z-20 bg-rose-50/95 border-r border-rose-200 px-4 py-0.5 flex items-center justify-between text-[11px]">
                            <span className="text-rose-800 font-semibold text-[10px]">
                              🚫 Absence Interval
                            </span>
                            <span className="text-emerald-700 font-bold text-[10px] bg-white px-1.5 py-0.2 rounded border border-emerald-200">
                              Resumes {formatShortDate(restartDate)}
                            </span>
                          </div>

                          <div
                            className="grid px-1 relative items-center"
                            style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
                          >
                            <div
                              className="h-5 rounded-md px-2 flex items-center justify-between text-[9px] font-bold bg-rose-600 text-white shadow-2xs"
                              style={{
                                gridColumnStart: leavePos.startCol,
                                gridColumnEnd: `span ${leavePos.span}`,
                              }}
                            >
                              <span className="truncate">🚫 Out of Office</span>
                              <span className="opacity-90">{formatShortDate(leavePos.lStart)} – {formatShortDate(leavePos.lEnd)}</span>
                            </div>

                            {leavePos.restartCol !== -1 && (
                              <div
                                style={{ gridColumnStart: leavePos.restartCol, gridColumnEnd: leavePos.restartCol + 1 }}
                                className="h-5 rounded-md px-1 flex items-center justify-center text-[9px] font-bold bg-emerald-600 text-white shadow-2xs"
                                title={`Work restarts on ${restartDate}`}
                              >
                                <span>🟢 Resume</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Developer Tasks */}
                      {dev.tasks.length === 0 ? (
                        <div className="flex items-center py-2 text-xs text-slate-400">
                          <div className="w-80 min-w-[20rem] sticky left-0 z-20 bg-white border-r border-slate-100 px-4 py-1 text-[11px] italic">
                            No tasks scheduled.
                          </div>
                        </div>
                      ) : (
                        dev.tasks.map((task, tIdx) => {
                          const pos = getTaskGridPosition(task);
                          const isDirectLeaveOverlap =
                            unavail &&
                            pos.tStart &&
                            pos.tDue &&
                            pos.tStart <= unavail.toDate &&
                            pos.tDue >= unavail.fromDate;

                          const barColor = getBarColor(task, Boolean(unavail), isDirectLeaveOverlap);

                          // Check dependency status
                          const parentTask = task.dependency ? taskMap.get(task.dependency) : null;
                          const isDependencyDelayed =
                            parentTask &&
                            parentTask.dueDate &&
                            pos.tStart &&
                            parseDateToIsoDay(parentTask.dueDate) > pos.tStart;

                          return (
                            <div
                              key={task.id || task._id || tIdx}
                              className={`flex items-center hover:bg-slate-50/70 transition group text-xs min-h-[48px] ${
                                isDirectLeaveOverlap ? 'bg-rose-50/20' : ''
                              }`}
                            >
                              {/* Sticky Task Metadata Column (Clean, Compact, No Clutter) */}
                              <div
                                className={`w-80 min-w-[20rem] sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-100 px-4 py-1.5 min-w-0 transition shadow-2xs ${
                                  isDirectLeaveOverlap ? 'bg-rose-50/30' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
                                      {task.taskId || task.id}
                                    </span>
                                    <span
                                      className="font-semibold text-slate-800 truncate"
                                      title={task.title}
                                    >
                                      {task.title}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                    {task.effortHours}h
                                  </span>
                                </div>

                                {/* Clean subline: Duration + Dependency link */}
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                  <span>{pos.durationDays}d span</span>
                                  {task.dependency && (
                                    <>
                                      <span>•</span>
                                      <span
                                        className={`font-medium ${
                                          isDependencyDelayed ? 'text-rose-600 font-bold' : 'text-blue-600'
                                        }`}
                                        title={
                                          isDependencyDelayed
                                            ? `Predecessor finishes after this task starts!`
                                            : `Depends on ${task.dependency}`
                                        }
                                      >
                                        ↳ Waits for {task.dependency}
                                      </span>
                                    </>
                                  )}
                                  {isDirectLeaveOverlap && (
                                    <span className="text-rose-700 font-bold ml-auto">
                                      ⚠️ Overlaps Leave
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Calendar Grid Cell with In-Grid Vertical Marker Lines & Task Bar */}
                              <div
                                className="grid relative items-center py-1.5 px-1 h-full"
                                style={{ gridTemplateColumns: `repeat(${days.length}, 48px)` }}
                              >
                                {/* In-Grid Today Column Marker */}
                                {todayIndex !== -1 && (
                                  <div
                                    className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-dashed border-blue-400/80"
                                    style={{ left: `${todayIndex * 48 + 24}px` }}
                                  ></div>
                                )}

                                {/* In-Grid Milestone Deadline Marker */}
                                {deadlineIndex !== -1 && (
                                  <div
                                    className="absolute inset-y-0 pointer-events-none z-10 border-r-2 border-red-500 shadow-xs"
                                    style={{ left: `${deadlineIndex * 48 + 24}px` }}
                                  ></div>
                                )}

                                {/* Task Bar */}
                                {pos.outOfRange === 'past' ? (
                                  <div
                                    style={{ gridColumnStart: 1, gridColumnEnd: 3 }}
                                    onClick={() => setSelectedTask(task)}
                                    className="h-7 rounded-lg px-2 flex items-center gap-1 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
                                  >
                                    <span>◀ Finished ({formatShortDate(pos.tDue)})</span>
                                  </div>
                                ) : pos.outOfRange === 'future' ? (
                                  <div
                                    style={{ gridColumnStart: Math.max(1, days.length - 2), gridColumnEnd: days.length + 1 }}
                                    onClick={() => setSelectedTask(task)}
                                    className="h-7 rounded-lg px-2 flex items-center justify-end gap-1 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
                                  >
                                    <span>Starts {formatShortDate(pos.tStart)} ▶</span>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => setSelectedTask(task)}
                                    className={`h-7 rounded-lg px-2 flex items-center justify-between text-xs font-medium cursor-pointer shadow-2xs transition transform hover:scale-[1.01] ${barColor}`}
                                    style={{
                                      gridColumnStart: pos.startCol,
                                      gridColumnEnd: `span ${pos.span}`,
                                    }}
                                  >
                                    <div className="truncate font-semibold text-[11px] flex items-center gap-1">
                                      {pos.clippedLeft && <span className="opacity-80 text-[9px]">◀</span>}
                                      {isDirectLeaveOverlap && <span>⚠️</span>}
                                      <span className="truncate">{task.title}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                                      <span className="text-[9px] font-mono opacity-85 hidden sm:inline">
                                        {formatShortDate(pos.tStart)}–{formatShortDate(pos.tDue)}
                                      </span>
                                      <span className="text-[9px] opacity-90 font-bold bg-black/20 px-1 py-0.2 rounded">
                                        {task.progress || 0}%
                                      </span>
                                      {pos.clippedRight && <span className="opacity-80 text-[9px]">▶</span>}
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
              /* ─── ALL TASKS LIST (FLAT VIEW) ─── */
              filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">No tasks match filter.</div>
              ) : (
                filteredTasks.map((task, idx) => {
                  const pos = getTaskGridPosition(task);
                  const isUnavailable = checkIsAssigneeUnavailable(task);
                  const barColor = getBarColor(task, isUnavailable, false);
                  const assigneeName = task.assigneeName || task.assignee || 'Unassigned';

                  return (
                    <div
                      key={task.id || task._id || idx}
                      className={`flex items-center hover:bg-slate-50/70 transition group text-xs min-h-[48px] ${
                        isUnavailable ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Sticky Task Metadata Column */}
                      <div className="w-80 min-w-[20rem] sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-100 px-4 py-1.5 min-w-0 transition shadow-2xs">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
                              {task.taskId || task.id}
                            </span>
                            <span className="font-semibold text-slate-800 truncate" title={task.title}>
                              {task.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{task.effortHours}h</span>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span className={isUnavailable ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                            {assigneeName}
                          </span>
                          <span>•</span>
                          <span>{pos.durationDays}d span</span>
                          {task.dependency && (
                            <>
                              <span>•</span>
                              <span className="text-blue-600">↳ Waits for {task.dependency}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Timeline Grid Cell */}
                      <div
                        className="grid relative items-center py-1.5 px-1 h-full"
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
                          className={`h-7 rounded-lg px-2 flex items-center justify-between text-xs font-medium cursor-pointer shadow-2xs transition transform hover:scale-[1.01] ${barColor}`}
                          style={{
                            gridColumnStart: pos.startCol,
                            gridColumnEnd: `span ${pos.span}`,
                          }}
                        >
                          <div className="truncate font-semibold text-[11px] flex items-center gap-1">
                            {isUnavailable && <span>⚠️</span>}
                            <span className="truncate">{task.title}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                            <span className="text-[9px] font-mono opacity-85 hidden sm:inline">
                              {formatShortDate(pos.tStart)}–{formatShortDate(pos.tDue)}
                            </span>
                            <span className="text-[9px] opacity-90 font-bold bg-black/20 px-1 py-0.2 rounded">
                              {task.progress || 0}%
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

      {/* ─── TASK DETAILS DRAWER (CLEAR & INTERACTIVE) ─── */}
      {selectedTask && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-indigo-700 text-sm">
                {selectedTask.taskId || selectedTask.id}
              </span>
              <h4 className="text-sm font-bold text-slate-900">{selectedTask.title}</h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Leave Conflict Warning */}
          {checkIsAssigneeUnavailable(selectedTask) && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
              <div>
                <strong className="block">
                  🚨 Assigned developer ({selectedTask.assigneeName || selectedTask.assignee}) is on leave!
                </strong>
                <span className="text-[11px] text-rose-700">
                  Leave: {getUnavailabilityInfo(selectedTask)?.fromDate} ➔ {getUnavailabilityInfo(selectedTask)?.toDate}.{' '}
                  <strong className="text-emerald-900">
                    Restarts work on {getWorkRestartDate(getUnavailabilityInfo(selectedTask)?.toDate)}.
                  </strong>
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                Disrupted
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Assignee</span>
              <strong className="text-slate-800">{selectedTask.assigneeName || selectedTask.assignee || 'Unassigned'}</strong>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Start Date</span>
              <strong className="text-emerald-700 font-mono font-bold">
                {parseDateToIsoDay(selectedTask.startDate) || 'Auto-Scheduled'}
              </strong>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Due Date</span>
              <strong className="text-blue-700 font-mono font-bold">
                {parseDateToIsoDay(selectedTask.dueDate) || 'Not Set'}
              </strong>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Effort</span>
              <strong className="text-slate-800">{selectedTask.effortHours || 8}h</strong>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Dependency</span>
              <strong className="text-slate-800 font-mono">
                {selectedTask.dependency ? `Waits for ${selectedTask.dependency}` : 'None'}
              </strong>
            </div>
          </div>

          {selectedTask.description && (
            <div className="text-xs text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <strong className="text-slate-700 block mb-0.5">Description:</strong>
              {selectedTask.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GanttTimelineView;
