/**
 * Papers: library CRUD, tag filtering, and the tag index.
 *
 * The tag-filter test is here because the old implementation filtered in JS
 * *after* the SQL LIMIT, so a tag match sitting outside the first page was
 * silently dropped. It only shows up once there are more papers than the limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { app, request, resetDb, createUser, createPaper, TestUser } from './helpers.js';

describe('papers', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDb();
    user = await createUser();
  });

  it('creates and reads back a paper', async () => {
    const paperId = await createPaper(user);

    const res = await request(app)
      .get(`/api/papers/${paperId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(res.body.title).toBe('Attention Is All You Need');
    expect(res.body.tags).toContain('nlp');
  });

  it('filters by tag in SQL, so matches beyond the first page still surface', async () => {
    // 5 papers tagged "vision", then the one "nlp" paper we are looking for.
    for (let i = 0; i < 5; i++) {
      await createPaper(user, { title: `Vision Paper ${i}`, tags: ['vision'] });
    }
    await createPaper(user, { title: 'The NLP One', tags: ['nlp'] });

    // A limit smaller than the number of non-matching papers: the old
    // filter-after-LIMIT bug would return an empty list here.
    const res = await request(app)
      .get('/api/papers?tag=nlp&limit=3')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('The NLP One');
  });

  it('searches by title and abstract', async () => {
    await createPaper(user, { title: 'Transformers for Vision', tags: [] });
    await createPaper(user, { title: 'Graph Neural Networks', abstract: 'About graphs.', tags: [] });

    const res = await request(app)
      .get('/api/papers?search=transformers')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Transformers for Vision');
  });

  it('lists every distinct tag', async () => {
    await createPaper(user, { tags: ['nlp', 'transformers'] });
    await createPaper(user, { title: 'Another', tags: ['nlp', 'vision'] });

    const res = await request(app)
      .get('/api/papers/meta/tags')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(res.body).toEqual(['nlp', 'transformers', 'vision']);
  });

  it('saves and unsaves a paper for the current user', async () => {
    const paperId = await createPaper(user);

    await request(app)
      .post(`/api/papers/${paperId}/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);

    let saved = await request(app)
      .get('/api/papers/saved')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(saved.body).toHaveLength(1);

    await request(app)
      .delete(`/api/papers/${paperId}/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    saved = await request(app)
      .get('/api/papers/saved')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(saved.body).toHaveLength(0);
  });
});
