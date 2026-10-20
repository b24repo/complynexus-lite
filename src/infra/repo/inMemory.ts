import type { LoginToken } from '../../domain/types';
import type { LoginTokenStore, Repository } from './repository';

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  protected readonly items = new Map<string, T>();

  async insert(item: T): Promise<T> {
    if (this.items.has(item.id)) throw new Error(`Duplicate id ${item.id}`);
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }
  async getById(id: string): Promise<T | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }
  async update(item: T): Promise<T> {
    if (!this.items.has(item.id)) throw new Error(`Unknown id ${item.id}`);
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }
  async find(pred: (t: T) => boolean, where?: Partial<T>): Promise<T[]> {
    const entries = Object.entries(where ?? {}) as [keyof T, unknown][];
    return [...this.items.values()]
      .filter((x) => entries.every(([k, v]) => x[k] === v))
      .filter(pred)
      .map((x) => structuredClone(x));
  }
  async count(): Promise<number> {
    return this.items.size;
  }
  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

export class InMemoryLoginTokenStore extends InMemoryRepository<LoginToken> implements LoginTokenStore {
  async consume(tokenHash: string, now: Date): Promise<LoginToken | null> {
    // No await before the write: that is what makes the check-and-mark atomic.
    const t = this.items.get(tokenHash);
    if (!t || t.usedAt !== null || t.expiresAt.getTime() <= now.getTime()) return null;
    t.usedAt = new Date(now.getTime());
    return structuredClone(t);
  }
}
