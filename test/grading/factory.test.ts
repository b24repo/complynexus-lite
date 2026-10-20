import { describe, expect, it, vi } from 'vitest';
import { ClaudeGrader } from '../../src/grading/claude';
import { createGrader } from '../../src/grading/grader';
import { RuleBasedGrader } from '../../src/grading/ruleBased';

describe('createGrader', () => {
  it('returns RuleBasedGrader when ANTHROPIC_API_KEY is unset', () => {
    const logger = { warn: vi.fn() };
    expect(createGrader({}, logger)).toBeInstanceOf(RuleBasedGrader);
    expect(logger.warn).not.toHaveBeenCalled();
  });
  it('returns ClaudeGrader when key and model are set (no network call)', () => {
    expect(createGrader({ ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_MODEL: 'test-model' })).toBeInstanceOf(ClaudeGrader);
  });
  it.each([undefined, '  '])('falls back to rules with a warning when the key is set but model is %j', (model) => {
    const logger = { warn: vi.fn() };
    const g = createGrader({ ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_MODEL: model }, logger);
    expect(g).toBeInstanceOf(RuleBasedGrader);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
