# ADR-0008: Notifier port

Status: accepted (Sprint 1, S1-03a)

## Context
Lazy time transitions are silent: nobody learns that a record is due for re-test or has expired.
Magic-link sign-in (S1-02) also needs email.

## Decision
- `Notifier.send({ to, subject, text, html? })` is the only port.
- Adapters: `NoopNotifier` (tests, records messages), `ConsoleNotifier` (dev default, prints
  to/subject/text) and `ResendNotifier` (Resend HTTP API over raw `fetch`, no SDK, 10 s timeout,
  `NotifyError` on non-2xx or network failure).
- `createNotifier(env)` picks Resend when both `RESEND_API_KEY` and `MAIL_FROM` are set, otherwise Console.
- Templates are plain TS functions returning `{ subject, text, html }`; every interpolated value is
  HTML-escaped and every mail carries the not-certification footer.
- Injected as `AppDeps.notifier`. No route uses it yet.

## Consequences
- No retries or queue. A failed send throws to the caller.
- The transitions job, dedup markers and cron come in S1-03b and will be appended to this ADR.
- SPF/DKIM for the sending domain is a PO decision.
- `src/infra/notify/templates.ts` imports `esc` from `src/api/views`, a small layering wart.

## Scheduler (S1-03b)

Status: accepted (Sprint 1, S1-03b)

- Lazy reads persist transitions silently, so the nightly job is state-based, not transition-based: it scans Current, Re-test due and Expired records (one query per status, `status` index), applies `applyTimeTransitions`, then decides from the current state which email is owed.
- Dedup markers live in `record.notifications` (`retestDue`, `expired`, `reminder`, ISO timestamps). They are outside the hash snapshot and never appear in the public verify JSON or page. A marker counts only if it is not older than `lastTestedAt`, so a re-test makes old markers stale and the next cycle mails again.
- Persist, then send: the transition is saved before the mail, and the marker is saved only after a successful send. A failed send is logged and counted in `failed`; the marker stays unset so the next run retries.
- A Current record gets a reminder from 14 days before `nextRetestBy`.
- Scheduling is external: a Render cron running `node dist/jobs/cli.js`, or the scheduled workflow calling `POST /jobs/transitions` (admin key, checked before body validation). `--now` / `now` is only accepted with dry-run. An in-process guard returns 409 `JOB_RUNNING` for overlapping calls.
- The agent-change email (`agentChanged`) is sent synchronously by the declare-change usecase (JSON route and /app form) when the verify base URL can be resolved safely; otherwise, or on a send failure, the nightly job sends it.

Consequences:
- Last writer wins against a concurrent `PATCH /public` (no optimistic locking on records).
- Records already Re-test due or Expired when this ships get a one-time email; run a dry run first.
- Markers are visible in the founder-only `GET /api/records/:recordId`.
