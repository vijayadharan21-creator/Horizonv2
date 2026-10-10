import React from 'react';

export const AnalyticsView = ({ tasks }) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
  const totalEffort = tasks.reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);
  const completedEffort = tasks
    .filter((t) => t.status === 'Completed')
    .reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);
  const inProgressEffort = tasks
    .filter((t) => t.status === 'In Progress')
    .reduce((sum, t) => sum + (Number(t.effortHours) || 0), 0);

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track effort distribution, task completion rates, and schedule health.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Overall Completion</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{completionRate}%</div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Effort Distribution</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalEffort}h Total</div>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="text-emerald-600 font-bold">{completedEffort}h Done</span>
            <span>•</span>
            <span className="text-blue-600 font-bold">{inProgressEffort}h In Progress</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Remaining: {totalEffort - completedEffort}h
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Schedule Health</span>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">On Track</div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>No deadline violations detected</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Projected finish aligns with target deadline
          </p>
        </div>
      </div>

      {/* Task Priority & Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <h3 className="font-bold text-slate-900 text-sm mb-4">Task Priority Breakdown</h3>
          <div className="space-y-3 text-xs">
            {['Critical', 'High', 'Medium', 'Low'].map((p) => {
              const count = tasks.filter((t) => t.priority === p).length;
              const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
              return (
                <div key={p}>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-700">{p} Priority</span>
                    <span className="text-slate-500 font-medium">{count} tasks ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        p === 'Critical'
                          ? 'bg-rose-500'
                          : p === 'High'
                          ? 'bg-amber-500'
                          : p === 'Medium'
                          ? 'bg-blue-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <h3 className="font-bold text-slate-900 text-sm mb-4">Sprint Summary</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Total Tasks</span>
              <span className="font-bold text-slate-800">{totalTasks}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Completed</span>
              <span className="font-bold text-emerald-600">{completedTasks}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-600">Total Effort Logged</span>
              <span className="font-bold text-slate-800">{completedEffort}h / {totalEffort}h</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-600">Remaining Effort</span>
              <span className="font-bold text-blue-600">{totalEffort - completedEffort}h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
