import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import 'dotenv/config';

// Config
import { loadEnv, getEnv } from './config/env.js';
import { corsOriginHandler } from './config/cors.js';

// Validate environment variables before anything else
loadEnv();
const env = getEnv();

// Routes
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import sessionRoutes from './routes/sessions.js';
import paperRoutes from './routes/papers.js';
import healthRoutes from './routes/health.js';
import groupPapersRoutes from './routes/groupPapers.js';
import reportsRoutes from './routes/reports.js';

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
      connectSrc: ["'self'", env.CLIENT_URL],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration (shared origin check with Socket.IO)
app.use(cors({
  origin: corsOriginHandler,
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
app.use('/api/reports', reportsRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server. Integration tests import `app` directly and drive it with
// supertest, so binding a port there would be pointless (and would collide).
const PORT = env.PORT;

if (env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📡 Socket.IO ready for connections`);
    logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  });
}

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
