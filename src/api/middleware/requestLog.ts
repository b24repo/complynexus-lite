import type { RequestHandler } from 'express';
import type { Logger } from '../../infra/logger';

export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(
        { reqId: res.locals.requestId, method: req.method, path: req.originalUrl, status: res.statusCode, ms },
        'request',
      );
    });
    next();
  };
}
