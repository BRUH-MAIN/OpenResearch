import { Router } from 'express';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
  };
  version?: string;
}

// Basic health check
router.get('/', async (req, res) => {
  const startTime = Date.now();
  let dbStatus: 'up' | 'down' = 'down';

  try {
    // Check database connectivity
    await db.execute(sql`SELECT 1`);
    dbStatus = 'up';
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  const healthStatus: HealthStatus = {
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
    },
    version: process.env.npm_package_version || '1.0.0',
  };

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// Detailed health check (for internal monitoring)
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = {
      status: 'up',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  
  // Check if any service is down
  const allUp = Object.values(checks).every((c) => c.status === 'up');

  res.status(allUp ? 200 : 503).json({
    status: allUp ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    totalLatency: Date.now() - startTime,
    checks,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    environment: process.env.NODE_ENV,
  });
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: 'Database unavailable' });
  }
});

export default router;
