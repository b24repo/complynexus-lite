import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../../src/api/errors';
import { DomainError } from '../../src/domain/types';
import { htmlErrorHandler } from '../../src/web/middleware';
import { setup } from '../api/helpers';

async function run(err: unknown, headersSent = false) {
  const { deps } = await setup();
  const errorSpy = vi.spyOn(deps.logger, 'error');
  const out: { status?: number; html?: string } = {};
  const res = {
    headersSent,
    locals: { requestId: 'req-123' },
    status(s: number) {
      out.status = s;
      return this;
    },
    type() {
      return this;
    },
    send(h: string) {
      out.html = h;
      return this;
    },
  } as unknown as Response;
  const next = vi.fn();
  htmlErrorHandler(deps)(err, { method: 'GET', originalUrl: '/app/x' } as Request, res, next);
  return { out, next, errorSpy };
}

describe('htmlErrorHandler', () => {
  it('maps a DomainError to a friendly 409', async () => {
    const { out } = await run(new DomainError('ASSESSMENT_REQUIRED'));
    expect(out.status).toBe(409);
    expect(out.html).toContain('Complete the readiness assessment');
  });

  it('uses a generic message for an unknown DomainError code', async () => {
    const { out } = await run(new DomainError('SOMETHING_NEW'));
    expect(out.status).toBe(409);
    expect(out.html).toContain('That action is not allowed right now.');
  });

  it('maps a ZodError to 400', async () => {
    const { out } = await run(new ZodError([]));
    expect(out.status).toBe(400);
    expect(out.html).toContain('Some fields were invalid.');
  });

  it('maps an HttpError with an unknown code to its status and a generic message', async () => {
    const { out } = await run(new HttpError(418, 'TEAPOT'));
    expect(out.status).toBe(418);
    expect(out.html).toContain('Something went wrong.');
  });

  it('logs an unexpected error and returns a 500 with the request reference, without leaking the message', async () => {
    const { out, errorSpy } = await run(new Error('db password is hunter2'));
    expect(out.status).toBe(500);
    expect(out.html).toContain('Reference req-123.');
    expect(out.html).not.toContain('hunter2');
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('delegates to the next handler when headers were already sent', async () => {
    const boom = new Error('late');
    const { out, next } = await run(boom, true);
    expect(next).toHaveBeenCalledWith(boom);
    expect(out.status).toBeUndefined();
  });
});
