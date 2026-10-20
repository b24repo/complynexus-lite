# ADR-0007: Founder authentication and ownership

Status: accepted (Sprint 1, S1-02)

## Context
The founder endpoints were open on a public URL, so anyone who guessed an id could read an agent, its
test run or its record. That is a privacy problem for a service that holds prompts, replies and owner names.

## Decision
- Magic-link sign-in. The login token is 32 random bytes (base64url), valid 15 minutes and single use.
  Only its SHA-256 hash is stored, and the hash is the document `id`.
- On callback the server creates a session (also stored only as a hash) and sets the `cnl_session` cookie:
  httpOnly, SameSite=Lax, 30 days, Secure when the request or `PUBLIC_BASE_URL` is https. Scripts may send
  `Authorization: Bearer <token>` instead (the header wins).
- `requireFounder` guards the founder routes. `Agent.founderId` is set on create. Records and runs are owned
  through their agent. Another founder's resource returns 404, not 403, so ids cannot be probed.
  Admin actions (revoke) stay on `X-Admin-Key`. `/api/library`, `/verify`, `/healthz` and `/auth/*` are public.
- `POST /auth/dev-link` returns a login link without email, only when `ALLOW_DEV_LOGIN` is exactly `1` and an
  admin key is set (not tied to NODE_ENV, because staging runs with NODE_ENV=production). It logs a warning at boot
  and is a 404 otherwise.
- `LoginTokenStore.consume(hash, now)` is the one atomic primitive: in memory there is no await between the
  check and the write, in Mongo it is a single `findOneAndUpdate`.
- `expiresAt` and `usedAt` on login tokens and sessions are Dates, not ISO strings. This is an exception to
  ADR-0005, needed because Mongo TTL indexes only work on Date fields. Every read still compares against the
  injected clock, so the TTL index is housekeeping only.
- The magic-link response is identical for new and existing emails. Requests are rate limited per IP and per email.
- No passwords, OAuth or teams.

## Consequences
- One extra agent read per record or run access.
- No per-device session revocation yet (logout deletes only the current session).
- Agents created before this change have no `founderId`; they are orphaned (404 for everyone) until back-filled.
- Email deliverability is a product-owner decision (Resend sender domain).
