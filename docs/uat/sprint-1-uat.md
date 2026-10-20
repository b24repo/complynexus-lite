# Sprint 1 UAT: ComplyNexus Lite

## Purpose

This UAT proves, over HTTP against a running server and with no access to the code, that the Sprint 1 build keeps every Sprint 0 business rule and adds: founder sign-in (one-time link, session cookie and Bearer token), ownership isolation (another founder always gets 404), the server-rendered /app pages and their CSRF guard, the health endpoint, the admin transitions job (dry run), the owner-only record PDF whose hash matches the public page, and the append-only version history on the verify page. Out of scope: the real email provider, the nightly scheduler clock, and the Claude grader.

## How to run

The script signs in itself (UAT-00) through `POST /auth/dev-link`, so every environment needs: `ALLOW_DEV_LOGIN=1`, `ADMIN_KEY` (same value as the runner), `PUBLIC_BASE_URL` (equal to the runner's `BASE_URL`), `ANTHROPIC_API_KEY` empty and `RESEND_API_KEY` empty.

**Local**

1. `npm run build`
2. Terminal 1: `PORT=3000 ADMIN_KEY=change-me ALLOW_DEV_LOGIN=1 PUBLIC_BASE_URL=http://localhost:3000 ANTHROPIC_API_KEY= node dist/server.js`
3. Terminal 2: `BASE_URL=http://localhost:3000 ADMIN_KEY=change-me npm run uat`
4. Wait 60 seconds before running again (magic-link rate limit, UAT-34 also waits once if needed).

**CI**: the `uat` job in `.github/workflows/ci.yml` builds, starts the in-memory server and runs the script; the `uat-results` artifact holds the JSON report, the saved PDF and `server.log`. A failing UAT blocks the deploy.

**Staging**: `BASE_URL=https://<svc>.onrender.com ADMIN_KEY=<secret> npm run uat`. Set `ALLOW_DEV_LOGIN=1` on the service only during acceptance and remove it afterwards. Leave 60 seconds between runs. Leave `RESEND_API_KEY` unset, or set `UAT_EMAIL_DOMAIN` to a domain you control.

Optional runner env: `PUBLIC_BASE_URL` (defaults to `BASE_URL`), `UAT_EMAIL_DOMAIN` (default `example.com`). A JSON report is written to `uat-results/` (gitignored). Exit code 1 means at least one FAIL; 2 means the server was unreachable. An early failure cascades to SKIP for dependent cases.

## Test data

- Founders: `uat-founder-a@<domain>` (owns everything), `uat-founder-z@<domain>` (the other founder), `uat-magic@<domain>` (magic-link requests). They are reused across runs.
- Agents and replies as in Sprint 0 (BookBot, BookBot B with the seven deliberate outcomes, a hostile-name agent); one extra agent, FormBot, is created through the HTML forms in UAT-38.
- Expected totals: 43 cases, 40 PASS, 0 FAIL, 3 SKIP (UAT-30, UAT-31, UAT-36).

## Cases

| ID | Feature | User story | Expected result |
|---|---|---|---|
| UAT-00 | Sign-in | A founder can sign in with a one-time link and gets a session | Dev-link returns a login token; the callback sets an HttpOnly, SameSite=Lax session cookie and redirects to /app; /auth/me shows the founder; the link works once (second use 401) |
| UAT-01 | Library | I can see the test library | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-02 | Agents | I can profile my agent and read it back | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-03 | Agents/errors | Bad input is rejected clearly | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-04 | Assessment | Answering 15 controls scores my agent and creates an Assessed record | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-05 | Assessment/errors | Incomplete or invalid assessments are refused without creating a record | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-06 | Record/hash | The record hash is stable across reads and matches the public JSON | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-07 | Badge | An untested agent cannot show the badge | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-08 | Verify page (Assessed) | The public page says the agent is assessed but not tested | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-09 | Re-assessment | Re-answering creates a new version with a new hash but keeps Assessed | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-10 | Guided run/preconditions | I cannot start a test without an assessment or without attesting | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-11 | Guided run/plan | Starting an Essentials run gives me 4 batches of at most 5 prompts | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-12 | Guided run/guardrails | Batches must be submitted in order and complete, and action cases need the send-node answer | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-13 | Guided run/grading | Pasting compliant replies grades the batch with the rule-based grader | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-14 | Record lifecycle | Finishing all batches makes my record Current | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-15 | Guided results | I can read a results summary with what was not run and why | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-16 | Badge | A Current record with no must-fix items is badge-eligible | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-17 | Verify JSON (privacy) | The public JSON shows status and summary but no personal data, prompts or replies | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-18 | Verify page (Current) | The public page explains the self-run test and next re-test date | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-19 | Public summary toggle | I can hide the test summary from the public page without changing the hash | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-20 | Agent change (CA-1) | Declaring a change puts a Current record into Re-test due with a 30-day deadline | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-21 | Re-test | Re-testing after a change returns the record to Current | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-22 | Revoke/auth | Only an admin with the key can revoke | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-23 | Revoke | ComplyNexus can withdraw a record and the public page says so | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-24 | Revoked is terminal | Nothing can move a revoked record | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-25 | Agent B / full run plan | A second agent gets its own record and a change before testing does not alter Assessed | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-26 | Full run with failures | Failed, leaked, skipped and unknown replies are graded by the business rules and roll into the record | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-27 | Guided results (full) | The results page lists failed cases with control and severity, and groups not-run cases by reason | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-28 | Verify page/safety | HTML in an agent name is shown as text, not executed | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-29 | Not found | Unknown ids give friendly 404s | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-30 | Time transitions | Records move to Re-test due (scheduled) and Expired with time | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-31 | Server configuration | Revoke is refused without ADMIN_KEY; grader selection | As in Sprint 0 (docs/uat/sprint-0-uat.md); UAT-08, 09, 17, 18 also check version-history text |
| UAT-32 | Auth/401 | Every protected route refuses anonymous callers; public routes stay public | 16 anonymous or malformed-token requests give 401 AUTH_REQUIRED; library, verify page and JSON, and /healthz stay 200; revoke and jobs without the admin key give 403 |
| UAT-33 | Ownership | Another founder cannot see or change my agents, runs or records | Founder Z gets 404 (never 403) on 13 agent, run and record routes; /app shows an empty dashboard and a 404 page; A's record is unchanged |
| UAT-34 | Magic link | Magic-link request never reveals whether an address exists and is rate limited | 202 {ok:true} for new and known emails; form posts redirect to /app/sign-in/sent or /app/sign-in?error=email; invalid email 400; the sixth request in the window is 429 with Retry-After |
| UAT-35 | Logout | Signing out ends only that session | Logout returns 204 and clears the cookie; the session then gets 401 and /app redirects to sign-in; other sessions stay valid; the form logout redirects to /app/sign-in |
| UAT-36 | Dev-link disabled | POST /auth/dev-link is 404 when ALLOW_DEV_LOGIN is unset | Not run by the script (needs a second server config); covered by test/api/auth.test.ts |
| UAT-37 | Web app (/app) smoke | The dashboard, agent page, sign-in page and CSRF guard behave | Dashboard and agent pages render with the founder's data; anonymous requests redirect to /app/sign-in; a POST without a valid _csrf is 403 "This form has expired" and changes nothing; unknown /app paths 404; sign-in page has a strict CSP |
| UAT-38 | Web app journey | A founder can create, assess and test an agent entirely through the HTML forms | Create agent, incomplete assessment shows "Answer every control.", complete assessment gives Assessed score 100, an Essentials run through all four batch pages ends on the results page "10 of 10 run cases passed" and the record is Current v2 |
| UAT-39 | Health | The health endpoint reports version, commit, store and library | 200 status ok, version, commit, db memory or ok, library 1.2 with 46 cases |
| UAT-40 | Jobs | The admin job plans re-test reminders as a dry run and stores nothing | With the admin key and now set 100 days ahead, record B is planned as retestDue to founder A; the record is unchanged; missing or wrong key 403; now without dryRun 400 |
| UAT-41 | PDF | The record PDF is owner-only and shows the same hash as the public page | application/pdf attachment named <id>-v<version>.pdf, no-store; text shows record, status, score, must-fix, run summary, SHA-256 equal to /verify, verify URL and disclaimer; no owner name; revoked record prints Revoked; other founder 404; anonymous 401 |
| UAT-42 | Version history | The public page lists earlier hashes, newest first, and grows on re-assessment | previousHashes in JSON and an "Earlier versions: N" list on the page; none for a first version; re-assessing adds the old hash |

## Manual checks

- [ ] Browser journey in /app: sign in with a dev-link, create an agent, assess, run the test through the batch pages, see the results and the Current record.
- [ ] Open the saved PDF (`uat-results/<record>-v2.pdf`) in a viewer and compare its SHA-256 with `/verify/<record>`.
- [ ] On a verify page with several versions, open the "Earlier versions" expander and compare the hashes.
- [ ] At about 375px width the dashboard, agent page, batch page and verify page are readable.

## Results

| Run date | Server (commit / BASE_URL) | Runner | PASS | FAIL | SKIP | Report file | Manual checks | Sign-off |
|---|---|---|---|---|---|---|---|---|
| 2026-10-20 | b91ee6e + S1-07 changes / http://localhost:3995 | Claude Code (automated; 3 runs, last two 60 s apart) | 40 | 0 | 3 | uat-results/uat-2026-10-20T02-11-25-061Z.json | Not done | Pending |

### Observations / defects

- UAT-37 initially asserted a CSRF field on the dashboard; the dashboard has no POST form (sign-out uses /auth/logout), so the check moved to the agent page (script fix, no app change).
