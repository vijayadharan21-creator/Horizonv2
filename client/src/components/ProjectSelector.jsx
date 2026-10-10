import React, { useState, useRef, useEffect } from 'react';

export const ProjectSelector = ({
  currentProject,
  projects,
  onSelectProject,
  onAddProject,
  isPM = false,
  onOpenSrsModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setIsAdding(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = (e) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onAddProject(newProjectName.trim());
      setNewProjectName('');
      setIsAdding(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Header Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-56 h-9 shrink-0 flex items-center gap-2.5 px-3 rounded-xl bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-left transition cursor-pointer group shadow-xs"
        title="Switch active project"
      >
        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
          {currentProject?.name ? currentProject.name.slice(0, 2).toUpperCase() : 'TF'}
        </div>
        <div className="min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 truncate max-w-[140px] sm:max-w-[200px]">
              {currentProject?.name || 'TaskForge AI Core'}
            </span>
            <span className="hidden md:inline-block text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded-md">
              {currentProject?.status || 'Active'}
            </span>
          </div>
        </div>

        <svg
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 max-w-xs bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header & Search */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Active Project
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                autoFocus
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Scrollable Project List */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
            {filteredProjects.map((project) => {
              const isSelected = project.id === currentProject?.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(project);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isSelected ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-300'
                      }`}
                    ></span>
                    <div className="min-w-0 truncate">
                      <div className="truncate font-semibold">{project.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {project.key || 'TASK'} • {project.deadline || 'Q4 2026'}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                      Current
                    </span>
                  )}
                </button>
              );
            })}

            {filteredProjects.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-400">
                No matching projects
              </div>
            )}
          </div>

          {/* Add Project Footer — ONLY for Project Manager */}
          {isPM ? (
            <div className="p-2.5 border-t border-slate-100 bg-slate-50/60">
              {!isAdding ? (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenSrsModal?.();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition cursor-pointer shadow-xs"
                  >
                    <span>✨</span>
                    <span>Upload SRS & AI Setup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <span>+</span>
                    <span>Quick Blank Project</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="New project name..."
                    autoFocus
                    className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold cursor-pointer shadow-xs"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ProjectSelector;
