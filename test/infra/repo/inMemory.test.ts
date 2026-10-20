import { InMemoryLoginTokenStore, InMemoryRepository } from '../../../src/infra/repo/inMemory';
import { loginTokenStoreContract } from './loginTokenStoreContract';
import { repositoryContract } from './repositoryContract';
import type { Doc } from './repositoryContract';

repositoryContract('InMemoryRepository', async () => new InMemoryRepository<Doc>());
loginTokenStoreContract('InMemoryLoginTokenStore', async () => new InMemoryLoginTokenStore());
