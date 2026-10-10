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

  // ── AI-SENSE Live Uncertainty State ───────────────────────────────────────
  const [detectedRisks, setDetectedRisks] = useState([]);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [riskError, setRiskError] = useState(null);
  const [showRiskPanel, setShowRiskPanel] = useState(true);

  // ── EDUR AI Replanning & Persistence State ────────────────────────────────
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [simError, setSimError] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(null);
  const [isClearing, setIsClearing] = useState(false);

  // ── Post-Leave Return Evaluation State ────────────────────────────────────
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnMemberId, setReturnMemberId] = useState('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [evaluatingReturn, setEvaluatingReturn] = useState(false);
  const [returnEvalResult, setReturnEvalResult] = useState(null);
  const [returnEvalError, setReturnEvalError] = useState(null);
  const [applyingReturn, setApplyingReturn] = useState(false);

  // ── Schedule Audit History Modal State ────────────────────────────────────
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingAudits, setLoadingAudits] = useState(false);

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

  // AI-SENSE: Detect live project uncertainties across 7 categories
  const fetchUncertainties = async () => {
    if (!projectId) return;
    try {
      setLoadingRisks(true);
      setRiskError(null);
      const res = await aiApi.detectUncertainties(projectId);
      if (res.success) {
        setDetectedRisks(res.risks || []);
      }
    } catch (err) {
      setRiskError(err.response?.data?.message || err.message || 'Failed to detect uncertainties');
    } finally {
      setLoadingRisks(false);
    }
  };

  // Load audit trail
  const fetchAuditHistory = async () => {
    if (!projectId) return;
    try {
      setLoadingAudits(true);
      const res = await aiApi.getScheduleAuditHistory(projectId);
      if (res.success) {
        setAuditHistory(res.audits || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingAudits(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchUncertainties();
    setSimulationResult(null);
    setSimError(null);
    setApplySuccess(null);
    setReturnEvalResult(null);
  }, [projectId]);

  // ── Run AI Uncertainty Reschedule & Rebalance (EDUR Solver) ─────────────────
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
        const data = res.data;
        setSimulationResult({
          ...data,
          meta: res.meta,
          timestamp: new Date().toLocaleTimeString(),
        });
        // Select recommended candidate by default
        if (data.selectedCandidate?.candidateId) {
          setSelectedCandidateId(data.selectedCandidate.candidateId);
        } else if (data.candidates?.length > 0) {
          setSelectedCandidateId(data.candidates[0].candidateId);
        }
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

  // Selected candidate object
  const currentCandidate =
    simulationResult?.candidates?.find((c) => c.candidateId === selectedCandidateId) ||
    simulationResult?.selectedCandidate ||
    null;

  const activeActions = currentCandidate ? currentCandidate.actions : simulationResult?.actions || [];

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

    const actionsToApply = activeActions;
    const expectedVersion = simulationResult?.scheduleVersion || currentProject?.scheduleVersion;

    try {
      const res = await aiApi.applyRecoveryPlan(
        projectId,
        actionsToApply,
        unavailableInfo,
        expectedVersion
      );

      if (res.success) {
        setApplySuccess(
          res.message ||
            `Successfully marked ${unavailableInfo.userName} as Unavailable and applied ${actionsToApply.length} module reallocation(s)!`
        );
        await fetchMembers();
        await fetchUncertainties();
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
      await fetchUncertainties();
      if (onTriggerReplan) {
        await onTriggerReplan();
      }
    } catch (err) {
      setSimError(err.response?.data?.message || err.message || 'Failed to restore status.');
    } finally {
      setIsClearing(false);
    }
  };

  // ── Post-Leave Return Evaluation ──────────────────────────────────────────
  const handleOpenReturnModal = (userId) => {
    setReturnMemberId(userId || (activeUnavailabilities[0]?.userId || ''));
    setReturnEvalResult(null);
    setReturnEvalError(null);
    setShowReturnModal(true);
  };

  const handleEvaluateReturn = async () => {
    if (!projectId || !returnMemberId) return;
    setEvaluatingReturn(true);
    setReturnEvalError(null);
    try {
      const res = await aiApi.evaluatePostLeaveReturn(projectId, returnMemberId, returnDate);
      if (res.success) {
        setReturnEvalResult(res.data);
      } else {
        setReturnEvalError(res.message || 'Failed to evaluate post-leave return.');
      }
    } catch (err) {
      setReturnEvalError(err.response?.data?.message || err.message || 'Evaluation failed.');
    } finally {
      setEvaluatingReturn(false);
    }
  };

  const handleApplyReturnPlan = async () => {
    if (!projectId || !returnEvalResult) return;
    const reassignActions = returnEvalResult.recommendations
      .filter((r) => r.action === 'REASSIGN_BACK')
      .map((r) => ({
        taskId: r.taskId,
        recommendedAssigneeId: returnMemberId,
        recommendedAssigneeName: returnEvalResult.workerName,
        actionType: 'REALLOCATE',
        reason: `Safe post-leave handback: ${r.reason}`,
      }));

    if (reassignActions.length === 0) {
      // Just clear unavailability
      await handleClearUnavailability(returnMemberId);
      setShowReturnModal(false);
      return;
    }

    try {
      setApplyingReturn(true);
      await aiApi.applyRecoveryPlan(projectId, reassignActions, null);
      await aiApi.clearUnavailability(projectId, returnMemberId);
      setApplySuccess(`Restored ${returnEvalResult.workerName} and safely reassigned ${reassignActions.length} future task(s).`);
      setShowReturnModal(false);
      await fetchMembers();
      await fetchUncertainties();
      if (onTriggerReplan) await onTriggerReplan();
    } catch (err) {
      setReturnEvalError(err.response?.data?.message || err.message || 'Failed to apply return plan.');
    } finally {
      setApplyingReturn(false);
    }
  };

  // Pre-fill disruption scenario from AI-SENSE detected risk
  const handlePreFillRisk = (risk) => {
    if (risk.preFill?.workerId) {
      setSelectedMemberId(risk.preFill.workerId);
    }
    if (risk.preFill?.fromDate) {
      setFromDate(risk.preFill.fromDate);
    }
    if (risk.preFill?.toDate) {
      setToDate(risk.preFill.toDate);
    }
    if (risk.preFill?.reason) {
      setReason(risk.preFill.reason);
    }
    setContextNotes(`Detected risk: ${risk.description}`);
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
              AI-SENSE & EDUR Uncertainty Recovery Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
              v2 Uncertainty-Aware Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Proactive uncertainty detection across 7 taxonomy categories. Event-driven uncertainty recovery (EDUR)
            with independent constraint validation, minimal disruption optimization ($J$), and post-leave lifecycle management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchAuditHistory();
              setShowAuditModal(true);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <span>📜</span>
            <span>Schedule Audits (v{currentProject?.scheduleVersion || 1})</span>
          </button>

          {activeUnavailabilities.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenReturnModal(activeUnavailabilities[0]?.userId)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>Evaluate Worker Return</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── AI-SENSE LIVE RISK MONITOR ────────────────────────────────────────── */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-base">
              📡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">AI-SENSE Live Uncertainty Monitor</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-mono">
                  7-Category Continuous Scan
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Early-warning risk identification before schedule degradation occurs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchUncertainties}
              disabled={loadingRisks}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer flex items-center gap-1"
            >
              <span className={loadingRisks ? 'animate-spin' : ''}>🔄</span>
              <span>Rescan</span>
            </button>
            <button
              type="button"
              onClick={() => setShowRiskPanel(!showRiskPanel)}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
            >
              {showRiskPanel ? 'Collapse ▲' : `Expand (${detectedRisks.length}) ▼`}
            </button>
          </div>
        </div>

        {showRiskPanel && (
          <div className="pt-3">
            {loadingRisks ? (
              <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></div>
                <span>Scanning 7 uncertainty dimensions against current project telemetry...</span>
              </div>
            ) : detectedRisks.length === 0 ? (
              <div className="py-4 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <span>✓</span>
                <span>All 7 uncertainty categories within safe parameters. No schedule failure risks detected.</span>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                {detectedRisks.map((risk, idx) => {
                  const severityColors = {
                    CRITICAL: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                    HIGH: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                    MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
                    LOW: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                  };
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-slate-800/90 border border-slate-700 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              severityColors[risk.severity] || severityColors.MEDIUM
                            }`}
                          >
                            {risk.severity}
                          </span>
                          <span className="font-semibold text-slate-200">{risk.description}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({risk.riskCode})</span>
                        </div>
                        {risk.evidence && (
                          <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                            {risk.evidence.conservativeEffortHours !== undefined && (
                              <span>Remaining Effort: {risk.evidence.conservativeEffortHours}h</span>
                            )}
                            {risk.evidence.availableHours !== undefined && (
                              <span>Available Before Leave: {risk.evidence.availableHours}h</span>
                            )}
                            {risk.evidence.deficitHours !== undefined && (
                              <span className="text-rose-400 font-bold">Deficit: {risk.evidence.deficitHours}h</span>
                            )}
                            {risk.evidence.delayDays !== undefined && (
                              <span>Delay: {risk.evidence.delayDays} day(s)</span>
                            )}
                          </div>
                        )}
                        <p className="text-[11px] text-indigo-300/90 italic">
                          Recommended Action: {risk.recommendedAction}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {risk.preFill && (
                          <button
                            type="button"
                            onClick={() => handlePreFillRisk(risk)}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <span>⚡</span>
                            <span>Simulate Disruption</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
              Hard Constraint Enforced (No New Tasks Permitted)
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
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenReturnModal(u.userId)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    Evaluate Return 🔄
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearUnavailability(u.userId)}
                    disabled={isClearing}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                  >
                    Direct Restore ↺
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Disruption Simulation Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Simulate / Record Disruption</span>
              </h3>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                EDUR Candidate Engine
              </span>
            </div>

            <form onSubmit={handleSimulate} className="space-y-4">
              {/* Working Person Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Affected Team Member
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
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
                      {selectedMemberObj.name}'s Verified Sub-Skills:
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
                  Disruption Window Start
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
                  Disruption Window End
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
                  Uncertainty Category / Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  <option value="Medical Leave">Medical / Sick Leave (Availability Uncertainty)</option>
                  <option value="Emergency Leave">Emergency / Family Leave (Availability Uncertainty)</option>
                  <option value="Technical Disruption">Equipment / System Disruption (Infrastructure)</option>
                  <option value="Shift Reallocation">Shift / Cross-Team Reallocation (Skill/Resource)</option>
                  <option value="Personal Leave">Planned Personal Leave (Availability Uncertainty)</option>
                  <option value="Critical Outage">Critical Blocker / Outage (Dependency Uncertainty)</option>
                </select>
              </div>

              {/* Additional Uncertainty Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Context Notes & Guidance (Optional)
                </label>
                <textarea
                  rows={2}
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="e.g. Prioritize assigning frontend sub-skills to Priya; defer non-critical testing."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSimulating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Solving Candidates & Validating Constraints...</span>
                    </>
                  ) : (
                    '⚡ Generate EDUR Candidate Schedules'
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
                <span className="font-semibold block mb-0.5">✓ Successfully Persisted</span>
                {applySuccess}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: EDUR Candidates, Objective Score J, and Reallocation Details */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Recovery Candidates & Validation
                </h3>
                {simulationResult?.solverStatus && (
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-mono">
                    STATUS: {simulationResult.solverStatus}
                  </span>
                )}
              </div>
              {simulationResult && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {simulationResult.preservedCompletedTaskCount || 0} Completed Tasks Safeguarded
                </span>
              )}
            </div>

            {simulationResult ? (
              <div className="space-y-4 text-xs animate-in fade-in">
                {/* CANDIDATE SELECTOR CARDS */}
                {simulationResult.candidates?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      Select Candidate Strategy (Objective Function $J$ Comparison):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {simulationResult.candidates.map((cand) => {
                        const isSelected = cand.candidateId === selectedCandidateId;
                        const isRecommended = simulationResult.selectedCandidate?.candidateId === cand.candidateId;
                        return (
                          <div
                            key={cand.candidateId}
                            onClick={() => setSelectedCandidateId(cand.candidateId)}
                            className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between text-xs ${
                              isSelected
                                ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-400/20'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-slate-900 text-[11px]">
                                  {cand.strategyName}
                                </span>
                                {isRecommended && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                                    Minimal $J$
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-600">
                                Disruption Score: <strong className="text-indigo-700">{cand.objectiveScore?.totalScore || 0}</strong>
                              </div>
                              <div className="text-[9px] text-slate-400 mt-1">
                                Reassignments: {cand.objectiveScore?.reassignmentScore || 0} | Max Delay: {cand.objectiveScore?.delayScore || 0}d
                              </div>
                            </div>

                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                              {cand.validation?.isValid ? (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <span>✓</span>
                                  <span>Validated (V1-V10)</span>
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold">
                                  ⚠️ Invalid Candidate
                                </span>
                              )}
                              <span className="text-slate-500">{cand.actions?.length || 0} actions</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Explanation Banner */}
                {simulationResult.explanation && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 space-y-1">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>💡</span>
                      <span>EDUR Decision Rationale:</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {simulationResult.explanation}
                    </p>
                  </div>
                )}

                {/* Candidate Action Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Module Actions for Selected Strategy ({activeActions.length})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Evaluated for sub-skill compatibility and schedule windows
                    </span>
                  </div>

                  {activeActions.length > 0 ? (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      {activeActions.map((act, i) => (
                        <div
                          key={i}
                          className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-2 shadow-2xs hover:border-indigo-300 transition"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                {act.taskId}
                              </span>
                              <span className="font-bold text-slate-900">{act.taskTitle}</span>
                            </div>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {act.actionType}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80 text-[11px]">
                            <div>
                              <span className="text-slate-500">Current / Previous: </span>
                              <strong className="text-slate-700">{act.unavailablePersonName || 'Original'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Target Assignee: </span>
                              <strong className="text-emerald-700">{act.recommendedAssigneeName || 'Preserved'}</strong>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                            {act.matchedSubSkills?.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-semibold">Matched Sub-Skills:</span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  ✓ {act.matchedSubSkills.join(', ')}
                                </span>
                              </div>
                            )}

                            {act.proposedDueDate && (
                              <div className="text-[10px] text-slate-600 font-mono">
                                New Due Date: <strong className="text-slate-900">📅 {act.proposedDueDate}</strong>
                              </div>
                            )}
                          </div>

                          <p className="text-slate-500 text-[10px] italic">{act.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl">
                      No task modifications required. Timeline and buffer capacity safely absorb this disruption.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
                <div className="text-4xl mb-3">🔄</div>
                <h4 className="font-bold text-slate-700 text-sm mb-1">
                  Ready to Solve Uncertainty Recovery
                </h4>
                <p className="max-w-md mx-auto text-slate-500">
                  Select an affected team member, configure the disruption window on the left, and click
                  "Generate EDUR Candidate Schedules" to generate candidate recovery plans with minimal disruption $J$.
                </p>
              </div>
            )}
          </div>

          {/* PM Approval & Persistence */}
          {simulationResult && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Persisting will increment schedule to <strong>v{(simulationResult.scheduleVersion || 1) + 1}</strong> and atomically update task dates/assignees.
              </span>
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={isApplying || !currentCandidate?.validation?.isValid}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-2 shrink-0"
              >
                {isApplying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Persisting Schedule v{(simulationResult.scheduleVersion || 1) + 1}...</span>
                  </>
                ) : (
                  `Approve & Persist Candidate (${currentCandidate?.strategyName || 'Selected'}) →`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── POST-LEAVE RETURN EVALUATION MODAL ───────────────────────────────── */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <h3 className="text-base font-bold text-slate-900">Post-Leave Return Evaluation</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Prevents blind reversal! Evaluates whether returning workers should take back unstarted future tasks
              while strictly preserving in-progress work to avoid disruptive context-switching.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Returning Team Member
                </label>
                <select
                  value={returnMemberId}
                  onChange={(e) => setReturnMemberId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {activeUnavailabilities.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.userName} (On Leave)
                    </option>
                  ))}
                  {projectMembers.map((m) => (
                    <option key={m.id || m._id} value={m.id || m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Actual Return Date
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleEvaluateReturn}
              disabled={evaluatingReturn}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              {evaluatingReturn ? 'Analyzing in-progress vs future tasks...' : '⚡ Evaluate Safe Task Handback'}
            </button>

            {returnEvalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {returnEvalError}
              </div>
            )}

            {returnEvalResult && (
              <div className="space-y-3 pt-2 text-xs">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900">
                  <div className="font-bold mb-1">{returnEvalResult.summary}</div>
                  <div className="text-[11px] text-indigo-700">
                    Safe to reassign back: {returnEvalResult.reassignBackCount} | Keep with current assignee: {returnEvalResult.keepCount}
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {returnEvalResult.recommendations.map((rec, rIdx) => (
                    <div
                      key={rIdx}
                      className="p-2.5 rounded-lg border bg-white flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-600">{rec.taskId}</span>
                          <span className="font-semibold text-slate-900">{rec.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-mono">{rec.status}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{rec.reason}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          rec.action === 'REASSIGN_BACK'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rec.action === 'REASSIGN_BACK' ? 'REASSIGN BACK' : 'KEEP CURRENT'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReturnModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyReturnPlan}
                    disabled={applyingReturn}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition"
                  >
                    {applyingReturn ? 'Applying...' : 'Apply Return Handbacks & Restore Worker'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SCHEDULE AUDIT HISTORY MODAL ────────────────────────────────────── */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">📜</span>
                <h3 className="text-base font-bold text-slate-900">
                  Schedule Audit Trail & Version History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Complete provenance trail recording every schedule revision, objective score $J$, and validator pass record.
            </p>

            {loadingAudits ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading audit records...</div>
            ) : auditHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No schedule revisions recorded yet. Project is on initial schedule version 1.
              </div>
            ) : (
              <div className="space-y-3">
                {auditHistory.map((audit, aIdx) => (
                  <div
                    key={aIdx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-indigo-100 text-indigo-800 text-[11px]">
                          v{audit.scheduleVersion}
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          (from v{audit.previousScheduleVersion || (audit.scheduleVersion - 1)})
                        </span>
                        <span className="font-semibold text-slate-800">{audit.triggerType}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(audit.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-600">
                      <span>Tasks Modified: <strong>{audit.modifiedTaskCount || 0}</strong></span>
                      {audit.objectiveScore !== undefined && (
                        <span>Objective Disruption $J$: <strong>{audit.objectiveScore}</strong></span>
                      )}
                      <span className="text-emerald-700 font-semibold">
                        {audit.validationPassed ? '✓ Validated' : '⚠️ Unvalidated'}
                      </span>
                    </div>

                    {audit.notes && (
                      <p className="text-[10px] text-slate-500 italic">{audit.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecoveryCenterView;
