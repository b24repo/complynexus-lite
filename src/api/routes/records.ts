import { timingSafeEqual } from 'node:crypto';
import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { HttpError } from '../errors';
import { PublicBody, RevokeBody } from '../schemas';
import { loadRecord } from '../helpers';
import { badgeEligibility } from '../../domain/badge';
import { applyRevoke } from '../../domain/record';

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function recordRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  router.get('/:recordId', async (req, res) => {
    res.json(await loadRecord(deps, req.params.recordId));
  });

  router.get('/:recordId/badge', async (req, res) => {
    const record = await loadRecord(deps, req.params.recordId);
    const base = deps.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    res.json({ ...badgeEligibility(record), verifyUrl: `${base}/verify/${record.recordId}` });
  });

  router.patch('/:recordId/public', async (req, res) => {
    const { showTestSummary } = PublicBody.parse(req.body);
    const record = await loadRecord(deps, req.params.recordId);
    res.json(await deps.repos.records.update({ ...record, showTestSummary, updatedAt: deps.clock.now().toISOString() }));
  });

  router.post('/:recordId/revoke', async (req, res) => {
    const key = req.header('X-Admin-Key');
    if (!deps.adminKey || !key || !sameKey(key, deps.adminKey)) throw new HttpError(403, 'FORBIDDEN');
    const { reason } = RevokeBody.parse(req.body);
    const record = await loadRecord(deps, req.params.recordId);
    res.json(await deps.repos.records.update(applyRevoke(record, reason, deps.clock.now())));
  });

  return router;
}
