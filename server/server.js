import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './database/db.js';
import { cookieParserMiddleware } from './middlewares/authMiddleware.js';
import authRoutes from './router/authRoutes.js';
import projectRoutes from './router/projectRoutes.js';
import taskRoutes from './router/taskRoutes.js';
import invitationRoutes from './router/invitationRoutes.js';
import userRoutes from './router/userRoutes.js';
import aiRoutes from './router/aiRoutes.js';
import { validateAiConfig, getSafeAiStatus } from './config/ai.config.js';
// Seed imports removed — DB is source of truth. Use scripts/reset_and_seed.mjs to seed manually.

// Load environment variables
dotenv.config();

// Validate AI configuration on initialization
try {
  validateAiConfig();
} catch (cfgErr) {
  console.warn('[AI Config Warning]', cfgErr.message);
}

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ─── Dynamic CORS Configuration (EC2 & Multi-Origin Resilient) ───────────────
const getConfiguredOrigins = () => {
  const rawList = [
    process.env.CLIENT_URL,
    process.env.ALLOWED_ORIGINS,
    process.env.CORS_ORIGIN,
  ]
    .filter(Boolean)
    .flatMap((val) => String(val).split(','))
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return new Set([
    ...rawList,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:80',
    'http://localhost',
    'http://127.0.0.1',
  ]);
};

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Direct API calls, curl, postman, server-to-server

  const normalized = origin.trim().replace(/\/+$/, '');
  const allowed = getConfiguredOrigins();

  // 1. Explicit configured match or wildcard
  if (allowed.has(normalized) || allowed.has('*') || process.env.CORS_ALLOW_ALL === 'true') {
    return true;
  }

  // 2. Non-production environments allow all web origins
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  // 3. Localhost and loopback IPs on any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(normalized)) {
    return true;
  }

  // 4. EC2 / Cloud / Network IPv4 addresses on any port (e.g. http://54.210.12.34, http://172.31.69.3:5173, etc.)
  if (/^https?:\/\/(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?$/.test(normalized)) {
    return true;
  }

  // 5. AWS EC2 domains (e.g. *.compute.amazonaws.com, *.compute-1.amazonaws.com, *.elb.amazonaws.com)
  if (/^https?:\/\/([a-zA-Z0-9-]+\.)*(amazonaws\.com|compute\.internal|elasticbeanstalk\.com)(?::[0-9]+)?$/.test(normalized)) {
    return true;
  }

  // 6. Valid web origin fallback (ensures legitimate deployed hosts are never blocked)
  return /^https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(normalized);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParserMiddleware);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const isTest = process.env.NODE_ENV === 'test';
  const isDbConnected = mongoose.connection.readyState === 1;
  const isHealthy = isTest || isDbConnected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    database: isDbConnected ? 'connected' : (isTest ? 'test_mocked' : 'disconnected'),
    timestamp: new Date().toISOString(),
    service: 'TaskForge AI Server',
    version: '2.0.0',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[TaskForge Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
export const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`TaskForge AI Server v2.0 running on port ${PORT}`);
      console.log(`Auth    → http://localhost:${PORT}/api/auth`);
      console.log(`Projects→ http://localhost:${PORT}/api/projects`);
      console.log(`Tasks   → http://localhost:${PORT}/api/tasks`);
      console.log(`Users   → http://localhost:${PORT}/api/users`);
      console.log(`AI      → http://localhost:${PORT}/api/ai/status`);
      console.log(`AI Engine → Active: ${getSafeAiStatus().activeProvider}`);
      console.log(`Health  → http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    app.listen(PORT, () => {
      console.log(`TaskForge AI Server running in fallback mode on port ${PORT}`);
    });
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
