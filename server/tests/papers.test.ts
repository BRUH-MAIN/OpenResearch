import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

describe('Papers Routes', () => {
  let accessToken: string;

  beforeAll(async () => {
    // Create a test user and get token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Papers Test User',
        email: `papers-test-${Date.now()}@example.com`,
        password: 'testpassword123',
      });

    accessToken = registerResponse.body.accessToken;
  });

  describe('GET /api/papers', () => {
    it('should list papers', async () => {
      const response = await request(app)
        .get('/api/papers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should support search query', async () => {
      const response = await request(app)
        .get('/api/papers?search=machine+learning')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/papers')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/papers/saved', () => {
    it('should list saved papers', async () => {
      const response = await request(app)
        .get('/api/papers/saved')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/papers/search/external', () => {
    it('should search external APIs', async () => {
      const response = await request(app)
        .get('/api/papers/search/external?query=neural+networks&source=arxiv&limit=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/papers/search/external')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/papers/meta/tags', () => {
    it('should return all tags', async () => {
      const response = await request(app)
        .get('/api/papers/meta/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
