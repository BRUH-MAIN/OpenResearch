import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const HEADER_NAME = 'x-correlation-id';

export interface CorrelationRequest extends Request {
  correlationId?: string;
}

// AsyncLocalStorage lets any code on the request's async path (e.g. the AI
// service client) read the correlation ID without threading it as a parameter.
const correlationStore = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

/**
 * Runs a function within a correlation-ID context. Used by non-HTTP entry
 * points (Socket.IO handlers) that want their AI-service calls traced too.
 */
export function withCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStore.run(id, fn);
}

/**
 * Middleware that attaches a unique correlation ID to every request.
 * If the client sends an `X-Correlation-ID` header it is reused;
 * otherwise a new UUID v4 is generated.
 *
 * The ID is:
 * - Stored on `req.correlationId` and in AsyncLocalStorage
 * - Echoed back via the `X-Correlation-ID` response header
 * - Forwarded to the AI service by the aiClient
 */
export const correlationId = (
  req: CorrelationRequest,
  res: Response,
  next: NextFunction,
): void => {
  const id =
    (req.headers[HEADER_NAME] as string) || crypto.randomUUID();

  req.correlationId = id;
  res.setHeader(HEADER_NAME, id);

  correlationStore.run(id, () => next());
};
