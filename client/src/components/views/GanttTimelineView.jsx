import React, { useState, useEffect, useMemo } from 'react';
import { projectsApi } from '../../api/index.js';

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
  const [viewMode, setViewMode] = useState('sprint'); // 'sprint' (14 days), 'project' (21 days), 'month' (28 days)

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
  } = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    // Collect all dates from tasks, unavailabilities, and project
    const allDates = [];
    tasks.forEach((t) => {
      if (t.startDate) allDates.push(t.startDate);
      if (t.dueDate) allDates.push(t.dueDate);
    });
    if (currentProject?.deadline) allDates.push(currentProject.deadline);
    if (currentProject?.createdAt) {
      allDates.push(new Date(currentProject.createdAt).toISOString().split('T')[0]);
    }
    unavailabilities.forEach((u) => {
      if (u.fromDate) allDates.push(u.fromDate);
      if (u.toDate) allDates.push(u.toDate);
    });

    // Determine window size
    const spanDays = viewMode === 'month' ? 28 : viewMode === 'project' ? 21 : 14;

    // Start 2 days before today by default + user navigation offset
    let baseDate = new Date(today);
    baseDate.setDate(baseDate.getDate() - 2 + dayOffset);

    // In 'project' mode, align to earliest known date if available
    if (viewMode === 'project' && allDates.length > 0) {
      allDates.sort();
      const earliest = new Date(allDates[0]);
      if (!isNaN(earliest.getTime())) {
        baseDate = new Date(earliest);
        baseDate.setDate(baseDate.getDate() - 1 + dayOffset);
      }
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const computedDays = [];

    for (let i = 0; i < spanDays; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().split('T')[0];

      computedDays.push({
        dateStr: iso,
        label: `${months[d.getMonth()]} ${d.getDate()}`,
        dayOfWeek: weekdays[d.getDay()],
        dayNum: d.getDate(),
        isToday: iso === todayIso,
        isDeadline: Boolean(currentProject?.deadline && iso === currentProject.deadline),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    const tIdx = computedDays.findIndex((d) => d.isToday);
    const dIdx = computedDays.findIndex((d) => d.isDeadline);

    return {
      days: computedDays,
      todayIndex: tIdx,
      deadlineIndex: dIdx,
      projectStartDateStr: currentProject?.createdAt
        ? new Date(currentProject.createdAt).toISOString().split('T')[0]
        : computedDays[0]?.dateStr,
      projectDeadlineStr: currentProject?.deadline || 'Not Specified',
      visibleStartStr: computedDays[0]?.label || '',
      visibleEndStr: computedDays[computedDays.length - 1]?.label || '',
    };
  }, [tasks, currentProject, unavailabilities, dayOffset, viewMode]);

  // Check if a task's assignee is currently on leave / unavailable
  const checkIsAssigneeUnavailable = (task) => {
    const taskAssignee = task.assigneeName || task.assignee;
    if (!taskAssignee) return false;

    const inProjectUnavail = unavailabilities.some(
      (u) =>
        u.userName?.toLowerCase() === taskAssignee.toLowerCase() ||
        String(u.userId) === String(task.assignee)
    );
    if (inProjectUnavail) return true;

    const memberMatch = projectMembers.find(
      (m) =>
        m.name?.toLowerCase() === taskAssignee.toLowerCase() ||
        String(m.id || m._id) === String(task.assignee)
    );
    return memberMatch?.availability?.status === 'unavailable';
  };

  const getUnavailabilityInfo = (task) => {
    const taskAssignee = task.assigneeName || task.assignee;
    return unavailabilities.find(
      (u) =>
        u.userName?.toLowerCase() === taskAssignee?.toLowerCase() ||
        String(u.userId) === String(task.assignee)
    );
  };

  // ── Calculate Precise Grid Column Positioning for a Task ─────────────────
  const getTaskGridPosition = (task) => {
    if (!days || days.length === 0) return { start: 1, span: 2 };

    const firstDay = days[0].dateStr;
    const lastDay = days[days.length - 1].dateStr;

    let tStart = task.startDate;
    let tDue = task.dueDate;

    if (!tStart && tDue) {
      const d = new Date(tDue);
      const effortDays = Math.max(1, Math.ceil((task.effortHours || 8) / 8));
      d.setDate(d.getDate() - (effortDays - 1));
      tStart = d.toISOString().split('T')[0];
    } else if (!tStart && !tDue) {
      tStart = new Date().toISOString().split('T')[0];
      tDue = tStart;
    }

    if (!tDue && tStart) {
      const d = new Date(tStart);
      d.setDate(d.getDate() + 2);
      tDue = d.toISOString().split('T')[0];
    }

    if (tStart > tDue) {
      const temp = tStart;
      tStart = tDue;
      tDue = temp;
    }

    let startCol = days.findIndex((d) => d.dateStr === tStart);
    let endCol = days.findIndex((d) => d.dateStr === tDue);

    const isBeforeWindow = tDue < firstDay;
    const isAfterWindow = tStart > lastDay;

    if (startCol === -1) {
      startCol = tStart < firstDay ? 0 : days.length - 1;
    }
    if (endCol === -1) {
      endCol = tDue > lastDay ? days.length - 1 : 0;
    }

    if (endCol < startCol) endCol = startCol;

    const span = Math.max(1, endCol - startCol + 1);
    return {
      start: startCol + 1,
      span,
      isBeforeWindow,
      isAfterWindow,
      startDateFormatted: tStart,
      dueDateFormatted: tDue,
    };
  };

  // ── Calculate Position for Leave / Absence Interval ───────────────────────
  const getLeaveGridPosition = (u) => {
    if (!days || days.length === 0) return { start: 1, span: 2 };
    const firstDay = days[0].dateStr;
    const lastDay = days[days.length - 1].dateStr;

    const lStart = u.fromDate || firstDay;
    const lEnd = u.toDate || lStart;

    let startCol = days.findIndex((d) => d.dateStr === lStart);
    let endCol = days.findIndex((d) => d.dateStr === lEnd);

    if (startCol === -1) {
      startCol = lStart < firstDay ? 0 : days.length - 1;
    }
    if (endCol === -1) {
      endCol = lEnd > lastDay ? days.length - 1 : 0;
    }
    if (endCol < startCol) endCol = startCol;

    return {
      start: startCol + 1,
      span: Math.max(1, endCol - startCol + 1),
    };
  };

  const getBarColor = (task) => {
    // CRITICAL: Highlight in RED if assignee is on leave / unavailable
    if (checkIsAssigneeUnavailable(task)) {
      return 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-sm shadow-rose-500/25 ring-2 ring-rose-300';
    }

    switch (task.status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600';
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

  const filteredTasks = tasks.filter((t) => {
    const assigneeName = t.assigneeName || t.assignee;
    return assigneeFilter === 'All' || assigneeName === assigneeFilter;
  });

  const uniqueAssignees = Array.from(
    new Set(tasks.map((t) => t.assigneeName || t.assignee).filter(Boolean))
  );

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Timeline & Schedule
            </h1>
            {unavailabilities.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {unavailabilities.length} Member(s) on Leave (Red Alert)
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Deterministic calendar Gantt view. Real-time synchronization with task start/due dates,
            project deadline, and team member absences.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:border-blue-500 cursor-pointer"
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
              Today's Calendar
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
              className={`font-mono flex items-center gap-1 ${
                currentProject?.deadline ? 'text-amber-300' : 'text-slate-400 italic'
              }`}
            >
              <span>🎯</span>
              <span>{projectDeadlineStr}</span>
            </strong>
          </div>

          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Visible Timeline Window
            </span>
            <span className="text-slate-200 font-mono text-[11px]">
              {visibleStartStr} ➔ {visibleEndStr} ({days.length} Days)
            </span>
          </div>
        </div>

        {/* View Mode & Time Panning Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('sprint')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'sprint' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              2-Wk Sprint
            </button>
            <button
              type="button"
              onClick={() => setViewMode('project')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'project' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Project Window
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Month (28d)
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

      {/* Unavailability Banner */}
      {unavailabilities.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <div>
              <span className="font-bold text-rose-900">
                Active Absence Schedules Highlighted in Red:
              </span>{' '}
              <span className="text-rose-700">
                {unavailabilities
                  .map((u) => `${u.userName} (${u.fromDate} to ${u.toDate} — ${u.reason || 'Leave'})`)
                  .join(' • ')}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-800">
            Hard Constraint Active (No Overlaps)
          </span>
        </div>
      )}

      {/* Gantt Chart Container */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50/70 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-500 font-semibold">Status Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600 font-medium">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span className="text-slate-600 font-medium">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              <span className="text-slate-600 font-medium">Pending / To Do</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-300 animate-pulse"></span>
              <span className="text-rose-700 font-bold">On Leave / Unavailable (Red Alert)</span>
            </div>
            {deadlineIndex !== -1 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-600"></span>
                <span className="text-red-700 font-bold">Project Deadline Marker</span>
              </div>
            )}
          </div>

          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <span>💡 Click any task bar to view full details and dependency links</span>
          </div>
        </div>

        {/* Dynamic Date Columns & Grid */}
        <div className="overflow-x-auto min-w-[760px]">
          {/* Header row */}
          <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
            <div className="col-span-3 py-3 px-4 border-r border-slate-200 flex items-center justify-between">
              <span>Task & Assignee</span>
              <span className="text-[10px] text-slate-400 font-mono">DATES</span>
            </div>

            <div
              className="col-span-9 grid text-center"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}
            >
              {days.map((day) => (
                <div
                  key={day.dateStr}
                  className={`py-2 px-1 text-xs border-r border-slate-100 relative transition ${
                    day.isToday
                      ? 'bg-blue-50/90 text-blue-800 font-bold'
                      : day.isDeadline
                      ? 'bg-amber-50/90 text-amber-900 font-bold'
                      : day.isWeekend
                      ? 'bg-slate-100/50 text-slate-400'
                      : 'text-slate-600'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
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
                      Deadline
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Leave Schedule Bars on Timeline (if any) */}
          {unavailabilities.length > 0 && (
            <div className="bg-rose-50/50 border-b border-rose-100 divide-y divide-rose-100">
              {unavailabilities.map((u, uIdx) => {
                const pos = getLeaveGridPosition(u);
                return (
                  <div key={uIdx} className="grid grid-cols-12 items-center text-xs py-2">
                    <div className="col-span-3 px-4 border-r border-rose-200 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
                      <span className="font-bold text-rose-900 truncate">
                        {u.userName} (On Leave)
                      </span>
                    </div>

                    <div
                      className="col-span-9 grid gap-0 px-2 relative items-center"
                      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}
                    >
                      <div
                        className="h-6 rounded-lg px-2 flex items-center justify-between text-[10px] font-bold bg-rose-600 text-white shadow-xs"
                        style={{
                          gridColumnStart: pos.start,
                          gridColumnEnd: `span ${pos.span}`,
                        }}
                      >
                        <span className="truncate">🚫 Out of Office: {u.reason || 'Leave'}</span>
                        <span className="text-[9px] font-mono shrink-0 ml-1">
                          {u.fromDate} ➔ {u.toDate}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Task Timeline Rows */}
          <div className="divide-y divide-slate-100 relative">
            {/* Today vertical marker line */}
            {todayIndex !== -1 && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10 border-r-2 border-dashed border-blue-500"
                style={{
                  left: `calc(25% + (75% / ${days.length}) * (${todayIndex} + 0.5))`,
                }}
              ></div>
            )}

            {/* Project Deadline vertical marker line */}
            {deadlineIndex !== -1 && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10 border-r-2 border-red-500 shadow-sm"
                style={{
                  left: `calc(25% + (75% / ${days.length}) * (${deadlineIndex} + 0.5))`,
                }}
              ></div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No tasks match the selected assignee filter.
              </div>
            ) : (
              filteredTasks.map((task, idx) => {
                const pos = getTaskGridPosition(task);
                const isUnavailable = checkIsAssigneeUnavailable(task);
                const barColor = getBarColor(task);
                const assigneeName = task.assigneeName || task.assignee || 'Unassigned';

                return (
                  <div
                    key={task.id || task._id || idx}
                    className={`grid grid-cols-12 items-center hover:bg-slate-50/70 transition group text-xs min-h-[54px] ${
                      isUnavailable ? 'bg-rose-50/25' : ''
                    }`}
                  >
                    {/* Task meta (col-span-3) */}
                    <div className="col-span-3 py-2 px-4 border-r border-slate-100 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          {task.taskId || task.id}
                        </span>
                        <span className="font-semibold text-slate-800 truncate" title={task.title}>
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <span className={isUnavailable ? 'font-bold text-rose-700' : ''}>
                          {assigneeName}
                        </span>
                        {isUnavailable && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            ON LEAVE
                          </span>
                        )}
                        <span>•</span>
                        <span>{task.effortHours}h</span>
                        {task.dueDate && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-500">📅 {task.dueDate}</span>
                          </>
                        )}
                        {task.dependency && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600 font-medium">Waits for {task.dependency}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Gantt Bar Area (col-span-9) */}
                    <div
                      className="col-span-9 grid gap-0 px-2 relative items-center h-full"
                      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}
                    >
                      <div
                        onClick={() => setSelectedTask(task)}
                        className={`h-8 rounded-xl px-2.5 flex items-center justify-between text-xs font-medium cursor-pointer shadow-xs transition transform hover:scale-[1.01] ${barColor}`}
                        style={{
                          gridColumnStart: pos.start,
                          gridColumnEnd: `span ${pos.span}`,
                        }}
                      >
                        <div className="truncate font-semibold text-[11px] flex items-center gap-1.5">
                          {isUnavailable && <span>⚠️</span>}
                          <span className="truncate">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] font-mono opacity-80 hidden sm:inline">
                            {task.dueDate?.slice(5)}
                          </span>
                          <span className="text-[10px] opacity-90 font-bold bg-black/15 px-1.5 py-0.2 rounded">
                            {isUnavailable ? 'LEAVE' : `${task.progress || 0}%`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
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
            <div className="mb-4 p-3 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold block">
                  🚨 Assigned developer ({selectedTask.assigneeName || selectedTask.assignee}) is currently ON LEAVE!
                </span>
                <span className="text-[11px] text-rose-700">
                  {getUnavailabilityInfo(selectedTask)?.reason
                    ? `Reason: ${getUnavailabilityInfo(selectedTask).reason}. `
                    : ''}
                  Go to "Uncertainty & Recovery Center" to reassign this module to a qualified peer with minimal schedule disruption.
                </span>
              </div>
              <span className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px]">
                Red Alert
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs mb-4">
            <div>
              <span className="text-slate-500 block mb-0.5">Assignee:</span>
              <strong className={checkIsAssigneeUnavailable(selectedTask) ? 'text-rose-700' : 'text-slate-800'}>
                {selectedTask.assigneeName || selectedTask.assignee || 'Unassigned'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Start Date:</span>
              <strong className="text-slate-800 font-mono">
                {selectedTask.startDate || 'Auto-Scheduled'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Due Date:</span>
              <strong className="text-slate-800 font-mono">
                {selectedTask.dueDate || 'Not set'}
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
