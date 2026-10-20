import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicVerdictClient, describeClientError } from '../../src/grading/anthropicClient';

function fake(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

describe('AnthropicVerdictClient', () => {
  it('sends structured-output params and per-request options', async () => {
    const parse = vi.fn().mockResolvedValue({ parsed_output: { verdict: 'pass', reason: 'ok', confidence: 'high' }, stop_reason: 'end_turn' });
    const c = new AnthropicVerdictClient(fake(parse), 'test-model');
    const res = await c.parseVerdict({ system: 'S', user: 'U' });
    const [params, options] = parse.mock.calls[0];
    expect(params).toMatchObject({
      model: 'test-model',
      max_tokens: 1024,
      system: 'S',
      messages: [{ role: 'user', content: 'U' }],
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(params).not.toHaveProperty('thinking');
    expect(options).toEqual({ timeout: 10000, maxRetries: 1 });
    expect(res).toEqual({ parsed: { verdict: 'pass', reason: 'ok', confidence: 'high' }, stopReason: 'end_turn' });
  });
  it('maps an SDK parse failure to an error result', async () => {
    const parse = vi.fn().mockRejectedValue(new Anthropic.AnthropicError('bad json'));
    const res = await new AnthropicVerdictClient(fake(parse), 'm').parseVerdict({ system: 'S', user: 'U' });
    expect(res).toEqual({ parsed: null, stopReason: null, error: 'unparseable output' });
  });
});

describe('describeClientError', () => {
  it('names typed errors without message text', () => {
    expect(describeClientError(new Anthropic.APIConnectionTimeoutError())).toBe('timeout');
    expect(describeClientError(new Anthropic.APIConnectionError({ message: 'secret' }))).toBe('connection error');
    expect(describeClientError(new Anthropic.RateLimitError(429, undefined, 'x', new Headers()))).toMatch(/^api error 429/);
    expect(describeClientError(new Error('x'))).toBe('unexpected Error');
    expect(describeClientError('str')).toBe('unknown error');
  });
});
