import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RouterProvider, useRouter } from './router/Router';
import LoginPage from './pages/LoginPage';
import SimpleDashboard from './pages/SimpleDashboard';

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const { currentPath, navigate } = useRouter();

  // Redirect authenticated users to their corresponding dashboard
  useEffect(() => {
    if (!loading && user) {
      if (currentPath === '/login' || currentPath === '/register' || currentPath === '/' || currentPath === '') {
        if (user.role === 'project_manager') {
          navigate('/dashboard/pm');
        } else {
          navigate('/dashboard/developer');
        }
      }
    }
  }, [user, loading, currentPath, navigate]);

  // Loading state while checking HTTP-only cookie session
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-medium text-slate-500">Checking Session...</p>
      </div>
    );
  }

  // Project Manager Dashboard
  if (currentPath.startsWith('/dashboard/pm') || currentPath === '/pm') {
    if (!user) {
      return <LoginPage />;
    }
    return <SimpleDashboard expectedRole="project_manager" />;
  }

  // Developer Dashboard
  if (currentPath.startsWith('/dashboard/developer') || currentPath === '/developer') {
    if (!user) {
      return <LoginPage />;
    }
    return <SimpleDashboard expectedRole="developer" />;
  }

  // Default to Login/Register page
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
