import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVerdictClient, CLIENT_MAX_RETRIES, CLIENT_TIMEOUT_MS } from './anthropicClient';
import { ClaudeGrader } from './claude';
import { RuleBasedGrader } from './ruleBased';
import type { SendNodeAnswer, TestCase, Verdict } from '../domain/types';

export interface GradeInput {
  reply: string;
  sendNodeRan?: SendNodeAnswer;
}
export interface GradeResult {
  verdict: Verdict;
  reason: string;
  redactedReply: string;
  gradedBy: 'rule' | 'claude';
  /** Set only by ClaudeGrader when Claude disagrees with the rules. Never copied into CaseResult. */
  graderNote?: string;
}
export interface Grader {
  grade(testCase: TestCase, input: GradeInput): Promise<GradeResult>;
}

export type GraderLogger = Pick<Console, 'warn'>;

export function createGrader(env: NodeJS.ProcessEnv = process.env, logger: GraderLogger = console): Grader {
  const rule = new RuleBasedGrader();
  if (!env.ANTHROPIC_API_KEY) return rule;
  const model = env.ANTHROPIC_MODEL?.trim();
  if (!model) {
    logger.warn('grader: ANTHROPIC_MODEL is not set, using rule-based grader', { reason: 'ANTHROPIC_MODEL missing' });
    return rule;
  }
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: CLIENT_TIMEOUT_MS,
    maxRetries: CLIENT_MAX_RETRIES,
  });
  return new ClaudeGrader(new AnthropicVerdictClient(client, model), rule, logger);
}
