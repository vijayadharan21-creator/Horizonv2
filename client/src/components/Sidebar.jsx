import React from 'react';

export const Sidebar = ({
  currentTab,
  onSelectTab,
  user,
  onLogout,
  isPM = false,
}) => {
  const allWorkspaceNavItems = [
    {
      id: 'overview',
      label: 'Overview',
      badge: null,
      pmOnly: false,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'task-allocation',
      label: 'Task Allocation',
      badge: null,
      pmOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
    },
    {
      id: 'team',
      label: 'Team',
      badge: null,
      pmOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'my-tasks',
      label: 'My Tasks',
      badge: null,
      pmOnly: false,
      devOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'main-table',
      label: 'Main Table',
      badge: null,
      pmOnly: false,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      badge: null,
      pmOnly: false,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'analytics',
      label: 'Analytics',
      badge: null,
      pmOnly: false,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const toolsNavItems = [
    {
      id: 'recovery-center',
      label: 'Unavailable & Recovery',
      badge: null,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'profile',
      label: 'My Profile',
      badge: null,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  // Filter workspace items based on role
  const visibleWorkspaceNavItems = allWorkspaceNavItems.filter((item) => {
    if (item.pmOnly && !isPM) return false;     // hide PM-only items from devs
    if (item.devOnly && isPM) return false;      // hide dev-only items from PM
    return true;
  });

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none text-slate-700 h-screen sticky top-0 overflow-y-auto custom-scrollbar">
      {/* Top Brand Header */}
      <div className="p-4 space-y-5">
        {/* Brand */}
        <div className="flex items-center gap-3 px-1 pt-1">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-base flex items-center justify-center shadow-md shadow-blue-500/25">
            T
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
              <span>TASKFORGE</span>
              <span className="text-blue-600 font-extrabold">AI</span>
            </div>
            <div className="text-[10px] text-slate-400 font-semibold tracking-wide">
              {isPM ? 'MANAGER WORKSPACE' : 'DEVELOPER WORKSPACE'}
            </div>
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="pt-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            NAVIGATION
          </div>
          <nav className="space-y-1">
            {visibleWorkspaceNavItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-semibold'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ACCOUNT */}
        <div className="pt-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            ACCOUNT
          </div>
          <nav className="space-y-1">
            {toolsNavItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-semibold'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom User Card */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70">
        <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'TF'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                {user?.name || (isPM ? 'Sarah Jenkins' : 'Alex Rivera')}
              </div>
              <div className="text-[10px] text-blue-600 truncate font-mono">
                {user?.email || (isPM ? 'pm@taskforge.ai' : 'dev@taskforge.ai')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
