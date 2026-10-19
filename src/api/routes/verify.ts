import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { HttpError } from '../errors';
import { loadRecord } from '../helpers';
import { badgeEligibility } from '../../domain/badge';
import type { ReadinessRecord } from '../../domain/types';
import { DISCLAIMER, renderVerifyHtml } from '../views/verify';
import type { PublicRecordView } from '../views/verify';

export function toPublicView(r: ReadinessRecord): PublicRecordView {
  return {
    recordId: r.recordId,
    version: r.version,
    orgName: r.orgName,
    agentName: r.agentName,
    status: r.status,
    assessedAt: r.assessedAt,
    lastTestedAt: r.lastTestedAt,
    retestBy: r.retestBy,
    nextRetestBy: r.nextRetestBy,
    retestReason: r.retestReason,
    changedAt: r.changedAt,
    expiredAt: r.expiredAt,
    revokedAt: r.revokedAt,
    runMode: r.runMode,
    evidenceLevel: r.evidenceLevel,
    guidedSize: r.guidedSize,
    hash: r.hash,
    showTestSummary: r.showTestSummary,
    testSummary: r.showTestSummary ? r.testSummary : null,
    openMustFixCount: r.openMustFix.length,
    badge: { eligible: badgeEligibility(r).eligible },
    disclaimer: DISCLAIMER,
  };
}

export function verifyRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  router.get('/:recordId.json', async (req, res) => {
    const r = toPublicView(await loadRecord(deps, req.params.recordId));
    res.json({
      recordId: r.recordId,
      version: r.version,
      orgName: r.orgName,
      agentName: r.agentName,
      status: r.status,
      assessedAt: r.assessedAt,
      lastTestedAt: r.lastTestedAt,
      retestBy: r.retestBy,
      nextRetestBy: r.nextRetestBy,
      runMode: r.runMode,
      evidenceLevel: r.evidenceLevel,
      guidedSize: r.guidedSize,
      hash: r.hash,
      testSummary: r.testSummary,
      openMustFixCount: r.openMustFixCount,
      badge: r.badge,
      disclaimer: r.disclaimer,
    });
  });

  router.get('/:recordId', async (req, res) => {
    try {
      const view = toPublicView(await loadRecord(deps, req.params.recordId));
      res.type('html').send(renderVerifyHtml(view));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        res.status(404).type('html').send('<!doctype html><html><head><meta charset="utf-8"><title>Record not found</title></head><body><h1>Record not found</h1><p>No ComplyNexus Lite record matches this link.</p></body></html>');
        return;
      }
      throw e;
    }
  });

  return router;
}
