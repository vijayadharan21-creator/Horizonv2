import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';

export const LoginPage = () => {
  const { login, register, error: authError, setError } = useAuth();
  const { navigate } = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [role, setRole] = useState('project_manager'); // 'project_manager' or 'developer'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('pm@taskforge.ai');
  const [password, setPassword] = useState('Password@123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  // Role toggle
  const handleRoleChange = (selectedRole) => {
    setRole(selectedRole);
    setLocalError('');
    setError(null);
    if (!isRegisterMode) {
      if (selectedRole === 'project_manager') {
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
      if (role === 'project_manager') {
        setEmail('pm@taskforge.ai');
        setPassword('Password@123');
      } else {
        setEmail('dev@taskforge.ai');
        setPassword('Password@123');
      }
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
          role,
        });
      } else {
        result = await login({
          email: email.trim(),
          password,
          role,
        });
      }

      if (result.success && result.user) {
        // Redirect to role dashboard
        if (result.user.role === 'project_manager') {
          navigate('/dashboard/pm');
        } else {
          navigate('/dashboard/developer');
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* App Title & Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-xl shadow-lg shadow-blue-500/20 mb-3">
            TF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            TaskForge AI
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Collaborative Task Allocation System
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-slate-200 mb-6 pb-2">
            <button
              type="button"
              onClick={() => handleModeToggle(false)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-2 transition-colors cursor-pointer ${
                !isRegisterMode
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle(true)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-2 transition-colors cursor-pointer ${
                isRegisterMode
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Register
            </button>
          </div>

          {/* Role Picker (Project Manager or Developer) */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Select Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleRoleChange('project_manager')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition cursor-pointer ${
                  role === 'project_manager'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 font-semibold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>📊</span>
                <span>Project Manager</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('developer')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition cursor-pointer ${
                  role === 'developer'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 font-semibold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>💻</span>
                <span>Developer</span>
              </button>
            </div>
          </div>

          {/* Quick Demo Fill (for Sign In mode) */}
          {!isRegisterMode && (
            <div className="mb-4 flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-600">
                Demo Account: <strong className="text-blue-700 capitalize">{role.replace('_', ' ')}</strong>
              </span>
              <button
                type="button"
                onClick={() => handleRoleChange(role)}
                className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
              >
                Auto-Fill
              </button>
            </div>
          )}

          {/* Error Message */}
          {(localError || authError) && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
              {localError || authError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@taskforge.ai"
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition shadow-sm cursor-pointer"
            >
              {isSubmitting
                ? 'Processing...'
                : isRegisterMode
                ? `Create ${role === 'project_manager' ? 'PM' : 'Developer'} Account`
                : `Sign In as ${role === 'project_manager' ? 'Project Manager' : 'Developer'}`}
            </button>
          </form>

          {/* Dual-Token Cookie Note */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
            🔒 Secured with Dual-Token HTTP-Only Cookies
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
