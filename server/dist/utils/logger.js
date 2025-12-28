import pino from 'pino';
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
export const logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
    },
    base: isProduction ? { pid: process.pid } : undefined,
});
// Create child loggers for different contexts
export const dbLogger = logger.child({ context: 'database' });
export const authLogger = logger.child({ context: 'auth' });
export const socketLogger = logger.child({ context: 'socket' });
export const aiLogger = logger.child({ context: 'ai' });
// Request logging helper
export const logRequest = (req, userId) => {
    logger.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId,
    }, 'Request received');
};
// Error logging helper
export const logError = (error, context) => {
    logger.error({
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
        ...context,
    }, 'Error occurred');
};
export default logger;
//# sourceMappingURL=logger.js.map