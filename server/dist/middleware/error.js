import logger from '../utils/logger.js';
export class AppError extends Error {
    statusCode;
    isOperational;
    code;
    details;
    constructor(message, statusCode = 500, code, details) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.isOperational = true;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
export const errorHandler = (err, req, res, next) => {
    // Log error with context
    logger.error({
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack,
        },
        request: {
            method: req.method,
            url: req.url,
            ip: req.ip,
        },
    }, 'Request error');
    if (err instanceof AppError) {
        const response = {
            error: err.message,
            code: err.code,
        };
        if (err.details) {
            response.details = err.details;
        }
        if (process.env.NODE_ENV === 'development') {
            response.stack = err.stack;
        }
        res.status(err.statusCode).json(response);
        return;
    }
    // Handle known error types
    if (err.name === 'JsonWebTokenError') {
        res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
        return;
    }
    if (err.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
    }
    if (err.name === 'ValidationError') {
        res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
        return;
    }
    // Generic error response
    const statusCode = 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;
    res.status(statusCode).json({
        error: message,
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
export const notFoundHandler = (req, res) => {
    logger.warn({ method: req.method, url: req.url }, 'Route not found');
    res.status(404).json({
        error: 'Route not found',
        code: 'NOT_FOUND',
        path: req.url,
    });
};
export const createError = (message, statusCode, code, details) => {
    return new AppError(message, statusCode, code, details);
};
// Async error wrapper for route handlers
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
//# sourceMappingURL=error.js.map