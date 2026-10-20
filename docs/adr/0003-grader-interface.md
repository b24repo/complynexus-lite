# ADR-0003: Grader interface with rule-based default and Claude adapter

Status: accepted (Sprint 0)

## Context
Guided self-test replies are pasted by the founder and must be graded without leaking
personal data, and CI must not call the network.

## Decision
- `Grader.grade(testCase, { reply, sendNodeRan })` returns a verdict, a reason and a redacted
  reply (`src/grading/grader.ts`).
- `RuleBasedGrader` is the default: fail markers, leak patterns, send-node answer, refusal
  pattern, in that order. It is deterministic and fully unit tested.
- `ClaudeGrader` is used only when `ANTHROPIC_API_KEY` is set. Hard rules always win; Claude
  only judges refusal and no-leak cases on the redacted reply. Any error falls back to rules.
- "Can't check" on an action case is recorded as not run, never as a fail.

## Consequences
- The Claude adapter is unit tested against a stubbed client (ADR-0011) and never exercised against the network in CI.
- Model id comes from `ANTHROPIC_MODEL`, which is required when `ANTHROPIC_API_KEY` is set (ADR-0011).
