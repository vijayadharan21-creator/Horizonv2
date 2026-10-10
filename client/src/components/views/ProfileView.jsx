import React, { useState } from 'react';
import { usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SKILL_SUGGESTIONS = [
  'React', 'Node.js', 'MongoDB', 'Python', 'PostgreSQL', 'TypeScript',
  'GraphQL', 'Docker', 'Kubernetes', 'AWS', 'CI/CD', 'REST APIs',
  'FastAPI', 'Vitest', 'Jest', 'E2E Testing', 'Redis', 'Next.js',
  'Express.js', 'ETL', 'Analytics', 'Database Design', 'Vue.js', 'Angular',
];

const ROLE_LABELS = {
  project_manager: 'Project Manager',
  developer: 'Developer',
};

/* ── Skill pill ────────────────────────────────────────── */
function SkillPill({ label, type, onRemove, editable }) {
  const isPrimary = type === 'primary';
  return (
    <div
      className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition group ${
        isPrimary
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      <span>{isPrimary ? '●' : '○'}</span>
      <span>{label}</span>
      {editable && (
        <button
          type="button"
          onClick={() => onRemove(label)}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-red-500 cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ── Skill Input ────────────────────────────────────────── */
function SkillInput({ onAdd, existing }) {
  const [val, setVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = SKILL_SUGGESTIONS.filter(
    (s) =>
      s.toLowerCase().includes(val.toLowerCase()) &&
      !existing.includes(s)
  );

  const handleAdd = (skill) => {
    if (skill.trim() && !existing.includes(skill.trim())) {
      onAdd(skill.trim());
    }
    setVal('');
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={val}
          onChange={(e) => { setVal(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && val.trim()) handleAdd(val);
            if (e.key === 'Escape') setShowSuggestions(false);
          }}
          placeholder="Type a skill..."
          className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
        />
        <button
          type="button"
          onClick={() => { if (val.trim()) handleAdd(val); }}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition"
        >
          Add
        </button>
      </div>
      {showSuggestions && val.length > 0 && filtered.length > 0 && (
        <div
          className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleAdd(s)}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main ProfileView ───────────────────────────────────── */
export const ProfileView = ({ user, isPM }) => {
  const { checkAuth } = useAuth();
  const defaultName = user?.name || (isPM ? 'Sarah Jenkins' : 'Alex Rivera');
  const defaultEmail = user?.email || (isPM ? 'pm@taskforge.ai' : 'dev@taskforge.ai');

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [name, setName] = useState(defaultName);
  const [email] = useState(defaultEmail);
  const [bio, setBio] = useState(
    isPM
      ? 'Experienced project manager driving agile software teams to deliver on time.'
      : 'Full-stack developer passionate about building scalable, performant web applications.'
  );
  const [department, setDepartment] = useState(isPM ? 'Engineering Management' : 'Software Engineering');
  const [location, setLocation] = useState('Chennai, India');

  // Skills — seed from user.skills if available
  const existingSkills = user?.skills || [];
  const [primarySkills, setPrimarySkills] = useState(
    existingSkills.length > 0
      ? existingSkills.slice(0, Math.ceil(existingSkills.length / 2))
      : isPM
        ? ['Agile', 'Jira', 'Risk Management']
        : ['React', 'Node.js', 'TypeScript']
  );
  const [secondarySkills, setSecondarySkills] = useState(
    existingSkills.length > 0
      ? existingSkills.slice(Math.ceil(existingSkills.length / 2))
      : isPM
        ? ['Scrum', 'Roadmapping', 'Stakeholder Management']
        : ['MongoDB', 'Docker', 'CI/CD']
  );

  const allSkills = [...primarySkills, ...secondarySkills];

  const removePrimary = (skill) => setPrimarySkills((prev) => prev.filter((s) => s !== skill));
  const removeSecondary = (skill) => setSecondarySkills((prev) => prev.filter((s) => s !== skill));

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await usersApi.updateProfile({
        name,
        primarySkills,
        secondarySkills,
      });
      setSaveSuccess(true);
      setEditMode(false);
      // Refresh user in context
      await checkAuth();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const avatarLetters = name ? name.slice(0, 2).toUpperCase() : 'ME';
  const roleLabel = ROLE_LABELS[user?.role] || (isPM ? 'Project Manager' : 'Developer');

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            My Profile
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage your personal profile, skill proficiencies, and preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-600 font-semibold">✓ Saved successfully</span>
          )}
          {saveError && (
            <span className="text-xs text-red-600 font-semibold">{saveError}</span>
          )}
          <button
            type="button"
            onClick={() => (editMode ? handleSave() : setEditMode(true))}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-60 ${
              editMode
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
            }`}
          >
            {saving ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
            ) : editMode ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit Profile
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top Card: Avatar + Name */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-2xl font-extrabold flex items-center justify-center shadow-md shadow-blue-500/25">
            {avatarLetters}
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-500" title="Active"></div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          {editMode ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xl font-extrabold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          ) : (
            <h2 className="text-xl font-extrabold text-slate-900">{name}</h2>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono text-blue-600">{email}</span>
            <span>•</span>
            <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] border ${isPM ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${!isPM ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* About */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
            About
          </div>

          <div className="space-y-3">
            {/* Bio */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bio</label>
              {editMode ? (
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="mt-1 w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              ) : (
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">{bio}</p>
              )}
            </div>

            {/* Department */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Department</label>
              {editMode ? (
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              ) : (
                <div className="mt-1 text-xs text-slate-700">{department}</div>
              )}
            </div>

            {/* Location */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location</label>
              {editMode ? (
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              ) : (
                <div className="mt-1 text-xs text-slate-700 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Skills — Developer only */}
        {!isPM && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
              Skills
            </div>

            {/* Primary Skills */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Primary Skills</span>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[36px]">
                {primarySkills.length === 0 && (
                  <span className="text-[11px] text-slate-400 italic">No primary skills added yet.</span>
                )}
                {primarySkills.map((sk) => (
                  <SkillPill
                    key={sk}
                    label={sk}
                    type="primary"
                    onRemove={removePrimary}
                    editable={editMode}
                  />
                ))}
              </div>
              {editMode && (
                <SkillInput
                  onAdd={(sk) => setPrimarySkills((prev) => [...prev, sk])}
                  existing={allSkills}
                />
              )}
            </div>

            {/* Secondary Skills */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Secondary Skills</span>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[36px]">
                {secondarySkills.length === 0 && (
                  <span className="text-[11px] text-slate-400 italic">No secondary skills added yet.</span>
                )}
                {secondarySkills.map((sk) => (
                  <SkillPill
                    key={sk}
                    label={sk}
                    type="secondary"
                    onRemove={removeSecondary}
                    editable={editMode}
                  />
                ))}
              </div>
              {editMode && (
                <SkillInput
                  onAdd={(sk) => setSecondarySkills((prev) => [...prev, sk])}
                  existing={allSkills}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend Card — Developer only */}
      {!isPM && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-wrap gap-6 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
            <strong>Primary Skills</strong> — Core competencies you are highly proficient in
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span>
            <strong>Secondary Skills</strong> — Supporting skills you can contribute to
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
