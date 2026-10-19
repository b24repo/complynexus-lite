import { CONTROLS, getControl } from './controls';
import { DomainError } from './types';
import type { AssessmentAnswer, Control, ControlStatus, OpenItem, Priority, RiskBand } from './types';

export function priorityLabel(control: Control, status: ControlStatus): Priority {
  if (status === 'In place' || status === 'N/A') return 'OK';
  return control.severity === 'critical' ? 'Must fix' : 'Should fix';
}

function assertComplete(answers: AssessmentAnswer[]): void {
  const seen = new Set(answers.map((a) => a.controlId));
  if (answers.length !== CONTROLS.length || seen.size !== CONTROLS.length || CONTROLS.some((c) => !seen.has(c.id))) {
    throw new DomainError('INCOMPLETE_ASSESSMENT', 'All 15 controls must be answered exactly once');
  }
}

const POINTS: Record<ControlStatus, number> = { 'In place': 1, 'Partly in place': 0.5, Missing: 0, 'N/A': 0 };

export function readinessScore(answers: AssessmentAnswer[]): number {
  assertComplete(answers);
  let earned = 0;
  let total = 0;
  for (const a of answers) {
    if (a.status === 'N/A') continue;
    const weight = getControl(a.controlId).severity === 'critical' ? 2 : 1;
    earned += POINTS[a.status] * weight;
    total += weight;
  }
  return total === 0 ? 0 : Math.round((100 * earned) / total);
}

export function riskBand(score: number): RiskBand {
  if (score >= 80) return 'Low risk';
  if (score >= 60) return 'Medium risk';
  return 'High risk';
}

export function assessmentOpenItems(answers: AssessmentAnswer[]): OpenItem[] {
  return CONTROLS.flatMap((control) => {
    const a = answers.find((x) => x.controlId === control.id);
    if (!a || (a.status !== 'Missing' && a.status !== 'Partly in place')) return [];
    return [{ controlId: control.id, priority: priorityLabel(control, a.status), source: ['assessment' as const] }];
  });
}

export function countByStatus(answers: AssessmentAnswer[]): Record<ControlStatus, number> {
  const counts: Record<ControlStatus, number> = { 'In place': 0, 'Partly in place': 0, Missing: 0, 'N/A': 0 };
  for (const a of answers) counts[a.status] += 1;
  return counts;
}
