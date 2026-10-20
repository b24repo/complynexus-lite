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
