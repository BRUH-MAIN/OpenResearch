/**
 * Integration-test helpers.
 *
 * These tests run against a real Postgres (pgvector) instance — the schema,
 * constraints, and cascade rules are part of what we want to test, and a mocked
 * `db` object can't tell us whether a query is actually correct.
 *
 * Start one locally with:
 *   docker compose -f docker-compose.test.yml up -d
 * CI provides the same thing as a service container.
 */

import request from 'supertest';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { app } from '../src/index.js';

export { app, db };

/** Truncate every table so each test starts from a known-empty database. */
export async function resetDb(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      group_paper_vectors, ai_artifacts, group_reports, group_papers,
      group_invitations, saved_papers, messages, sessions,
      group_members, groups, papers, refresh_tokens, users
    RESTART IDENTITY CASCADE
  `);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

let userCounter = 0;

/** Register a fresh user and return their id + access token. */
export async function createUser(overrides: { email?: string; password?: string } = {}): Promise<TestUser> {
  const email = overrides.email ?? `user${++userCounter}-${Date.now()}@test.dev`;
  const password = overrides.password ?? 'Password123!';

  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password })
    .expect(201);

  return { id: res.body.user.id, email, token: res.body.accessToken };
}

/** Create a group owned by `user`. */
export async function createGroup(user: TestUser, name = 'Test Group'): Promise<string> {
  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ name, description: 'A group for testing' })
    .expect(201);

  return res.body.id;
}

/** Create a session inside `groupId`. */
export async function createSession(user: TestUser, groupId: string, title = 'Test Session'): Promise<string> {
  const res = await request(app)
    .post('/api/sessions')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ groupId, title })
    .expect(201);

  return res.body.id;
}

/** Create a paper in the global library. */
export async function createPaper(user: TestUser, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/papers')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      title: 'Attention Is All You Need',
      authors: ['Vaswani et al.'],
      abstract: 'We propose the Transformer, based solely on attention mechanisms.',
      url: 'https://arxiv.org/abs/1706.03762',
      tags: ['nlp'],
      ...overrides,
    })
    .expect(201);

  return res.body.id;
}

export { request };
