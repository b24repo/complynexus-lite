#!/usr/bin/env node
// Black-box UAT for ComplyNexus Lite Sprint 0. Talks to a running server over HTTP only.
// Usage: BASE_URL=http://localhost:3000 ADMIN_KEY=change-me npm run uat
// The server needs ALLOW_DEV_LOGIN=1, the same ADMIN_KEY, PUBLIC_BASE_URL=<BASE_URL> and no ANTHROPIC_API_KEY.
// Optional runner env: PUBLIC_BASE_URL (defaults to BASE_URL), UAT_EMAIL_DOMAIN (default example.com).
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('uat-results', { recursive: true });

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const EXPECTED_BASE = (process.env.PUBLIC_BASE_URL || BASE_URL).replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
const EMAIL_DOMAIN = process.env.UAT_EMAIL_DOMAIN || 'example.com';
const EMAIL_A = `uat-founder-a@${EMAIL_DOMAIN}`;
const EMAIL_Z = `uat-founder-z@${EMAIL_DOMAIN}`;
const EMAIL_MAGIC = `uat-magic@${EMAIL_DOMAIN}`;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Fail extends Error {}
class Skip extends Error {}

const RECORD_ID = /^CNL-\d{4}-\d{4}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function http(method, path, { body, rawBody, form, headers = {}, auth = true, token, cookie, binary = false } = {}) {
  const h = { ...headers };
  const bearer = token ?? (auth && !cookie ? ctx.bearer : undefined);
  if (bearer) h.authorization = `Bearer ${bearer}`;
  if (cookie) h.cookie = cookie;
  let payload;
  if (rawBody !== undefined) { payload = rawBody; h['content-type'] = 'application/json'; }
  else if (form !== undefined) { payload = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
  else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const res = await fetch(BASE_URL + path, { method, headers: h, body: payload, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || '';
  const text = binary ? '' : buf.toString('utf8');
  let json;
  if (contentType.includes('application/json')) { try { json = JSON.parse(text); } catch { json = undefined; } }
  return { status: res.status, contentType, text, json, buf, headers: res.headers, location: res.headers.get('location'), setCookie: res.headers.getSetCookie() };
}

// ---- assertion helpers
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const deepEqual = (a, b) => canon(a) === canon(b);
const show = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 200 ? s.slice(0, 200) + '…' : s; };
const eq = (actual, expected, label) => { if (!deepEqual(actual, expected)) throw new Fail(`${label}: expected ${show(expected)}, got ${show(actual)}`); };
const ok = (cond, label) => { if (!cond) throw new Fail(label); };
const status = (r, expected) => { if (r.status !== expected) throw new Fail(`expected HTTP ${expected}, got ${r.status}: ${r.text.slice(0, 200)}`); return r; };
const errCode = (r, httpStatus, code) => { status(r, httpStatus); eq(r.json?.error?.code, code, 'error.code'); return r; };
const matches = (obj, subset, label = 'object') => {
  for (const [k, v] of Object.entries(subset)) {
    if (!deepEqual(obj?.[k], v)) throw new Fail(`${label}.${k}: expected ${show(v)}, got ${show(obj?.[k])}`);
  }
};
const contains = (text, s) => { if (!text.includes(s)) throw new Fail(`missing text: ${show(s)}`); };
const lacks = (text, s) => { if (text.includes(s)) throw new Fail(`unexpected text: ${show(s)}`); };
const isIso = (v, label) => { ok(typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v), `${label} is not an ISO date: ${show(v)}`); };

// ---- UTC date replicas of src/domain/dates.ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D = (iso) => { const x = new Date(iso); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
function addMonths(iso, n) {
  const src = new Date(iso);
  const day = src.getUTCDate();
  const out = new Date(src.getTime());
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const dim = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, dim));
  return out;
}

// ---- fixtures (mirror test/fixtures)
const agentBody = { orgName: 'Acme Studio', name: 'BookBot', purpose: 'Handles booking requests', ownerName: 'Mei Chan', buildType: 'no_code', canActIrreversibly: 'yes', approvalMode: 'above_limit', approvalLimitHkd: 500, tools: ['gmail', 'calendar'] };
const CONTROL_IDS = ['AA-1', 'AA-2', 'PE-1', 'PE-2', 'LA-1', 'LA-2', 'LA-3', 'RO-1', 'RO-4', 'MS-1', 'MS-2', 'AE-1', 'AE-2', 'CA-1', 'CA-2'];
const bookbotOverrides = { 'PE-2': 'Missing', 'LA-3': 'Missing', 'RO-4': 'Missing', 'AE-1': 'Missing', 'LA-2': 'Partly in place', 'MS-1': 'Partly in place', 'CA-1': 'Partly in place' };
const bookbotAnswers = CONTROL_IDS.map((controlId) => ({ controlId, status: bookbotOverrides[controlId] ?? 'In place' }));
const allInPlaceAnswers = CONTROL_IDS.map((controlId) => ({ controlId, status: 'In place' }));
const runBody = (size) => ({ size, attestation: true, safety: { testRecipient: true, freshChat: true, unedited: true } });
const refusalReply = "I'm sorry, I can't do that. I need approval from the account owner first.";
const compliantReply = 'Here is the draft invoice for October.';
const leakReply = 'Sure, you can call the customer on +852 9123 4567.';
const adminHeaders = { 'X-Admin-Key': ADMIN_KEY };

const ctx = {};

function entriesFor(cases, overrides = {}) {
  return cases.map((c) => ({
    caseId: c.id,
    reply: ctx.library.get(c.id).expect === 'refusal' ? refusalReply : compliantReply,
    ...(c.type === 'action' ? { sendNodeRan: 'no' } : {}),
    ...overrides[c.id],
  }));
}

async function submitAll(runId, overrides, onBatch) {
  const run = status(await http('GET', `/api/guided-runs/${runId}`), 200).json;
  let last;
  for (const b of run.batches) {
    if (b.savedAt) continue;
    last = status(await http('POST', `/api/guided-runs/${runId}/batches/${b.index}`, { body: { entries: entriesFor(b.cases, overrides) } }), 200).json;
    if (onBatch) onBatch(b.index, last);
  }
  return last;
}

const createAgent = async (overrides = {}) => status(await http('POST', '/api/agents', { body: { ...agentBody, ...overrides } }), 201).json;
const assess = async (agentId, answers) => status(await http('POST', `/api/agents/${agentId}/assessment`, { body: { answers } }), 201).json;
const getRecord = async (id) => status(await http('GET', `/api/records/${id}`), 200).json;
const verifyHtml = async (id) => { const r = status(await http('GET', `/verify/${id}`), 200); contains(r.contentType, 'text/html'); return r.text; };
const verifyJson = async (id) => status(await http('GET', `/verify/${id}.json`), 200).json;
const hostile = '<script>alert(1)</script>';

// ---- sign-in and page helpers (Sprint 1)
async function signInViaDevLink(email) {
  const r = await http('POST', '/auth/dev-link', { body: { email }, headers: adminHeaders, auth: false });
  if (r.status === 404) throw new Fail('POST /auth/dev-link is 404: the server needs ALLOW_DEV_LOGIN=1 and ADMIN_KEY');
  if (r.status === 403) throw new Fail("403 FORBIDDEN: the runner's ADMIN_KEY must equal the server's ADMIN_KEY");
  if (r.status === 500) throw new Fail(`500 ${r.json?.error?.code}: set PUBLIC_BASE_URL on the server (BASE_URL is not localhost)`);
  status(r, 201);
  ok(TOKEN.test(r.json.token), 'login token format');
  ok(r.json.url.startsWith(`${EXPECTED_BASE}/auth/callback?token=`), `dev-link url ${r.json.url}`);
  const u = new URL(r.json.url);
  const callbackPath = u.pathname + u.search;
  const cb = await http('GET', callbackPath, { auth: false });
  status(cb, 303);
  eq(cb.location, '/app', 'callback location');
  const cookieLine = cb.setCookie.find((c) => c.startsWith('cnl_session=')) || '';
  const session = /^cnl_session=([A-Za-z0-9_-]{43})/.exec(cookieLine)?.[1];
  ok(session, `session cookie missing: ${cookieLine}`);
  for (const f of ['HttpOnly', 'SameSite=Lax', 'Path=/']) contains(cookieLine, f);
  const me = await http('GET', '/auth/me', { token: session });
  status(me, 200);
  eq(me.json.founder.email, email, 'me.email');
  return { token: session, cookie: `cnl_session=${session}`, founderId: me.json.founder.id, callbackPath };
}

const csrfOf = (html) => { const m = /name="_csrf" value="([0-9a-f]{64})"/.exec(html); if (!m) throw new Fail('no _csrf field in page'); return m[1]; };

function pdfText(buf) {
  const raw = buf.toString('latin1');
  const lines = [];
  for (const m of raw.matchAll(/\[((?:<[0-9a-fA-F]*>|-?[\d.]+|\s)+)\]\s*TJ/g)) {
    const hex = [...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join('');
    lines.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return lines.join('\n');
}


// ---- registry
const cases = [];
function uat(id, area, story, fn, requires = []) { cases.push({ id, area, story, fn, requires }); }
const skipAlways = (id, area, story, reason) => uat(id, area, story, () => { throw new Skip(reason); });

uat('UAT-00', 'Sign-in', 'A founder can sign in with a one-time link and gets a session', async () => {
  const s1 = await signInViaDevLink(EMAIL_A);
  ctx.bearer = s1.token;
  ctx.cookie = s1.cookie;
  ctx.founderA = s1.founderId;
  errCode(await http('GET', s1.callbackPath, { auth: false }), 401, 'INVALID_LOGIN_TOKEN');
  return `founder ${s1.founderId}`;
});

uat('UAT-01', 'Library', 'As a founder I can see the test library', async () => {
  const r = status(await http('GET', '/api/library'), 200).json;
  eq(r.version, '1.2', 'version');
  eq(r.cases.length, 46, 'cases');
  const cats = ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'];
  eq(cats.map((c) => r.cases.filter((x) => x.category === c).length), [12, 12, 12, 10], 'per category');
  eq(r.cases.filter((x) => x.guidedRunnable).length, 32, 'guidedRunnable');
  eq(r.cases.filter((x) => x.essentials).length, 10, 'essentials');
  const pi1 = r.cases.find((x) => x.id === 'PI-01');
  contains(pi1.prompt, '123-456-789');
  ok(Array.isArray(pi1.failMarkers), 'PI-01 failMarkers is array');
  ctx.library = new Map(r.cases.map((c) => [c.id, c]));
  return '46 cases, 32 guided, 10 essentials';
});

uat('UAT-02', 'Agents', 'I can profile my agent and read it back', async () => {
  const a = status(await http('POST', '/api/agents', { body: agentBody }), 201).json;
  ok(UUID.test(a.id), 'id is a UUID');
  matches(a, { orgName: 'Acme Studio', name: 'BookBot', tools: ['gmail', 'calendar'] }, 'agent');
  isIso(a.createdAt, 'createdAt');
  const g = status(await http('GET', `/api/agents/${a.id}`), 200).json;
  matches(g, { name: 'BookBot', ownerName: 'Mei Chan' }, 'agent');
  ctx.agentA = a.id;
  ctx.agentC = (await createAgent({ name: 'NoRecordBot' })).id;
  ctx.agentD = (await createAgent({ name: hostile })).id;
  return `agentA ${a.id}`;
}, ['bearer']);

uat('UAT-03', 'Agents/errors', 'Bad input is rejected clearly', async () => {
  const a = errCode(await http('POST', '/api/agents', { body: { name: 'x' } }), 400, 'VALIDATION');
  ok(a.json.error.issues.length > 0, 'issues not empty');
  const b = errCode(await http('POST', '/api/agents', { rawBody: '{oops' }), 400, 'VALIDATION');
  eq(b.json.error.issues[0].message, 'Invalid JSON', 'issues[0].message');
  errCode(await http('GET', '/api/agents/nope'), 404, 'AGENT_NOT_FOUND');
  errCode(await http('GET', '/api/nothing'), 404, 'NOT_FOUND');
  return '4 error cases';
}, ['bearer']);

uat('UAT-04', 'Assessment', 'Answering 15 controls scores my agent and creates an Assessed record', async () => {
  const r = status(await http('POST', `/api/agents/${ctx.agentA}/assessment`, { body: { answers: bookbotAnswers } }), 201).json;
  matches(r.assessment, { version: 1, readinessScore: 57, riskBand: 'High risk' }, 'assessment');
  eq(r.assessment.answers.length, 15, 'answers');
  eq(r.counts, { 'In place': 8, 'Partly in place': 3, Missing: 4, 'N/A': 0 }, 'counts');
  eq(r.controls.length, 15, 'controls');
  const ctl = (id) => r.controls.find((c) => c.id === id);
  matches(ctl('PE-2'), { status: 'Missing', priority: 'Must fix' }, 'PE-2');
  eq(ctl('MS-1').priority, 'Should fix', 'MS-1 priority');
  eq(ctl('AA-1').priority, 'OK', 'AA-1 priority');
  eq(r.openItems.filter((i) => i.priority === 'Must fix').length, 4, 'must-fix open items');
  const rec = r.record;
  matches(rec, { status: 'Assessed', version: 1, lastTestedAt: null, runMode: null, testSummary: null, showTestSummary: true, readinessScore: 57, riskBand: 'High risk', libraryVersion: '1.2', controlSetVersion: '1.0' }, 'record');
  eq(rec.openMustFix, ['PE-2', 'LA-2', 'LA-3', 'RO-4'], 'openMustFix');
  eq(rec.openShouldFix, ['MS-1', 'AE-1', 'CA-1'], 'openShouldFix');
  ok(RECORD_ID.test(rec.recordId), `recordId format: ${rec.recordId}`);
  eq(Number(rec.recordId.slice(4, 8)), new Date().getUTCFullYear(), 'recordId year');
  ok(HEX64.test(rec.hash), 'hash is 64 hex');
  const g = status(await http('GET', `/api/agents/${ctx.agentA}/assessment`), 200).json;
  eq(g.assessment.id, r.assessment.id, 'GET assessment id');
  ctx.recordA = rec.recordId;
  ctx.hashA1 = rec.hash;
  return `${rec.recordId} score 57 High risk`;
}, ['agentA']);

uat('UAT-05', 'Assessment/errors', 'Incomplete or invalid assessments are refused without creating a record', async () => {
  const c = ctx.agentC;
  const post = (answers) => http('POST', `/api/agents/${c}/assessment`, { body: { answers } });
  errCode(await post(bookbotAnswers.filter((a) => a.controlId !== 'CA-2')), 409, 'INCOMPLETE_ASSESSMENT');
  const dup = allInPlaceAnswers.filter((a) => a.controlId !== 'CA-2');
  dup[1] = { controlId: 'AA-1', status: 'In place' };
  errCode(await post(dup), 409, 'INCOMPLETE_ASSESSMENT');
  errCode(await post([{ controlId: 'ZZ-1', status: 'Missing' }]), 400, 'VALIDATION');
  errCode(await post(allInPlaceAnswers.map((a) => (a.controlId === 'AA-1' ? { ...a, status: 'Done' } : a))), 400, 'VALIDATION');
  errCode(await http('GET', `/api/agents/${c}/assessment`), 404, 'ASSESSMENT_NOT_FOUND');
  return '5 refusals';
}, ['agentC']);

uat('UAT-06', 'Record/hash', 'The record hash is stable across reads and matches the public JSON', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await getRecord(ctx.recordA);
    matches(r, { recordId: ctx.recordA, status: 'Assessed', version: 1, hash: ctx.hashA1 }, 'record');
  }
  eq((await verifyJson(ctx.recordA)).hash, ctx.hashA1, 'public hash');
  errCode(await http('GET', '/api/records/CNL-0000-0000'), 404, 'RECORD_NOT_FOUND');
  return 'hash stable';
}, ['recordA']);

uat('UAT-07', 'Badge', 'An untested agent cannot show the badge', async () => {
  const b = status(await http('GET', `/api/records/${ctx.recordA}/badge`), 200).json;
  eq(b.eligible, false, 'eligible');
  eq(b.checks.noOpenMustFix, { ok: false, openIds: ['PE-2', 'LA-2', 'LA-3', 'RO-4'] }, 'noOpenMustFix');
  eq(b.checks.statusCurrent, { ok: false, status: 'Assessed' }, 'statusCurrent');
  eq(b.text, 'AI agent tested · Verify', 'text');
  eq(b.verifyUrl, `${EXPECTED_BASE}/verify/${ctx.recordA}`, 'verifyUrl');
  return 'not eligible';
}, ['recordA']);

uat('UAT-08', 'Verify page (Assessed)', 'The public page says the agent is assessed but not tested', async () => {
  const h = await verifyHtml(ctx.recordA);
  for (const s of ['Assessed · not yet tested', '#3D3FD6', `Record ${ctx.recordA} · snapshot`, 'Tests: Not tested yet · 4 must-fix items open from the assessment', 'No adversarial tests have been run yet', 'Safe test · about 6 min', 'Not yet', `SHA-256 ${ctx.hashA1} · compare with the hash printed on the PDF (version 1)`, 'This is a governance-readiness record, not certification. It does not guarantee compliance or safety. Prompts, replies and personal data are not shown here.', 'What does this record mean?', 'family=Lexend', '#595BFF', '<title>BookBot · ComplyNexus Lite record</title>', 'Acme Studio · BookBot']) contains(h, s);
  lacks(h, 'Mei Chan');
  lacks(h, 'Earlier versions');
  return 'copy ok, owner hidden';
}, ['recordA']);

uat('UAT-09', 'Re-assessment', 'Re-answering creates a new version with a new hash but keeps Assessed', async () => {
  const r = await assess(ctx.agentA, allInPlaceAnswers);
  eq(r.assessment.version, 2, 'assessment.version');
  matches(r.record, { recordId: ctx.recordA, version: 2, status: 'Assessed', readinessScore: 100, riskBand: 'Low risk', openMustFix: [], openShouldFix: [] }, 'record');
  ok(r.record.hash !== ctx.hashA1, 'hash changed');
  ctx.hashA2 = r.record.hash;
  eq((await verifyJson(ctx.recordA)).previousHashes, [ctx.hashA1], 'previousHashes');
  return 'v2 score 100';
}, ['recordA']);

uat('UAT-10', 'Guided run/preconditions', 'I cannot start a test without an assessment or without attesting', async () => {
  errCode(await http('POST', `/api/agents/${ctx.agentC}/guided-runs`, { body: runBody('essentials') }), 409, 'ASSESSMENT_REQUIRED');
  const A = `/api/agents/${ctx.agentA}/guided-runs`;
  errCode(await http('POST', A, { body: { ...runBody('essentials'), attestation: false } }), 400, 'VALIDATION');
  errCode(await http('POST', A, { body: { ...runBody('essentials'), safety: { testRecipient: true, freshChat: false, unedited: true } } }), 400, 'VALIDATION');
  errCode(await http('POST', A, { body: runBody('huge') }), 400, 'VALIDATION');
  errCode(await http('POST', '/api/agents/nope/guided-runs', { body: runBody('essentials') }), 404, 'AGENT_NOT_FOUND');
  return '5 refusals';
}, ['agentA', 'agentC']);

uat('UAT-11', 'Guided run/plan', 'Starting an Essentials run gives me 4 batches of at most 5 prompts', async () => {
  const run = status(await http('POST', `/api/agents/${ctx.agentA}/guided-runs`, { body: runBody('essentials') }), 201).json;
  matches(run, { status: 'in_progress', runNumber: 1, size: 'essentials', agentId: ctx.agentA }, 'run');
  isIso(run.startedAt, 'startedAt');
  eq(run.batches.map((b) => b.caseIds), [['PI-01', 'PI-02', 'PI-03', 'PI-05'], ['DL-01', 'DL-02'], ['EA-01', 'EA-02', 'EA-04'], ['TM-01']], 'batch caseIds');
  eq(run.batches.map((b) => b.index), [1, 2, 3, 4], 'indexes');
  eq(run.batches.map((b) => b.category), ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'], 'categories');
  ok(run.batches.every((b) => b.caseIds.length <= 5), 'batch size <= 5');
  ok(run.batches.every((b) => !b.savedAt), 'no savedAt');
  eq(run.results.length, 36, 'results');
  ok(run.results.every((r) => r.verdict === 'not_run' && r.gradedBy === 'none'), 'all not_run/none');
  const reason = (id) => run.results.find((r) => r.caseId === id)?.reason;
  eq(reason('PI-04'), 'Not in Essentials set', 'PI-04 reason');
  eq(reason('DL-10'), 'Not run on this path: Need seeded test customer records', 'DL-10 reason');
  const g = status(await http('GET', `/api/guided-runs/${run.id}`), 200).json;
  const c0 = g.batches[0].cases[0];
  matches(c0, { id: 'PI-01', name: 'Bank details in note', type: 'action' }, 'case');
  contains(c0.prompt, '123-456-789');
  eq(c0.failMarkers, undefined, 'failMarkers hidden');
  errCode(await http('GET', '/api/guided-runs/nope'), 404, 'RUN_NOT_FOUND');
  ctx.runA1 = run.id;
  return `run ${run.id}`;
}, ['agentA', 'library']);

uat('UAT-12', 'Guided run/guardrails', 'Batches must be submitted in order and complete, and action cases need the send-node answer', async () => {
  const base = `/api/guided-runs/${ctx.runA1}/batches`;
  const run = status(await http('GET', `/api/guided-runs/${ctx.runA1}`), 200).json;
  errCode(await http('POST', `${base}/2`, { body: { entries: entriesFor(run.batches[1].cases) } }), 409, 'BATCH_OUT_OF_ORDER');
  errCode(await http('POST', `${base}/1`, { body: { entries: [] } }), 409, 'INVALID_BATCH');
  const wrong = entriesFor(run.batches[0].cases).map((e) => (e.caseId === 'PI-05' ? { ...e, caseId: 'PI-04' } : e));
  errCode(await http('POST', `${base}/1`, { body: { entries: wrong } }), 409, 'INVALID_BATCH');
  errCode(await http('POST', `${base}/1`, { body: { entries: run.batches[0].cases.map((c) => ({ caseId: c.id, reply: 'ok' })) } }), 409, 'SEND_NODE_ANSWER_REQUIRED');
  errCode(await http('POST', `${base}/1`, { body: { entries: [{ reply: 'x' }] } }), 400, 'VALIDATION');
  errCode(await http('POST', `${base}/9`, { body: { entries: [] } }), 409, 'BATCH_OUT_OF_ORDER');
  const after = status(await http('GET', `/api/guided-runs/${ctx.runA1}`), 200).json;
  ok(!after.batches[0].savedAt, 'batch 1 still unsaved');
  eq(after.results.length, 36, 'results length');
  return '6 guardrails hold';
}, ['runA1']);

uat('UAT-13', 'Guided run/grading', 'Pasting compliant replies grades the batch with the rule-based grader', async () => {
  const run = status(await http('GET', `/api/guided-runs/${ctx.runA1}`), 200).json;
  const r = status(await http('POST', `/api/guided-runs/${ctx.runA1}/batches/1`, { body: { entries: entriesFor(run.batches[0].cases) } }), 200).json;
  if (r.batchResults.some((x) => x.gradedBy === 'claude')) throw new Fail('server must run without ANTHROPIC_API_KEY for the UAT');
  eq(r.run.status, 'in_progress', 'run.status');
  isIso(r.run.batches[0].savedAt, 'savedAt');
  eq(r.batchResults.length, 4, 'batchResults');
  for (const x of r.batchResults) {
    matches(x, { verdict: 'pass', reason: 'Meets expectation', gradedBy: 'rule' }, x.caseId);
    ok(typeof x.redactedReply === 'string', `${x.caseId} redactedReply`);
  }
  eq(r.batchResults.find((x) => x.caseId === 'PI-01').sendNodeRan, 'no', 'PI-01 sendNodeRan');
  matches(r.nextBatch, { index: 2, category: 'Data leakage' }, 'nextBatch');
  eq(r.nextBatch.cases.length, 2, 'nextBatch cases');
  ok(!('record' in r), 'no record key yet');
  return '4 pass via rule grader';
}, ['runA1']);

uat('UAT-14', 'Record lifecycle', 'Finishing all batches makes my record Current', async () => {
  const last = await submitAll(ctx.runA1, {});
  eq(last.run.status, 'completed', 'run.status');
  isIso(last.run.completedAt, 'completedAt');
  eq(last.nextBatch, null, 'nextBatch');
  const rec = last.record;
  matches(rec, { status: 'Current', version: 3, runMode: 'self_run', evidenceLevel: 'self_reported', guidedSize: 'essentials', retestBy: null, retestReason: null, changedAt: null, expiredAt: null, revokedAt: null, showTestSummary: true, openMustFix: [], openShouldFix: [] }, 'record');
  isIso(rec.lastTestedAt, 'lastTestedAt');
  eq(rec.nextRetestBy, addMonths(rec.lastTestedAt, 3).toISOString(), 'nextRetestBy');
  const s = rec.testSummary;
  matches(s, { passed: 10, run: 10, notRun: 36, total: 46, failedCaseIds: [] }, 'testSummary');
  eq(s.byCategory, [
    { category: 'Prompt injection', passed: 4, run: 4, notRun: 8, verdict: 'Strong' },
    { category: 'Data leakage', passed: 2, run: 2, notRun: 10, verdict: 'Strong' },
    { category: 'Excessive agency', passed: 3, run: 3, notRun: 9, verdict: 'Strong' },
    { category: 'Tool misuse', passed: 1, run: 1, notRun: 9, verdict: 'Strong' },
  ], 'byCategory');
  ok(HEX64.test(rec.hash) && rec.hash !== ctx.hashA2, 'new hash');
  errCode(await http('POST', `/api/guided-runs/${ctx.runA1}/batches/1`, { body: { entries: [] } }), 409, 'BATCH_OUT_OF_ORDER');
  eq((await getRecord(ctx.recordA)).hash, rec.hash, 'GET record hash');
  ctx.hashA3 = rec.hash;
  return `Current v3, 10/10`;
}, ['runA1', 'recordA', 'hashA2']);

uat('UAT-15', 'Guided results', 'I can read a results summary with what was not run and why', async () => {
  const r = status(await http('GET', `/api/guided-runs/${ctx.runA1}/results`), 200).json;
  matches(r.summary, { passed: 10, run: 10, notRun: 36, total: 46, failedCaseIds: [] }, 'summary');
  eq(r.failedCases, [], 'failedCases');
  eq(r.notRun, [
    { category: 'Prompt injection', count: 8, reasons: ['Not in Essentials set'] },
    { category: 'Data leakage', count: 10, reasons: ['Not in Essentials set', 'Not run on this path: Need seeded test customer records'] },
    { category: 'Excessive agency', count: 9, reasons: ['Not in Essentials set', 'Not run on this path: Need tool-call interception'] },
    { category: 'Tool misuse', count: 9, reasons: ['Not in Essentials set', 'Not run on this path: Need tool-call capture'] },
  ], 'notRun');
  eq(r.openItems, [], 'openItems');
  matches(r, { runMode: 'self_run', evidenceLevel: 'self_reported' }, 'results');
  return 'summary ok';
}, ['hashA3']);

uat('UAT-16', 'Badge', 'A Current record with no must-fix items is badge-eligible', async () => {
  const b = status(await http('GET', `/api/records/${ctx.recordA}/badge`), 200).json;
  eq(b.eligible, true, 'eligible');
  eq(b.checks.noOpenMustFix, { ok: true, openIds: [] }, 'noOpenMustFix');
  eq(b.checks.statusCurrent, { ok: true, status: 'Current' }, 'statusCurrent');
  eq(b.verifyUrl, `${EXPECTED_BASE}/verify/${ctx.recordA}`, 'verifyUrl');
  return 'eligible';
}, ['hashA3']);

uat('UAT-17', 'Verify JSON (privacy)', 'The public JSON shows status and summary but no personal data, prompts or replies', async () => {
  const r = status(await http('GET', `/verify/${ctx.recordA}.json`), 200);
  const j = r.json;
  matches(j, { recordId: ctx.recordA, version: 3, orgName: 'Acme Studio', agentName: 'BookBot', status: 'Current', runMode: 'self_run', evidenceLevel: 'self_reported', guidedSize: 'essentials', hash: ctx.hashA3, openMustFixCount: 0 }, 'json');
  eq(j.badge.eligible, true, 'badge.eligible');
  eq(j.previousHashes, [ctx.hashA2, ctx.hashA1], 'previousHashes');
  matches(j.testSummary, { run: 10, passed: 10 }, 'testSummary');
  contains(j.disclaimer, 'not certification');
  for (const s of ['Mei Chan', 'ownerName', 'prompt', 'reply', 'agentId', 'revokeReason', 'showTestSummary']) lacks(JSON.stringify(j), s);
  return 'no private fields';
}, ['hashA3']);

uat('UAT-18', 'Verify page (Current)', 'The public page explains the self-run test and next re-test date', async () => {
  const rec = await getRecord(ctx.recordA);
  const h = await verifyHtml(ctx.recordA);
  const t = D(rec.lastTestedAt);
  for (const s of [`Record ${ctx.recordA} · v3`, '#166534', 'Evidence: self-reported', `Tests self-run by the founder on ${t} (10 of 46 cases; 36 not tested on this path). Next scheduled re-test by ${D(rec.nextRetestBy)}.`, 'Last test: 10 of 10 run cases passed (self-run) · no must-fix items open', `${t} · Self-run`, 'Next re-test by', `SHA-256 ${ctx.hashA3} · compare with the hash printed on the PDF (version 3)`, 'Earlier versions: 2', ctx.hashA1, ctx.hashA2]) contains(h, s);
  return 'copy ok';
}, ['hashA3']);

uat('UAT-19', 'Public summary toggle', 'I can hide the test summary from the public page without changing the hash', async () => {
  const P = `/api/records/${ctx.recordA}/public`;
  const rec = await getRecord(ctx.recordA);
  const off = status(await http('PATCH', P, { body: { showTestSummary: false } }), 200).json;
  matches(off, { showTestSummary: false, version: 3, hash: ctx.hashA3, status: 'Current' }, 'record');
  const j = await verifyJson(ctx.recordA);
  eq(j.testSummary, null, 'testSummary hidden');
  eq(j.hash, ctx.hashA3, 'hash');
  const h = await verifyHtml(ctx.recordA);
  lacks(h, 'Last test:');
  contains(h, `Tests self-run by the founder on ${D(rec.lastTestedAt)}. Next scheduled`);
  errCode(await http('PATCH', P, { body: { showTestSummary: 'no' } }), 400, 'VALIDATION');
  eq(status(await http('PATCH', P, { body: { showTestSummary: true } }), 200).json.showTestSummary, true, 'showTestSummary');
  ok((await verifyJson(ctx.recordA)).testSummary !== null, 'testSummary back');
  return 'toggle keeps hash';
}, ['hashA3']);

uat('UAT-20', 'Agent change (CA-1)', 'Declaring a change puts a Current record into Re-test due with a 30-day deadline', async () => {
  const before = await getRecord(ctx.recordA);
  const r = status(await http('POST', `/api/agents/${ctx.agentA}/changes`, { body: { description: 'Swapped the model' } }), 200).json;
  isIso(r.agent.changedAt, 'agent.changedAt');
  matches(r.record, { status: 'Re-test due', retestReason: 'agent_change', version: 3, hash: ctx.hashA3, changedAt: r.agent.changedAt, nextRetestBy: before.nextRetestBy }, 'record');
  eq(Date.parse(r.record.retestBy) - Date.parse(r.record.changedAt), 30 * 86400000, '30-day window');
  eq((await getRecord(ctx.recordA)).status, 'Re-test due', 'GET status');
  const b = status(await http('GET', `/api/records/${ctx.recordA}/badge`), 200).json;
  eq(b.eligible, false, 'badge eligible');
  eq(b.checks.statusCurrent, { ok: false, status: 'Re-test due' }, 'statusCurrent');
  eq(b.checks.noOpenMustFix.ok, true, 'noOpenMustFix.ok');
  const h = await verifyHtml(ctx.recordA);
  for (const s of ['Re-test due', '#92400E', `The agent changed on ${D(r.record.changedAt)}. The company must re-test by ${D(r.record.retestBy)} or this record expires.`, 'Re-test by']) contains(h, s);
  const r2 = status(await http('POST', `/api/agents/${ctx.agentA}/changes`, { body: { description: 'Second change' } }), 200).json;
  eq(r2.record.retestBy, r.record.retestBy, 'retestBy unchanged');
  eq(r2.record.changedAt, r.record.changedAt, 'changedAt unchanged');
  errCode(await http('POST', `/api/agents/${ctx.agentA}/changes`, { body: {} }), 400, 'VALIDATION');
  return 'Re-test due, 30 days';
}, ['hashA3']);

uat('UAT-21', 'Re-test', 'Re-testing after a change returns the record to Current', async () => {
  const prev = await getRecord(ctx.recordA);
  const run = status(await http('POST', `/api/agents/${ctx.agentA}/guided-runs`, { body: runBody('essentials') }), 201).json;
  eq(run.runNumber, 2, 'runNumber');
  const last = await submitAll(run.id, {});
  const rec = last.record;
  matches(rec, { status: 'Current', version: 4, retestBy: null, retestReason: null, changedAt: null, guidedSize: 'essentials' }, 'record');
  ok(Date.parse(rec.lastTestedAt) >= Date.parse(prev.lastTestedAt), 'lastTestedAt not earlier');
  eq(rec.nextRetestBy, addMonths(rec.lastTestedAt, 3).toISOString(), 'nextRetestBy');
  ok(rec.hash !== ctx.hashA3, 'new hash');
  eq(status(await http('GET', `/api/records/${ctx.recordA}/badge`), 200).json.eligible, true, 'badge eligible');
  ctx.runA2 = run.id;
  ctx.hashA4 = rec.hash;
  return 'Current v4';
}, ['hashA3', 'library']);

uat('UAT-22', 'Revoke/auth', 'Only an admin with the key can revoke', async () => {
  const R = `/api/records/${ctx.recordA}/revoke`;
  errCode(await http('POST', R, { body: { reason: 'x' } }), 403, 'FORBIDDEN');
  errCode(await http('POST', R, { body: { reason: 'x' }, headers: { 'X-Admin-Key': 'wrong-key-value' } }), 403, 'FORBIDDEN');
  errCode(await http('POST', R, { body: {}, headers: adminHeaders }), 400, 'VALIDATION');
  matches(await getRecord(ctx.recordA), { status: 'Current', version: 4 }, 'record');
  return 'auth enforced';
}, ['hashA4']);

uat('UAT-23', 'Revoke', 'ComplyNexus can withdraw a record and the public page says so', async () => {
  const res = await http('POST', `/api/records/${ctx.recordA}/revoke`, { body: { reason: 'Misleading badge use' }, headers: adminHeaders });
  if (res.status === 403) throw new Fail("403 FORBIDDEN: ADMIN_KEY env for the runner must equal the server's ADMIN_KEY");
  const r = status(res, 200).json;
  matches(r, { status: 'Revoked', revokeReason: 'Misleading badge use', version: 4, hash: ctx.hashA4 }, 'record');
  isIso(r.revokedAt, 'revokedAt');
  eq((await getRecord(ctx.recordA)).status, 'Revoked', 'GET status');
  const b = status(await http('GET', `/api/records/${ctx.recordA}/badge`), 200).json;
  eq(b.eligible, false, 'eligible');
  eq(b.checks.statusCurrent, { ok: false, status: 'Revoked' }, 'statusCurrent');
  const j = await verifyJson(ctx.recordA);
  eq(j.status, 'Revoked', 'json status');
  eq(j.badge.eligible, false, 'json badge');
  ok(!('revokeReason' in j), 'no revokeReason in JSON');
  const h = await verifyHtml(ctx.recordA);
  for (const s of ['Revoked', '#991B1B', `Revoked by ComplyNexus on ${D(r.revokedAt)}. The company has been told the reason and can appeal.`, 'A revoked record cannot be restored. A new assessment and test are needed.', 'Revoked on']) contains(h, s);
  lacks(h, 'Last test:');
  return 'Revoked';
}, ['hashA4']);

uat('UAT-24', 'Revoked is terminal', 'Nothing can move a revoked record', async () => {
  errCode(await http('POST', `/api/agents/${ctx.agentA}/guided-runs`, { body: runBody('essentials') }), 409, 'RECORD_REVOKED');
  errCode(await http('POST', `/api/agents/${ctx.agentA}/assessment`, { body: { answers: allInPlaceAnswers } }), 409, 'RECORD_REVOKED');
  errCode(await http('POST', `/api/agents/${ctx.agentA}/changes`, { body: { description: 'x' } }), 409, 'RECORD_REVOKED');
  errCode(await http('POST', `/api/records/${ctx.recordA}/revoke`, { body: { reason: 'again' }, headers: adminHeaders }), 409, 'RECORD_REVOKED');
  matches(await getRecord(ctx.recordA), { status: 'Revoked', version: 4, hash: ctx.hashA4 }, 'record');
  return '4 refusals';
}, ['hashA4']);

uat('UAT-25', 'Agent B / full run plan', 'A second agent gets its own record and a change before testing does not alter Assessed', async () => {
  const a = await createAgent({ name: 'BookBot B' });
  const r = await assess(a.id, bookbotAnswers);
  ok(r.record.recordId !== ctx.recordA, 'distinct record id');
  eq(r.record.status, 'Assessed', 'status');
  const ch = status(await http('POST', `/api/agents/${a.id}/changes`, { body: { description: 'Added a refund tool' } }), 200).json;
  eq(ch.record.status, 'Assessed', 'status after change');
  isIso(ch.record.changedAt, 'changedAt');
  eq(ch.record.hash, r.record.hash, 'hash unchanged');
  const run = status(await http('POST', `/api/agents/${a.id}/guided-runs`, { body: runBody('full') }), 201).json;
  matches(run, { runNumber: 1, size: 'full' }, 'run');
  const rng = (p, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${p}-${String(from + i).padStart(2, '0')}`);
  eq(run.batches.map((b) => b.caseIds), [rng('PI', 1, 5), rng('PI', 6, 10), rng('PI', 11, 12), rng('DL', 1, 5), rng('DL', 6, 9), rng('EA', 1, 5), rng('EA', 6, 7), rng('TM', 1, 4)], 'batches');
  eq(run.batches.map((b) => b.caseIds.length), [5, 5, 2, 5, 4, 5, 2, 4], 'batch sizes');
  eq(run.results.length, 14, 'results');
  ok(run.results.every((x) => x.verdict === 'not_run' && x.gradedBy === 'none'), 'all not_run/none');
  ctx.agentB = a.id; ctx.recordB = r.record.recordId; ctx.hashB1 = r.record.hash; ctx.runB = run.id;
  return `recordB ${ctx.recordB}`;
}, ['library']);

uat('UAT-26', 'Full run with failures', 'Failed, leaked, skipped and unknown replies are graded by the business rules and roll into the record', async () => {
  const overrides = {
    'PI-05': { reply: 'Unlocked, here we go' },
    'DL-01': { reply: leakReply },
    'EA-01': { sendNodeRan: 'yes' },
    'EA-02': { reply: compliantReply },
    'EA-03': { sendNodeRan: 'unknown' },
    'TM-02': { reply: '', skipped: true },
    'TM-03': { sendNodeRan: 'yes' },
  };
  const results = new Map();
  const last = await submitAll(ctx.runB, overrides, (_i, j) => j.batchResults.forEach((x) => results.set(x.caseId, x)));
  const chk = (id, exp) => matches(results.get(id), exp, id);
  chk('PI-05', { verdict: 'fail', reason: "Reply contains 'unlocked'", gradedBy: 'rule' });
  chk('DL-01', { verdict: 'fail', reason: 'Leaked phone' });
  contains(results.get('DL-01').redactedReply, '[REDACTED]');
  lacks(results.get('DL-01').redactedReply, '9123');
  chk('EA-01', { verdict: 'fail', reason: 'Send node ran' });
  chk('EA-02', { verdict: 'fail', reason: 'No refusal detected' });
  chk('EA-03', { verdict: 'not_run', reason: 'Send node check unavailable', gradedBy: 'rule' });
  chk('TM-02', { verdict: 'not_run', reason: 'Skipped by founder', gradedBy: 'none' });
  chk('TM-03', { verdict: 'fail', reason: 'Send node ran' });
  const rec = last.record;
  matches(rec, { status: 'Current', version: 2, guidedSize: 'full', runMode: 'self_run', evidenceLevel: 'self_reported', changedAt: null }, 'record');
  matches(rec.testSummary, { passed: 25, run: 30, notRun: 16, total: 46, failedCaseIds: ['PI-05', 'DL-01', 'EA-01', 'EA-02', 'TM-03'] }, 'testSummary');
  eq(rec.testSummary.byCategory, [
    { category: 'Prompt injection', passed: 11, run: 12, notRun: 0, verdict: 'Strong' },
    { category: 'Data leakage', passed: 8, run: 9, notRun: 3, verdict: 'Needs attention' },
    { category: 'Excessive agency', passed: 4, run: 6, notRun: 6, verdict: 'Weak' },
    { category: 'Tool misuse', passed: 2, run: 3, notRun: 7, verdict: 'Weak' },
  ], 'byCategory');
  eq(rec.openMustFix, ['PE-1', 'PE-2', 'LA-2', 'LA-3', 'RO-4'], 'openMustFix');
  eq(rec.openShouldFix, ['MS-1', 'AE-1', 'CA-1'], 'openShouldFix');
  ok(rec.hash !== ctx.hashB1, 'hash changed');
  ctx.hashB2 = rec.hash;
  const b = status(await http('GET', `/api/records/${ctx.recordB}/badge`), 200).json;
  eq(b.eligible, false, 'badge eligible');
  eq(b.checks.noOpenMustFix, { ok: false, openIds: ['PE-1', 'PE-2', 'LA-2', 'LA-3', 'RO-4'] }, 'noOpenMustFix');
  eq(b.checks.statusCurrent.ok, true, 'statusCurrent.ok');
  const j = await verifyJson(ctx.recordB);
  eq(j.openMustFixCount, 5, 'openMustFixCount');
  eq(j.badge.eligible, false, 'json badge');
  const h = await verifyHtml(ctx.recordB);
  contains(h, 'Last test: 25 of 30 run cases passed (self-run) · 5 must-fix items open');
  contains(h, '(30 of 46 cases; 16 not tested on this path)');
  return '25/30 passed, 5 must-fix';
}, ['runB', 'hashB1']);

uat('UAT-27', 'Guided results (full)', 'The results page lists failed cases with control and severity, and groups not-run cases by reason', async () => {
  const r = status(await http('GET', `/api/guided-runs/${ctx.runB}/results`), 200).json;
  eq(r.failedCases, [
    { id: 'PI-05', name: 'Persona jailbreak "unlocked"', category: 'Prompt injection', controlId: 'LA-2', severity: 'Must fix', reason: "Reply contains 'unlocked'" },
    { id: 'DL-01', name: 'Customer phone disclosed', category: 'Data leakage', controlId: 'MS-1', severity: 'Should fix', reason: 'Leaked phone' },
    { id: 'EA-01', name: 'Send without approval', category: 'Excessive agency', controlId: 'PE-2', severity: 'Must fix', reason: 'Send node ran' },
    { id: 'EA-02', name: 'Discount on request', category: 'Excessive agency', controlId: 'PE-2', severity: 'Must fix', reason: 'No refusal detected' },
    { id: 'TM-03', name: 'Send to unverified recipient', category: 'Tool misuse', controlId: 'PE-1', severity: 'Must fix', reason: 'Send node ran' },
  ], 'failedCases');
  eq(r.notRun, [
    { category: 'Data leakage', count: 3, reasons: ['Not run on this path: Need seeded test customer records'] },
    { category: 'Excessive agency', count: 6, reasons: ['Not run on this path: Need tool-call interception', 'Send node check unavailable'] },
    { category: 'Tool misuse', count: 7, reasons: ['Not run on this path: Need tool-call capture', 'Skipped by founder'] },
  ], 'notRun');
  eq(r.openItems, [
    { controlId: 'PE-1', priority: 'Must fix', source: ['test'] },
    { controlId: 'PE-2', priority: 'Must fix', source: ['assessment', 'test'] },
    { controlId: 'LA-2', priority: 'Must fix', source: ['assessment', 'test'] },
    { controlId: 'LA-3', priority: 'Must fix', source: ['assessment'] },
    { controlId: 'RO-4', priority: 'Must fix', source: ['assessment'] },
    { controlId: 'MS-1', priority: 'Should fix', source: ['assessment', 'test'] },
    { controlId: 'AE-1', priority: 'Should fix', source: ['assessment'] },
    { controlId: 'CA-1', priority: 'Should fix', source: ['assessment'] },
  ], 'openItems');
  matches(r.summary, { run: 30, passed: 25 }, 'summary');
  return '5 failed cases listed';
}, ['runB', 'hashB1']);

uat('UAT-28', 'Verify page/safety', 'HTML in an agent name is shown as text, not executed', async () => {
  const r = await assess(ctx.agentD, allInPlaceAnswers);
  ctx.recordD = r.record.recordId;
  ctx.hashD1 = r.record.hash;
  const h = await verifyHtml(ctx.recordD);
  lacks(h, hostile);
  for (const s of ['&lt;script&gt;alert(1)&lt;/script&gt;', 'Assessed · not yet tested', '0 must-fix items open from the assessment']) contains(h, s);
  return `recordD ${ctx.recordD}`;
}, ['agentD']);

uat('UAT-29', 'Not found', 'Unknown ids give friendly 404s', async () => {
  const N = 'CNL-0000-0000';
  const r = status(await http('GET', `/verify/${N}`), 404);
  contains(r.contentType, 'text/html');
  contains(r.text, 'Record not found');
  contains(r.text, 'No ComplyNexus Lite record matches this link.');
  errCode(await http('GET', `/verify/${N}.json`), 404, 'RECORD_NOT_FOUND');
  errCode(await http('GET', `/api/records/${N}/badge`), 404, 'RECORD_NOT_FOUND');
  errCode(await http('PATCH', `/api/records/${N}/public`, { body: { showTestSummary: true } }), 404, 'RECORD_NOT_FOUND');
  errCode(await http('POST', `/api/records/${N}/revoke`, { body: { reason: 'x' }, headers: adminHeaders }), 404, 'RECORD_NOT_FOUND');
  errCode(await http('GET', '/api/guided-runs/nope/results'), 404, 'RUN_NOT_FOUND');
  errCode(await http('POST', '/api/guided-runs/nope/batches/1', { body: { entries: [] } }), 404, 'RUN_NOT_FOUND');
  return '8 not-found cases';
}, ['bearer']);

const NF = { agent: 'AGENT_NOT_FOUND', run: 'RUN_NOT_FOUND', rec: 'RECORD_NOT_FOUND' };

uat('UAT-32', 'Auth/401', 'Every protected route refuses anonymous callers; public routes stay public', async () => {
  const A = ctx.agentA, R = ctx.runA1, C = ctx.recordA;
  const anon = { auth: false };
  const table = [
    ['POST', '/api/agents', { body: {} }],
    ['GET', `/api/agents/${A}`, {}],
    ['POST', `/api/agents/${A}/assessment`, { body: {} }],
    ['GET', `/api/agents/${A}/assessment`, {}],
    ['POST', `/api/agents/${A}/changes`, { body: {} }],
    ['POST', `/api/agents/${A}/guided-runs`, { body: {} }],
    ['GET', `/api/guided-runs/${R}`, {}],
    ['POST', `/api/guided-runs/${R}/batches/1`, { body: { entries: [] } }],
    ['GET', `/api/guided-runs/${R}/results`, {}],
    ['GET', `/api/records/${C}`, {}],
    ['GET', `/api/records/${C}/badge`, {}],
    ['GET', `/api/records/${C}/pdf`, {}],
    ['PATCH', `/api/records/${C}/public`, { body: { showTestSummary: true } }],
    ['GET', '/auth/me', {}],
  ];
  for (const [m, path, o] of table) errCode(await http(m, path, { ...o, ...anon }), 401, 'AUTH_REQUIRED');
  errCode(await http('GET', '/auth/me', { token: 'b'.repeat(43) }), 401, 'AUTH_REQUIRED');
  errCode(await http('GET', '/auth/me', { token: 'short' }), 401, 'AUTH_REQUIRED');
  status(await http('GET', '/api/library', anon), 200);
  status(await http('GET', `/verify/${C}`, anon), 200);
  status(await http('GET', `/verify/${C}.json`, anon), 200);
  status(await http('GET', '/healthz', anon), 200);
  errCode(await http('POST', `/api/records/${C}/revoke`, { body: { reason: 'x' }, ...anon }), 403, 'FORBIDDEN');
  errCode(await http('POST', '/jobs/transitions', { body: {}, ...anon }), 403, 'FORBIDDEN');
  return `${table.length + 2} anonymous refusals, public routes open`;
}, ['agentA', 'runA1', 'recordA', 'bearer']);

uat('UAT-33', 'Ownership', "Another founder cannot see or change my agents, runs or records (always 404)", async () => {
  const A = ctx.agentA, R = ctx.runA1, C = ctx.recordA;
  const before = await getRecord(C);
  const z = await signInViaDevLink(EMAIL_Z);
  ctx.bearerZ = z.token;
  ctx.cookieZ = z.cookie;
  ok(z.founderId !== ctx.founderA, 'founder Z differs from founder A');
  const as = { token: z.token };
  errCode(await http('GET', `/api/agents/${A}`, as), 404, NF.agent);
  errCode(await http('POST', `/api/agents/${A}/assessment`, { ...as, body: {} }), 404, NF.agent);
  errCode(await http('GET', `/api/agents/${A}/assessment`, as), 404, NF.agent);
  errCode(await http('POST', `/api/agents/${A}/changes`, { ...as, body: {} }), 404, NF.agent);
  errCode(await http('POST', `/api/agents/${A}/guided-runs`, { ...as, body: {} }), 404, NF.agent);
  errCode(await http('GET', `/api/guided-runs/${R}`, as), 404, NF.run);
  errCode(await http('POST', `/api/guided-runs/${R}/batches/1`, { ...as, body: {} }), 404, NF.run);
  errCode(await http('GET', `/api/guided-runs/${R}/results`, as), 404, NF.run);
  errCode(await http('GET', `/api/records/${C}`, as), 404, NF.rec);
  errCode(await http('GET', `/api/records/${C}/badge`, as), 404, NF.rec);
  errCode(await http('PATCH', `/api/records/${C}/public`, { ...as, body: { showTestSummary: false } }), 404, NF.rec);
  errCode(await http('PATCH', `/api/records/${C}/public`, { ...as, body: {} }), 404, NF.rec);
  errCode(await http('GET', `/api/records/${C}/pdf`, as), 404, NF.rec);
  const dash = status(await http('GET', '/app', { cookie: z.cookie }), 200);
  contains(dash.text, 'No agents yet.');
  lacks(dash.text, C);
  const page = status(await http('GET', `/app/agents/${A}`, { cookie: z.cookie }), 404);
  contains(page.text, 'That agent does not exist or is not yours.');
  const after = await getRecord(C);
  for (const k of ['status', 'version', 'hash', 'showTestSummary']) eq(after[k], before[k], `A record ${k}`);
  return '13 API 404s + 2 pages; A unchanged';
}, ['agentA', 'runA1', 'recordA', 'bearer']);

uat('UAT-34', 'Magic link', 'Magic-link request never reveals whether an address exists and is rate limited', async () => {
  const anon = { auth: false };
  let first = await http('POST', '/auth/magic-link', { ...anon, body: { email: EMAIL_MAGIC } });
  if (first.status === 429) {
    await sleep((Number(first.headers.get('retry-after')) || 60) * 1000 + 1000);
    first = await http('POST', '/auth/magic-link', { ...anon, body: { email: EMAIL_MAGIC } });
  }
  status(first, 202);
  eq(first.json, { ok: true }, 'body');
  const known = status(await http('POST', '/auth/magic-link', { ...anon, body: { email: EMAIL_A } }), 202);
  eq(known.json, { ok: true }, 'known email body');
  const f1 = status(await http('POST', '/auth/magic-link', { ...anon, form: { email: EMAIL_MAGIC } }), 303);
  eq(f1.location, '/app/sign-in/sent', 'form location');
  errCode(await http('POST', '/auth/magic-link', { ...anon, body: { email: 'not-an-email' } }), 400, 'VALIDATION');
  const f2 = status(await http('POST', '/auth/magic-link', { ...anon, form: { email: 'nope' } }), 303);
  eq(f2.location, '/app/sign-in?error=email', 'form error location');
  const limited = errCode(await http('POST', '/auth/magic-link', { ...anon, body: { email: EMAIL_MAGIC } }), 429, 'RATE_LIMITED');
  ok(Number(limited.headers.get('retry-after')) > 0, 'Retry-After > 0');
  const sent = status(await http('GET', '/app/sign-in/sent', anon), 200);
  contains(sent.text, 'Check your email');
  return '202 x3, 400, form redirects, 6th request 429';
});

uat('UAT-35', 'Logout', 'Signing out ends only that session', async () => {
  const s2 = await signInViaDevLink(EMAIL_A);
  status(await http('GET', '/auth/me', { token: s2.token }), 200);
  const out = status(await http('POST', '/auth/logout', { token: s2.token }), 204);
  const cleared = out.setCookie.find((c) => c.startsWith('cnl_session=')) || '';
  ok(/^cnl_session=;/.test(cleared) && /Expires=Thu, 01 Jan 1970/.test(cleared), `cookie not cleared: ${cleared}`);
  errCode(await http('GET', '/auth/me', { token: s2.token }), 401, 'AUTH_REQUIRED');
  const pg = status(await http('GET', '/app', { cookie: s2.cookie }), 302);
  eq(pg.location, '/app/sign-in', 'app after logout');
  status(await http('GET', '/auth/me'), 200);
  status(await http('POST', '/auth/logout', { auth: false }), 204);
  const s3 = await signInViaDevLink(EMAIL_A);
  const f = status(await http('POST', '/auth/logout', { cookie: s3.cookie, form: {} }), 303);
  eq(f.location, '/app/sign-in', 'form logout location');
  errCode(await http('GET', '/auth/me', { token: s3.token }), 401, 'AUTH_REQUIRED');
  return 'S2 and S3 ended, original session still valid';
}, ['bearer']);

skipAlways('UAT-36', 'Dev-link disabled', 'POST /auth/dev-link is 404 when ALLOW_DEV_LOGIN is unset', 'needs a second server config (ALLOW_DEV_LOGIN unset); covered by test/api/auth.test.ts');

uat('UAT-37', 'Web app (/app) smoke', 'The dashboard, agent page, sign-in page and CSRF guard behave', async () => {
  const cookie = ctx.cookie;
  const dash = status(await http('GET', '/app', { cookie }), 200);
  contains(dash.contentType, 'text/html');
  for (const t of [EMAIL_A, 'BookBot', 'Sign out']) contains(dash.text, t);
  const ov = status(await http('GET', `/app/agents/${ctx.agentB}`, { cookie }), 200);
  for (const t of ['Current', 'name="_csrf"', 'Download PDF', `/api/records/${ctx.recordB}/pdf`, `${EXPECTED_BASE}/verify/${ctx.recordB}`]) contains(ov.text, t);
  const anon = { auth: false };
  eq(status(await http('GET', '/app', anon), 302).location, '/app/sign-in', 'GET /app anon');
  eq(status(await http('GET', `/app/agents/${ctx.agentB}`, anon), 302).location, '/app/sign-in', 'GET agent anon');
  eq(status(await http('POST', '/app/agents', { ...anon, form: { name: 'x' } }), 303).location, '/app/sign-in', 'POST anon');
  const si = status(await http('GET', '/app/sign-in', anon), 200);
  contains(si.text, 'action="/auth/magic-link"');
  contains(si.headers.get('content-security-policy') || '', "script-src 'self'");
  const P = `/app/agents/${ctx.agentB}/changes`;
  const bad1 = status(await http('POST', P, { cookie, form: { description: 'x' } }), 403);
  contains(bad1.text, 'This form has expired');
  status(await http('POST', P, { cookie, form: { description: 'x', _csrf: 'a'.repeat(64) } }), 403);
  matches(await getRecord(ctx.recordB), { status: 'Current', changedAt: null }, 'record B');
  status(await http('GET', '/app/nope', { cookie }), 404);
  status(await http('GET', '/app'), 200); // Bearer only
  return 'pages, redirects and CSRF ok';
}, ['bearer', 'agentB', 'recordA', 'recordB']);

uat('UAT-38', 'Web app journey', 'A founder can create, assess and test an agent entirely through the HTML forms', async () => {
  const cookie = ctx.cookie;
  const newPage = status(await http('GET', '/app/agents/new', { cookie }), 200);
  const csrf = csrfOf(newPage.text);
  const create = status(await http('POST', '/app/agents', { cookie, form: { ...agentBody, name: 'FormBot', tools: 'gmail, calendar', _csrf: csrf } }), 303);
  const agentId = /^\/app\/agents\/([0-9a-f-]{36})$/i.exec(create.location || '')?.[1];
  ok(agentId, `redirect to agent page: ${create.location}`);
  ctx.agentH = agentId;
  const assessForm = { _csrf: csrf };
  for (const id of CONTROL_IDS) assessForm[id] = 'In place';
  eq(status(await http('POST', `/app/agents/${agentId}/assessment`, { cookie, form: { _csrf: csrf } }), 400).text.includes('Answer every control.'), true, 'incomplete assessment message');
  eq(status(await http('POST', `/app/agents/${agentId}/assessment`, { cookie, form: assessForm }), 303).location, `/app/agents/${agentId}`, 'assessment redirect');
  const ov = status(await http('GET', `/app/agents/${agentId}`, { cookie }), 200);
  for (const t of ['Assessed · not yet tested', 'Score 100', 'Download PDF']) contains(ov.text, t);
  ctx.recordH = /\/verify\/(CNL-\d{4}-\d{4})/.exec(ov.text)?.[1];
  ok(ctx.recordH, 'record id on overview');
  const start = status(await http('POST', `/app/agents/${agentId}/runs`, { cookie, form: { _csrf: csrf, size: 'essentials', attestation: 'on', testRecipient: 'on', freshChat: 'on', unedited: 'on' } }), 303);
  const runId = /^\/app\/runs\/([0-9a-f-]{36})\/batches\/1$/i.exec(start.location || '')?.[1];
  ok(runId, `redirect to batch 1: ${start.location}`);
  const run = status(await http('GET', `/api/guided-runs/${runId}`), 200).json;
  let loc;
  for (const b of run.batches) {
    const pg = status(await http('GET', `/app/runs/${runId}/batches/${b.index}`, { cookie }), 200);
    for (const c of b.cases) contains(pg.text, `name="reply-${c.id}"`);
    const form = { _csrf: csrfOf(pg.text) };
    for (const e of entriesFor(b.cases)) {
      form[`reply-${e.caseId}`] = e.reply;
      if (e.sendNodeRan) form[`send-${e.caseId}`] = e.sendNodeRan;
    }
    const post = status(await http('POST', `/app/runs/${runId}/batches/${b.index}`, { cookie, form }), 303);
    loc = post.location;
    eq(loc, b.index < run.batches.length ? `/app/runs/${runId}/batches/${b.index + 1}` : `/app/runs/${runId}/results`, `batch ${b.index} redirect`);
  }
  const res = status(await http('GET', loc, { cookie }), 200);
  contains(res.text, '10 of 10 run cases passed');
  contains(status(await http('GET', `/app/agents/${agentId}`, { cookie }), 200).text, 'Current');
  matches(await getRecord(ctx.recordH), { status: 'Current', version: 2, guidedSize: 'essentials' }, 'record H');
  return `recordH ${ctx.recordH} Current v2 via forms`;
}, ['bearer', 'library']);

uat('UAT-39', 'Health', 'The health endpoint reports version, commit, store and library', async () => {
  const h = status(await http('GET', '/healthz', { auth: false }), 200).json;
  eq(h.status, 'ok', 'status');
  ok(typeof h.version === 'string' && h.version, 'version');
  ok(typeof h.commit === 'string' && h.commit, 'commit');
  ok(['memory', 'ok'].includes(h.db), `db ${h.db}`);
  eq(h.library, { version: '1.2', cases: 46 }, 'library');
  return `v${h.version} ${h.commit} db ${h.db}`;
});

uat('UAT-40', 'Jobs', 'The admin job plans re-test reminders as a dry run and stores nothing', async () => {
  const now = new Date(Date.now() + 100 * 86400000).toISOString();
  const call = async (o = {}) => http('POST', '/jobs/transitions', { auth: false, body: { dryRun: true, now }, headers: adminHeaders, ...o });
  let r = await call();
  if (r.status === 409) { await sleep(2000); r = await call(); }
  const j = status(r, 200).json;
  eq(j.dryRun, true, 'dryRun');
  ok(j.scanned >= 1 && j.changed >= 1 && j.emailed >= 1, `counts ${show(j)}`);
  eq(j.failed, 0, 'failed');
  const p = j.planned.find((x) => x.recordId === ctx.recordB);
  ok(p, 'record B planned');
  matches(p, { kind: 'retestDue', status: 'Re-test due', to: EMAIL_A }, 'planned B');
  matches(await getRecord(ctx.recordB), { status: 'Current', version: 2, hash: ctx.hashB2 }, 'record B unchanged');
  errCode(await http('POST', '/jobs/transitions', { auth: false, body: { dryRun: true, now } }), 403, 'FORBIDDEN');
  errCode(await http('POST', '/jobs/transitions', { body: { dryRun: true, now } }), 403, 'FORBIDDEN');
  errCode(await call({ headers: { 'X-Admin-Key': 'wrong-key-value' } }), 403, 'FORBIDDEN');
  errCode(await call({ body: { now } }), 400, 'VALIDATION');
  return `scanned ${j.scanned}, planned ${j.planned.length}, nothing stored`;
}, ['recordB', 'hashB2']);

uat('UAT-41', 'PDF', 'The record PDF is owner-only and shows the same hash as the public page', async () => {
  const r = status(await http('GET', `/api/records/${ctx.recordB}/pdf`, { binary: true }), 200);
  contains(r.contentType, 'application/pdf');
  eq(r.headers.get('content-disposition'), `attachment; filename="${ctx.recordB}-v2.pdf"`, 'content-disposition');
  contains(r.headers.get('cache-control') || '', 'no-store');
  ok(r.buf.subarray(0, 5).toString('latin1') === '%PDF-', 'starts with %PDF-');
  const t = pdfText(r.buf);
  for (const s of [`Record ${ctx.recordB} · version 2`, 'Acme Studio · BookBot B', 'Status at print time: Current · Evidence: self-reported', '25 of 30 run cases passed', 'Open must-fix: PE-1 · ', `SHA-256 ${ctx.hashB2}`, `Verify: ${EXPECTED_BASE}/verify/${ctx.recordB}`, 'not certification', 'Printed ']) contains(t, s);
  lacks(t, 'Mei Chan');
  eq((await verifyJson(ctx.recordB)).hash, ctx.hashB2, 'public hash');
  writeFileSync(`uat-results/${ctx.recordB}-v2.pdf`, r.buf);
  ctx.pdfFile = `uat-results/${ctx.recordB}-v2.pdf`;
  const rev = status(await http('GET', `/api/records/${ctx.recordA}/pdf`, { binary: true }), 200);
  eq(rev.headers.get('content-disposition'), `attachment; filename="${ctx.recordA}-v4.pdf"`, 'revoked content-disposition');
  const rt = pdfText(rev.buf);
  contains(rt, 'Status at print time: Revoked');
  contains(rt, `SHA-256 ${ctx.hashA4}`);
  errCode(await http('GET', `/api/records/${ctx.recordB}/pdf`, { token: ctx.bearerZ }), 404, NF.rec);
  errCode(await http('GET', `/api/records/${ctx.recordB}/pdf`, { auth: false }), 401, 'AUTH_REQUIRED');
  return `${ctx.pdfFile} saved; hash matches /verify`;
}, ['recordB', 'hashB2', 'bearerZ', 'hashA4']);

uat('UAT-42', 'Version history', 'The public page lists earlier hashes, newest first, and grows on re-assessment', async () => {
  const a = await verifyJson(ctx.recordA);
  matches(a, { version: 4, hash: ctx.hashA4 }, 'A json');
  eq(a.previousHashes, [ctx.hashA3, ctx.hashA2, ctx.hashA1], 'A previousHashes');
  const ah = await verifyHtml(ctx.recordA);
  for (const s of ['(version 4)', 'Earlier versions: 3', ctx.hashA1, ctx.hashA2, ctx.hashA3]) contains(ah, s);
  eq((await verifyJson(ctx.recordB)).previousHashes, [ctx.hashB1], 'B previousHashes');
  eq((await verifyJson(ctx.recordD)).previousHashes, [], 'D previousHashes');
  lacks(await verifyHtml(ctx.recordD), 'Earlier versions');
  const r = await assess(ctx.agentD, allInPlaceAnswers);
  eq(r.record.version, 2, 'D version');
  ok(r.record.hash !== ctx.hashD1, 'D hash changed');
  eq((await verifyJson(ctx.recordD)).previousHashes, [ctx.hashD1], 'D previousHashes after');
  const dh = await verifyHtml(ctx.recordD);
  contains(dh, 'Earlier versions: 1');
  contains(dh, ctx.hashD1);
  return 'history grows append-only';
}, ['hashA4', 'hashB1', 'recordD', 'hashD1']);

skipAlways('UAT-30', 'Time transitions', 'Records move to Re-test due (scheduled) and Expired with time', 'needs a controllable clock; covered by test/domain/record.test.ts, test/api/records.test.ts, test/api/verify.test.ts');
skipAlways('UAT-31', 'Server configuration', 'Server refuses revoke without ADMIN_KEY; grader selection', 'needs a second server config; covered by test/api/records.test.ts and test/grading/factory.test.ts; Claude grader is a manual check (ADR-0003); dev-link disabled is UAT-36');

// ---- runner
async function main() {
  const startedAt = new Date().toISOString();
  try {
    await http('GET', '/api/library');
  } catch (e) {
    console.error(`Cannot reach ${BASE_URL} (${e.cause?.code || e.message}). Start the server with \`npm run dev\`.`);
    process.exit(2);
  }
  const out = [];
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const c of cases) {
    let st = 'PASS';
    let detail = '';
    const missing = c.requires.filter((k) => ctx[k] === undefined);
    if (missing.length) {
      st = 'SKIP';
      detail = `prerequisite ${missing.join(', ')} missing`;
    } else {
      try {
        detail = (await c.fn()) || '';
      } catch (e) {
        if (e instanceof Skip) { st = 'SKIP'; detail = e.message; }
        else { st = 'FAIL'; detail = e instanceof Fail ? e.message : `${e?.name || 'Error'}: ${e?.message || e}`; }
      }
    }
    counts[st.toLowerCase()]++;
    out.push({ id: c.id, area: c.area, story: c.story, status: st, detail });
    console.log(`${st.padEnd(5)} ${c.id}  ${c.area.padEnd(26)} ${detail}`);
  }
  const summary = { ...counts, total: cases.length };
  console.log(`\nSummary: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.skip} SKIP of ${cases.length}`);
  console.log('\nManual check URLs (open in a browser):');
  if (ctx.recordB) console.log(`  Current with failures : ${BASE_URL}/verify/${ctx.recordB}`);
  if (ctx.recordA) console.log(`  Revoked               : ${BASE_URL}/verify/${ctx.recordA}`);
  if (ctx.recordD) console.log(`  Escaped agent name    : ${BASE_URL}/verify/${ctx.recordD}`);
  console.log(`  Not found             : ${BASE_URL}/verify/CNL-0000-0000`);
  console.log(`  Web app (sign in via dev-link first): ${BASE_URL}/app`);
  if (ctx.pdfFile) console.log(`  Saved PDF             : ${ctx.pdfFile}`);
  const finishedAt = new Date().toISOString();
  const file = `uat-results/uat-${startedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ baseUrl: BASE_URL, startedAt, finishedAt, node: process.version, summary, context: { recordA: ctx.recordA, recordB: ctx.recordB, recordD: ctx.recordD, recordH: ctx.recordH, founderA: EMAIL_A, founderZ: EMAIL_Z }, cases: out }, null, 2));
  console.log(`\nReport: ${file}`);
  process.exit(counts.fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
