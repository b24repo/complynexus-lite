import pino from 'pino';
import type { Logger } from 'pino';

export type { Logger };

export function createLogger(env: NodeJS.ProcessEnv = process.env): Logger {
  const level = env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info');
  return pino({ level, base: { service: 'complynexus-lite', commit: env.GIT_COMMIT ?? 'dev' } });
}
