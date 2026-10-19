import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { agentBody, allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';
import { assess, createAgent, setup } from './helpers';

describe('agents API', () => {
  it('POST /api/agents returns 201 and an id', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/agents').send(agentBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    const got = await request(app).get(`/api/agents/${res.body.id}`);
    expect(got.body.name).toBe('BookBot');
    expect((await request(app).get('/api/agents/nope')).status).toBe(404);
  });
  it('POST /api/agents validates body (400 with issues)', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/agents').send({ name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.issues.length).toBeGreaterThan(0);
  });
  it('POST assessment with BookBot answers returns score, High risk, 4 must-fix and creates an Assessed record', async () => {
    // Plan said Medium risk, but the weighted formula gives 57, which is High risk.
    const { app } = setup();
    const id = await createAgent(app);
    const res = await assess(app, id);
    expect(res.status).toBe(201);
    expect(res.body.assessment).toMatchObject({ readinessScore: 57, riskBand: 'High risk', version: 1 });
    expect(res.body.counts).toEqual({ 'In place': 8, 'Partly in place': 3, Missing: 4, 'N/A': 0 });
    expect(res.body.controls).toHaveLength(15);
    expect(res.body.controls.find((c: { id: string }) => c.id === 'PE-2')).toMatchObject({ status: 'Missing', priority: 'Must fix' });
    expect(res.body.openItems.filter((i: { priority: string }) => i.priority === 'Must fix')).toHaveLength(4);
    expect(res.body.record).toMatchObject({ status: 'Assessed', version: 1, openMustFix: ['PE-2', 'LA-2', 'LA-3', 'RO-4'], recordId: 'CNL-2026-0001' });
    const again = await request(app).get(`/api/agents/${id}/assessment`);
    expect(again.body.assessment.id).toBe(res.body.assessment.id);
  });
  it('POST assessment with 14 answers returns 409 INCOMPLETE_ASSESSMENT', async () => {
    const { app } = setup();
    const id = await createAgent(app);
    const res = await assess(app, id, bookbotAnswers.slice(0, 14));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INCOMPLETE_ASSESSMENT');
  });
  it('GET assessment returns 404 before one exists, and POST rejects unknown control ids', async () => {
    const { app } = setup();
    const id = await createAgent(app);
    expect((await request(app).get(`/api/agents/${id}/assessment`)).status).toBe(404);
    const bad = await request(app).post(`/api/agents/${id}/assessment`).send({ answers: [{ controlId: 'ZZ-1', status: 'Missing' }] });
    expect(bad.status).toBe(400);
    expect((await request(app).post('/api/agents').set('Content-Type', 'application/json').send('{oops')).status).toBe(400);
    expect((await request(app).get('/api/nothing')).status).toBe(404);
  });
  it('second POST assessment bumps record version and hash but keeps status', async () => {
    const { app } = setup();
    const id = await createAgent(app);
    const first = (await assess(app, id)).body.record;
    const second = (await assess(app, id, allInPlaceAnswers)).body;
    expect(second.assessment.version).toBe(2);
    expect(second.record.recordId).toBe(first.recordId);
    expect(second.record.version).toBe(2);
    expect(second.record.hash).not.toBe(first.hash);
    expect(second.record.status).toBe('Assessed');
    expect(second.record.readinessScore).toBe(100);
    expect(second.record.openMustFix).toEqual([]);
  });
  it('POST /changes on an Assessed record leaves it Assessed', async () => {
    const { app } = setup();
    const id = await createAgent(app);
    await assess(app, id);
    const res = await request(app).post(`/api/agents/${id}/changes`).send({ description: 'Swapped the model' });
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('Assessed');
    expect(res.body.agent.changedAt).toBeDefined();
  });
  it('POST /changes without a record returns the agent and a null record', async () => {
    const { app } = setup();
    const id = await createAgent(app);
    const res = await request(app).post(`/api/agents/${id}/changes`).send({ description: 'x' });
    expect(res.body.record).toBeNull();
  });
  it('GET /api/library returns the version and all 46 cases', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/library');
    expect(res.body.version).toBe('1.2');
    expect(res.body.cases).toHaveLength(46);
  });
});
