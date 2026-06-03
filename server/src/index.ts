import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import 'dotenv/config';

// Config
import { loadEnv, getEnv } from './config/env.js';

// Validate environment variables before anything else
loadEnv();
const env = getEnv();

// Routes
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import sessionRoutes from './routes/sessions.js';
import paperRoutes from './routes/papers.js';
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import groupPapersRoutes from './routes/groupPapers.js';
import reportsRoutes from './routes/reports.js';
import recommendationsRoutes from './routes/recommendations.js';

// Middleware
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { correlationId } from './middleware/correlationId.js';
import { initializeSocket } from './socket/index.js';

// Swagger / OpenAPI
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

// Utils
import logger from './utils/logger.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:3000'],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration
const allowedHttpOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  process.env.CLIENT_URL || 'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedHttpOrigins.includes(origin)) return callback(null, true);
    try {
      const clientHost = new URL(process.env.CLIENT_URL || 'http://localhost:3000').hostname;
      const reqHost = new URL(origin).hostname;
      if (reqHost === clientHost) return callback(null, true);
    } catch { /* invalid URL, fall through */ }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
}));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Correlation ID for cross-service tracing
app.use(correlationId);

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Health check routes (no rate limiting)
app.use('/health', healthRoutes);

// Swagger UI (no rate limiting)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'OpenResearch API Docs',
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups', groupPapersRoutes); // Group papers and AI features
app.use('/api/sessions', sessionRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/recommendations', recommendationsRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = env.PORT;

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📡 Socket.IO ready for connections`);
  logger.info(`🌍 Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, io };
