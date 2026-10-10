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
import { seedDefaultUsers } from './controllers/authController.js';
import { seedDemoData } from './database/seed.js';

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

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        CLIENT_URL,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://localhost',
      ];
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

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
    await seedDefaultUsers();
    await seedDemoData();

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
