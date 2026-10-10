import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';

export const LoginPage = () => {
  const { login, register, error: authError, setError } = useAuth();
  const { navigate } = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [selectedRole, setSelectedRole] = useState('developer'); // 'developer' or 'project_manager'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('dev@taskforge.ai');
  const [password, setPassword] = useState('Password@123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setLocalError('');
    setError(null);
    if (!isRegisterMode) {
      if (role === 'project_manager') {
        setEmail('pm@taskforge.ai');
        setPassword('Password@123');
      } else {
        setEmail('dev@taskforge.ai');
        setPassword('Password@123');
      }
    }
  };

  const handleModeToggle = (registerMode) => {
    setIsRegisterMode(registerMode);
    setLocalError('');
    setError(null);
    if (registerMode) {
      setName('');
      setEmail('');
      setPassword('');
    } else {
      handleRoleSelect(selectedRole);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setError(null);

    if (isRegisterMode && !name.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      let result;
      if (isRegisterMode) {
        result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          role: selectedRole,
        });
      } else {
        result = await login({
          email: email.trim(),
          password,
        });
      }

      if (result.success && result.user) {
        // Check for a pending invite token (set when user was redirected from /invite/accept)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 text-slate-800 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background soft blue glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-sky-400/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* App Title & Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold text-2xl shadow-lg shadow-blue-500/25 mb-3">
            TF
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-1.5">
            <span>TaskForge</span>
            <span className="text-blue-600">AI</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Collaborative Task Allocation & Scheduling System
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-slate-200 mb-5 pb-1">
            <button
              type="button"
              onClick={() => handleModeToggle(false)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-1 transition-colors cursor-pointer ${
                !isRegisterMode
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle(true)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-1 transition-colors cursor-pointer ${
                isRegisterMode
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Register
            </button>
          </div>

          {/* Role Picker (Developer vs Project Manager) */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Select Workspace Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleRoleSelect('developer')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${
                  selectedRole === 'developer'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span>Developer</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('project_manager')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${
                  selectedRole === 'project_manager'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Project Manager</span>
              </button>
            </div>
          </div>

          {/* Quick Demo Pill */}
          {!isRegisterMode && (
            <div className="mb-4 flex items-center justify-between text-xs px-3.5 py-2 bg-blue-50/80 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                <span className="text-slate-700">
                  Demo Account: <strong className="text-blue-700 capitalize">{selectedRole.replace('_', ' ')}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRoleSelect(selectedRole)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                Auto-Fill
              </button>
            </div>
          )}

          {/* Error Message */}
          {(localError || authError) && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {localError || authError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegisterMode && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedRole === 'project_manager' ? 'Sarah Jenkins' : 'Alex Rivera'}
                  required
                  className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={selectedRole === 'project_manager' ? 'pm@taskforge.ai' : 'dev@taskforge.ai'}
                required
                className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/25 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </>
              ) : isRegisterMode ? (
                `Create ${selectedRole === 'project_manager' ? 'Project Manager' : 'Developer'} Account`
              ) : (
                `Sign In as ${selectedRole === 'project_manager' ? 'Project Manager' : 'Developer'}`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
