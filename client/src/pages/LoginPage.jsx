import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';

/* ─── role-specific skill suggestions ─────────────────────────────────────── */
const ROLE_SKILLS = {
  developer: {
    primary: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#',
      'React', 'Vue.js', 'Angular', 'Node.js', 'FastAPI', 'Spring Boot', 'Django',
      'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'GraphQL',
      'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
    ],
    sub: [
      'React Hooks', 'Redux', 'REST APIs', 'GraphQL', 'Microservices',
      'CI/CD', 'Docker Compose', 'Jest', 'Cypress', 'Playwright',
      'Tailwind CSS', 'Responsive Design', 'WebSockets', 'OAuth2',
      'Mongoose', 'SQLAlchemy', 'JPA', 'Spring Security', 'Express Middleware',
      'EC2', 'S3', 'Lambda', 'EKS', 'Prometheus', 'Pytest', 'JUnit',
    ],
  },
  project_manager: {
    primary: [
      'Project Planning', 'Resource Allocation', 'Sprint Planning', 'Risk Management',
      'Agile', 'Scrum', 'Kanban', 'Stakeholder Management', 'Roadmapping',
      'Budget Management', 'Team Leadership', 'Product Management',
    ],
    sub: [
      'JIRA', 'Confluence', 'Trello', 'Asana', 'Monday.com',
      'OKR Setting', 'Capacity Planning', 'Retrospectives', 'Backlog Grooming',
      'User Story Mapping', 'Risk Assessment', 'Change Management',
      'KPI Tracking', 'Velocity Metrics', 'Release Planning',
    ],
  },
};

/* ─── small chip component ───────────────────────────────────────────────── */
const Chip = ({ label, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
      selected
        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-400/30'
        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
    }`}
  >
    {label}
  </button>
);

/* ─── tag input for custom skill entry ──────────────────────────────────── */
const TagInput = ({ tags, onAdd, onRemove, placeholder, color = 'blue' }) => {
  const [val, setVal] = useState('');

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed);
    setVal('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !val && tags.length) onRemove(tags[tags.length - 1]);
  };

  const colors = {
    blue:   { tag: 'bg-blue-100 text-blue-800 border-blue-200',   x: 'text-blue-400 hover:text-blue-700' },
    violet: { tag: 'bg-violet-100 text-violet-800 border-violet-200', x: 'text-violet-400 hover:text-violet-700' },
  };
  const c = colors[color];

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-slate-50/60 min-h-[44px] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition">
      {tags.map((t) => (
        <span key={t} className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${c.tag}`}>
          {t}
          <button type="button" onClick={() => onRemove(t)} className={`leading-none ${c.x} cursor-pointer`}>×</button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : 'Add more…'}
        className="flex-1 min-w-[100px] bg-transparent text-xs text-slate-800 outline-none placeholder-slate-400"
      />
    </div>
  );
};

/* ═══════════════════════════ MAIN PAGE ══════════════════════════════════════ */
export const LoginPage = () => {
  const { login, register, error: authError, setError } = useAuth();
  const { navigate } = useRouter();

  /* ── mode / step state ── */
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [step, setStep]                     = useState(1); // 1 = credentials, 2 = skills

  /* ── shared fields ── */
  const [selectedRole, setSelectedRole] = useState('developer');
  const [name, setName]                 = useState('');
  const [email, setEmail]               = useState('dev@taskforge.ai');
  const [password, setPassword]         = useState('Password@123');

  /* ── skills step ── */
  const [primarySkills, setPrimarySkills] = useState([]);
  const [subSkills, setSubSkills]         = useState([]);

  /* ── ui state ── */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError]     = useState('');
  const [showPw, setShowPw]             = useState(false);

  /* ── helpers ── */
  const clearErrors = () => { setLocalError(''); setError?.(null); };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    clearErrors();
    if (!isRegisterMode) {
      setEmail(role === 'project_manager' ? 'pm@taskforge.ai' : 'dev@taskforge.ai');
      setPassword('Password@123');
    }
  };

  const handleModeToggle = (registerMode) => {
    setIsRegisterMode(registerMode);
    setStep(1);
    setPrimarySkills([]);
    setSubSkills([]);
    clearErrors();
    if (registerMode) { setName(''); setEmail(''); setPassword(''); }
    else { handleRoleSelect(selectedRole); }
  };

  /* ── step 1 → step 2 ── */
  const handleNextStep = (e) => {
    e.preventDefault();
    clearErrors();
    if (!name.trim())    { setLocalError('Please enter your full name.');  return; }
    if (!email.trim())   { setLocalError('Please enter your email.');      return; }
    if (password.length < 6) { setLocalError('Password must be at least 6 characters.'); return; }
    setStep(2);
  };

  /* ── skill chip toggles ── */
  const togglePrimary = (s) => setPrimarySkills(ps =>
    ps.includes(s) ? ps.filter(x => x !== s) : [...ps, s]
  );
  const toggleSub = (s) => setSubSkills(ss =>
    ss.includes(s) ? ss.filter(x => x !== s) : [...ss, s]
  );

  /* ── final submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();

    if (isRegisterMode) {
      if (primarySkills.length === 0) {
        setLocalError('Please add at least one primary skill.');
        return;
      }
    } else {
      if (!email.trim() || !password) { setLocalError('Please enter both email and password.'); return; }
    }

    setIsSubmitting(true);
    try {
      let result;
      if (isRegisterMode) {
        result = await register({
          name:      name.trim(),
          email:     email.trim(),
          password,
          role:      selectedRole,
          skills:    primarySkills,
          subSkills: subSkills,
        });
      } else {
        result = await login({ email: email.trim(), password });
      }

      if (result.success && result.user) {
        const pendingToken = sessionStorage.getItem('tf_invite_token');
        if (pendingToken) {
          sessionStorage.removeItem('tf_invite_token');
          navigate(`/invite/accept?token=${pendingToken}`);
        } else {
          navigate('/dashboard');
        }
      } else {
        setLocalError(result.error || 'Authentication failed.');
      }
    } catch (err) {
      setLocalError(err.message || 'Server connection error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── derived ── */
  const suggestions = ROLE_SKILLS[selectedRole] || ROLE_SKILLS.developer;
  const roleName = selectedRole === 'project_manager' ? 'Project Manager' : 'Developer';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 text-slate-800 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`w-full relative z-10 transition-all duration-300 ${isRegisterMode && step === 2 ? 'max-w-2xl' : 'max-w-md'}`}>

        {/* App header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold text-2xl shadow-lg shadow-blue-500/25 mb-3">TF</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-1.5">
            <span>TaskForge</span><span className="text-blue-600">AI</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Collaborative Task Allocation &amp; Scheduling System</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl">

          {/* Tabs */}
          <div className="flex border-b border-slate-200 mb-5 pb-1">
            {[['Sign In', false], ['Register', true]].map(([label, mode]) => (
              <button
                key={label}
                type="button"
                onClick={() => handleModeToggle(mode)}
                className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-1 transition-colors cursor-pointer ${
                  isRegisterMode === mode ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* Role picker */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Workspace Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['developer',       'Developer',       'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'],
                ['project_manager', 'Project Manager', 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
              ].map(([r, label, d]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRoleSelect(r)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${
                    selectedRole === r
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
                  </svg>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Demo pill (login only) */}
          {!isRegisterMode && (
            <div className="mb-4 flex items-center justify-between text-xs px-3.5 py-2 bg-blue-50/80 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-slate-700">Demo: <strong className="text-blue-700 capitalize">{selectedRole.replace('_', ' ')}</strong></span>
              </div>
              <button type="button" onClick={() => handleRoleSelect(selectedRole)} className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">Auto-Fill</button>
            </div>
          )}

          {/* Step indicator (register only) */}
          {isRegisterMode && (
            <div className="flex items-center gap-2 mb-5">
              {['Account Info', 'Skills'].map((label, i) => {
                const s = i + 1;
                const active  = step === s;
                const done    = step > s;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                        done   ? 'bg-blue-600 border-blue-600 text-white'  :
                        active ? 'border-blue-600 text-blue-600 bg-blue-50' :
                                 'border-slate-300 text-slate-400 bg-white'
                      }`}>
                        {done ? '✓' : s}
                      </div>
                      <span className={`text-[11px] font-semibold ${active ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
                    </div>
                    {i < 1 && <div className="flex-1 h-px bg-slate-200 mx-1" />}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Error */}
          {(localError || authError) && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {localError || authError}
            </div>
          )}

          {/* ══ STEP 1: Credentials form (login + register) ══ */}
          {(!isRegisterMode || step === 1) && (
            <form onSubmit={isRegisterMode ? handleNextStep : handleSubmit} className="space-y-3.5">
              {isRegisterMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={selectedRole === 'project_manager' ? 'Sarah Jenkins' : 'Alex Rivera'}
                    required
                    className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={selectedRole === 'project_manager' ? 'pm@taskforge.ai' : 'dev@taskforge.ai'}
                  required
                  className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••" required
                    className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPw
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={isSubmitting}
                className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/25 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Signing in…</span></>
                  : isRegisterMode
                    ? <span>Next — Add Skills →</span>
                    : `Sign In as ${roleName}`
                }
              </button>
            </form>
          )}

          {/* ══ STEP 2: Skills form ══ */}
          {isRegisterMode && step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Primary Skills */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Primary Skills <span className="text-rose-500">*</span>
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">({primarySkills.length} selected)</span>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">Click to select from suggestions, or type custom skills below.</p>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto">
                  {suggestions.primary.map(s => (
                    <Chip key={s} label={s} selected={primarySkills.includes(s)} onClick={() => togglePrimary(s)} />
                  ))}
                </div>

                {/* Custom tag input */}
                <TagInput
                  tags={primarySkills}
                  onAdd={(s) => setPrimarySkills(ps => [...ps, s])}
                  onRemove={(s) => setPrimarySkills(ps => ps.filter(x => x !== s))}
                  placeholder="Type a custom skill & press Enter…"
                  color="blue"
                />
              </div>

              {/* Sub Skills */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Sub-Skills / Specialisations
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">({subSkills.length} selected — optional)</span>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">Specific technologies or frameworks you're proficient in.</p>

                <div className="flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto">
                  {suggestions.sub.map(s => (
                    <Chip key={s} label={s} selected={subSkills.includes(s)} onClick={() => toggleSub(s)} />
                  ))}
                </div>

                <TagInput
                  tags={subSkills}
                  onAdd={(s) => setSubSkills(ss => [...ss, s])}
                  onRemove={(s) => setSubSkills(ss => ss.filter(x => x !== s))}
                  placeholder="Type a sub-skill & press Enter…"
                  color="violet"
                />
              </div>

              {/* Selected preview */}
              {(primarySkills.length > 0 || subSkills.length > 0) && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 space-y-1">
                  {primarySkills.length > 0 && (
                    <div><span className="font-bold text-blue-600">Primary:</span> {primarySkills.join(', ')}</div>
                  )}
                  {subSkills.length > 0 && (
                    <div><span className="font-bold text-violet-600">Sub-skills:</span> {subSkills.join(', ')}</div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep(1); clearErrors(); }}
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="submit" disabled={isSubmitting || primarySkills.length === 0}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/25 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Creating account…</span></>
                    : `Create ${roleName} Account`
                  }
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
