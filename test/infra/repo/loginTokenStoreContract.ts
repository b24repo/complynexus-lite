import { describe, expect, it } from 'vitest';
import type { LoginToken } from '../../../src/domain/types';
import type { LoginTokenStore } from '../../../src/infra/repo/repository';

const NOW = new Date('2026-12-01T00:00:00.000Z');

function token(id: string, over: Partial<LoginToken> = {}): LoginToken {
  return {
    id,
    founderId: 'f1',
    email: 'f@example.com',
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    usedAt: null,
    ...over,
  };
}

/** `fresh` must return an empty store every call. */
export function loginTokenStoreContract(name: string, fresh: () => Promise<LoginTokenStore>): void {
  describe(`${name} login token store contract`, () => {
    it('consume returns the token once, then null', async () => {
      const store = await fresh();
      await store.insert(token('h1'));
      const first = await store.consume('h1', NOW);
      expect(first).toMatchObject({ id: 'h1', founderId: 'f1' });
      expect(first!.usedAt).toEqual(NOW);
      expect(await store.consume('h1', NOW)).toBeNull();
    });
    it('consume returns null when expired or unknown', async () => {
      const store = await fresh();
      await store.insert(token('h2'));
      expect(await store.consume('h2', new Date(NOW.getTime() + 15 * 60_000))).toBeNull();
      expect(await store.consume('missing', NOW)).toBeNull();
    });
    it('10 concurrent consumes yield exactly one winner', async () => {
      const store = await fresh();
      await store.insert(token('h3'));
      const results = await Promise.all(Array.from({ length: 10 }, () => store.consume('h3', NOW)));
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });
    it('round-trips Date fields as Dates', async () => {
      const store = await fresh();
      await store.insert(token('h4'));
      const got = await store.getById('h4');
      expect(got!.expiresAt).toBeInstanceOf(Date);
      expect(got!.usedAt).toBeNull();
    });
  });
}
