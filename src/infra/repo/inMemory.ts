import type { Repository } from './repository';

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly items = new Map<string, T>();

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
  async find(pred: (t: T) => boolean): Promise<T[]> {
    return [...this.items.values()].filter(pred).map((x) => structuredClone(x));
  }
  async count(): Promise<number> {
    return this.items.size;
  }
}
