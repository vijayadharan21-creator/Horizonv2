import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './database/db.js';
import { cookieParserMiddleware } from './middlewares/authMiddleware.js';
import authRoutes from './router/authRoutes.js';
import { seedDefaultUsers } from './controllers/authController.js';

// Load environment variables (.env / .env.dev)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        CLIENT_URL,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev mode
    },
    credentials: true, // Crucial for receiving and setting HTTP-only cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParserMiddleware);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TaskForge AI Auth Service',
    dualTokenSupported: true,
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[TaskForge Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Initialize server and database
export const startServer = async () => {
  try {
    await connectDB();
    await seedDefaultUsers();

    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`TaskForge AI Server running on port ${PORT}`);
      console.log(`Auth endpoints available at http://localhost:${PORT}/api/auth`);
      console.log(`Health check at http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    // Still listen so health or status can be inspected if DB connection has network issues
    app.listen(PORT, () => {
      console.log(`TaskForge AI Server running in fallback mode on port ${PORT}`);
    });
  }
};

// Auto-start when not running in unit test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
