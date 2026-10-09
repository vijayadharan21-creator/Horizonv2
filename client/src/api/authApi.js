import axios from 'axios';

// Base API client with credentials enabled so HTTP-only cookies are passed automatically
const api = axios.create({
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to keep access token in memory for Bearer fallback alongside cookies
export const setBearerToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor to auto-refresh access token on 401 TOKEN_EXPIRED
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token) {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await api.post('/api/auth/refresh');
        const newToken = refreshRes.data?.accessToken;
        if (newToken) {
          setBearerToken(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        }
        processQueue(null, newToken);
        isRefreshing = false;
        return api(originalRequest);
      } catch (refreshError) {
        setBearerToken(null);
        processQueue(refreshError, null);
        isRefreshing = false;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  // Register with full explicit /api/auth path
  register: async (userData) => {
    const response = await api.post('/api/auth/register', userData);
    if (response.data?.accessToken) {
      setBearerToken(response.data.accessToken);
    }
    return response.data;
  },

  // Login with full explicit /api/auth path
  login: async (credentials) => {
    const response = await api.post('/api/auth/login', credentials);
    if (response.data?.accessToken) {
      setBearerToken(response.data.accessToken);
    }
    return response.data;
  },

  // Refresh dual tokens
  refresh: async () => {
    const response = await api.post('/api/auth/refresh');
    if (response.data?.accessToken) {
      setBearerToken(response.data.accessToken);
    }
    return response.data;
  },

  // Logout (clears HTTP-only cookies and in-memory token)
  logout: async () => {
    try {
      const response = await api.post('/api/auth/logout');
      return response.data;
    } finally {
      setBearerToken(null);
    }
  },

  // Get current user profile
  getMe: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  // Demo accounts
  getDemoAccounts: async () => {
    const response = await api.get('/api/auth/demo-accounts');
    return response.data;
  },

  // Role verification endpoints
  getPmData: async () => {
    const response = await api.get('/api/auth/pm-dashboard');
    return response.data;
  },

  getDevData: async () => {
    const response = await api.get('/api/auth/dev-dashboard');
    return response.data;
  },
};

export default api;
