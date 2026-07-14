import { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { getEnv } from '../config/env.js';

export interface JWTPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Short-lived access token; refresh token rotates via httpOnly cookie + DB.
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const REFRESH_COOKIE_NAME = 'refresh_token';

// Scoped to /api/auth so the cookie is only sent to auth endpoints.
// `secure` follows the client scheme rather than NODE_ENV: a production build
// served over plain HTTP (docker compose on localhost) would silently drop a
// Secure cookie. sameSite=lax is fine while client and API share a site;
// a cross-domain deployment would need sameSite=none + secure.
export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: getEnv().CLIENT_URL.startsWith('https://'),
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
});

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as JWTPayload;

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    next(error);
  }
};

export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, getEnv().JWT_SECRET) as JWTPayload;
};

export const generateTokens = (userId: string, email: string) => {
  // jti keeps refresh tokens unique even when generated within the same second
  const jti = crypto.randomUUID();

  const accessToken = jwt.sign(
    { userId, email },
    getEnv().JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh', jti },
    getEnv().JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export const verifyRefreshToken = (token: string): JWTPayload & { type: string } => {
  return jwt.verify(token, getEnv().JWT_REFRESH_SECRET) as JWTPayload & { type: string };
};
