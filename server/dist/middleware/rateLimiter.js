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
    max: 2000, // Increased for testing to avoid 429
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
// Rate limiter for AI chat / Q&A endpoints (60 req/min)
export const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 300 : 60,
    message: {
        error: 'Chat rate limit exceeded, please slow down',
        retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiter for summarization endpoints (10 req/min)
export const summarizeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 100 : 10,
    message: {
        error: 'Summarization rate limit exceeded, please try again shortly',
        retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiter for agentic / deep-research tasks (5 req/min)
export const agenticLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 50 : 5,
    message: {
        error: 'Agentic task rate limit exceeded, please wait before submitting another task',
        retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiter for report generation (5 req/hr)
export const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 50 : 5,
    message: {
        error: 'Report generation rate limit exceeded, please try again later',
        retryAfter: '1 hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimiter.js.map