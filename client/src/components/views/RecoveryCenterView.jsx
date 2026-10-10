import React, { useState, useEffect } from 'react';
import { aiApi, projectsApi } from '../../api/index.js';

export const RecoveryCenterView = ({
  tasks = [],
  currentProject,
  isPM = true,
  onTriggerReplan,
}) => {
  // ── Unavailability & Disruption State ─────────────────────────────────────
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fromTime, setFromTime] = useState('09:00');
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toISOString().split('T')[0];
  });
  const [toTime, setToTime] = useState('18:00');
  const [reason, setReason] = useState('Medical Leave');
  const [contextNotes, setContextNotes] = useState('');

  // ── Project & Team Data ───────────────────────────────────────────────────
  const [projectMembers, setProjectMembers] = useState([]);
  const [activeUnavailabilities, setActiveUnavailabilities] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── AI Replanning & Persistence State ─────────────────────────────────────
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simError, setSimError] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(null);
  const [isClearing, setIsClearing] = useState(false);

  const projectId = currentProject?.id || currentProject?._id;

  // Load project members & unavailabilities
  const fetchMembers = async () => {
    if (!projectId) return;
    try {
      setLoadingMembers(true);
      const res = await projectsApi.getMembers(projectId);
      if (res.success) {
        const membersList = res.members || [];
        setProjectMembers(membersList);
        setActiveUnavailabilities(res.unavailabilities || []);
        if (membersList.length > 0 && !selectedMemberId) {
          setSelectedMemberId(membersList[0].id || membersList[0]._id);
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    setSimulationResult(null);
    setSimError(null);
    setApplySuccess(null);
  }, [projectId]);

  // ── Run AI Uncertainty Reschedule & Rebalance (Fast Sub-Skill Engine) ──────
  const handleSimulate = async (e) => {
    if (e) e.preventDefault();
    if (!projectId) {
      setSimError('Project identifier is missing. Please select an active project.');
      return;
    }

    setIsSimulating(true);
    setSimError(null);
    setApplySuccess(null);

    const selectedMember = projectMembers.find(
      (m) => String(m.id || m._id) === String(selectedMemberId)
    );

    const scenario = {
      type: 'worker_unavailability',
      userId: selectedMemberId || undefined,
      workerName: selectedMember?.name || undefined,
      fromDate,
      fromTime,
      toDate,
      toTime,
      reason,
      contextNotes: contextNotes.trim(),
    };

    try {
      const res = await aiApi.getRecoveryRecommendations(projectId, scenario);
      if (res.success) {
        setSimulationResult({
          ...res.data,
          meta: res.meta,
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        setSimError(res.message || 'Failed to generate uncertainty recovery plan.');
      }
    } catch (err) {
      setSimError(
        err.response?.data?.message ||
          err.message ||
          'Failed to generate uncertainty recovery plan.'
      );
    } finally {
      setIsSimulating(false);
    }
  };

  // ── Apply Reallocation & Mark Person as Unavailable (Persist to MongoDB) ──
  const handleApplyPlan = async () => {
    if (!projectId) {
      setSimError('Project identifier missing. Please select an active project.');
      return;
    }

    setIsApplying(true);
    setSimError(null);
    setApplySuccess(null);

    const selectedMember = projectMembers.find(
      (m) => String(m.id || m._id) === String(selectedMemberId)
    );

    const unavailableInfo = simulationResult?.unavailablePerson || {
      userId: selectedMemberId,
      userName: selectedMember?.name || 'Developer',
      fromDate,
      fromTime,
      toDate,
      toTime,
      reason,
      subSkills: selectedMember?.subSkills || selectedMember?.skills || [],
      contextNotes: contextNotes.trim(),
    };

    const actionsToApply = simulationResult?.actions || [];

    try {
      const res = await aiApi.applyRecoveryPlan(
        projectId,
        actionsToApply,
        unavailableInfo
      );

      if (res.success) {
        setApplySuccess(
          res.message ||
            `Successfully marked ${unavailableInfo.userName} as Unavailable and applied ${actionsToApply.length} module reallocation(s)!`
        );
        await fetchMembers();
        if (onTriggerReplan) {
          await onTriggerReplan();
        }
      } else {
        setSimError(res.message || 'Failed to update person as unavailable.');
      }
    } catch (err) {
      setSimError(
        err.response?.data?.message ||
          err.message ||
          'Failed to apply recovery plan changes.'
      );
    } finally {
      setIsApplying(false);
    }
  };

  // ── Clear Unavailability (Restore Available status) ───────────────────────
  const handleClearUnavailability = async (userId) => {
    if (!projectId || !userId) return;
    try {
      setIsClearing(true);
      setSimError(null);
      await aiApi.clearUnavailability(projectId, userId);
      setApplySuccess('Team member restored to Available status.');
      await fetchMembers();
      if (onTriggerReplan) {
        await onTriggerReplan();
      }
    } catch (err) {
      setSimError(err.response?.data?.message || err.message || 'Failed to restore status.');
    } finally {
      setIsClearing(false);
    }
  };

  const selectedMemberObj = projectMembers.find(
    (m) => String(m.id || m._id) === String(selectedMemberId)
  );

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Unavailable & Schedule Recovery
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
              Sub-Skill Grounded AI Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage unexpected disruptions and team absences. Mark working team members as{' '}
            <strong className="text-slate-700">Unavailable</strong> with exact date and time
            windows, re-allocate modules based on <strong className="text-blue-600">sub-skill alignment</strong>,
            and balance remaining workloads across available developers.
          </p>
        </div>
      </div>

      {/* Active Unavailabilities Alert Banner */}
      {activeUnavailabilities.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
              <span className="text-base">🚨</span>
              <span>Currently Unavailable / On Leave in Project ({activeUnavailabilities.length})</span>
            </div>
            <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
              Timeline Highlighted in Red
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {activeUnavailabilities.map((u, i) => (
              <div
                key={i}
                className="bg-white border border-rose-200 rounded-xl p-3 flex flex-col justify-between text-xs shadow-2xs space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{u.userName}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      ON LEAVE
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    📅 {u.fromDate} {u.fromTime} ➔ {u.toDate} {u.toTime}
                  </div>
                  <div className="text-[11px] text-rose-800 mt-0.5 font-medium">
                    Reason: {u.reason || 'Leave'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleClearUnavailability(u.userId)}
                  disabled={isClearing}
                  className="self-end text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                >
                  Restore to Available ↺
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Unavailability Input & Information Gathering Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Update Person as Unavailable</span>
              </h3>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                Sub-Skill Match
              </span>
            </div>

            <form onSubmit={handleSimulate} className="space-y-4">
              {/* Working Person Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Working Person / Developer
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  {projectMembers.length > 0 ? (
                    projectMembers.map((m) => (
                      <option key={m.id || m._id} value={m.id || m._id}>
                        {m.name} — {m.role} {m.availability?.status === 'unavailable' ? ' [Currently Unavailable]' : ''}
                      </option>
                    ))
                  ) : (
                    <option value="">No team members loaded</option>
                  )}
                </select>

                {/* Sub-skills of the selected person */}
                {selectedMemberObj && (
                  <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {selectedMemberObj.name}'s Sub-Skills:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(selectedMemberObj.subSkills?.length
                        ? selectedMemberObj.subSkills
                        : selectedMemberObj.skills || ['Fullstack Core']
                      ).map((sk, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs"
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Time and Date From */}
              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Unavailable From (Date & Time)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                      Date From
                    </label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                      Time From
                    </label>
                    <input
                      type="time"
                      value={fromTime}
                      onChange={(e) => setFromTime(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Time and Date To */}
              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Unavailable To (Date & Time)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                      Date To
                    </label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                      Time To
                    </label>
                    <input
                      type="time"
                      value={toTime}
                      onChange={(e) => setToTime(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Reason for Unavailability */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Unavailability
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                >
                  <option value="Medical Leave">Medical / Sick Leave</option>
                  <option value="Emergency Leave">Emergency / Family Leave</option>
                  <option value="Technical Disruption">Equipment / System Disruption</option>
                  <option value="Shift Reallocation">Shift / Cross-Team Reallocation</option>
                  <option value="Personal Leave">Personal Planned Leave</option>
                  <option value="Critical Outage">Critical Dependency Blocker</option>
                </select>
              </div>

              {/* Additional Uncertainty Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uncertainty Notes & Context (Optional)
                </label>
                <textarea
                  rows={2}
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="e.g. Alex is on medical leave; prioritize React/MongoDB sub-skills to Arun or Priya."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSimulating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Sub-Skill Matching & Rebalancing Modules...</span>
                    </>
                  ) : (
                    '⚡ Run AI Reschedule & Balance by Sub-Skills'
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleApplyPlan}
                  disabled={isApplying}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isApplying ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    '✓ Mark Unavailable & Persist Now'
                  )}
                </button>
              </div>
            </form>

            {simError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <span className="font-semibold block mb-0.5">⚠️ Error</span>
                {simError}
              </div>
            )}

            {applySuccess && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                <span className="font-semibold block mb-0.5">✓ Successfully Updated</span>
                {applySuccess}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Rescheduling & Module Rebalancing Plan Output */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Sub-Skill Reallocation Plan
                </h3>
                {simulationResult?.meta?.provider && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">
                    {simulationResult.meta.provider}
                  </span>
                )}
              </div>
              {simulationResult && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Completed tasks strictly preserved
                </span>
              )}
            </div>

            {simulationResult ? (
              <div className="space-y-4 text-xs animate-in fade-in">
                {/* Summary Banner */}
                <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl text-emerald-950">
                  <div className="font-bold flex items-center gap-2 mb-1 text-sm">
                    <span className="text-emerald-600 text-base">✓</span>
                    <span>{simulationResult.summary}</span>
                  </div>
                  {simulationResult.unavailablePerson && (
                    <div className="text-[11px] text-emerald-800 font-semibold mt-1 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-mono text-[10px]">
                        Marked Unavailable
                      </span>
                      <span>
                        {simulationResult.unavailablePerson.userName} (from{' '}
                        {simulationResult.unavailablePerson.fromDate}{' '}
                        {simulationResult.unavailablePerson.fromTime} to{' '}
                        {simulationResult.unavailablePerson.toDate}{' '}
                        {simulationResult.unavailablePerson.toTime})
                      </span>
                    </div>
                  )}
                </div>

                {/* Team Workload Balancing Cards */}
                {simulationResult.workloadBalance?.length > 0 && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Balanced Team Workload (Before vs After)
                      </span>
                      <span className="text-[10px] text-slate-400">Total 40h standard week</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {simulationResult.workloadBalance.map((w, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border text-[11px] ${
                            w.isUnavailable
                              ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="font-bold truncate flex items-center justify-between">
                            <span>{w.name}</span>
                            {w.isUnavailable && (
                              <span className="text-[9px] px-1 rounded bg-rose-200 text-rose-800 uppercase font-bold">
                                Off
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                            <span>Before: {w.beforeHours}h</span>
                            <span className="font-bold text-blue-700">➔ After: {w.afterHours}h</span>
                          </div>
                          {w.subSkills?.length > 0 && (
                            <div className="text-[9px] text-slate-400 truncate mt-1">
                              {w.subSkills.slice(0, 2).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposed Reallocation Actions with Sub-Skill Matrix */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Module Actions ({simulationResult.actions?.length || 0}) — Matched by Sub-Skill
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Sub-skills displayed for both persons
                    </span>
                  </div>

                  {simulationResult.actions?.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      {simulationResult.actions.map((act, i) => (
                        <div
                          key={i}
                          className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs space-y-2.5 shadow-2xs hover:border-blue-300 transition"
                        >
                          {/* Module Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                {act.taskId}
                              </span>
                              <span className="font-bold text-slate-900">{act.taskTitle}</span>
                            </div>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {act.actionType}
                            </span>
                          </div>

                          {/* SUB-SKILL MATCHING MATRIX: Both Persons Displayed */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                            {/* Unavailable Person Column */}
                            <div className="space-y-1">
                              <div className="text-[10px] font-bold text-rose-800 flex items-center gap-1">
                                <span>👤 Unavailable Person:</span>
                                <strong>{act.unavailablePersonName}</strong>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(act.unavailablePersonSubSkills || []).map((sk, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-rose-50 text-rose-700 border border-rose-200"
                                  >
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Allocated Person Column */}
                            <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-2.5">
                              <div className="text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                                <span>🎯 Reallocated To:</span>
                                <strong>{act.recommendedAssigneeName}</strong>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(act.allocatedPersonSubSkills || []).map((sk, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  >
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Matched Sub-Skill Highlight & Dates */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                            {act.matchedSubSkills?.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-semibold">
                                  Matched Sub-Skill Alignment:
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  ✓ {act.matchedSubSkills.join(', ')}
                                </span>
                              </div>
                            )}

                            {act.proposedDueDate && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-600 font-mono">
                                <span>New Target Due:</span>
                                <strong className="text-slate-900">📅 {act.proposedDueDate}</strong>
                              </div>
                            )}
                          </div>

                          <p className="text-slate-500 text-[10px] italic pt-0.5">{act.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl">
                      No active modules required reallocation. Current buffers absorb the uncertainty.
                    </div>
                  )}
                </div>

                {/* Preserved Completed Tasks & Warnings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px]">
                    <span className="font-bold text-slate-700 block mb-1">
                      Preserved Completed Tasks ({simulationResult.preservedCompletedTasks?.length || 0})
                    </span>
                    <p className="text-slate-500 text-[10px]">
                      Completed work is locked in stone and safeguarded against alterations.
                    </p>
                  </div>

                  {simulationResult.risksAndWarnings?.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px]">
                      <span className="font-bold block mb-1">Uncertainty Mitigation:</span>
                      <ul className="list-disc pl-3.5 space-y-0.5 text-[10px]">
                        {simulationResult.risksAndWarnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
                <div className="text-4xl mb-3">🔄</div>
                <h4 className="font-bold text-slate-700 text-sm mb-1">
                  Ready to Rebalance Team Uncertainty
                </h4>
                <p className="max-w-md mx-auto text-slate-500">
                  Select the working person, enter the from and to dates/times on the left, and click
                  "Run AI Reschedule & Balance by Sub-Skills" to compute the optimal sub-skill matching reallocation.
                </p>
              </div>
            )}
          </div>

          {/* PM Approval & Persistence */}
          {simulationResult && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Approving will mark the person as <strong>Unavailable</strong> and update task
                assignees and due dates in MongoDB.
              </span>
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={isApplying}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-2 shrink-0"
              >
                {isApplying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Persisting to Database...</span>
                  </>
                ) : (
                  'Approve & Update Person as Unavailable →'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecoveryCenterView;
