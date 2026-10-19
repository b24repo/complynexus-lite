import { z } from 'zod';
import cases from './cases.json';
import { DomainError } from '../domain/types';
import type { Category, GuidedSize, TestCase } from '../domain/types';

export const LIBRARY_VERSION = '1.2';

export const TestCaseSchema = z.object({
  id: z.string().regex(/^(PI|DL|EA|TM)-\d{2}$/),
  name: z.string().min(1),
  category: z.enum(['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse']),
  controlId: z.string().min(1),
  severity: z.enum(['Must fix', 'Should fix', 'OK']),
  type: z.enum(['text', 'action', 'intercept']),
  expect: z.enum(['refusal', 'no_leak', 'no_action']),
  guidedRunnable: z.boolean(),
  essentials: z.boolean(),
  prompt: z.string().min(1),
  failMarkers: z.array(z.string()),
  notRunReason: z.string().optional(),
});

const CATEGORIES: Category[] = ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'];
const EXPECTED_TOTAL = 46;
const EXPECTED_PER_CATEGORY = [12, 12, 12, 10];
const EXPECTED_GUIDED = [12, 9, 7, 4];
const EXPECTED_ESSENTIALS = 10;
const EXPECTED_GUIDED_ACTIONS = 11;

let cache: TestCase[] | null = null;

export function loadLibrary(): TestCase[] {
  if (cache) return cache;
  const parsed = z.array(TestCaseSchema).parse(cases) as TestCase[];
  const bad = (msg: string) => new DomainError('LIBRARY_INVALID', msg);
  if (parsed.length !== EXPECTED_TOTAL) throw bad(`Expected ${EXPECTED_TOTAL} cases, got ${parsed.length}`);
  CATEGORIES.forEach((cat, i) => {
    const inCat = parsed.filter((c) => c.category === cat);
    if (inCat.length !== EXPECTED_PER_CATEGORY[i]) throw bad(`Category ${cat} has ${inCat.length} cases`);
    const guided = inCat.filter((c) => c.guidedRunnable).length;
    if (guided !== EXPECTED_GUIDED[i]) throw bad(`Category ${cat} has ${guided} guided cases`);
  });
  if (parsed.filter((c) => c.essentials).length !== EXPECTED_ESSENTIALS) throw bad('Essentials count mismatch');
  if (parsed.filter((c) => c.guidedRunnable && c.type === 'action').length !== EXPECTED_GUIDED_ACTIONS) {
    throw bad('Guided action case count mismatch');
  }
  cache = parsed;
  return parsed;
}

export function casesForGuided(size: GuidedSize): TestCase[] {
  return loadLibrary().filter((c) => c.guidedRunnable && (size === 'full' || c.essentials));
}

export function byCategory(category: Category): TestCase[] {
  return loadLibrary().filter((c) => c.category === category);
}

export function getCase(id: string): TestCase {
  const found = loadLibrary().find((c) => c.id === id);
  if (!found) throw new DomainError('UNKNOWN_CASE', `Unknown case ${id}`);
  return found;
}
