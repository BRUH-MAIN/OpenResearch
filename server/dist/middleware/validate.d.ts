import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
export declare const validate: <T extends z.ZodSchema>(schema: T) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateQuery: <T extends z.ZodSchema>(schema: T) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateParams: <T extends z.ZodSchema>(schema: T) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=validate.d.ts.map