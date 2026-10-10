import React, { useState, useEffect } from 'react';
import { aiApi } from '../api/index.js';

export const CreateTaskModal = ({
  isOpen,
  onClose,
  onAddTask,
  currentProject,
  onTasksCreated,
  groups = ['To Do', 'In Progress', 'In Review', 'Completed'],
  existingTasks = [],
  teamMembers = [],
}) => {
  const [mode, setMode] = useState('single'); // 'single' | 'ai_generate'

  // ── Single Task Form State ────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState(groups[0] || 'To Do');
  const [assignee, setAssignee] = useState('Unassigned');
  const [priority, setPriority] = useState('High');
  const [effortHours, setEffortHours] = useState('5');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [dependency, setDependency] = useState('None');
  const [description, setDescription] = useState('');
  const [isAssisting, setIsAssisting] = useState(false);
  const [assistMessage, setAssistMessage] = useState(null);

  // ── AI Requirements Generation State ──────────────────────────────────────
  const [requirementsText, setRequirementsText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setMode('single');
      setTitle('');
      setDescription('');
      setAssistMessage(null);
      setRequirementsText('');
      setSuggestions([]);
      setSelectedSuggestions(new Set());
      setGenError(null);
      setAssignee('Unassigned');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Handle Single Task Submit ─────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title: title.trim(),
      group,
      assignee,
      assigneeName: assignee,
      priority,
      effortHours: Number(effortHours) || 4,
      dueDate,
      dependency: dependency === 'None' ? null : dependency,
      description: description.trim(),
      status: group === 'Completed' ? 'Completed' : group === 'In Progress' ? 'In Progress' : 'Pending',
      progress: group === 'Completed' ? 100 : group === 'In Progress' ? 40 : 0,
    });

    // Reset & close
    setTitle('');
    setDescription('');
    setAssistMessage(null);
    onClose();
  };

  // ── Feature 5: AI Task Assist ─────────────────────────────────────────────
  const handleAiAssist = async () => {
    if (!title.trim() || !currentProject?.id) return;
    setIsAssisting(true);
    setAssistMessage(null);
    try {
      const res = await aiApi.getTaskAssistance(currentProject.id, {
        title: title.trim(),
        description: description.trim(),
      });
      if (res.success && res.data) {
        const assist = res.data;
        if (assist.improvedDescription) setDescription(assist.improvedDescription);
        if (assist.estimatedEffortHours) setEffortHours(String(assist.estimatedEffortHours));
        if (assist.suggestedPriority) setPriority(assist.suggestedPriority);
        setAssistMessage(
          `✨ AI suggested refined description and ${assist.estimatedEffortHours}h effort.`
        );
      }
    } catch (err) {
      setAssistMessage(err.response?.data?.message || 'AI assistance temporarily unavailable.');
    } finally {
      setIsAssisting(false);
    }
  };

  // ── Feature 1: AI Task Proposal Generation ────────────────────────────────
  const handleGenerateProposals = async (e) => {
    e.preventDefault();
    if (!requirementsText.trim() || !currentProject?.id) return;

    setIsGenerating(true);
    setGenError(null);
    setSuggestions([]);
    setSelectedSuggestions(new Set());

    const requirementsList = requirementsText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      const res = await aiApi.generateTasks(currentProject.id, requirementsList);
      if (res.success && res.data?.suggestions) {
        setSuggestions(res.data.suggestions);
        // Default select all suggestions for approval
        const allKeys = new Set(res.data.suggestions.map((_, i) => i));
        setSelectedSuggestions(allKeys);
      }
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Failed to generate task proposals.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Feature 1: Approval Workflow ──────────────────────────────────────────
  const handleApproveSelected = async () => {
    if (selectedSuggestions.size === 0 || !currentProject?.id) return;

    setIsApproving(true);
    setGenError(null);

    const approvedList = suggestions.filter((_, idx) => selectedSuggestions.has(idx));

    try {
      const res = await aiApi.approveTasks(currentProject.id, approvedList);
      if (res.success) {
        if (onTasksCreated) {
          await onTasksCreated();
        }
        onClose();
      }
    } catch (err) {
      setGenError(err.response?.data?.message || 'Failed to approve and create tasks.');
    } finally {
      setIsApproving(false);
    }
  };

  const toggleSuggestion = (idx) => {
    const next = new Set(selectedSuggestions);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedSuggestions(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {mode === 'single' ? 'Create New Task' : 'AI Generate Tasks from Requirements'}
            </h3>
            <p className="text-xs text-slate-500">
              {mode === 'single'
                ? 'Add task to collaborative workflow & schedule'
                : 'Decompose feature requirements into structured tasks'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/30 px-6 pt-2">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`pb-2 text-xs font-semibold px-3 border-b-2 transition cursor-pointer ${
              mode === 'single'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Manual Task
          </button>
          <button
            type="button"
            onClick={() => setMode('ai_generate')}
            className={`pb-2 text-xs font-semibold px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'ai_generate'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>✨</span>
            <span>AI Requirements Generator</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {mode === 'single' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Task Title *</label>
                  {title.trim().length >= 3 && (
                    <button
                      type="button"
                      onClick={handleAiAssist}
                      disabled={isAssisting}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                      title="Use AI to flesh out description, acceptance criteria, and effort"
                    >
                      <span>✨</span>
                      <span>{isAssisting ? 'Thinking...' : 'AI Assist'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Build API response validator"
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Table / Group
                  </label>
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assignee</label>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Unassigned">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Effort (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={effortHours}
                    onChange={(e) => setEffortHours(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preceding Task Dependency
                </label>
                <select
                  value={dependency}
                  onChange={(e) => setDependency(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="None">None (Independent task)</option>
                  {existingTasks.map((t) => (
                    <option key={t.id || t.taskId} value={t.taskId || t.id}>
                      {t.taskId || t.id}: {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Acceptance Criteria
                </label>
                <textarea
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Key specifications or acceptance criteria..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {assistMessage && (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
                  {assistMessage}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer"
                >
                  Add Task
                </button>
              </div>
            </form>
          ) : (
            /* AI Requirements Generation Mode */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Requirements (one per line)
                </label>
                <textarea
                  rows="4"
                  value={requirementsText}
                  onChange={(e) => setRequirementsText(e.target.value)}
                  placeholder="e.g.&#10;Implement user registration & JWT authentication&#10;Build task drag-and-drop board&#10;Add sprint timeline Gantt chart"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-400">
                  AI will suggest structured tasks, effort hours, and dependencies.
                </span>
                <button
                  type="button"
                  onClick={handleGenerateProposals}
                  disabled={isGenerating || !requirementsText.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Analyzing & Decomposing...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Generate Task Proposals</span>
                    </>
                  )}
                </button>
              </div>

              {genError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {genError}
                </div>
              )}

              {/* Proposal Preview & Selection */}
              {suggestions.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Generated Task Proposals ({selectedSuggestions.size} of {suggestions.length} selected)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSuggestions(
                          selectedSuggestions.size === suggestions.length
                            ? new Set()
                            : new Set(suggestions.map((_, i) => i))
                        )
                      }
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {selectedSuggestions.size === suggestions.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {suggestions.map((sugg, idx) => {
                      const isChecked = selectedSuggestions.has(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleSuggestion(idx)}
                          className={`p-3 rounded-xl border text-xs transition cursor-pointer ${
                            isChecked
                              ? 'bg-blue-50/50 border-blue-300'
                              : 'bg-white border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSuggestion(idx)}
                              className="mt-0.5 rounded text-blue-600 focus:ring-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900">{sugg.title}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600">
                                  {sugg.effortHours}h • {sugg.priority}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                {sugg.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                                <span>Role: {sugg.suggestedRole}</span>
                                {sugg.dependencies?.length > 0 && (
                                  <span>• Depends on: {sugg.dependencies.join(', ')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApproveSelected}
                      disabled={isApproving || selectedSuggestions.size === 0}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      {isApproving ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Persisting Tasks...</span>
                        </>
                      ) : (
                        `Approve & Create ${selectedSuggestions.size} Tasks →`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;
