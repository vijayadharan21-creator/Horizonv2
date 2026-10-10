import React, { useState, useEffect } from 'react';
import { aiApi, projectsApi, usersApi } from '../api/index.js';

const SAMPLE_SRS_TEMPLATES = [
  {
    name: 'E-Commerce Platform SRS',
    text: `SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
PROJECT: NextGen Cloud E-Commerce Platform
1. Executive Summary:
Build an enterprise multi-vendor e-commerce web platform with responsive storefront, scalable product catalog, secure checkout with Stripe/PayPal, inventory management, and automated order notifications.

2. Functional Modules:
- Core Database & Schema Design: Design PostgreSQL and Redis schemas for users, vendor catalogs, inventory locks, and cart sessions.
- Authentication & RBAC Service: OAuth2 and JWT-based authentication for Customers, Vendors, and Admin staff with role permissions.
- Product Catalog & Search API: Fast full-text search with filtering by category, price, rating, and stock availability. Depends on Database Design.
- Responsive React Storefront: Modern mobile-first shopping UI with product detail pages, live cart drawer, and review system. Depends on Product Catalog API.
- Payment & Checkout Pipeline: Secure Stripe PaymentIntent integration with webhook listeners, tax calculation, and receipt generation. Depends on Cart and Auth.
- Vendor Inventory Management Portal: Dashboard for vendors to add SKUs, upload media, update pricing, and track shipments. Depends on Storefront and Catalog.
- QA Automated Testing & Security Audit: End-to-end Cypress test suite, penetration testing for checkout flow, and OWASP compliance. Depends on Checkout and Inventory.

3. Constraints:
Target delivery within 6 weeks. High availability (99.9%) and zero-downtime deployment on AWS.`,
  },
  {
    name: 'Healthcare Clinic Portal SRS',
    text: `SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
PROJECT: MedPulse Telehealth & Patient Portal
1. Summary:
A HIPAA-compliant telehealth application connecting patients with doctors for appointment booking, real-time video consultations, prescription history, and billing.

2. Required Modules:
- HIPAA Secure Database & Encryption: Encrypted patient records (EHR), audit logs, and medical history database.
- Patient & Physician Auth: Multi-factor authentication (MFA) with strict role segregation and audit trails.
- Appointment Scheduling Engine: Real-time calendar synchronization with conflict resolution and reminder webhooks. Depends on Patient DB.
- WebRTC Video Consultation Room: Peer-to-peer encrypted audio/video calling with in-call chat and screen sharing. Depends on Scheduling Engine.
- Digital Prescription & Pharmacy Dispatch: Doctor prescription generator with pharmacy API routing. Depends on Patient DB and Video Room.
- Compliance, QA & Load Testing: HIPAA compliance validation, load testing for 1,000 simultaneous video sessions. Depends on all modules.`,
  },
  {
    name: 'Autonomous Task Allocator SRS',
    text: `SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
PROJECT: TaskForge AI Core Engine
1. Overview:
An intelligent task allocation engine that evaluates developer skills, historical velocity, and task dependency graphs to automatically recommend optimal sprint schedules.

2. Core Capabilities:
- Graph Dependency Engine: Topological sort algorithm to identify critical paths and detect circular dependencies.
- Developer Skill & Velocity Database: MongoDB models tracking developer competencies, active capacity, and completion rates.
- AI Allocation Recommender: Local LLM service recommending optimal assignees with rationale based on skill tags. Depends on Graph Engine and Velocity DB.
- Interactive Gantt & Timeline UI: React timeline with drag-and-drop task rescheduling and buffer visualization. Depends on AI Recommender.
- End-to-End Test Suite: Unit tests for topological sorting, mock LLM evaluations, and CI/CD validation.`,
  },
];

export const CreateProjectSrsModal = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const [step, setStep] = useState('team'); // 'team' | 'input' | 'template_review'
  const [srsText, setSrsText] = useState('');
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState(0);

  // Step 0: Team selection
  const [developers, setDevelopers] = useState([]);
  const [loadingDevs, setLoadingDevs] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState([]); // array of developer ids

  // Step 2: AI Template State (Editable by Project Manager)
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [safeDeadline, setSafeDeadline] = useState('');
  const [timelineAnalysis, setTimelineAnalysis] = useState(null);
  const [modules, setModules] = useState([]);
  const [metaInfo, setMetaInfo] = useState(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadDevelopers();
      setStep('team');
      setSelectedTeam([]);
      setSrsText('');
      setFileName('');
      setAnalyzeError(null);
      setSaveError(null);
      setModules([]);
      setMetaInfo(null);
    }
  }, [isOpen]);

  const loadDevelopers = async () => {
    setLoadingDevs(true);
    try {
      const res = await usersApi.getDevelopers();
      if (res.success && res.developers) {
        setDevelopers(res.developers);
      }
    } catch {
      setDevelopers([]);
    } finally {
      setLoadingDevs(false);
    }
  };

  const toggleDeveloper = (devId) => {
    setSelectedTeam(prev =>
      prev.includes(devId) ? prev.filter(id => id !== devId) : [...prev, devId]
    );
  };

  if (!isOpen) return null;

  // ── Handle File Upload ──────────────────────────────────────────────────────
  const readFileAsText = (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc')) {
      setFileName(file.name);
      setAnalyzeError(
        'Binary documents cannot be parsed in the browser. Paste the SRS text, or upload a .txt / .md file.'
      );
      return;
    }
    setFileName(file.name);
    setAnalyzeError(null);
    const reader = new FileReader();
    reader.onload = (event) => setSrsText(event.target.result);
    reader.onerror = () => setAnalyzeError('Failed to read the uploaded file. Please paste requirements directly.');
    reader.readAsText(file);
  };

  const handleFileUpload = (e) => readFileAsText(e.target.files?.[0]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDraggingOver(true); };
  const handleDragLeave = () => setIsDraggingOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFileAsText(file);
  };

  // ── Step 1: Analyze SRS Document with AI ────────────────────────────────────
  const ANALYZE_STAGES = [
    'Reading SRS document structure...',
    'Identifying functional modules & scope...',
    'Classifying independent vs dependent modules...',
    'Calculating critical path & safe timeline buffer...',
    'Matching modules to available developers...',
    'Generating editable project template...',
  ];

  const handleAnalyzeSrs = async () => {
    if (selectedTeam.length === 0) {
      setAnalyzeError('Please select at least one team member before analyzing. The AI needs your team to allocate tasks correctly.');
      return;
    }
    if (!srsText.trim()) {
      setAnalyzeError('Please upload an SRS document or paste requirements text.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeStage(0);

    // Animate stage labels while waiting for AI response
    const stageInterval = setInterval(() => {
      setAnalyzeStage((s) => (s < ANALYZE_STAGES.length - 1 ? s + 1 : s));
    }, 1800);

    try {
      const res = await aiApi.analyzeSrs({
        srsText: srsText.trim(),
        fileName: fileName || 'Uploaded SRS Document',
        teamMemberIds: selectedTeam,   // ← only these developers will be considered
      });

      clearInterval(stageInterval);

      if (res.success && res.data) {
        const t = res.data;
        setProjectName(t.projectName || 'New Software Project');
        setProjectKey(t.projectKey || 'PROJ');
        setProjectDescription(t.summary || '');
        setTimelineAnalysis(t.timelineAnalysis || {});

        let deadl = t.timelineAnalysis?.recommendedDeadline || '';
        if (!deadl) {
          const d = new Date();
          const safeDays = (t.timelineAnalysis?.criticalPathDays || 14) + (t.timelineAnalysis?.safeBufferDays || 5);
          d.setDate(d.getDate() + safeDays);
          deadl = d.toISOString().split('T')[0];
        }
        setSafeDeadline(deadl);

        const mappedModules = (t.modules || []).map((m, idx) => ({
          ...m,
          id: m.moduleId || `MOD-${idx + 1}`,
          moduleId: m.moduleId || `MOD-${idx + 1}`,
          isIndependent: Array.isArray(m.dependencies) ? m.dependencies.length === 0 : true,
          dependencies: Array.isArray(m.dependencies) ? m.dependencies : [],
          dependency: Array.isArray(m.dependencies) && m.dependencies.length > 0 ? m.dependencies[0] : '',
          assignee: m.suggestedAssignee || 'Unassigned',
          effortHours: Number(m.effortHours) || 8,
          priority: m.priority || 'Medium',
          category: m.category || 'General',
        }));

        setModules(mappedModules);
        setMetaInfo(res.meta);
        setStep('template_review');
      } else {
        setAnalyzeError(res.message || 'Analysis failed. Please try again.');
      }
    } catch (err) {
      clearInterval(stageInterval);
      setAnalyzeError(
        err.response?.data?.message || err.message || 'Service temporarily unavailable. Please retry.'
      );
    } finally {
      setAnalyzing(false);
      setAnalyzeStage(0);
    }
  };

  // ── Step 2 Handlers: Module Edits by PM ─────────────────────────────────────
  const handleUpdateModule = (modId, updates) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== modId && m.moduleId !== modId) return m;
        const updated = { ...m, ...updates };

        // Recalculate dependency state
        if ('dependency' in updates) {
          const dep = updates.dependency;
          if (!dep || dep === 'None') {
            updated.dependencies = [];
            updated.isIndependent = true;
          } else {
            updated.dependencies = [dep];
            updated.isIndependent = false;
          }
        }

        return updated;
      })
    );
  };

  const handleDeleteModule = (modId) => {
    setModules((prev) => prev.filter((m) => m.id !== modId && m.moduleId !== modId));
  };

  const handleAddModule = () => {
    const newId = `MOD-${modules.length + 1}`;
    const newModule = {
      id: newId,
      moduleId: newId,
      title: 'New Feature Module',
      description: 'Scope and requirements for this module.',
      category: 'Backend',
      isIndependent: true,
      dependencies: [],
      dependency: 'None',
      effortHours: 8,
      priority: 'Medium',
      suggestedRole: 'Software Engineer',
      assignee: developers[0]?.name || 'Unassigned',
    };
    setModules((prev) => [...prev, newModule]);
  };

  // ── Step 2 Submit: Confirm and Persist to Database ──────────────────────────
  const handleConfirmAndSave = async () => {
    if (!projectName.trim()) {
      setSaveError('Project name cannot be empty.');
      return;
    }
    if (modules.length === 0) {
      setSaveError('At least one module is required to initialize the project.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        name: projectName.trim(),
        description: projectDescription.trim(),
        key: projectKey.trim().toUpperCase() || 'PROJ',
        deadline: safeDeadline,
        teamMemberIds: selectedTeam,
        modules: modules.map((m) => {
          const matchedMember = developers.find(
            (d) => (d.id || d._id) === m.suggestedAssigneeId || d.name === m.assignee
          );
          return {
            moduleId: m.moduleId || m.id,
            title: m.title,
            description: m.description,
            category: m.category,
            isIndependent: m.isIndependent,
            dependencies: m.dependencies,
            dependency: m.dependencies?.[0] || null,
            effortHours: Number(m.effortHours) || 8,
            priority: m.priority || 'Medium',
            assignee: m.assignee || 'Unassigned',
            assigneeId: matchedMember ? (matchedMember.id || matchedMember._id) : null,
            suggestedSkills: m.suggestedSkills || [],
          };
        }),
      };

      const res = await projectsApi.createWithSrsTemplate(payload);
      if (res.success && res.project) {
        onProjectCreated?.(res.project, res.tasks || []);
        onClose();
      } else {
        setSaveError(res.message || 'Failed to save project template in database.');
      }
    } catch (err) {
      setSaveError(
        err.response?.data?.message || err.message || 'Failed to create project in database.'
      );
    } finally {
      setSaving(false);
    }
  };

  const independentCount = modules.filter((m) => m.isIndependent).length;
  const dependentCount = modules.filter((m) => !m.isIndependent).length;
  const totalHours = modules.reduce((sum, m) => sum + (Number(m.effortHours) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 text-lg">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {step === 'team' ? 'Step 1 — Form Your Team'
                    : step === 'input' ? 'Step 2 — SRS Document'
                    : 'Step 3 — Review & Save'}
                </h2>
                {metaInfo?.provider && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    {metaInfo.provider}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 'team'
                  ? 'Select the developers who will work on this project. The AI allocates tasks based only on their skills.'
                  : step === 'input'
                  ? 'Upload your SRS document. The AI will create tasks and assign them to your selected team.'
                  : 'Review and customize the AI-generated project template before saving to the database.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'input' && (
              <button type="button" onClick={() => setStep('team')} disabled={analyzing}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                ← Team
              </button>
            )}
            {step === 'template_review' && (
              <button type="button" onClick={() => setStep('input')} disabled={saving}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                ← SRS
              </button>
            )}
            <button type="button" onClick={onClose} disabled={analyzing || saving}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
              ✕
            </button>
          </div>
        </div>

        {/* Step progress bar */}
        <div className="px-6 py-2.5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2">
            {[
              { key: 'team',            label: 'Form Team' },
              { key: 'input',           label: 'SRS Document' },
              { key: 'template_review', label: 'Review & Save' },
            ].map((s, i) => {
              const steps = ['team', 'input', 'template_review'];
              const currentIdx = steps.indexOf(step);
              const stepIdx    = steps.indexOf(s.key);
              const done    = stepIdx < currentIdx;
              const active  = stepIdx === currentIdx;
              return (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                      done   ? 'bg-blue-600 border-blue-600 text-white'
                      : active ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-slate-200 text-slate-400 bg-white'
                    }`}>{done ? '✓' : i + 1}</div>
                    <span className={`text-[11px] font-semibold ${
                      active ? 'text-blue-600' : done ? 'text-slate-600' : 'text-slate-400'
                    }`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 0 — TEAM FORMATION (mandatory before AI analysis)
          ═══════════════════════════════════════════════════════════════════ */}
          {step === 'team' && (
            <div className="space-y-5">
              {/* Banner */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 text-sm font-bold">👥</div>
                <div>
                  <p className="text-sm font-bold text-blue-900">Team formation is required before AI analysis</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    The AI agent allocates tasks exclusively to the developers you select here, matching their registered skills and sub-skills. Without a team, allocation is not possible.
                  </p>
                </div>
              </div>

              {/* Developer list */}
              {loadingDevs ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                  Loading available developers...
                </div>
              ) : developers.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <div className="text-3xl mb-2">🚫</div>
                  <p className="text-sm font-semibold text-slate-600">No registered developers found.</p>
                  <p className="text-xs text-slate-400 mt-1">Developers must register an account before you can form a team.</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Available Developers ({developers.length})
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedTeam(developers.map(d => d.id || d._id))}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button type="button" onClick={() => setSelectedTeam([])}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer">
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {developers.map((dev, idx) => {
                      const devId = dev.id || dev._id;
                      const isSelected = selectedTeam.includes(devId);
                      const colors = ['bg-violet-600','bg-blue-600','bg-emerald-600','bg-amber-600','bg-rose-600','bg-cyan-600'];
                      const color = colors[idx % colors.length];
                      return (
                        <button
                          key={devId}
                          type="button"
                          onClick={() => toggleDeveloper(devId)}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-100'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl ${color} text-white font-bold text-xs flex items-center justify-center shrink-0`}>
                            {dev.name?.slice(0, 2).toUpperCase() || 'DE'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 truncate">{dev.name}</span>
                              {isSelected && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white shrink-0">✓ Selected</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">{dev.email}</div>
                            {(dev.skills?.length > 0) && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {dev.skills.slice(0, 4).map(s => (
                                  <span key={s} className="text-[9px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md">● {s}</span>
                                ))}
                                {(dev.subSkills?.length > 0) && dev.subSkills.slice(0, 2).map(s => (
                                  <span key={s} className="text-[9px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">{s}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected summary */}
              {selectedTeam.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <span className="text-base">✅</span>
                  <span><strong>{selectedTeam.length}</strong> developer{selectedTeam.length > 1 ? 's' : ''} selected — the AI will allocate tasks based on their combined skills.</span>
                </div>
              )}

              {/* CTA */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={selectedTeam.length === 0}
                  onClick={() => { setAnalyzeError(null); setStep('input'); }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer flex items-center gap-2"
                >
                  <span>Continue to SRS Upload</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 1: UPLOAD / PASTE SRS DOCUMENT
          ───────────────────────────────────────────────────────────────── */}
          {step === 'input' && (
            <div className="space-y-6">

              {/* Selected team reminder banner */}
              <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-emerald-600 font-bold text-sm">👥</span>
                <span className="text-xs text-emerald-800">
                  <strong>Team ({selectedTeam.length}):</strong>{' '}
                  {developers.filter(d => selectedTeam.includes(d.id || d._id)).map(d => d.name).join(', ')}
                </span>
                <button type="button" onClick={() => setStep('team')}
                  className="ml-auto text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer shrink-0">
                  Change →
                </button>
              </div>
              {/* Document Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Upload SRS Document (PDF, Word, Markdown, Text)
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition group ${
                    isDraggingOver
                      ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
                      : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20'
                  }`}
                >
                  <input
                    type="file"
                    id="srsFileInput"
                    accept=".txt,.md,.pdf,.docx,.json,.rtf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label htmlFor="srsFileInput" className="cursor-pointer space-y-2 block">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition shadow-xs">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div className="text-xs font-bold text-slate-700">
                      {fileName ? (
                        <span className="text-blue-600 font-semibold">📄 {fileName}</span>
                      ) : isDraggingOver ? (
                        <span className="text-blue-600 font-bold">Drop file here to upload</span>
                      ) : (
                        <>
                          <span className="text-blue-600 hover:underline">Click to upload document</span> or drag & drop file here
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Supported formats: TXT, MD, PDF, DOCX, JSON, RTF
                    </p>
                  </label>
                </div>
              </div>

              {/* Or Quick Sample SRS Templates */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    Or select a pre-configured sample SRS document:
                  </span>
                  <span className="text-[11px] text-slate-400">1-click demo</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {SAMPLE_SRS_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => {
                        setFileName(tmpl.name);
                        setSrsText(tmpl.text);
                        setAnalyzeError(null);
                      }}
                      className="p-3 text-left rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 text-xs font-medium text-slate-700 hover:text-blue-700 transition cursor-pointer shadow-xs group"
                    >
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 truncate">
                        📄 {tmpl.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                        Decomposes into modules with safe timeline & assignments
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Requirements Text Area */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Document Requirements Content (Review or Paste)
                </label>
                <textarea
                  value={srsText}
                  onChange={(e) => setSrsText(e.target.value)}
                  rows={8}
                  placeholder="Paste software requirements specification text here, or edit the uploaded document content..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
                />
              </div>

              {analyzeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{analyzeError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                {analyzing && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0"></div>
                      <span className="text-xs font-bold text-blue-800">AI Analysis in Progress</span>
                    </div>
                    <p className="text-[11px] text-blue-600 pl-7 animate-pulse">{ANALYZE_STAGES[analyzeStage]}</p>
                    <div className="mt-2 pl-7 flex gap-1">
                      {ANALYZE_STAGES.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 rounded-full flex-1 transition-all duration-500 ${
                            i <= analyzeStage ? 'bg-blue-500' : 'bg-blue-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={analyzing}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyzeSrs}
                    disabled={analyzing || !srsText.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
                  >
                    {analyzing ? (
                      <span>Analyzing...</span>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>Analyze SRS &amp; Generate Template</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 2: INTERACTIVE AI TEMPLATE REVIEW & EVALUATION (EDITABLE)
          ───────────────────────────────────────────────────────────────── */}
          {step === 'template_review' && (
            <div className="space-y-6">
              {/* Project Metadata Card */}
              <div className="p-5 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Project Name (Editable)
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Project Key
                    </label>
                    <input
                      type="text"
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Executive Scope & Summary
                  </label>
                  <textarea
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Timeline & Safe Buffer Feasibility Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Total Estimated Effort
                  </span>
                  <div className="text-2xl font-extrabold text-slate-900 flex items-baseline gap-1.5">
                    <span>{totalHours}h</span>
                    <span className="text-xs font-semibold text-slate-500">
                      ({Math.ceil(totalHours / 8)} person-days)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Sum of module tasks</p>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Critical Path
                  </span>
                  <div className="text-2xl font-extrabold text-blue-600">
                    {timelineAnalysis?.criticalPathDays || Math.ceil(totalHours / 16)} Days
                  </div>
                  <p className="text-[11px] text-slate-400">Longest sequential dependency</p>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                    Safe Risk Buffer
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-600">
                    +{timelineAnalysis?.safeBufferDays || 5} Days Buffer
                  </div>
                  <p className="text-[11px] text-emerald-600/80">Absorbs unexpected blockers</p>
                </div>

                <div className="p-4 bg-white border border-blue-200 bg-blue-50/40 rounded-2xl shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                    Safe Target Deadline (Editable)
                  </span>
                  <input
                    type="date"
                    value={safeDeadline}
                    onChange={(e) => setSafeDeadline(e.target.value)}
                    className="w-full bg-white border border-blue-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-900 font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-blue-700 font-medium">Safe buffer included</p>
                </div>
              </div>

              {/* Fallback Notice */}
              {metaInfo?.fallbackEngaged && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">🔧</span>
                  <span>
                    <strong className="text-slate-700">Smart Analysis Engine:</strong> AI model generated this template using deterministic semantic analysis of your SRS document. All modules, dependencies, and timeline are fully editable below before saving.
                  </span>
                </div>
              )}

              {/* Risk Assessment Note */}
              {timelineAnalysis?.riskAssessment && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <span className="text-amber-600 font-bold">🛡️ Risk Feasibility:</span>
                  <span>{timelineAnalysis.riskAssessment}</span>
                </div>
              )}

              {/* Modules & Dependency Breakdown Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Decomposed Modules & Developer Allocation</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {modules.length} Modules
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Evaluate and customize independent vs dependent modules, dependencies, and assignees.
                  </p>
                </div>

                {/* Filter / Category Pills */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    🟢 {independentCount} Independent (Starts Day 1)
                  </span>
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    ⏳ {dependentCount} Dependent Tracks
                  </span>
                  <button
                    type="button"
                    onClick={handleAddModule}
                    className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-blue-600 text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                  >
                    + Add Module
                  </button>
                </div>
              </div>

              {/* Modules Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-3 w-16">ID</th>
                        <th className="py-3 px-3 min-w-[200px]">Module Title</th>
                        <th className="py-3 px-3 w-28">Category</th>
                        <th className="py-3 px-3 w-36">Track Type</th>
                        <th className="py-3 px-3 min-w-[140px]">Dependencies</th>
                        <th className="py-3 px-3 min-w-[160px]">Work Allocation</th>
                        <th className="py-3 px-3 w-20">Hours</th>
                        <th className="py-3 px-3 w-24">Priority</th>
                        <th className="py-3 px-3 w-10 text-center">✕</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modules.map((mod) => (
                        <tr key={mod.id} className="hover:bg-slate-50/60 transition group">
                          {/* Module ID */}
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">
                            {mod.moduleId || mod.id}
                          </td>

                          {/* Title */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={mod.title}
                              onChange={(e) => handleUpdateModule(mod.id, { title: e.target.value })}
                              className="w-full font-semibold text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-xs"
                            />
                            {mod.description && (
                              <p className="text-[10px] text-slate-400 pl-1.5 line-clamp-1 mt-0.5">
                                {mod.description}
                              </p>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3 px-3">
                            <select
                              value={mod.category}
                              onChange={(e) => handleUpdateModule(mod.id, { category: e.target.value })}
                              className="bg-transparent font-medium text-slate-700 hover:bg-slate-100 rounded px-1.5 py-1 text-[11px] cursor-pointer"
                            >
                              <option value="Frontend">Frontend</option>
                              <option value="Backend">Backend</option>
                              <option value="Database">Database</option>
                              <option value="DevOps">DevOps</option>
                              <option value="QA">QA & Test</option>
                              <option value="Security">Security</option>
                              <option value="Architecture">Architecture</option>
                              <option value="General">General</option>
                            </select>
                          </td>

                          {/* Track Type: Independent vs Dependent */}
                          <td className="py-3 px-3">
                            {mod.isIndependent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span>🟢</span>
                                <span>Independent</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span>⏳</span>
                                <span>Dependent</span>
                              </span>
                            )}
                          </td>

                          {/* Dependencies Selector */}
                          <td className="py-3 px-3">
                            <select
                              value={mod.dependencies?.[0] || 'None'}
                              onChange={(e) => handleUpdateModule(mod.id, { dependency: e.target.value })}
                              className="bg-transparent text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded px-1.5 py-1 cursor-pointer w-full"
                            >
                              <option value="None">None (Independent)</option>
                              {modules
                                .filter((other) => other.id !== mod.id && other.moduleId !== mod.moduleId)
                                .map((other) => (
                                  <option key={other.id} value={other.moduleId || other.id}>
                                    Waits for {other.moduleId || other.id} ({other.title.slice(0, 18)}...)
                                  </option>
                                ))}
                            </select>
                          </td>

                          {/* Work Allocation (Assignee) */}
                          <td className="py-3 px-3">
                            <select
                              value={mod.assignee || 'Unassigned'}
                              onChange={(e) => handleUpdateModule(mod.id, { assignee: e.target.value })}
                              className="bg-transparent text-[11px] font-medium text-slate-800 hover:bg-slate-100 rounded px-1.5 py-1 cursor-pointer w-full"
                            >
                              <option value="Unassigned">Unassigned</option>
                              {(developers.filter((dev) => selectedTeam.includes(dev.id || dev._id)).length > 0
                                ? developers.filter((dev) => selectedTeam.includes(dev.id || dev._id))
                                : developers
                              ).map((dev) => (
                                <option key={dev.id || dev._id || dev.name} value={dev.name}>
                                  👤 {dev.name} {dev.skills?.length ? `(${dev.skills.slice(0, 2).join(', ')})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Hours */}
                          <td className="py-3 px-3">
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={mod.effortHours}
                              onChange={(e) => handleUpdateModule(mod.id, { effortHours: Number(e.target.value) })}
                              className="w-16 bg-transparent font-semibold text-slate-800 hover:bg-slate-100 rounded px-1.5 py-1 text-xs"
                            />
                          </td>

                          {/* Priority */}
                          <td className="py-3 px-3">
                            <select
                              value={mod.priority}
                              onChange={(e) => handleUpdateModule(mod.id, { priority: e.target.value })}
                              className="bg-transparent font-bold text-[10px] hover:bg-slate-100 rounded px-1.5 py-1 cursor-pointer"
                            >
                              <option value="Critical">Critical</option>
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                          </td>

                          {/* Delete */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteModule(mod.id)}
                              className="text-slate-300 hover:text-rose-600 transition p-1 cursor-pointer"
                              title="Delete module"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{saveError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  ← Re-analyze Document
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAndSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Saving Project & Tasks to Database...</span>
                      </>
                    ) : (
                      <>
                        <span>🚀</span>
                        <span>Confirm & Initialize Project in Database</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateProjectSrsModal;
