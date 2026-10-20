import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// package.json sits two levels above both src/infra and dist/infra.
export const VERSION: string = (
  JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }
).version;
