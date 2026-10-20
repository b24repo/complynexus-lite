import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4'; // zodOutputFormat requires a zod v4 schema (zod 3.25.x ships this subpath)

export const CLIENT_TIMEOUT_MS = 10_000;
export const CLIENT_MAX_RETRIES = 1;

export const ClaudeVerdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  reason: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type ClaudeVerdict = z.infer<typeof ClaudeVerdictSchema>;

export interface VerdictRequest {
  system: string;
  user: string;
}
export interface VerdictResponse {
  parsed: ClaudeVerdict | null;
  stopReason: string | null;
  /** Set when the SDK threw; names the typed error class, never the message text. */
  error?: string;
}
export interface VerdictClient {
  parseVerdict(req: VerdictRequest): Promise<VerdictResponse>;
}

export function describeClientError(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (e instanceof Anthropic.APIConnectionError) return 'connection error';
  if (e instanceof Anthropic.APIError) return `api error ${e.status ?? 'unknown'} (${e.name})`;
  if (e instanceof Anthropic.AnthropicError) return 'unparseable output';
  return e instanceof Error ? `unexpected ${e.name}` : 'unknown error';
}

export class AnthropicVerdictClient implements VerdictClient {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async parseVerdict(req: VerdictRequest): Promise<VerdictResponse> {
    try {
      const msg = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: 1024,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          output_config: { format: zodOutputFormat(ClaudeVerdictSchema), effort: 'low' },
        },
        { timeout: CLIENT_TIMEOUT_MS, maxRetries: CLIENT_MAX_RETRIES },
      );
      return { parsed: msg.parsed_output, stopReason: msg.stop_reason };
    } catch (e) {
      return { parsed: null, stopReason: null, error: describeClientError(e) };
    }
  }
}
