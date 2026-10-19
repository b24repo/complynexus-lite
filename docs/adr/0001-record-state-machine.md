# ADR-0001: Record state machine with lazy time transitions

Status: accepted (Sprint 0)

## Context
A readiness record moves Assessed, Current, Re-test due, Expired, Revoked. Two moves are
caused by time (3 months after a test, then 30 days of grace), not by a user action.

## Decision
- All transitions are pure functions in `src/domain/record.ts` taking `(record, now)` and
  returning a new record. `TRANSITIONS` and `assertTransition` hold the allowed table.
- Time transitions are applied on read (`applyTimeTransitions`) and persisted if they changed
  the record. Ticket L-31 later adds a scheduler that calls the same function over all records
  and sends the emails.
- "3 months" is calendar months (`addMonths`), grace is 30 calendar days, UTC day boundary.
- Only a Current record reacts to an agent change. Revoked is terminal.

## Consequences
- No cron is needed for correctness; reads are always up to date.
- Reads can write, so the repository must tolerate that.
- Applying the function twice gives the same result (idempotent), so a scheduler is safe.
