/**
 * Auth: registration, login, the access/refresh token split, and rotation.
 *
 * The refresh flow is the part that was previously broken (both tokens signed
 * with the same secret, both 7-day, refresh token echoed in the JSON body), so
 * these assertions exist specifically to keep that from regressing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { app, request, resetDb, createUser } from './helpers.js';

const REFRESH_COOKIE = 'refresh_token';

function getCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`));
}

describe('auth', () => {
  beforeEach(resetDb);

  it('registers a user and returns an access token, never the refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@test.dev', password: 'Password123!' })
      .expect(201);

    expect(res.body.user.email).toBe('ada@test.dev');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  it('delivers the refresh token as an httpOnly, path-scoped cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@test.dev', password: 'Password123!' })
      .expect(201);

    const cookie = getCookie(res, REFRESH_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('signs the access token with a 15-minute expiry', async () => {
    const user = await createUser();
    const decoded = jwt.decode(user.token) as { iat: number; exp: number };

    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it('signs access and refresh tokens with different secrets', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@test.dev', password: 'Password123!' })
      .expect(201);

    const refreshToken = getCookie(res, REFRESH_COOKIE)!.split(';')[0].split('=')[1];

    // The refresh token must NOT validate against the access-token secret.
    expect(() => jwt.verify(refreshToken, process.env.JWT_SECRET!)).toThrow();
    expect(jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!)).toMatchObject({
      type: 'refresh',
    });
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'dup@test.dev' });

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'dup@test.dev', password: 'Password123!' })
      .expect(409);
  });

  it('rejects a bad password', async () => {
    await createUser({ email: 'ada@test.dev', password: 'Password123!' });

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@test.dev', password: 'wrong' })
      .expect(401);
  });

  it('rotates the refresh token: the old cookie stops working', async () => {
    const login = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@test.dev', password: 'Password123!' })
      .expect(201);

    const oldCookie = getCookie(login, REFRESH_COOKIE)!;

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(200);

    expect(refreshed.body.accessToken).toBeTruthy();
    const newCookie = getCookie(refreshed, REFRESH_COOKIE)!;
    expect(newCookie).not.toBe(oldCookie);

    // Replaying the rotated-out token must fail.
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);
  });

  it('refuses to refresh without a cookie', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
  });

  it('requires a token for protected routes', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/groups').expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ userId: 'x', email: 'x@test.dev' }, 'not-the-real-secret-not-the-real-secret');

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('validates the registration payload', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: '123' })
      .expect(400);
  });
});
