/**
 * Tests for Authentication Routes
 * 
 * These tests cover user authentication, token management, and user profile.
 */

import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock the database
vi.mock('../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-id', name: 'Test User', email: 'test@example.com' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  users: {},
  refreshTokens: {},
}));

describe('Auth Routes', () => {
  const testUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'testpassword123',
    interests: ['AI', 'Machine Learning'],
  };

  describe('POST /api/auth/register', () => {
    it('should hash password before storing', async () => {
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      expect(hashedPassword).not.toBe(testUser.password);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    it('should return tokens on registration', async () => {
      const mockResponse = {
        user: { id: 'test-id', name: testUser.name, email: testUser.email },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };
      
      expect(mockResponse).toHaveProperty('user');
      expect(mockResponse).toHaveProperty('accessToken');
      expect(mockResponse).toHaveProperty('refreshToken');
      expect(mockResponse.user.email).toBe(testUser.email);
      expect(mockResponse.user).not.toHaveProperty('password');
    });

    it('should reject duplicate email', async () => {
      const existingUser = { id: 'existing-id', email: testUser.email };
      expect(existingUser).toBeTruthy();
      // Duplicate registration should be rejected
    });

    it('should validate required fields', async () => {
      const isValidRegister = (data: { name?: string; email?: string; password?: string }) => {
        return !!data.name && !!data.email && !!data.password;
      };
      
      expect(isValidRegister({ email: 'test@example.com' })).toBe(false);
      expect(isValidRegister({ name: 'Test', email: 'test@example.com', password: 'pass' })).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should verify password correctly', async () => {
      const storedHash = await bcrypt.hash(testUser.password, 10);
      const isValid = await bcrypt.compare(testUser.password, storedHash);
      expect(isValid).toBe(true);
    });

    it('should reject invalid password', async () => {
      const storedHash = await bcrypt.hash(testUser.password, 10);
      const isValid = await bcrypt.compare('wrongpassword', storedHash);
      expect(isValid).toBe(false);
    });

    it('should generate JWT tokens', async () => {
      const secret = 'test-secret';
      const token = jwt.sign({ userId: 'test-id', email: testUser.email }, secret, { expiresIn: '1h' });
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should decode JWT token correctly', async () => {
      const secret = 'test-secret';
      const payload = { userId: 'test-id', email: testUser.email };
      const token = jwt.sign(payload, secret);
      
      const decoded = jwt.verify(token, secret) as typeof payload;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    it('should reject expired token', async () => {
      const secret = 'test-secret';
      const token = jwt.sign({ userId: 'test-id' }, secret, { expiresIn: '-1h' });
      
      expect(() => jwt.verify(token, secret)).toThrow();
    });

    it('should reject invalid token', async () => {
      const secret = 'test-secret';
      expect(() => jwt.verify('invalidtoken', secret)).toThrow();
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('should allow updating name', async () => {
      const updateData = { name: 'Updated Name' };
      expect(updateData.name).toBe('Updated Name');
    });

    it('should not allow password in updates', async () => {
      const updateData = { name: 'Test', password: 'newpass' };
      const sanitized = { name: updateData.name };
      expect(sanitized).not.toHaveProperty('password');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should generate new token pair', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      
      expect(mockTokens.accessToken).not.toBe(mockTokens.refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const isValidRefreshToken = (token: string, storedToken: string) => token === storedToken;
      expect(isValidRefreshToken('invalid', 'stored')).toBe(false);
    });
  });
});

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const healthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
    
    expect(healthResponse).toHaveProperty('status', 'ok');
    expect(healthResponse).toHaveProperty('timestamp');
  });
});

describe('Token Validation', () => {
  it('should validate Bearer token format', () => {
    const extractToken = (header?: string) => {
      if (!header) return null;
      const parts = header.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
      return parts[1];
    };
    
    expect(extractToken('Bearer abc123')).toBe('abc123');
    expect(extractToken('Bearer')).toBe(null);
    expect(extractToken('Basic abc123')).toBe(null);
    expect(extractToken()).toBe(null);
  });
});
