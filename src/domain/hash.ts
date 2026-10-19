import { createHash } from 'node:crypto';
import type { ReadinessRecord, RecordSnapshot } from './types';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export function recordHash(snapshot: RecordSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}

export function toSnapshot(record: ReadinessRecord): RecordSnapshot {
  return {
    recordId: record.recordId,
    version: record.version,
    orgName: record.orgName,
    agentName: record.agentName,
    ownerName: record.ownerName,
    assessedAt: record.assessedAt,
    lastTestedAt: record.lastTestedAt,
    runMode: record.runMode,
    evidenceLevel: record.evidenceLevel,
    guidedSize: record.guidedSize,
    readinessScore: record.readinessScore,
    riskBand: record.riskBand,
    openMustFix: record.openMustFix,
    openShouldFix: record.openShouldFix,
    testSummary: record.testSummary,
    libraryVersion: record.libraryVersion,
    controlSetVersion: record.controlSetVersion,
  };
}
