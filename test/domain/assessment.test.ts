import { describe, expect, it } from 'vitest';
import {
  assessmentOpenItems,
  countByStatus,
  priorityLabel,
  readinessScore,
  riskBand,
} from '../../src/domain/assessment';
import { CONTROLS, getControl } from '../../src/domain/controls';
import { DomainError } from '../../src/domain/types';
import { splitOpenItems } from '../../src/domain/scoring';
import { allInPlaceAnswers, bookbotAnswers, withStatus } from '../fixtures/bookbot';

describe('assessment', () => {
  it('labels In place as OK regardless of severity', () => {
    expect(priorityLabel(getControl('PE-2'), 'In place')).toBe('OK');
    expect(priorityLabel(getControl('AA-1'), 'In place')).toBe('OK');
  });
  it('labels N/A as OK', () => {
    expect(priorityLabel(getControl('LA-2'), 'N/A')).toBe('OK');
  });
  it('labels critical control not in place as Must fix', () => {
    expect(priorityLabel(getControl('PE-2'), 'Missing')).toBe('Must fix');
    expect(priorityLabel(getControl('LA-2'), 'Partly in place')).toBe('Must fix');
  });
  it('labels important control not in place as Should fix', () => {
    expect(priorityLabel(getControl('AE-1'), 'Missing')).toBe('Should fix');
    expect(priorityLabel(getControl('MS-1'), 'Partly in place')).toBe('Should fix');
  });
  it('throws INCOMPLETE_ASSESSMENT when fewer than 15 answers', () => {
    expect(() => readinessScore(allInPlaceAnswers.slice(0, 14))).toThrowError(DomainError);
    expect(() => readinessScore(allInPlaceAnswers.slice(0, 14))).toThrow('INCOMPLETE_ASSESSMENT');
  });
  it('throws on duplicate controlId', () => {
    const dup = [...allInPlaceAnswers.slice(0, 14), allInPlaceAnswers[0]];
    expect(() => readinessScore(dup)).toThrow('INCOMPLETE_ASSESSMENT');
  });
  it('scores 100 when all 15 In place', () => {
    expect(readinessScore(allInPlaceAnswers)).toBe(100);
  });
  it('scores 0 when all 15 Missing', () => {
    expect(readinessScore(allInPlaceAnswers.map((a) => ({ ...a, status: 'Missing' as const })))).toBe(0);
  });
  it('excludes N/A from the denominator', () => {
    expect(readinessScore(withStatus('N/A', 'AA-1'))).toBe(100);
    expect(readinessScore(allInPlaceAnswers.map((a) => ({ ...a, status: 'N/A' as const })))).toBe(0);
  });
  it('weights critical controls double', () => {
    expect(readinessScore(withStatus('Missing', 'PE-2'))).toBe(90);
    expect(readinessScore(withStatus('Missing', 'AA-1'))).toBe(95);
  });
  it('band: 80 → Low risk, 79 → Medium risk, 60 → Medium risk, 59 → High risk', () => {
    expect(riskBand(80)).toBe('Low risk');
    expect(riskBand(79)).toBe('Medium risk');
    expect(riskBand(60)).toBe('Medium risk');
    expect(riskBand(59)).toBe('High risk');
  });
  it('BookBot fixture yields 4 open Must fix [PE-2, LA-2, LA-3, RO-4] and 3 Should fix [MS-1, AE-1, CA-1]', () => {
    // Plan listed [PE-2, RO-4, LA-3, LA-2] / [AE-1, MS-1, CA-1]; the rule sorts by CONTROLS order.
    const split = splitOpenItems(assessmentOpenItems(bookbotAnswers));
    expect(split.openMustFix).toEqual(['PE-2', 'LA-2', 'LA-3', 'RO-4']);
    expect(split.openShouldFix).toEqual(['MS-1', 'AE-1', 'CA-1']);
  });
  it('scores the BookBot fixture 57 (High risk) under the weighted formula', () => {
    // 12 of 21 weighted points: plan text said Medium risk, but 57 < 60 is High risk.
    expect(readinessScore(bookbotAnswers)).toBe(57);
    expect(riskBand(57)).toBe('High risk');
  });
  it('counts BookBot fixture as 8 in place, 3 partly, 4 missing', () => {
    expect(countByStatus(bookbotAnswers)).toEqual({ 'In place': 8, 'Partly in place': 3, Missing: 4, 'N/A': 0 });
    expect(CONTROLS).toHaveLength(15);
  });
  it('getControl throws UNKNOWN_CONTROL for an unknown id', () => {
    expect(() => getControl('ZZ-9')).toThrow('UNKNOWN_CONTROL');
  });
});
