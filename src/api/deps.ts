import { createGrader } from '../grading/grader';
import type { Grader } from '../grading/grader';
import { SystemClock } from '../infra/clock';
import type { Clock } from '../infra/clock';
import { InMemoryRepository } from '../infra/repo/inMemory';
import type { Repos } from '../infra/repo/repository';

export interface AppDeps {
  repos: Repos;
  clock: Clock;
  grader: Grader;
  adminKey?: string;
}

export function createDefaultDeps(): AppDeps {
  return {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
    },
    clock: new SystemClock(),
    grader: createGrader(),
    adminKey: process.env.ADMIN_KEY,
  };
}
