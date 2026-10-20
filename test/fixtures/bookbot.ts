import { CONTROLS } from '../../src/domain/controls';
import type { Agent, AssessmentAnswer, ControlStatus } from '../../src/domain/types';

const overrides: Record<string, ControlStatus> = {
  'PE-2': 'Missing',
  'RO-4': 'Missing',
  'LA-3': 'Missing',
  'AE-1': 'Missing',
  'LA-2': 'Partly in place',
  'MS-1': 'Partly in place',
  'CA-1': 'Partly in place',
};

/** BookBot board data: 4 missing, 3 partly, 8 in place. */
export const bookbotAnswers: AssessmentAnswer[] = CONTROLS.map((c) => ({
  controlId: c.id,
  status: overrides[c.id] ?? 'In place',
}));

export const allInPlaceAnswers: AssessmentAnswer[] = CONTROLS.map((c) => ({
  controlId: c.id,
  status: 'In place' as ControlStatus,
}));

export const withStatus = (status: ControlStatus, ...ids: string[]): AssessmentAnswer[] =>
  allInPlaceAnswers.map((a) => (ids.includes(a.controlId) ? { ...a, status } : a));

export const agentBody = {
  orgName: 'Acme Studio',
  name: 'BookBot',
  purpose: 'Handles booking requests',
  ownerName: 'Mei Chan',
  buildType: 'no_code',
  canActIrreversibly: 'yes',
  approvalMode: 'above_limit',
  approvalLimitHkd: 500,
  tools: ['gmail', 'calendar'],
} as const;

export const agentFixture: Agent = { id: 'agent-1', founderId: 'founder-1', ...agentBody, tools: [...agentBody.tools], createdAt: '2026-10-10T00:00:00.000Z' };
