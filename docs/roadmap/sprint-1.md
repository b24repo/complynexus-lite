# Sprint 1 technical plan

Status: proposed by the CTO, waiting for product owner review. Based on `main` @ ab64dfd plus open PRs #2 (MongoRepository), #3 (flaky test fix) and #4 (Sprint 0 UAT).

## 1. Sprint goal and definition of done

**Goal:** a founder can go from email sign-up to a shareable `/verify` link and a hash-stamped PDF, entirely in the browser, on a deployed staging URL backed by MongoDB.

**Done means (the PO can demo it on staging without curl):**
1. A staging URL deploys from `main` through CI, runs on MongoDB Atlas, and has a green `/healthz` and structured logs.
2. A founder signs up with a magic link, profiles an agent, answers the 15 controls, runs the Essentials guided test (4 batches, pasting replies), sees results and open items, downloads the PDF and copies the verify link. The hash on the PDF equals the hash on `/verify/:id`.
3. A nightly job applies `applyTimeTransitions` to every record and sends "re-test due" and "expired" emails through a provider adapter. Tests use a no-op notifier.
4. `npm run uat`, extended for Sprint 1, passes against staging, and the Sprint 0 UAT still passes.

Not in Sprint 1: React, the endpoint test runner, billing, an embeddable badge snippet, full fix-it plans (hints only, as a stretch goal), and multi-user orgs.

## 2. Backlog (priority order)

### S1-01 Staging deployment and observability baseline (M)
- **Why:** nothing is hosted, so the PO can't show anyone a verify link, and every other ticket needs somewhere to be accepted.
- **Scope:**
  - A multi-stage `Dockerfile` (node:22-alpine, `npm ci`, `npm run build`, `node dist/server.js`).
  - A Render web service (or Fly) with MongoDB Atlas M0.
  - A GitHub Actions `deploy.yml` that runs on push to `main` once `ci.yml` passes.
  - Secrets `MONGODB_URI`, `ADMIN_KEY`, `ANTHROPIC_API_KEY` and `BASE_URL`.
  - `GET /healthz`, reporting the Mongo ping, whether the library loads, and the version/commit.
  - `app.set('trust proxy', 1)`, so verify URLs and magic links use https.
  - pino JSON logs with a request id. Unknown errors are logged in `errorHandler`; today a 500 is returned with no log at all.
  - `helmet`, a JSON body limit, and basic rate limits on `/verify` and the auth routes.
  - The hard-coded `verify.complynexus.com` text in `src/api/views/verify.ts` is replaced with the configured host.
- **Out of scope:** AWS/Lambda, custom domain DNS beyond staging, metrics dashboards, and Sentry (optional if free).
- **Depends on:** PR #2 (Mongo wiring and graceful shutdown).
- **Acceptance criteria:**
  - A push to `main` deploys automatically.
  - `/healthz` returns 200 with db=ok.
  - The Sprint 0 UAT against staging gives 29 pass / 2 skip.
  - A thrown error appears in the logs with a request id.
  - SIGTERM closes Mongo cleanly.
- **Risk:** medium. The Atlas IP allowlist, and CI time spent downloading MongoDB for tests (the fallback is `SKIP_MONGO_TESTS=1` in CI plus a nightly Mongo job).

### S1-02 Founder authentication (magic link and session cookie) and ownership (M)
- **Why:** on a public URL every founder endpoint is open. Anyone can create agents, re-assess or `PATCH /public`, and `GET /api/records/:id` returns `ownerName` and open items. Shipping staging without this would be a privacy defect.
- **Scope:**
  - A `founders` collection.
  - `POST /auth/magic-link {email}` stores a hashed single-use token (15 min TTL) and sends the link through the `Notifier` (S1-03a).
  - `GET /auth/callback?token=` sets an httpOnly, SameSite=Lax, 30-day session cookie, stored in a `sessions` collection.
  - `POST /auth/logout`.
  - A `requireFounder` middleware on `/api/agents*`, `/api/guided-runs*`, non-public record routes, `PATCH /public`, the PDF and `/app/*`.
  - A new `Agent.founderId` field, with ownership checks in `src/api/helpers.ts`. Other founders' ids return 404, not 403.
  - Admin revoke keeps using `X-Admin-Key`.
  - `Authorization: Bearer <session>` is also accepted, so scripts and the UAT keep working.
- **Out of scope:** passwords, OAuth, teams, email change and account deletion.
- **Depends on:** PR #2 and S1-03a.
- **Acceptance criteria:**
  - Unauthenticated founder routes return 401 `AUTH_REQUIRED`.
  - A founder can't read or change another founder's agent or record.
  - `/verify/*` and `/api/library` stay public.
  - The token is single-use and expires.
  - Tests use `NoopNotifier` to capture the link.
  - The UAT signs in first.
- **Risk:** medium, because it needs a sending domain. Mitigation: `ConsoleNotifier`, plus an admin-only `POST /auth/dev-link` guarded by `X-Admin-Key` and `ALLOW_DEV_LOGIN=1` for staging acceptance.

### S1-03 Notifier interface and the L-31 scheduler (M, split into two PRs: 03a and 03b)
- **Why:** founders aren't told when a record becomes Re-test due or Expired. The lazy transitions (ADR-0001) are correct but silent, and the notifier also unblocks magic links.
- **03a scope:**
  - `Notifier { send({to, subject, text, html?}) }`, with three adapters: `NoopNotifier` (tests, records the calls), `ConsoleNotifier` (dev) and `ResendNotifier` (staging; `RESEND_API_KEY`, `MAIL_FROM`).
  - The notifier is added to `AppDeps`.
  - Templates are plain TypeScript strings.
- **03b scope:**
  - `src/jobs/transitions.ts` and `npm run job:transitions`. They go through records with status Current or Re-test due, apply `applyTimeTransitions`, save the changes and email the founder. An optional 14-day reminder can be added.
  - Dedup markers live in `record.notifications`, outside the hash snapshot.
  - `--dry-run` and `--now=<iso>` flags.
  - Triggered by an external cron (a Render cron job or a scheduled workflow calling `POST /jobs/transitions` with `X-Admin-Key`), not by an in-process timer.
- **Out of scope:** agent-change emails (optional), SMS and digest emails.
- **Depends on:** PR #2 and S1-02.
- **Acceptance criteria:**
  - The job is idempotent: a second run sends nothing.
  - Unit tests use `FixedClock` and `NoopNotifier`.
  - A staging dry run with `--now` 100 days ahead lists the emails it would send.
  - One real email arrives in a test inbox.
- **Risk:** low to medium (email deliverability).

### S1-04 Founder UI, rendered on the server (L)
- **Why:** the target founder builds no-code agents, and curl isn't a product. This ticket is on the critical path to "done".
- **Decision:** HTML is rendered on the server by TypeScript template functions, like `src/api/views/verify.ts`. Forms post, then redirect, then load the page again. There's no bundler, and only a few lines of plain JS for "copy prompt" buttons. React waits until a feature needs live interaction (the endpoint runner). The API stays the contract, so a React app can be added later without rework.
- **Scope:**
  - First, move route handler logic into `src/usecases/*.ts`, so the JSON and HTML routes call the same functions.
  - Then add pages under `/app`:
    - Sign-in.
    - Dashboard: my agents, each with a status pill.
    - New/edit agent.
    - Assessment form: the 15 controls, a radio per status, and a note.
    - Start a run: the attestation and 3 safety checkboxes.
    - Batch page: prompts with copy buttons, a reply box, a send-node radio for action cases, and skip.
    - Results: summary, failed cases, not-run reasons and open items.
    - Record page: status, verify link, show/hide the summary, a PDF button and "declare a change".
  - Usable at 375px, with the same look as the verify page.
- **Out of scope:** React, client-side validation beyond HTML attributes, drafts/autosave and i18n.
- **Depends on:** S1-02. The PDF button can be a stub until S1-05 lands.
- **Acceptance criteria:**
  - The full Essentials journey can be completed on staging in a browser.
  - Every HTML route has a supertest test asserting its key text.
  - The existing JSON API tests pass unchanged after the use-case refactor.
  - Every page has an XSS escaping test for the agent name.
- **Risk:** high, because of its size. Mitigation: ship the dashboard and assessment first, then the guided run, and polish last; cut agent editing if needed.

### S1-05 PDF record with a matching hash (M)
- **Why:** the verify page already tells visitors to "compare with the hash printed on the PDF", and no PDF exists. Not delivering that promise is a trust problem.
- **Scope:**
  - `GET /api/records/:recordId/pdf` (founder-only), generated on request with `pdfkit`.
  - Contents: org, agent, record id, version, status at print time, dates, score and band, open item ids, test summary, `SHA-256 <record.hash>`, the verify URL, the disclaimer and the date printed.
  - The printed hash is the ADR-0004 snapshot hash, not a hash of the file, so the PDF bytes don't need to be identical each time.
  - An append-only `record_versions` collection keeps older PDFs checkable, and `/verify/:id.json` gains `previousHashes`.
- **Out of scope:** digital signatures, storing PDFs, and branding beyond the logo mark (a QR code only if it's trivial).
- **Depends on:** S1-02 and PR #2.
- **Acceptance criteria:**
  - The PDF text, parsed in tests, contains the hash and id, and the hash equals the one in `/verify/:id.json`.
  - After a re-assessment, the old hash appears in `previousHashes`.
- **Risk:** low.

### S1-06 Harden the Claude grader (S/M)
- **Why:** `src/grading/claude.ts` is untested and fragile. It parses free-text JSON, has no timeout or retry, falls back silently with no log, and has no coverage.
- **Scope:**
  - Inject a small `MessagesClient` interface so tests can use a stub.
  - Get the verdict as structured output through a single tool (`record_verdict {verdict, reason, confidence}`).
  - The prompt includes the case prompt, an expectation rubric and only the redacted reply.
  - A 10 s timeout and one retry on 429/5xx, then fall back to the rules, logging every fallback.
  - Record a `graderNote` when Claude and the rules disagree.
  - `ANTHROPIC_MODEL` becomes required, with the current model id checked at implementation time.
  - A golden set of about 30 replies runs against the rules in CI, and against Claude through `npm run eval:grader`.
- **Out of scope:** prompt caching, the batch API, and grading `no_action` cases (hard rules own those, per ADR-0003).
- **Depends on:** none. It can start on day 1.
- **Acceptance criteria:**
  - Unit tests cover pass, fail, timeout fallback, bad tool output and rule precedence.
  - `claude.ts` is included in coverage.
  - Agreement with the golden set is at least 90%.
- **Risk:** low.

### S1-07 Sprint 1 UAT and staging smoke test (S)
- **Scope:**
  - Extend `scripts/uat.mjs` with sign-in, a PDF hash match, 401 and ownership cases, an `/app` smoke test, and `job:transitions --dry-run`.
  - Add `docs/uat/sprint-1-uat.md`.
  - Add a CI job that starts the server in memory and runs the UAT, so it becomes a regression check.
- **Depends on:** everything above, written incrementally per ticket.
- **Acceptance criteria:** the UAT passes on staging, with a results row signed off by the PO.

### S1-08 Fix-it hints per control (S, stretch)
- **Scope:**
  - Add `fixIt: { summary, steps[] }` to each of the 15 controls in `src/domain/controls.ts`, with copy written by the PO.
  - Show it next to open items on the results and record pages, and in `openItems[]`.
  - No new state, and the hash doesn't change.
- **Depends on:** S1-04. Cut it first if the sprint slips.

**Sequencing:**
- **Day 0:** merge the open PRs (section 3).
- **Week 1:** S1-01, S1-03a, S1-02 and S1-06 in parallel, plus the S1-04 use-case refactor.
- **Week 2:** S1-04 pages, S1-05, S1-03b and S1-07. S1-08 happens only if S1-04 is done by day 8.

PO review is the bottleneck, so keep each PR under about 400 lines and limit it to one ticket part.

## 3. Open PRs: merge order and conflicts

Order: **#3 → #4 → #2.**
- **#3 first.** It only changes tests and removes the supertest port flake that would otherwise make CI for #2 and #4 unreliable. Verified: 0 failures in 40 runs, against about 1 in 20 on `main`.
- **#4 second.** It adds docs and the UAT script, with no `src/` change, and it's the tool for validating #2.
- **#2 last.** Rebase it onto the new `main`, run the UAT both in memory and with `MONGODB_URI` set, and add a results row to the Sprint 0 UAT doc before merging.

Conflicts:
- `test/api/helpers.ts` (#2 vs #3): the changes are in different places, so expect a clean merge.
- `README.md` (#2 vs #4): a real conflict, because both add lines right after `npm run dev`. Resolve it by keeping all three new lines.
- `package.json` (#2 vs #4): different hunks, so it merges cleanly.

## 4. ADRs to write

- **ADR-0006 Hosting and delivery:** a Docker container on Render (web service plus cron job) with MongoDB Atlas, deployed from `main` by GitHub Actions. AWS waits until a customer needs it.
- **ADR-0007 Founder authentication:** an email magic link that issues an httpOnly session cookie, with bearer tokens accepted for scripts. Ownership is by `founderId`, admin stays on `X-Admin-Key`, and there are no passwords or OAuth.
- **ADR-0008 Notifier port and scheduler (L-31):** a `Notifier` interface with no-op, console and Resend adapters. The transitions job is an idempotent CLI triggered by an external cron, and its dedup markers sit outside the hash snapshot.
- **ADR-0009 PDF record and version history:** the PDF is generated on request with pdfkit and prints the ADR-0004 snapshot hash. Every version's snapshot and hash are appended to `record_versions`.
- **ADR-0010 Founder UI rendered on the server:** TypeScript template functions with post-redirect-get forms, sharing `src/usecases` with the JSON API. React only when a feature needs it.
- **ADR-0011 Claude grader contract:** a structured verdict through tool use on the redacted reply only, a 10 s timeout, logged fallback to the rules, and a golden-set eval check. The rules still take precedence (ADR-0003).

## 5. Decisions needed from the product owner

1. **Sending domain:** do we control `complynexus.com` DNS, and can we set SPF/DKIM for Resend this sprint? Without it, magic links and emails only work through the dev link and console on staging.
2. **Hosting account:** is it OK to use Render (web service plus cron) and a free MongoDB Atlas M0 for staging? Both need accounts that you own.
3. **Public host:** what is the staging hostname, and will production verify links live on a subdomain? This decides the links printed on PDFs, which can't change later.
4. **PDF audience:** the hash snapshot includes `ownerName`, which the public page hides. Should the PDF that goes to clients show the owner name and open control ids, or only the summary?
5. **Scope guard:** if S1-04 (UI) overruns, the CTO recommends cutting the scheduler emails (S1-03b) before the PDF (S1-05). Lazy transitions keep records correct, and the verify page already promises a PDF.
