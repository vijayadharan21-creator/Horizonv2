import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { authApi } from '../api/authApi';

export const SimpleDashboard = ({ expectedRole }) => {
  const { user, logout, refreshSession } = useAuth();
  const { navigate } = useRouter();

  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);
  const [refreshLoading, setRefreshLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (expectedRole && user.role !== expectedRole) {
      navigate(user.role === 'project_manager' ? '/dashboard/pm' : '/dashboard/developer');
    }
  }, [user, expectedRole, navigate]);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleTestApi = async () => {
    setApiLoading(true);
    setApiResponse(null);
    try {
      const data =
        user.role === 'project_manager'
          ? await authApi.getPmData()
          : await authApi.getDevData();
      setApiResponse(data);
    } catch (err) {
      setApiResponse({
        error: true,
        message: err.response?.data?.message || err.message || 'API call failed',
      });
    } finally {
      setApiLoading(false);
    }
  };

  const handleRefreshTokens = async () => {
    setRefreshLoading(true);
    setRefreshMessage(null);
    try {
      const res = await refreshSession();
      setRefreshMessage({
        success: res.success,
        text: res.message || 'Access token refreshed successfully via HTTP-Only cookie',
      });
    } catch (err) {
      setRefreshMessage({
        success: false,
        text: err.message || 'Refresh failed',
      });
    } finally {
      setRefreshLoading(false);
    }
  };

  const isPM = user.role === 'project_manager';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 sticky top-0 z-10 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
              TF
            </div>
            <div>
              <span className="font-bold text-slate-900 text-base">TaskForge AI</span>
              <span className="ml-2 text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {isPM ? 'Project Manager' : 'Developer'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Signed in as <strong className="text-slate-800">{user.name}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isPM ? '📊 Project Manager Dashboard' : '💻 Developer Workspace'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Welcome back, {user.name} ({user.email}). Credentials saved via secure HTTP-Only cookies.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Enterprise Session Active
            </div>
          </div>
        </div>

        {/* Role Content (Simple) */}
        {isPM ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h3 className="font-semibold text-slate-900 text-sm mb-2">Project Overview</h3>
              <p className="text-xs text-slate-500 mb-3">
                Current active project managed by you.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Project Name:</span>
                  <span className="font-medium text-slate-800">TaskForge AI Core</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-blue-600 font-semibold">Active Planning</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Total Tasks:</span>
                  <span className="font-medium text-slate-800">5 Active Tasks</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h3 className="font-semibold text-slate-900 text-sm mb-2">Manager Actions</h3>
              <p className="text-xs text-slate-500 mb-3">
                Key responsibilities assigned to Project Manager role.
              </p>
              <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                <li>Create and configure projects & working calendars</li>
                <li>Approve AI-suggested task proposals & dependencies</li>
                <li>Trigger automated schedule optimization and replanning</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h3 className="font-semibold text-slate-900 text-sm mb-2">Assigned Tasks</h3>
              <p className="text-xs text-slate-500 mb-3">
                Tasks allocated to your developer profile.
              </p>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-800">T2: Backend API & Auth</div>
                    <div className="text-slate-500">Effort: 5h • Priority: High</div>
                  </div>
                  <span className="text-[11px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    In Progress
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h3 className="font-semibold text-slate-900 text-sm mb-2">Developer Responsibilities</h3>
              <p className="text-xs text-slate-500 mb-3">
                Worker role capabilities in TaskForge AI.
              </p>
              <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                <li>View assigned tasks matching required skills</li>
                <li>Report actual progress and remaining hours</li>
                <li>Flag blockers for automated rescheduling</li>
              </ul>
            </div>
          </div>
        )}

        {/* Dual-Token Verification */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                🔒 Dual-Token Cookie Session Controls
              </h4>
              <p className="text-xs text-slate-500">
                Test the HTTP-Only cookie credentials and token refresh mechanism.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestApi}
                disabled={apiLoading}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                {apiLoading ? 'Testing...' : `Test ${isPM ? 'PM' : 'Dev'} API`}
              </button>
              <button
                onClick={handleRefreshTokens}
                disabled={refreshLoading}
                className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {refreshLoading ? 'Refreshing...' : 'Refresh Token'}
              </button>
            </div>
          </div>

          {refreshMessage && (
            <div
              className={`p-3 rounded-lg text-xs mb-3 ${
                refreshMessage.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}
            >
              {refreshMessage.text}
            </div>
          )}

          {apiResponse && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-700 overflow-x-auto">
              <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SimpleDashboard;
