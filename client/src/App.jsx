import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RouterProvider, useRouter } from './router/Router';
import LoginPage from './pages/LoginPage';
import DeveloperDashboard from './pages/DeveloperDashboard';
import InviteAcceptPage from './pages/InviteAcceptPage';

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const { currentPath, navigate } = useRouter();

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (!loading && user) {
      if (
        currentPath === '/login' ||
        currentPath === '/register' ||
        currentPath === '/' ||
        currentPath === ''
      ) {
        // If there's a pending invite token, go accept it
        const pendingToken = sessionStorage.getItem('tf_invite_token');
        if (pendingToken) {
          sessionStorage.removeItem('tf_invite_token');
          navigate(`/invite/accept?token=${pendingToken}`);
        } else {
          navigate('/dashboard');
        }
      }
    } else if (!loading && !user) {
      if (
        currentPath.startsWith('/dashboard') ||
        currentPath === '/pm' ||
        currentPath === '/developer'
      ) {
        navigate('/login');
      }
    }
  }, [user, loading, currentPath, navigate]);

  // Loading spinner while verifying session
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-700">
        <div className="w-9 h-9 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-semibold text-slate-500">Verifying session...</p>
      </div>
    );
  }

  // Invitation accept page (works for both logged-in and guest users)
  if (currentPath.startsWith('/invite/accept')) {
    return <InviteAcceptPage />;
  }

  // Dashboard routes (PM and Developer both use DeveloperDashboard — role-aware internally)
  if (
    currentPath.startsWith('/dashboard') ||
    currentPath === '/developer' ||
    currentPath === '/pm'
  ) {
    if (!user) return <LoginPage />;
    return <DeveloperDashboard />;
  }

  // Default: Login / Register
  return <LoginPage />;
};

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  );
}

export default App;
