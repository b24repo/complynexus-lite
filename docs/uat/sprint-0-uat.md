# Sprint 0 UAT: ComplyNexus Lite

## Purpose

This UAT proves, over HTTP against a running server and with no access to the code, that the Sprint 0 POC follows its business rules: the 15-control assessment and score bands, the record state machine (Assessed, Current, Re-test due, Current again, with Revoked as a terminal state), the badge rule, hash stability, the guided self-test in batches of at most 5 prompts with rule-based grading, and the copy and privacy of the public verify page and JSON. Out of scope, per the README: the endpoint runner, auth, the scheduler and the PDF.

## How to run

1. `cp .env.example .env` (keep `ADMIN_KEY=change-me`; leave `ANTHROPIC_API_KEY` and `MONGODB_URI` empty so the rule-based grader and in-memory repos are used).
2. Terminal 1: `npm run dev`.
3. Terminal 2: `ADMIN_KEY=change-me npm run uat` (optionally set `BASE_URL`, default `http://localhost:3000`).
4. Read the PASS/FAIL/SKIP table. A JSON report is written to `uat-results/` (gitignored). Exit code 1 means at least one FAIL; 2 means the server was unreachable.

Notes: the run is re-runnable (it creates fresh agents each time). An early FAIL in the Agent A chain cascades to SKIP for dependent cases. A 403 on UAT-23 means the runner's `ADMIN_KEY` differs from the server's.

**Sprint 1 note.** The script now signs in first (UAT-00, via `POST /auth/dev-link`), so the server needs `ALLOW_DEV_LOGIN=1`, `ADMIN_KEY` and `PUBLIC_BASE_URL` (equal to the runner's `BASE_URL`). Badge links are checked against `PUBLIC_BASE_URL`. UAT-08, 09, 17 and 18 also check the version-history text. See `docs/uat/sprint-1-uat.md` for the current run instructions and totals; the Sprint 0 results below are kept as history.

## Test data

- BookBot (Acme Studio, owner Mei Chan): 8 In place, 3 Partly in place, 4 Missing gives a score of 57, High risk. Must-fix: PE-2, LA-2, LA-3, RO-4. Should-fix: MS-1, AE-1, CA-1. All 15 In place gives 100, Low risk.
- Replies: refusal "I'm sorry, I can't do that. I need approval from the account owner first."; compliant "Here is the draft invoice for October."; leak "Sure, you can call the customer on +852 9123 4567."
- Seven deliberate outcomes in the full run: PI-05 reply "unlocked" (fail), DL-01 phone leak (fail), EA-01 send node ran (fail), EA-02 no refusal (fail), EA-03 send node unknown (not run), TM-02 skipped (not run), TM-03 send node ran (fail).

## Cases

| ID | Feature | User story | Expected result |
|---|---|---|---|
| UAT-01 | Library | I can see the test library | Version 1.2, 46 cases (12/12/12/10), 32 guided, 10 essentials; prompts visible with fail markers |
| UAT-02 | Agents | I can profile my agent and read it back | Agent created with an id and echoed fields, and readable again |
| UAT-03 | Agents/errors | Bad input is rejected clearly | Missing fields and bad JSON give 400 VALIDATION; unknown agent or route gives 404 |
| UAT-04 | Assessment | Answering 15 controls scores my agent and creates an Assessed record | Score 57, High risk, 4 must-fix and 3 should-fix items, record id CNL-year-NNNN with a SHA-256 hash |
| UAT-05 | Assessment/errors | Incomplete or invalid assessments are refused without creating a record | Missing or duplicate controls give 409; unknown control or status gives 400; no assessment exists afterwards |
| UAT-06 | Record/hash | The record hash is stable across reads and matches the public JSON | Same hash on repeated reads and in the public JSON; unknown record is 404 |
| UAT-07 | Badge | An untested agent cannot show the badge | Not eligible: must-fix items open and status is Assessed |
| UAT-08 | Verify page (Assessed) | The public page says the agent is assessed but not tested | Assessed pill, "not yet tested" copy, hash, disclaimer; owner name not shown |
| UAT-09 | Re-assessment | Re-answering creates a new version with a new hash but keeps Assessed | Version 2, score 100, Low risk, no open items, new hash |
| UAT-10 | Guided run/preconditions | I cannot start a test without an assessment or without attesting | No assessment gives 409; missing attestation or safety checks or bad size gives 400; unknown agent 404 |
| UAT-11 | Guided run/plan | Starting an Essentials run gives me 4 batches of at most 5 prompts | Batches PI/DL/EA/TM of 4, 2, 3, 1 cases; 36 cases pre-marked not run with reasons; fail markers hidden |
| UAT-12 | Guided run/guardrails | Batches must be submitted in order and complete, and action cases need the send-node answer | Out-of-order, empty, wrong-case, missing send-node answer and malformed submissions are refused; nothing is saved |
| UAT-13 | Guided run/grading | Pasting compliant replies grades the batch with the rule-based grader | Four passes graded by the rule grader; next batch offered; record not yet changed |
| UAT-14 | Record lifecycle | Finishing all batches makes my record Current | Run completed, record Current v3, self-run and self-reported, 10 of 10 passed, re-test in 3 months, new hash |
| UAT-15 | Guided results | I can read a results summary with what was not run and why | Summary, no failures, not-run grouped by category with reasons, no open items |
| UAT-16 | Badge | A Current record with no must-fix items is badge-eligible | Eligible |
| UAT-17 | Verify JSON (privacy) | The public JSON shows status and summary but no personal data, prompts or replies | Status, hash and summary present; owner, prompts, replies and internal fields absent |
| UAT-18 | Verify page (Current) | The public page explains the self-run test and next re-test date | Green Current pill, self-reported chip, self-run explanation with dates and counts, hash |
| UAT-19 | Public summary toggle | I can hide the test summary from the public page without changing the hash | Summary hidden in page and JSON, hash unchanged, invalid value rejected, can be shown again |
| UAT-20 | Agent change (CA-1) | Declaring a change puts a Current record into Re-test due with a 30-day deadline | Re-test due, deadline 30 days after the change, hash unchanged, badge off, a second change keeps the deadline |
| UAT-21 | Re-test | Re-testing after a change returns the record to Current | Run 2 completes, record Current v4, deadline cleared, new hash, badge eligible |
| UAT-22 | Revoke/auth | Only an admin with the key can revoke | No key or wrong key gives 403; empty reason gives 400; record unchanged |
| UAT-23 | Revoke | ComplyNexus can withdraw a record and the public page says so | Revoked with reason; badge off; public JSON hides the reason; page shows revoke copy |
| UAT-24 | Revoked is terminal | Nothing can move a revoked record | New test, assessment, change and second revoke all give 409 RECORD_REVOKED |
| UAT-25 | Agent B / full run plan | A second agent gets its own record and a change before testing does not alter Assessed | Separate record; change keeps Assessed and hash; full run has 8 batches (5,5,2,5,4,5,2,4) and 14 pre-filled not run |
| UAT-26 | Full run with failures | Failed, leaked, skipped and unknown replies are graded by the business rules and roll into the record | Seven deliberate outcomes graded as expected; phone redacted; 25 of 30 passed; 5 must-fix open; badge not eligible |
| UAT-27 | Guided results (full) | The results page lists failed cases with control and severity, and groups not-run cases by reason | Five failed cases with control and severity; not-run grouped by reason; open items merged from assessment and test |
| UAT-28 | Verify page/safety | HTML in an agent name is shown as text, not executed | Name is escaped in the page |
| UAT-29 | Not found | Unknown ids give friendly 404s | HTML "Record not found" page, JSON 404s for records and runs |
| UAT-30 | Time transitions | Records move to Re-test due (scheduled) and Expired with time | Not run by the script: covered by automated tests (test/domain/record.test.ts, test/api/records.test.ts, test/api/verify.test.ts) |
| UAT-31 | Server configuration | Revoke is refused without ADMIN_KEY; grader selection | Not run by the script: covered by automated tests (test/api/records.test.ts, test/grading/factory.test.ts); Claude grader is a manual check (ADR-0003) |

## Manual checks: verify page in a browser

The script prints the URLs at the end of the run.

- [x] Agent B (Current with failures): green Current pill, amber "Evidence: self-reported" chip, "Last test: 25 of 30 run cases passed (self-run) · 5 must-fix items open", facts with dates, SHA-256 wraps on narrow screens, disclaimer visible, "What does this record mean?" expands, Lexend font, tab title "BookBot B · ComplyNexus Lite record".
- [x] Agent A (Revoked): red Revoked pill, revoke copy, no summary box, "Revoked on" fact.
- [x] Agent D (escaped name): indigo Assessed pill, name shown literally as text with no alert dialog, "Safe test · about 6 min".
- [x] `/verify/CNL-0000-0000` shows "Record not found".
- [x] At about 375px width the page is readable and the facts stack.
- [ ] Optional: hide the summary via PATCH and reload (the script already checks this in UAT-19).

## Results

| Run date | Server (commit / BASE_URL) | Runner | PASS | FAIL | SKIP | Report file | Manual checks | Sign-off |
|---|---|---|---|---|---|---|---|---|
| 2026-10-19 | ab64dfd / http://localhost:3456 | Claude Code (automated) | 29 | 0 | 2 | uat-results/uat-2026-10-19T14-16-00-148Z.json | Not done | Pending |
| 2026-10-19 | ab64dfd / http://localhost:3456 | Claude Code (re-run, fresh server) | 29 | 0 | 2 | uat-results/uat-2026-10-19T14-17-10-026Z.json | Done in the browser (desktop and 375px) | Pending (product owner) |

### Observations / defects

- No application defects found. SKIP cases are UAT-30 and UAT-31 by design.
- Script note: the plan expected the LA-2 open item after the full run to have source `["assessment"]`; the app correctly returns `["assessment", "test"]` because PI-05 (control LA-2) fails in that run. The script expectation was corrected.
- Manual browser checks passed on desktop and at 375px wide: no horizontal scroll, the facts stack, the hash wraps, the expander opens, and the escaped name shows as text in both the heading and the tab title, with no alert.
- Cosmetic (not a defect against Sprint 0 scope): the "Record not found" page uses browser default styling, without the record page's look.
- Cosmetic: at 375px the SHA-256 line wraps mid-word in the trailing text ("compare wit / h the hash"), because the whole line breaks anywhere, not just the hash.
