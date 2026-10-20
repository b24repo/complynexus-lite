# ADR-0006: Hosting and delivery

Status: accepted (Sprint 1, S1-01)

## Decision

Run a single `node:22-alpine` non-root container. GitHub Actions builds it after `ci` succeeds on `main`, pushes it to GHCR with the commit SHA and `latest` tags, and a deploy hook releases it to a Render web service (plus a Render cron job for S1-03b) backed by MongoDB Atlas M0.

- `PUBLIC_BASE_URL` fixes the host printed on verify pages and PDFs.
- `/healthz` is the readiness probe (version, commit, db, library).
- pino JSON logs go to stdout with a request id on every line.
- AWS is deferred.

## Consequences

- One region, no autoscaling.
- Secrets live in Render.
- The Atlas IP allowlist is an operational risk.
- `TRUST_PROXY=1` must be set behind Render or the per-IP rate limit sees only the proxy.
- The rate limiter is in-memory per instance, so it resets on restart and is not shared across instances.
