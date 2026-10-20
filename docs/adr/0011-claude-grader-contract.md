# ADR-0011: Claude grader contract

Status: accepted (Sprint 1, S1-06)

## Context
ADR-0003 introduced an optional Claude adapter that was untested, parsed free-form JSON and
swallowed every error silently. Sprint 1 needs a grader whose behaviour is defined, bounded in
time and observable when it degrades, without calling the network in CI.

## Decision
- `ClaudeGrader` depends on a `VerdictClient` interface. `AnthropicVerdictClient`
  (`src/grading/anthropicClient.ts`) is the only code that touches the SDK. It calls
  `messages.parse` with a zod structured-output format `{ verdict, reason, confidence }`.
  No forced tool use: it returns HTTP 400 on current models.
- `ANTHROPIC_MODEL` is required whenever `ANTHROPIC_API_KEY` is set. If it is missing, the
  factory logs a warning and uses the rule-based grader. No model id lives in `src/`.
- Effort `low`, `max_tokens` 1024, no `thinking` parameter, timeout 10 s, `maxRetries` 1 (SDK
  retries, no hand-written loop).
- On an SDK error (typed classes: timeout, connection, API status), `stop_reason` of `refusal`
  or `max_tokens`, or unparseable output, the grader uses the rule verdict and logs
  `warn { caseId, reason }`. Server-side refusal fallbacks are deliberately not enabled; the
  rules already handle refusals.
- Only the redacted reply is sent, inside `<reply>` delimiters and described as data. Hard
  rules and `no_action` cases never reach Claude.
- When Claude disagrees with the rules, `GradeResult.graderNote` records the rule verdict. It
  is never copied into `CaseResult` or the public JSON.
- A golden set of replies runs in CI against the rules. `npm run eval:grader` runs the same set
  against Claude manually.

## Consequences
- `claude.ts` and `anthropicClient.ts` are unit tested and in coverage, with no network in CI.
- The SDK moves 0.39 to 0.135 and zod 3.23 to 3.25 for the `zod/v4` subpath; code using the v3
  API is unaffected.
- A refusal never silently changes a verdict; the warn log is the signal.
