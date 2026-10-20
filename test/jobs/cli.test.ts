import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

describe('transitions cli', () => {
  it('keeps stdout as pure JSON and sends logs to stderr', async () => {
    const { stdout, stderr } = await run(process.execPath, ['--import', 'tsx', 'src/jobs/cli.ts', '--dry-run'], {
      env: { ...process.env, MONGODB_URI: '', NODE_ENV: 'development', LOG_LEVEL: 'info' },
    });
    expect(JSON.parse(stdout)).toMatchObject({ dryRun: true, scanned: 0 });
    expect(stderr).toContain('"level"');
  }, 30000);
});
