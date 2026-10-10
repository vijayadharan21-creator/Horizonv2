import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { invitationsApi } from '../api/index.js';

/**
 * InviteAcceptPage
 * Shown when a developer visits /invite/accept?token=xxx
 * Calls the backend to accept the invitation, then redirects to dashboard.
 */
const InviteAcceptPage = () => {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error' | 'needs-login'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid invitation link — no token found.');
      return;
    }

    if (loading) return; // Wait for auth check

    if (!user) {
      // Not logged in — redirect to login, then come back
      setStatus('needs-login');
      setMessage('Please sign in to accept this invitation.');
      return;
    }

    // Try to accept
    const accept = async () => {
      try {
        const res = await invitationsApi.accept(token);
        if (res.success) {
          setStatus('success');
          setMessage(res.message || 'Invitation accepted!');
          setTimeout(() => navigate('/dashboard'), 2000);
        } else {
          setStatus('error');
          setMessage(res.message || 'Failed to accept invitation.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Failed to accept invitation.');
      }
    };

    accept();
  }, [user, loading]);

  const handleLoginRedirect = () => {
    const token = new URLSearchParams(window.location.search).get('token');
    navigate('/login');
    // Store the invite token so we can redirect back after login
    if (token) sessionStorage.setItem('tf_invite_token', token);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl max-w-sm w-full text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold text-xl shadow-lg shadow-blue-500/25 mb-4">
          TF
        </div>

        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-semibold text-slate-700">Processing invitation...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">You're in!</h2>
            <p className="text-sm text-slate-500">{message}</p>
            <p className="text-xs text-slate-400 mt-2">Redirecting to dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Invitation Error</h2>
            <p className="text-sm text-slate-500">{message}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'needs-login' && (
          <>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Sign In Required</h2>
            <p className="text-sm text-slate-500 mb-4">{message}</p>
            <button
              onClick={handleLoginRedirect}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Sign In to Accept
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default InviteAcceptPage;
