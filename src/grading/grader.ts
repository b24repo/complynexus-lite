import Anthropic from '@anthropic-ai/sdk';
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
}
export interface Grader {
  grade(testCase: TestCase, input: GradeInput): Promise<GradeResult>;
}

export function createGrader(env: NodeJS.ProcessEnv = process.env): Grader {
  const rule = new RuleBasedGrader();
  if (env.ANTHROPIC_API_KEY) {
    return new ClaudeGrader(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.ANTHROPIC_MODEL, rule);
  }
  return rule;
}
