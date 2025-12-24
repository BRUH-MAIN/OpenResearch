import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, users, refreshTokens } from '../db/index.js';
import { eq, and, gt } from 'drizzle-orm';
import { generateTokens, verifyRefreshToken, authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';

const router = Router();

// Register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, interests } = req.body;

    // Validation
    if (!name || !email || !password) {
      throw createError('Name, email, and password are required', 400);
    }

    if (password.length < 6) {
      throw createError('Password must be at least 6 characters', 400);
    }

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({
      userId: newUser.id,
      token: refreshToken,
      expiresAt,
    });

    res.status(201).json({
      user: newUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError('Email and password are required', 400);
    }

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw createError('Refresh token is required', 400);
    }

    // Verify token
    const decoded = verifyRefreshToken(refreshToken);
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

    // Delete old token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    // Generate new tokens
    const tokens = generateTokens(decoded.userId, decoded.email);

    // Store new refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({
      userId: decoded.userId,
      token: tokens.refreshToken,
      expiresAt,
    });

    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
    }

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
router.patch('/me', authenticate, async (req: AuthRequest, res: Response, next) => {
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
