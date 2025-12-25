import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

describe('Groups Routes', () => {
  let accessToken: string;
  let userId: string;
  let groupId: string;

  beforeAll(async () => {
    // Create a test user and get token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Groups Test User',
        email: `groups-test-${Date.now()}@example.com`,
        password: 'testpassword123',
      });

    accessToken = registerResponse.body.accessToken;
    userId = registerResponse.body.user.id;
  });

  describe('POST /api/groups', () => {
    it('should create a new group', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Research Group',
          description: 'A group for testing',
        })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Research Group');
      expect(response.body.ownerId).toBe(userId);
      
      groupId = response.body.id;
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/groups')
        .send({
          name: 'Test Group',
          description: 'Description',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/groups', () => {
    it('should list user groups', async () => {
      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('memberCount');
    });
  });

  describe('GET /api/groups/:groupId', () => {
    it('should get group details', async () => {
      const response = await request(app)
        .get(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.id).toBe(groupId);
      expect(response.body.name).toBe('Test Research Group');
    });

    it('should return 404 for non-existent group', async () => {
      const response = await request(app)
        .get('/api/groups/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/groups/:groupId/members', () => {
    it('should list group members', async () => {
      const response = await request(app)
        .get(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1); // Just the creator
      expect(response.body[0].role).toBe('owner');
    });
  });

  describe('PATCH /api/groups/:groupId', () => {
    it('should update group details', async () => {
      const response = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Updated description' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.description).toBe('Updated description');
    });
  });
});
