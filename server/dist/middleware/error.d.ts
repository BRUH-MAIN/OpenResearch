import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    code?: string;
    details?: unknown;
    constructor(message: string, statusCode?: number, code?: string, details?: unknown);
}
export declare const errorHandler: (err: Error | AppError, req: Request, res: Response, next: NextFunction) => void;
export declare const notFoundHandler: (req: Request, res: Response) => void;
export declare const createError: (message: string, statusCode: number, code?: string, details?: unknown) => AppError;
//# sourceMappingURL=error.d.ts.map