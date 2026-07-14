/**
 * Group invitations: invite, accept, decline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { app, request, resetDb, createUser, createGroup, TestUser } from './helpers.js';

describe('group invitations', () => {
  let owner: TestUser;
  let invitee: TestUser;
  let groupId: string;

  beforeEach(async () => {
    await resetDb();
    owner = await createUser();
    invitee = await createUser();
    groupId = await createGroup(owner);
  });

  async function invite() {
    const res = await request(app)
      .post(`/api/groups/${groupId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email, message: 'Join us' })
      .expect(201);
    return res.body.id as string;
  }

  it('invites a user, who then sees it as pending', async () => {
    await invite();

    const res = await request(app)
      .get('/api/groups/invitations/pending')
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('Join us');
  });

  it('accepting an invitation grants group access', async () => {
    const invitationId = await invite();

    // Before accepting, the group is invisible.
    await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(404);

    await request(app)
      .post(`/api/groups/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);

    const res = await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);
    expect(res.body.userRole).toBe('member');
  });

  it('declining leaves the user outside the group', async () => {
    const invitationId = await invite();

    await request(app)
      .post(`/api/groups/invitations/${invitationId}/decline`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);

    await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(404);
  });

  it('refuses to invite someone twice', async () => {
    await invite();

    await request(app)
      .post(`/api/groups/${groupId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email })
      .expect(409);
  });

  it('refuses to invite an existing member', async () => {
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email })
      .expect(201);

    await request(app)
      .post(`/api/groups/${groupId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email })
      .expect(409);
  });

  it('rejects an invitation payload with neither user nor email', async () => {
    await request(app)
      .post(`/api/groups/${groupId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ message: 'hi' })
      .expect(400);
  });
});
