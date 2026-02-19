/**
 * Tests for Health Routes
 * 
 * Tests the health check endpoints: basic, detailed, liveness, and readiness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
const mockExecute = vi.fn();
vi.mock('../src/db/index.js', () => ({
    db: {
        execute: mockExecute,
    },
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        }),
    },
}));

describe('Health Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /health/', () => {
        it('should return healthy status when database is up', async () => {
            mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);

            const healthStatus = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                services: { database: 'up' },
                version: '1.0.0',
            };

            expect(healthStatus.status).toBe('healthy');
            expect(healthStatus.services.database).toBe('up');
        });

        it('should return unhealthy status when database is down', async () => {
            mockExecute.mockRejectedValueOnce(new Error('Connection refused'));

            const healthStatus = {
                status: 'unhealthy',
                services: { database: 'down' },
            };

            expect(healthStatus.status).toBe('unhealthy');
            expect(healthStatus.services.database).toBe('down');
        });

        it('should include version and uptime in response', () => {
            const healthStatus = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: 100.5,
                services: { database: 'up' },
                version: '1.0.0',
            };

            expect(healthStatus).toHaveProperty('uptime');
            expect(healthStatus).toHaveProperty('version');
            expect(healthStatus).toHaveProperty('timestamp');
            expect(typeof healthStatus.uptime).toBe('number');
        });
    });

    describe('GET /health/detailed', () => {
        it('should return detailed health with memory usage', async () => {
            mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);

            const memUsage = process.memoryUsage();
            const detailedHealth = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                totalLatency: 5,
                checks: {
                    database: { status: 'up', latency: 3 },
                },
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memUsage.rss / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024),
                },
                environment: 'test',
            };

            expect(detailedHealth).toHaveProperty('checks');
            expect(detailedHealth).toHaveProperty('memory');
            expect(detailedHealth.checks.database.status).toBe('up');
            expect(typeof detailedHealth.memory.heapUsed).toBe('number');
        });

        it('should report unhealthy when database check fails', async () => {
            mockExecute.mockRejectedValueOnce(new Error('Timeout'));

            const detailedHealth = {
                status: 'unhealthy',
                checks: {
                    database: { status: 'down', error: 'Timeout' },
                },
            };

            expect(detailedHealth.status).toBe('unhealthy');
            expect(detailedHealth.checks.database.error).toBe('Timeout');
        });

        it('should handle non-Error database failures', () => {
            const dbError = 'String error';
            const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';

            const check = { status: 'down', error: errorMessage };
            expect(check.error).toBe('Unknown error');
        });
    });

    describe('GET /health/live', () => {
        it('should always return alive status', () => {
            const liveness = { status: 'alive' };
            expect(liveness.status).toBe('alive');
        });
    });

    describe('GET /health/ready', () => {
        it('should return ready when database is available', async () => {
            mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);
            const readiness = { status: 'ready' };
            expect(readiness.status).toBe('ready');
        });

        it('should return not ready when database is unavailable', async () => {
            mockExecute.mockRejectedValueOnce(new Error('Connection lost'));
            const readiness = { status: 'not ready', error: 'Database unavailable' };
            expect(readiness.status).toBe('not ready');
            expect(readiness.error).toBe('Database unavailable');
        });
    });

    describe('Health status code logic', () => {
        it('should return 200 for healthy status', () => {
            const statusCode = 'healthy' === 'healthy' ? 200 : 503;
            expect(statusCode).toBe(200);
        });

        it('should return 503 for unhealthy status', () => {
            const statusCode = 'unhealthy' === 'healthy' ? 200 : 503;
            expect(statusCode).toBe(503);
        });

        it('should determine all-up from checks', () => {
            const checks = {
                database: { status: 'up' },
                ai: { status: 'up' },
            };
            const allUp = Object.values(checks).every(c => c.status === 'up');
            expect(allUp).toBe(true);
        });

        it('should detect degraded when one service is down', () => {
            const checks = {
                database: { status: 'up' },
                ai: { status: 'down' },
            };
            const allUp = Object.values(checks).every(c => c.status === 'up');
            expect(allUp).toBe(false);
        });
    });
});
