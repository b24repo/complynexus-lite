import pino from 'pino';
import type { Logger } from 'pino';

export type { Logger };

export function createLogger(env: NodeJS.ProcessEnv = process.env, opts: { stderr?: boolean } = {}): Logger {
  const level = env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info');
  const options = { level, base: { service: 'complynexus-lite', commit: env.GIT_COMMIT ?? 'dev' } };
  return opts.stderr ? pino(options, pino.destination({ fd: 2, sync: true })) : pino(options);
}
