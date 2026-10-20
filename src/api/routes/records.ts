import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter, baseUrl, loadRecord } from '../helpers';
import { toPublicView } from './verify';
import { facts } from '../views/verify';
import { renderRecordPdf } from '../../pdf/recordPdf';
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

  router.get('/:recordId/pdf', auth, async (req, res) => {
    const record = await loadRecord(deps, req.params.recordId, founderOf(res).id);
    const pdf = await renderRecordPdf({
      record,
      facts: facts(toPublicView(record)),
      verifyUrl: `${baseUrl(deps, req)}/verify/${record.recordId}`,
      printedAt: deps.clock.now(),
    });
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${record.recordId}-v${record.version}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      })
      .send(pdf);
  });

  router.patch('/:recordId/public', auth, async (req, res) => {
    const parse = () => PublicBody.parse(req.body).showTestSummary;
    res.json(await setPublic(deps, req.params.recordId, founderOf(res).id, parse));
  });

  router.post('/:recordId/revoke', async (req, res) => {
    requireAdminKey(deps, req);
    const { reason } = RevokeBody.parse(req.body);
    res.json(await revokeRecord(deps, req.params.recordId, reason));
  });

  return router;
}
