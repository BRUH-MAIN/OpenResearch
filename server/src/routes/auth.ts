import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, users, refreshTokens } from '../db/index.js';
import { eq, and, gt } from 'drizzle-orm';
import {
  generateTokens,
  verifyRefreshToken,
  authenticate,
  AuthRequest,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS,
  refreshCookieOptions,
} from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, updateProfileSchema } from '../validation/schemas.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authLogger } from '../utils/logger.js';

const router = Router();

// Apply rate limiting to all auth routes
router.use(authLimiter);


// Register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, interests } = req.body;

    // Check if user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      throw createError('Email already registered', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        interests: interests || [],
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        interests: users.interests,
        createdAt: users.createdAt,
      });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(newUser.id, newUser.email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await db.insert(refreshTokens).values({
      userId: newUser.id,
      token: refreshToken,
      expiresAt,
    });

    authLogger.info({ userId: newUser.id, email: newUser.email }, 'User registered successfully');

    // Refresh token travels only in an httpOnly cookie, never the JSON body
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(201).json({
      user: newUser,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.password) {
      throw createError('Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw createError('Invalid email or password', 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await db.insert(refreshTokens).values({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    authLogger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.json({
      user: userWithoutPassword,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token — rotates the httpOnly cookie; access token returned in body
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw createError('Refresh token required', 401);
    }

    // Verify signature + type
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw createError('Invalid or expired refresh token', 401);
    }
    if (decoded.type !== 'refresh') {
      throw createError('Invalid token type', 401);
    }

    // Check if token exists in database
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, refreshToken),
          eq(refreshTokens.userId, decoded.userId),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!storedToken) {
      throw createError('Invalid or expired refresh token', 401);
    }

    // Rotate: delete old token, issue + store a new pair
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    const tokens = generateTokens(decoded.userId, decoded.email);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await db.insert(refreshTokens).values({
      userId: decoded.userId,
      token: tokens.refreshToken,
      expiresAt,
    });

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
    res.json({ accessToken: tokens.accessToken });
  } catch (error) {
    next(error);
  }
});

// Logout — revokes the stored refresh token and clears the cookie
router.post('/logout', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
    }

    authLogger.info({ userId: req.user!.id }, 'User logged out');

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        interests: users.interests,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      throw createError('User not found', 404);
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update current user
router.patch('/me', authenticate, validate(updateProfileSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { name, interests, avatar } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (interests) updateData.interests = interests;
    if (avatar) updateData.avatar = avatar;

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.user!.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        interests: users.interests,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

export default router;
