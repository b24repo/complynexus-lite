# ADR-0009: Founder UI is server-rendered

Status: accepted (Sprint 1, S1-04)

## Decision

The founder UI lives under `/app` and is rendered by TypeScript template functions in `src/web`. Forms post and redirect (PRG). HTML routes and the JSON API share the same use cases in `src/usecases`; use cases take parse thunks so ownership is checked before validation (other founders' ids return 404, never 400). CSRF protection is an HMAC of the session id (`CSRF_SECRET`, falling back to `ADMIN_KEY`), required on every `/app` POST. The only client script is `/app/static/app.js` (copy-to-clipboard), served same-origin so the CSP `script-src 'self'` holds with no inline scripts or handlers.

## Consequences

- No client-side validation beyond HTML attributes.
- A React front end can replace the templates later behind the same use cases.
- Form posts to `/auth/magic-link` share the JSON rate limiter, so the sixth request in a minute gets a JSON 429 rather than a page.
