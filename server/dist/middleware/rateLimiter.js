import rateLimit from 'express-rate-limit';
// Rate limiter for authentication endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 1000 : 100, // 100 attempts in production, 1000 in dev
    message: {
        error: 'Too many authentication attempts, please try again later',
        retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
});
// Rate limiter for general API endpoints
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per windowMs
    message: {
        error: 'Too many requests, please try again later',
        retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiter for search endpoints
export const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: {
        error: 'Search rate limit exceeded, please slow down',
        retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimiter.js.map