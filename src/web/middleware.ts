import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { AppDeps } from '../api/deps';
import { HttpError } from '../api/errors';
import { currentSession } from '../api/middleware/auth';
import { DomainError } from '../domain/types';
import type { Founder, Session } from '../domain/types';
import { CSRF_FIELD, csrfToken, csrfValid } from './csrf';
import { renderError } from './views/error';

export const publicHost = (deps: AppDeps): string | undefined => (deps.publicBaseUrl ? new URL(deps.publicBaseUrl).host : undefined);

export function requireFounderPage(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    currentSession(deps, req).then((cur) => {
      if (!cur) {
        res.redirect(req.method === 'GET' ? 302 : 303, '/app/sign-in');
        return;
      }
      res.locals.founder = cur.founder;
      res.locals.session = cur.session;
      res.locals.csrf = csrfToken(deps.csrfSecret, cur.session.id);
      next();
    }, next);
  };
}

export function csrfGuard(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    const presented = (req.body as Record<string, unknown> | undefined)?.[CSRF_FIELD];
    if (!csrfValid(deps.csrfSecret, (res.locals.session as Session).id, presented)) {
      next(new HttpError(403, 'CSRF'));
      return;
    }
    next();
  };
}

const FRIENDLY: Record<string, string> = {
  AGENT_NOT_FOUND: 'That agent does not exist or is not yours.',
  RECORD_NOT_FOUND: 'That record does not exist or is not yours.',
  RUN_NOT_FOUND: 'That test run does not exist or is not yours.',
  NOT_FOUND: 'Page not found.',
  CSRF: 'This form has expired. Go back, reload the page and try again.',
  ASSESSMENT_REQUIRED: 'Complete the readiness assessment before starting a test.',
  RECORD_REVOKED: 'This record was revoked by ComplyNexus and cannot change.',
  BATCH_OUT_OF_ORDER: 'Batches must be submitted in order.',
  INVALID_BATCH: 'The batch did not match the expected cases.',
  INCOMPLETE_ASSESSMENT: 'Answer all 15 controls.',
};

export function zodMessages(e: ZodError): string[] {
  return e.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`);
}

export function htmlErrorHandler(deps: AppDeps): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const ctx = {
      founderEmail: (res.locals.founder as Founder | undefined)?.email,
      publicHost: publicHost(deps),
    };
    const reply = (status: number, message: string): void => {
      res
        .status(status)
        .type('html')
        .send(renderError(ctx, status, message));
    };
    if (err instanceof HttpError) return reply(err.status, FRIENDLY[err.code] ?? 'Something went wrong.');
    if (err instanceof DomainError) return reply(409, FRIENDLY[err.code] ?? 'That action is not allowed right now.');
    if (err instanceof ZodError) return reply(400, 'Some fields were invalid. Go back and check the form.');
    deps.logger.error(
      {
        err,
        reqId: res.locals.requestId,
        method: req.method,
        path: req.originalUrl,
      },
      'unhandled error',
    );
    reply(500, `Something went wrong. Reference ${String(res.locals.requestId)}.`);
  };
}
