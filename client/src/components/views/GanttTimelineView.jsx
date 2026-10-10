import React, { useState, useEffect } from 'react';
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

  const projectId = currentProject?.id || currentProject?._id;

  // Fetch project unavailabilities and members to accurately highlight on-leave members in RED
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
  }, [projectId, currentProject?.unavailabilities]);

  const days = [
    { label: 'Oct 6', isToday: false },
    { label: 'Oct 7', isToday: false },
    { label: 'Oct 8', isToday: false },
    { label: 'Oct 9', isToday: true },
    { label: 'Oct 10', isToday: false },
    { label: 'Oct 11', isToday: false },
    { label: 'Oct 12', isToday: false },
    { label: 'Oct 13', isToday: false },
    { label: 'Oct 14', isToday: false },
  ];

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

  const filteredTasks = tasks.filter((t) => {
    const assigneeName = t.assigneeName || t.assignee;
    return assigneeFilter === 'All' || assigneeName === assigneeFilter;
  });

  const getTaskGridPosition = (index) => {
    const spans = [
      { start: 1, span: 3 }, // T1: Oct 6-8
      { start: 3, span: 3 }, // T2: Oct 8-10
      { start: 5, span: 3 }, // T3: Oct 10-12
      { start: 6, span: 3 }, // T4: Oct 11-13
      { start: 2, span: 3 }, // T5: Oct 7-9
      { start: 4, span: 4 }, // Custom
    ];
    return spans[index % spans.length];
  };

  const getBarColor = (task) => {
    // CRITICAL: Highlight in RED if the person is on leave / unavailable
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

  // Distinct assignees for filter
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
                {unavailabilities.length} Member(s) on Leave (Red)
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Visual project timeline with live status tracking. Tasks assigned to developers{' '}
            <strong className="text-rose-600">On Leave / Unavailable</strong> are prominently
            highlighted in <span className="font-bold text-rose-600">RED</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:border-blue-500 cursor-pointer"
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

      {/* Unavailability Banner in Timeline if members are on leave */}
      {unavailabilities.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <div>
              <span className="font-bold text-rose-900">
                Active Leave Windows Highlighted in Red:
              </span>{' '}
              <span className="text-rose-700">
                {unavailabilities
                  .map((u) => `${u.userName} (${u.fromDate} to ${u.toDate} - ${u.reason || 'Leave'})`)
                  .join(' • ')}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-800">
            Reallocation Recommended
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
              <span className="text-slate-600 font-medium">Pending</span>
            </div>
            {/* RED INDICATOR FOR ON LEAVE / UNAVAILABLE */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-300 animate-pulse"></span>
              <span className="text-rose-700 font-bold">On Leave / Unavailable (Red)</span>
            </div>
          </div>

          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <span>💡 Click any bar to inspect task details or sub-skill handoff</span>
          </div>
        </div>

        {/* Date Columns & Grid */}
        <div className="overflow-x-auto min-w-[700px]">
          {/* Header row */}
          <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-600">
            <div className="col-span-3 py-3 px-4 border-r border-slate-200">
              Task Details & Assignee
            </div>
            <div className="col-span-9 grid grid-cols-9 text-center">
              {days.map((day) => (
                <div
                  key={day.label}
                  className={`py-3 px-1 text-xs border-r border-slate-100 relative ${
                    day.isToday ? 'bg-blue-50 text-blue-700 font-bold' : ''
                  }`}
                >
                  {day.label}
                  {day.isToday && (
                    <span className="block text-[9px] uppercase tracking-wider text-blue-600 font-extrabold">
                      Today
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Leave Schedule Bars on Timeline (if any) */}
          {unavailabilities.length > 0 && (
            <div className="bg-rose-50/40 border-b border-rose-100 divide-y divide-rose-100">
              {unavailabilities.map((u, uIdx) => (
                <div key={uIdx} className="grid grid-cols-12 items-center text-xs py-2">
                  <div className="col-span-3 px-4 border-r border-rose-200 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
                    <span className="font-bold text-rose-900 truncate">
                      {u.userName} (On Leave)
                    </span>
                  </div>
                  <div className="col-span-9 grid grid-cols-9 gap-0 px-2 relative items-center">
                    <div
                      className="h-6 rounded-lg px-2 flex items-center justify-between text-[10px] font-bold bg-rose-500 text-white shadow-xs"
                      style={{ gridColumnStart: 5, gridColumnEnd: 'span 4' }}
                    >
                      <span className="truncate">🚫 Out of Office: {u.reason || 'Leave'}</span>
                      <span className="text-[9px] font-mono shrink-0 ml-1">
                        {u.fromDate?.slice(5)} ➔ {u.toDate?.slice(5)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Task Timeline Rows */}
          <div className="divide-y divide-slate-100 relative">
            {/* Today vertical line */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10 border-r-2 border-dashed border-blue-400/80"
              style={{ left: 'calc(25% + (75% / 9) * 3.5)' }}
            ></div>

            {filteredTasks.map((task, idx) => {
              const pos = getTaskGridPosition(idx);
              const isUnavailable = checkIsAssigneeUnavailable(task);
              const barColor = getBarColor(task);
              const assigneeName = task.assigneeName || task.assignee || 'Unassigned';

              return (
                <div
                  key={task.id || task._id || idx}
                  className={`grid grid-cols-12 items-center hover:bg-slate-50/70 transition group text-xs min-h-[52px] ${
                    isUnavailable ? 'bg-rose-50/20' : ''
                  }`}
                >
                  {/* Task meta (col-span-3) */}
                  <div className="col-span-3 py-2 px-4 border-r border-slate-100 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500">
                        {task.taskId || task.id}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">
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
                      {task.dependency && (
                        <>
                          <span>•</span>
                          <span className="text-blue-600 font-medium">Waits for {task.dependency}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Gantt Bar Area (col-span-9) */}
                  <div className="col-span-9 grid grid-cols-9 gap-0 px-2 relative items-center h-full">
                    <div
                      onClick={() => setSelectedTask(task)}
                      className={`h-8 rounded-xl px-3 flex items-center justify-between text-xs font-medium cursor-pointer shadow-xs transition transform hover:scale-[1.01] ${barColor}`}
                      style={{
                        gridColumnStart: pos.start,
                        gridColumnEnd: `span ${pos.span}`,
                      }}
                    >
                      <div className="truncate font-semibold text-[11px] flex items-center gap-1.5">
                        {isUnavailable && <span>⚠️</span>}
                        <span>{task.title}</span>
                      </div>
                      <span className="text-[10px] opacity-90 font-bold ml-2 shrink-0">
                        {isUnavailable ? 'LEAVE' : `${task.progress || 0}%`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
                  Go to "Unavailable & Recovery" to re-allocate this task based on sub-skills.
                </span>
              </div>
              <span className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px]">
                Red Alert
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs mb-4">
            <div>
              <span className="text-slate-500 block mb-0.5">Assignee:</span>
              <strong className={checkIsAssigneeUnavailable(selectedTask) ? 'text-rose-700' : 'text-slate-800'}>
                {selectedTask.assigneeName || selectedTask.assignee || 'Unassigned'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Priority:</span>
              <strong className="text-slate-800">{selectedTask.priority}</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Effort:</span>
              <strong className="text-slate-800">{selectedTask.effortHours} Hours</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Predecessors:</span>
              <strong className="text-slate-800">
                {selectedTask.dependency ? `Task ${selectedTask.dependency}` : 'None'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GanttTimelineView;
