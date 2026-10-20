import type { RequestHandler } from 'express';
import type { Logger } from '../../infra/logger';

const SENSITIVE = /([?&](?:token|access_token|code)=)[^&#]*/gi;

/** Hides login tokens and similar secrets carried in the query string. */
export function redactUrl(url: string): string {
  return url.replace(SENSITIVE, '$1[REDACTED]');
}

export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(
        { reqId: res.locals.requestId, method: req.method, path: redactUrl(req.originalUrl), status: res.statusCode, ms },
        'request',
      );
    });
    next();
  };
}
