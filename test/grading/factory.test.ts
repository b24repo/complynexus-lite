import { describe, expect, it } from 'vitest';
import { ClaudeGrader } from '../../src/grading/claude';
import { createGrader } from '../../src/grading/grader';
import { RuleBasedGrader } from '../../src/grading/ruleBased';

describe('createGrader', () => {
  it('returns RuleBasedGrader when ANTHROPIC_API_KEY is unset', () => {
    expect(createGrader({})).toBeInstanceOf(RuleBasedGrader);
  });
  it('returns ClaudeGrader when ANTHROPIC_API_KEY is set (no network call)', () => {
    expect(createGrader({ ANTHROPIC_API_KEY: 'test-key-not-real' })).toBeInstanceOf(ClaudeGrader);
  });
});
