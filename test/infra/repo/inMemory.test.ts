import { InMemoryRepository } from '../../../src/infra/repo/inMemory';
import { repositoryContract } from './repositoryContract';
import type { Doc } from './repositoryContract';

repositoryContract('InMemoryRepository', async () => new InMemoryRepository<Doc>());
