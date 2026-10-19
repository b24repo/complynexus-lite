import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../domain/types';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, 'NOT_FOUND'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', issues: err.issues } });
  } else if (err instanceof DomainError) {
    res.status(409).json({ error: { code: err.code } });
  } else if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code } });
  } else if (err instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'VALIDATION', issues: [{ message: 'Invalid JSON' }] } });
  } else {
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
}
