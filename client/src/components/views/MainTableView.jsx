import React, { useState } from 'react';

export const MainTableView = ({
  tasks = [],
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  groups = ['To Do', 'In Progress', 'In Review', 'Completed'],
  onAddGroup,
  onCreateTaskClick,
  searchQuery = '',
  isPM = true,
  teamMembers = [],
  user = null,
}) => {
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [inlineTitles, setInlineTitles] = useState({});
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroupCollapse = (grp) => {
    setCollapsedGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const handleAddGroupSubmit = (e) => {
    e.preventDefault();
    if (newGroupTitle.trim() && isPM) {
      onAddGroup(newGroupTitle.trim());
      setNewGroupTitle('');
      setIsAddingGroup(false);
    }
  };

  const handleInlineAddTask = (grp) => {
    if (!isPM) return;
    const text = inlineTitles[grp]?.trim();
    if (!text) return;

    onAddTask({
      title: text,
      group: grp,
      assignee: 'Unassigned',
      assigneeName: 'Unassigned',
      priority: 'Medium',
      effortHours: 4,
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      dependency: null,
      status: grp === 'Completed' ? 'Completed' : grp === 'In Progress' ? 'In Progress' : 'Pending',
      progress: grp === 'Completed' ? 100 : grp === 'In Progress' ? 30 : 0,
    });

    setInlineTitles((prev) => ({ ...prev, [grp]: '' }));
  };

  // Direct progression handler: smoothly transitions task between workflow stages/tables
  const handleProgressTask = (task, targetStatus) => {
    let targetGroup = targetStatus;
    let targetProgress = Number(task.progress) || 0;

    if (targetStatus === 'Completed') {
      targetGroup = 'Completed';
      targetProgress = 100;
    } else if (targetStatus === 'In Review') {
      targetGroup = 'In Review';
      if (targetProgress < 75) targetProgress = 80;
    } else if (targetStatus === 'In Progress') {
      targetGroup = 'In Progress';
      if (targetProgress === 0) targetProgress = 30;
    } else if (targetStatus === 'To Do' || targetStatus === 'Pending') {
      targetGroup = 'To Do';
      targetProgress = 0;
    }

    onUpdateTask(task.id || task.taskId, {
      status: targetStatus,
      group: targetGroup,
      progress: targetProgress,
      lastUpdated: 'Just now',
    });
  };

  const priorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'high':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'medium':
        return 'bg-purple-50 text-purple-600 border-purple-200';
      case 'low':
      default:
        return 'bg-emerald-50 text-emerald-600 border-emerald-200';
    }
  };

  const groupHeaderColor = (grp) => {
    switch (grp?.toLowerCase()) {
      case 'to do':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'in progress':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'in review':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'blocked':
        return 'bg-rose-100 text-rose-700 border-rose-300';
      default:
        return 'bg-indigo-100 text-indigo-700 border-indigo-300';
    }
  };

  // Determine if task belongs to current user / developer role
  const isAssignedToUser = (task) => {
    if (isPM) return true;
    if (!user) return true;

    const uId = String(user.id || user._id || '');
    const uName = (user.name || '').trim().toLowerCase();
    const uEmail = (user.email || '').trim().toLowerCase();

    const tAssigneeId = String(task.assigneeId || task.assignee?._id || task.assignee || '');
    const tAssigneeName = String(
      task.assigneeName || (typeof task.assignee === 'string' ? task.assignee : '')
    ).trim().toLowerCase();

    if (uId && tAssigneeId === uId) return true;
    if (uName && (tAssigneeName.includes(uName) || uName.includes(tAssigneeName))) return true;
    if (uEmail && (tAssigneeName.includes(uEmail) || uEmail.includes(tAssigneeName))) return true;

    // In developer role, if tasks are unassigned or explicitly for their skill tags
    return false;
  };

  // Filter tasks based on role, search, priority
  const roleFilteredTasks = tasks.filter((t) => isAssignedToUser(t));

  const filteredTasks = roleFilteredTasks.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.taskId || t.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.assignee || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPriority =
      selectedPriority === 'All' || t.priority?.toLowerCase() === selectedPriority.toLowerCase();

    return matchesSearch && matchesPriority;
  });

  // Calculate workflow stats for developer
  const inProgressCount = filteredTasks.filter((t) => t.status === 'In Progress').length;
  const inReviewCount = filteredTasks.filter((t) => t.status === 'In Review').length;
  const completedCount = filteredTasks.filter((t) => t.status === 'Completed').length;
  const toDoCount = filteredTasks.filter(
    (t) => t.status === 'To Do' || t.status === 'Pending'
  ).length;

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Main Table
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide uppercase ${
                isPM
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isPM ? 'Manager View (All Tasks)' : 'Developer View (Assigned Role Only)'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isPM
              ? 'Maintain task status, due dates, dependencies, timelines, and multiple workflow tables.'
              : 'View and progress tasks assigned to your role across the To Do, In Progress, Review, and Completed tables.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Priority filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Add Group & Task Buttons (PM only) */}
          {isPM && (
            <>
              <button
                type="button"
                onClick={() => setIsAddingGroup(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <span>+</span>
                <span>New Table / Group</span>
              </button>
              <button
                type="button"
                onClick={onCreateTaskClick}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <span className="text-base leading-none">+</span>
                <span>New Task</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Developer Banner & Workflow Stepper (Shown only for Developers) */}
      {!isPM && (
        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/80 border border-blue-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-base shadow-md shadow-blue-500/25 shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{user?.name || 'Developer'}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-blue-200 text-blue-700">
                  {user?.role?.replace('_', ' ')?.toUpperCase() || 'DEVELOPER'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Table data filtered exclusively to your assigned tasks. Progress work from{' '}
                <strong className="text-blue-700">In Progress</strong> ➔{' '}
                <strong className="text-purple-700">In Review Table</strong> ➔{' '}
                <strong className="text-emerald-700">Completed Table</strong>.
              </p>
            </div>
          </div>

          {/* Workflow Stage Counters */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-slate-200 shadow-2xs text-center min-w-[70px]">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">To Do</div>
              <div className="text-sm font-extrabold text-slate-700">{toDoCount}</div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-blue-200 shadow-2xs text-center min-w-[75px]">
              <div className="text-[10px] font-semibold text-blue-500 uppercase">In Progress</div>
              <div className="text-sm font-extrabold text-blue-700">{inProgressCount}</div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-purple-200 shadow-2xs text-center min-w-[75px]">
              <div className="text-[10px] font-semibold text-purple-500 uppercase">In Review</div>
              <div className="text-sm font-extrabold text-purple-700">{inReviewCount}</div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-emerald-200 shadow-2xs text-center min-w-[75px]">
              <div className="text-[10px] font-semibold text-emerald-500 uppercase">Completed</div>
              <div className="text-sm font-extrabold text-emerald-700">{completedCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Group Inline Modal / Box (PM only) */}
      {isAddingGroup && isPM && (
        <form
          onSubmit={handleAddGroupSubmit}
          className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-3 animate-in fade-in duration-150"
        >
          <div className="flex-1">
            <input
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              placeholder="Enter new table name (e.g. Blocked, Backlog, Testing)..."
              autoFocus
              className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            Add Table
          </button>
          <button
            type="button"
            onClick={() => setIsAddingGroup(false)}
            className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Zero State for Developer when no tasks assigned */}
      {!isPM && filteredTasks.length === 0 && (
        <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
          <div className="text-4xl mb-2">📋</div>
          <h3 className="text-sm font-bold text-slate-800">No Tasks Assigned to Your Role Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            You currently have no tasks assigned to ({user?.name || 'your developer account'}) in this project.
            When the project manager assigns modules or tasks to you, they will appear right here in the table.
          </p>
        </div>
      )}

      {/* Multiple Table Groups (To Do, In Progress, In Review, Completed, etc.) */}
      <div className="space-y-6">
        {groups.map((groupName) => {
          // Robust grouping: matches explicit group or normalized status
          const groupTasks = filteredTasks.filter((t) => {
            const rawGrp = (t.group || '').toLowerCase();
            const rawStatus = (t.status || '').toLowerCase();
            const target = groupName.toLowerCase();

            if (target === 'in review') {
              return rawGrp === 'in review' || rawStatus === 'in review';
            }
            if (target === 'completed') {
              return rawGrp === 'completed' || rawStatus === 'completed';
            }
            if (target === 'in progress') {
              return (
                (rawGrp === 'in progress' || rawStatus === 'in progress') &&
                rawStatus !== 'in review' &&
                rawStatus !== 'completed'
              );
            }
            if (target === 'to do') {
              return (
                (rawGrp === 'to do' ||
                  rawGrp === 'pending' ||
                  rawStatus === 'to do' ||
                  rawStatus === 'pending') &&
                rawStatus !== 'in progress' &&
                rawStatus !== 'in review' &&
                rawStatus !== 'completed'
              );
            }
            return rawGrp === target;
          });

          const isCollapsed = collapsedGroups[groupName];

          return (
            <div
              key={groupName}
              className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition"
            >
              {/* Table Group Header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(groupName)}
                    className="text-slate-400 hover:text-slate-700 transition cursor-pointer p-0.5"
                    title={isCollapsed ? 'Expand table' : 'Collapse table'}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isCollapsed ? '-rotate-90' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${groupHeaderColor(
                      groupName
                    )}`}
                  >
                    {groupName} {groupName.toLowerCase() === 'in review' ? 'Table' : groupName.toLowerCase() === 'completed' ? 'Table' : ''}
                  </span>

                  <span className="text-xs text-slate-400 font-medium">
                    {groupTasks.length} {groupTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <div>
                    Total Effort:{' '}
                    <strong className="text-slate-700">
                      {groupTasks.reduce((acc, t) => acc + (Number(t.effortHours) || 0), 0)}h
                    </strong>
                  </div>
                </div>
              </div>

              {/* Table Body */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/30">
                        <th className="py-2.5 px-4 w-20">Task ID</th>
                        <th className="py-2.5 px-4 min-w-[200px]">Task Name</th>
                        <th className="py-2.5 px-4 min-w-[130px]">Assignee</th>
                        <th className="py-2.5 px-4 min-w-[130px]">Status</th>
                        <th className="py-2.5 px-4 min-w-[110px]">Timeline</th>
                        <th className="py-2.5 px-4 min-w-[90px]">Priority</th>
                        <th className="py-2.5 px-4 min-w-[100px]">Dependency</th>
                        <th className="py-2.5 px-4 min-w-[100px]">Last Update</th>
                        <th className="py-2.5 px-4 min-w-[110px] text-center">
                          {isPM ? 'Actions' : 'Workflow Action'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupTasks.map((task) => {
                        const isDone = task.status === 'Completed';
                        const isInReview = task.status === 'In Review';
                        const isInProgress = task.status === 'In Progress';
                        const isToDo = task.status === 'To Do' || task.status === 'Pending';

                        return (
                          <tr key={task.id || task.taskId} className="hover:bg-slate-50/70 transition group">
                            {/* Task ID */}
                            <td className="py-3 px-4 font-mono font-medium text-slate-500">
                              {task.taskId || task.id}
                            </td>

                            {/* Task Name */}
                            <td className="py-3 px-4">
                              {isPM ? (
                                <input
                                  type="text"
                                  value={task.title}
                                  onChange={(e) =>
                                    onUpdateTask(task.id, {
                                      title: e.target.value,
                                      lastUpdated: 'Just now',
                                    })
                                  }
                                  className="w-full bg-transparent font-medium text-slate-800 hover:bg-slate-100/60 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5"
                                />
                              ) : (
                                <div className="font-semibold text-slate-800 px-1 py-0.5">
                                  {task.title}
                                </div>
                              )}
                              {task.description && (
                                <div className="text-[10px] text-slate-400 pl-1 truncate max-w-xs">
                                  {task.description}
                                </div>
                              )}
                            </td>

                            {/* Assignee */}
                            <td className="py-3 px-4">
                              {isPM ? (
                                <select
                                  value={task.assignee || 'Unassigned'}
                                  onChange={(e) =>
                                    onUpdateTask(task.id, {
                                      assignee: e.target.value,
                                      assigneeName: e.target.value,
                                      lastUpdated: 'Just now',
                                    })
                                  }
                                  className="bg-transparent text-slate-700 font-medium hover:bg-slate-100 rounded px-1.5 py-1 text-xs cursor-pointer focus:outline-none"
                                >
                                  <option value="Unassigned">Unassigned</option>
                                  {Array.from(
                                    new Set(
                                      [...(teamMembers || []), task.assignee].filter(Boolean)
                                    )
                                  )
                                    .filter((name) => name !== 'Unassigned')
                                    .map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                </select>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                  <span className="font-semibold text-slate-700 truncate">
                                    {task.assignee || user?.name || 'You'}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Status dropdown */}
                            <td className="py-3 px-4">
                              <select
                                value={task.status || 'To Do'}
                                onChange={(e) => {
                                  const newStatus = e.target.value;
                                  handleProgressTask(task, newStatus);
                                }}
                                className={`font-semibold rounded-lg px-2 py-1 text-xs cursor-pointer focus:outline-none border shadow-2xs transition ${
                                  isDone
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : isInReview
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : isInProgress
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                <option value="To Do">To Do</option>
                                <option value="In Progress">In Progress</option>
                                <option value="In Review">In Review</option>
                                <option value="Completed">Completed</option>
                                <option value="Blocked">Blocked</option>
                              </select>
                            </td>

                            {/* Due Date */}
                            <td className="py-3 px-4">
                              {isPM ? (
                                <input
                                  type="date"
                                  value={task.dueDate || ''}
                                  onChange={(e) =>
                                    onUpdateTask(task.id, {
                                      dueDate: e.target.value,
                                      lastUpdated: 'Just now',
                                    })
                                  }
                                  className="bg-transparent text-slate-700 hover:bg-slate-100 rounded px-1.5 py-1 text-xs cursor-pointer focus:outline-none font-mono"
                                />
                              ) : (
                                <span className="font-mono text-slate-600 text-[11px]">
                                  {task.dueDate || '—'}
                                </span>
                              )}
                            </td>

                            {/* Priority */}
                            <td className="py-3 px-4">
                              {isPM ? (
                                <select
                                  value={task.priority}
                                  onChange={(e) =>
                                    onUpdateTask(task.id, {
                                      priority: e.target.value,
                                      lastUpdated: 'Just now',
                                    })
                                  }
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer ${priorityColor(
                                    task.priority
                                  )}`}
                                >
                                  <option value="Critical">Critical</option>
                                  <option value="High">High</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityColor(
                                    task.priority
                                  )}`}
                                >
                                  {task.priority || 'Medium'}
                                </span>
                              )}
                            </td>

                            {/* Dependencies */}
                            <td className="py-3 px-4">
                              <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {task.dependency ? `Waits for ${task.dependency}` : 'None'}
                              </span>
                            </td>

                            {/* Last Update */}
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {task.lastUpdated || 'Just now'}
                            </td>

                            {/* Actions / Workflow Quick Action */}
                            <td className="py-3 px-4 text-center">
                              {isPM ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteTask(task.id)}
                                  title="Delete task"
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition p-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* Fast Workflow progression buttons for developer */}
                                  {isToDo && (
                                    <button
                                      type="button"
                                      onClick={() => handleProgressTask(task, 'In Progress')}
                                      title="Start working (move to In Progress)"
                                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold shadow-xs transition cursor-pointer whitespace-nowrap flex items-center gap-1"
                                    >
                                      <span>Start →</span>
                                    </button>
                                  )}

                                  {isInProgress && (
                                    <button
                                      type="button"
                                      onClick={() => handleProgressTask(task, 'In Review')}
                                      title="Progress to Review Table"
                                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-semibold shadow-xs transition cursor-pointer whitespace-nowrap flex items-center gap-1"
                                    >
                                      <span>→ Review</span>
                                    </button>
                                  )}

                                  {isInReview && (
                                    <button
                                      type="button"
                                      onClick={() => handleProgressTask(task, 'Completed')}
                                      title="Progress to Completed Table"
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold shadow-xs transition cursor-pointer whitespace-nowrap flex items-center gap-1"
                                    >
                                      <span>✓ Complete</span>
                                    </button>
                                  )}

                                  {isDone && (
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                                      <span>Done ✓</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Group is empty notice */}
                      {groupTasks.length === 0 && (
                        <tr>
                          <td colSpan="9" className="py-4 px-4 text-center text-slate-400 text-xs italic">
                            No tasks currently in {groupName} table
                          </td>
                        </tr>
                      )}

                      {/* Inline Add Task row (PM only) */}
                      {isPM && (
                        <tr className="bg-slate-50/40 border-t border-slate-100">
                          <td colSpan="9" className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 text-sm font-bold">+</span>
                              <input
                                type="text"
                                value={inlineTitles[groupName] || ''}
                                onChange={(e) =>
                                  setInlineTitles({
                                    ...inlineTitles,
                                    [groupName]: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleInlineAddTask(groupName);
                                  }
                                }}
                                placeholder={`Add task row to ${groupName} (press Enter)...`}
                                className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none py-1"
                              />
                              {inlineTitles[groupName] && (
                                <button
                                  type="button"
                                  onClick={() => handleInlineAddTask(groupName)}
                                  className="px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shrink-0 cursor-pointer shadow-xs"
                                >
                                  Add Row
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MainTableView;
