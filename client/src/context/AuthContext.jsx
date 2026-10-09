import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check existing session via HTTP-only cookie on mount
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authApi.getMe();
      if (res.success && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Register handler
  const register = async (userData) => {
    try {
      setError(null);
      const res = await authApi.register(userData);
      if (res.success && res.user) {
        setUser(res.user);
        return { success: true, user: res.user };
      }
      throw new Error(res.message || 'Registration failed');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  // Login handler
  const login = async (credentials) => {
    try {
      setError(null);
      const res = await authApi.login(credentials);
      if (res.success && res.user) {
        setUser(res.user);
        return { success: true, user: res.user };
      }
      throw new Error(res.message || 'Login failed');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  // Session refresh test
  const refreshSession = async () => {
    try {
      const res = await authApi.refresh();
      if (res.success && res.user) {
        setUser(res.user);
        return { success: true, message: 'Tokens refreshed' };
      }
      return { success: false, message: 'Refresh unsuccessful' };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Failed to refresh token',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        setError,
        register,
        login,
        logout,
        refreshSession,
        checkAuth,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
