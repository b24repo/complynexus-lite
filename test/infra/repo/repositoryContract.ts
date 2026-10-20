import { describe, expect, it } from 'vitest';
import type { Repository } from '../../../src/infra/repo/repository';

export interface Doc {
  id: string;
  agentId: string;
  status: 'open' | 'done';
  createdAt: string;
  nested: { tags: string[]; score: number; note?: string };
}

export function doc(id: string, over: Partial<Doc> = {}): Doc {
  return { id, agentId: 'a1', status: 'open', createdAt: '2026-12-01T00:00:00.000Z', nested: { tags: ['x', 'y'], score: 1 }, ...over };
}

/** `fresh` must return an empty repository every call. */
export function repositoryContract(name: string, fresh: () => Promise<Repository<Doc>>): void {
  describe(`${name} repository contract`, () => {
    it('insert returns the item and getById finds it', async () => {
      const repo = await fresh();
      const d = doc('1');
      expect(await repo.insert(d)).toEqual(d);
      expect(await repo.getById('1')).toEqual(d);
      expect(await repo.count()).toBe(1);
    });
    it('getById returns null for an unknown id', async () => {
      const repo = await fresh();
      expect(await repo.getById('nope')).toBeNull();
    });
    it('insert rejects a duplicate id', async () => {
      const repo = await fresh();
      await repo.insert(doc('1'));
      await expect(repo.insert(doc('1'))).rejects.toThrow(/Duplicate id 1/);
      expect(await repo.count()).toBe(1);
    });
    it('update replaces the whole document and returns it', async () => {
      const repo = await fresh();
      await repo.insert(doc('1'));
      const next = doc('1', { status: 'done', nested: { tags: [], score: 2 } });
      expect(await repo.update(next)).toEqual(next);
      expect(await repo.getById('1')).toEqual(next);
    });
    it('update rejects an unknown id', async () => {
      const repo = await fresh();
      await expect(repo.update(doc('ghost'))).rejects.toThrow(/Unknown id ghost/);
    });
    it('find applies the predicate', async () => {
      const repo = await fresh();
      await repo.insert(doc('1'));
      await repo.insert(doc('2', { agentId: 'a2' }));
      await repo.insert(doc('3', { status: 'done' }));
      const found = await repo.find((d) => d.agentId === 'a1');
      expect(found.map((d) => d.id).sort()).toEqual(['1', '3']);
      expect(await repo.find(() => false)).toEqual([]);
    });
    it('find applies the optional equality filter before the predicate', async () => {
      const repo = await fresh();
      await repo.insert(doc('1'));
      await repo.insert(doc('2', { agentId: 'a2' }));
      await repo.insert(doc('3', { status: 'done' }));
      expect((await repo.find(() => true, { agentId: 'a1' })).map((d) => d.id).sort()).toEqual(['1', '3']);
      expect((await repo.find(() => true, { agentId: 'a1', status: 'done' })).map((d) => d.id)).toEqual(['3']);
      expect((await repo.find((d) => d.id === '1', { agentId: 'a1' })).map((d) => d.id)).toEqual(['1']);
    });
    it('delete removes the document and returns true, false for unknown', async () => {
      const repo = await fresh();
      await repo.insert(doc('1'));
      expect(await repo.delete('1')).toBe(true);
      expect(await repo.getById('1')).toBeNull();
      expect(await repo.delete('1')).toBe(false);
      expect(await repo.delete('nope')).toBe(false);
    });
    it('count counts all documents', async () => {
      const repo = await fresh();
      expect(await repo.count()).toBe(0);
      await repo.insert(doc('1'));
      await repo.insert(doc('2'));
      expect(await repo.count()).toBe(2);
    });
    it('stored data is isolated from caller mutation (structured-clone semantics)', async () => {
      const repo = await fresh();
      const input = doc('1');
      const returned = await repo.insert(input);
      input.nested.tags.push('mutated-input');
      returned.nested.tags.push('mutated-return');
      const read = await repo.getById('1');
      expect(read?.nested.tags).toEqual(['x', 'y']);
      if (!read) throw new Error('expected a stored document');
      read.nested.score = 99;
      expect((await repo.getById('1'))?.nested.score).toBe(1);
      const [fromFind] = await repo.find(() => true);
      fromFind.status = 'done';
      expect((await repo.getById('1'))?.status).toBe('open');
    });
    it('ISO timestamps and nested structures round-trip unchanged', async () => {
      const repo = await fresh();
      const d = doc('1', { nested: { tags: ['a'], score: 0.5, note: 'n' } });
      await repo.insert(d);
      const read = await repo.getById('1');
      if (!read) throw new Error('expected a stored document');
      expect(typeof read.createdAt).toBe('string');
      expect(read.createdAt).toBe('2026-12-01T00:00:00.000Z');
      expect(read).toEqual(d);
      expect(Object.keys(read).sort()).toEqual(Object.keys(d).sort());
    });
  });
}
