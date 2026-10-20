import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setup } from './helpers';
import { LIBRARY_VERSION } from '../../src/library/library';

describe('GET /healthz', () => {
  it('reports ok in memory mode', async () => {
    const { app } = setup();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      commit: 'dev',
      db: 'memory',
      library: { version: LIBRARY_VERSION, cases: 46 },
    });
  });

  it('returns 503 when the db ping fails', async () => {
    const { app } = setup(undefined, { ping: async () => 'down' });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('reports db ok when ping succeeds', async () => {
    const { app } = setup(undefined, { ping: async () => 'ok' });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
  });
});
