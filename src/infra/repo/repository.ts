import type { Agent, Assessment, GuidedRun, ReadinessRecord } from '../../domain/types';

export interface Repository<T extends { id: string }> {
  insert(item: T): Promise<T>;
  getById(id: string): Promise<T | null>;
  update(item: T): Promise<T>;
  find(pred: (t: T) => boolean): Promise<T[]>;
  count(): Promise<number>;
}

export interface Repos {
  agents: Repository<Agent>;
  assessments: Repository<Assessment>;
  runs: Repository<GuidedRun>;
  records: Repository<ReadinessRecord>;
}
