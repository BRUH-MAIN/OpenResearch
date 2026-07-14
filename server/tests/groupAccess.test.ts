/**
 * Authorization: group membership and ownership.
 *
 * This is the security boundary of the whole product — one team's papers and
 * discussions must never be reachable by another team. Every case below goes
 * through the real requireGroupMember / requireGroupOwner middleware.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  app,
  request,
  resetDb,
  createUser,
  createGroup,
  createSession,
  TestUser,
} from './helpers.js';

describe('group access control', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let groupId: string;

  beforeEach(async () => {
    await resetDb();

    owner = await createUser();
    member = await createUser();
    outsider = await createUser();

    groupId = await createGroup(owner, 'Research Group');

    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: member.email })
      .expect(201);
  });

  it('lets a member read the group', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200);

    expect(res.body.name).toBe('Research Group');
    expect(res.body.userRole).toBe('member');
  });

  it("hides the group from a non-member", async () => {
    await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  });

  it('lets only the owner update the group', async () => {
    await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Renamed' })
      .expect(200);

    await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Hijacked' })
      .expect(403);
  });

  it('lets only the owner delete the group', async () => {
    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);

    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });

  it('lets only the owner add members', async () => {
    const another = await createUser();

    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ email: another.email })
      .expect(403);
  });

  it('blocks a non-member from the group papers', async () => {
    await request(app)
      .get(`/api/groups/${groupId}/papers`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  });

  it('blocks a non-member from vector search — the RAG isolation boundary', async () => {
    await request(app)
      .post(`/api/groups/${groupId}/search`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ query: 'anything' })
      .expect(404);
  });

  it('blocks a non-member from the group sessions and their messages', async () => {
    const sessionId = await createSession(owner, groupId);

    await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403);

    await request(app)
      .get(`/api/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403);
  });

  it('lets only the group owner clear a session', async () => {
    const sessionId = await createSession(owner, groupId);

    await request(app)
      .delete(`/api/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);

    await request(app)
      .delete(`/api/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });

  it('returns 404 for a malformed group id rather than a database error', async () => {
    await request(app)
      .get('/api/groups/not-a-uuid')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });
});
