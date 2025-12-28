import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Generic validation middleware for request body
export const validate = <T extends z.ZodSchema>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.parseAsync(req.body);
      req.body = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};

// Validate query parameters - returns parsed data but doesn't reassign req.query
export const validateQuery = <T extends z.ZodSchema>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.parseAsync(req.query);
      // Store parsed result on request for use in handlers
      (req as Request & { validatedQuery: z.infer<T> }).validatedQuery = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};

// Validate URL parameters - returns parsed data but doesn't reassign req.params
export const validateParams = <T extends z.ZodSchema>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.parseAsync(req.params);
      // Store parsed result on request for use in handlers
      (req as Request & { validatedParams: z.infer<T> }).validatedParams = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid URL parameters',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};
