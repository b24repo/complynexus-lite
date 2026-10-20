import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter, baseUrl } from '../helpers';
import { requireAdminKey } from '../middleware/admin';
import { founderOf, requireFounder } from '../middleware/auth';
import { PublicBody, RevokeBody } from '../schemas';
import { badgeView, recordView, revokeRecord, setPublic } from '../../usecases/records';

export function recordRoutes(deps: AppDeps): Router {
  const router = asyncRouter();
  const auth = requireFounder(deps);

  router.get('/:recordId', auth, async (req, res) => {
    res.json(await recordView(deps, req.params.recordId, founderOf(res).id));
  });

  router.get('/:recordId/badge', auth, async (req, res) => {
    res.json(await badgeView(deps, req.params.recordId, founderOf(res).id, baseUrl(deps, req)));
  });

  router.patch('/:recordId/public', auth, async (req, res) => {
    const { showTestSummary } = PublicBody.parse(req.body);
    res.json(await setPublic(deps, req.params.recordId, founderOf(res).id, showTestSummary));
  });

  router.post('/:recordId/revoke', async (req, res) => {
    requireAdminKey(deps, req);
    const { reason } = RevokeBody.parse(req.body);
    res.json(await revokeRecord(deps, req.params.recordId, reason));
  });

  return router;
}
