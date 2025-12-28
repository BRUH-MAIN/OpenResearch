import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
export declare const dbLogger: pino.Logger<never, boolean>;
export declare const authLogger: pino.Logger<never, boolean>;
export declare const socketLogger: pino.Logger<never, boolean>;
export declare const aiLogger: pino.Logger<never, boolean>;
export declare const logRequest: (req: {
    method: string;
    url: string;
    ip?: string;
}, userId?: string) => void;
export declare const logError: (error: Error, context?: Record<string, unknown>) => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map