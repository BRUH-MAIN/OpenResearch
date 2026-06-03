import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER_NAME = 'x-correlation-id';

export interface CorrelationRequest extends Request {
  correlationId?: string;
}

/**
 * Middleware that attaches a unique correlation ID to every request.
 * If the client sends an `X-Correlation-ID` header it is reused;
 * otherwise a new UUID v4 is generated.
 *
 * The ID is:
 * - Stored on `req.correlationId`
 * - Echoed back via the `X-Correlation-ID` response header
 * - Available for downstream services (pass it in AI service calls)
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

  next();
};
