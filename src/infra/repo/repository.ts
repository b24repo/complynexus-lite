import type { Agent, Assessment, Founder, GuidedRun, LoginToken, ReadinessRecord, RecordVersion, Session } from '../../domain/types';

export interface Repository<T extends { id: string }> {
  insert(item: T): Promise<T>;
  getById(id: string): Promise<T | null>;
  update(item: T): Promise<T>;
  /** `where` is an optional equality filter applied before `pred`; implementations may use it as an index hint. */
  find(pred: (t: T) => boolean, where?: Partial<T>): Promise<T[]>;
  count(): Promise<number>;
  delete(id: string): Promise<boolean>;
}

export interface LoginTokenStore extends Repository<LoginToken> {
  /** Atomically marks the token used and returns it; null when unknown, already used or expired at `now`. */
  consume(tokenHash: string, now: Date): Promise<LoginToken | null>;
}

export interface Repos {
  agents: Repository<Agent>;
  assessments: Repository<Assessment>;
  runs: Repository<GuidedRun>;
  records: Repository<ReadinessRecord>;
  recordVersions: Repository<RecordVersion>;
  founders: Repository<Founder>;
  loginTokens: LoginTokenStore;
  sessions: Repository<Session>;
}
