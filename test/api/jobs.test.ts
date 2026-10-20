import { describe, expect, it } from 'vitest';
import { ADMIN_KEY, setup, testedAgent } from './helpers';

describe('POST /jobs/transitions', () => {
  it('rejects anonymous, wrong-key and cookie-only callers with 403, even for a bad body', async () => {
    const { anon, app } = await setup();
    expect((await anon.post('/jobs/transitions').send({})).status).toBe(403);
    expect((await anon.post('/jobs/transitions').send({ now: 'junk' })).status).toBe(403);
    expect((await anon.post('/jobs/transitions').set('X-Admin-Key', 'wrong-key-value').send({})).status).toBe(403);
    expect((await app.post('/jobs/transitions').send({})).status).toBe(403);
  });

  it('runs a dry run with the admin key', async () => {
    const { anon } = await setup();
    const res = await anon.post('/jobs/transitions').set('X-Admin-Key', ADMIN_KEY).send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, scanned: 0 });
  });

  it('accepts an empty body as a real run', async () => {
    const { anon } = await setup();
    const res = await anon.post('/jobs/transitions').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
  });

  it('rejects now without dryRun', async () => {
    const { anon } = await setup();
    const res = await anon.post('/jobs/transitions').set('X-Admin-Key', ADMIN_KEY).send({ now: '2027-03-02T00:00:00Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('dry run with a future now plans the transition without applying it', async () => {
    const { anon, app, deps } = await setup();
    const { recordId } = await testedAgent(app);
    const res = await anon
      .post('/jobs/transitions')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ dryRun: true, now: '2027-03-02T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(1);
    expect((await deps.repos.records.getById(recordId))!.status).toBe('Current');
  });
});
