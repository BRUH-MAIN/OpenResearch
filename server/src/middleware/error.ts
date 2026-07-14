import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import logger from '../utils/logger.js';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Upload failures are the caller's fault, not a server fault.
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (20MB maximum)'
        : `Upload failed: ${err.message}`;
    res.status(400).json({ error: message });
    return;
  }

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
    const response: Record<string, unknown> = {
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

export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ 
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.url,
  });
};

export const createError = (
  message: string, 
  statusCode: number, 
  code?: string,
  details?: unknown
): AppError => {
  return new AppError(message, statusCode, code, details);
};
