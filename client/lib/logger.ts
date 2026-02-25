/**
 * Lightweight structured frontend logger.
 *
 * In production, swap the console transport for a remote endpoint
 * (e.g. Sentry, Datadog, custom `/api/client-errors`).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    timestamp: string;
    url?: string;
}

const IS_DEV = process.env.NODE_ENV !== 'production';

function buildEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
): LogEntry {
    return {
        level,
        message,
        context,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
}

function emit(entry: LogEntry) {
    // In development, log to console with colors
    if (IS_DEV) {
        const consoleFn = entry.level === 'error'
            ? console.error
            : entry.level === 'warn'
                ? console.warn
                : console.log;

        consoleFn(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.context ?? '');
        return;
    }

    // In production, batch and send to a remote endpoint
    // Placeholder: queue entries and flush periodically
    try {
        if (entry.level === 'error' || entry.level === 'warn') {
            // Could POST to /api/client-errors here
            console.error(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.context);
        }
    } catch {
        // Logging should never throw
    }
}

export const logger = {
    debug: (message: string, context?: Record<string, unknown>) =>
        emit(buildEntry('debug', message, context)),

    info: (message: string, context?: Record<string, unknown>) =>
        emit(buildEntry('info', message, context)),

    warn: (message: string, context?: Record<string, unknown>) =>
        emit(buildEntry('warn', message, context)),

    error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
        const errorContext: Record<string, unknown> = { ...context };
        if (error instanceof Error) {
            errorContext.errorName = error.name;
            errorContext.errorMessage = error.message;
            errorContext.stack = error.stack;
        }
        emit(buildEntry('error', message, errorContext));
    },
};
