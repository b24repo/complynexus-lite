# ADR-0010: PDF record and version history

Status: accepted (Sprint 1, S1-05)

## Decision

- The PDF is generated on request with pdfkit 0.20.2 and never stored. It is A4, uses the standard Latin-1 fonts and `compress: false`, so the file is tiny and tests can read its text from the bytes.
- It prints the org and agent, record id and version, status at print time, the public facts, the score and risk band, open must-fix and should-fix items with control names, the test summary, the SHA-256 hash, the verify URL and the disclaimer.
- The hash is the ADR-0004 snapshot hash of the record, identical to `hash` in `/verify/:id.json`. The verify URL is built with the shared base URL helper (`PUBLIC_BASE_URL` in production), never the raw request Host.
- The owner name is not printed, for parity with the public page. Product-owner question 5-4 can reverse this.
- The file is named `<recordId>-v<version>.pdf`. `GET /api/records/:recordId/pdf` is founder-only: anonymous gets 401, another founder's record gets 404. The `/app` agent overview links to it.
- History is the append-only `record_versions` collection (`id = recordId@version`), written by `saveNewVersion` at exactly three sites: `createAssessedRecord` (insert), `applyReassessment` and `applyTestCompleted` (update). Agent changes, revocation, time transitions, `PATCH /public` and the nightly job do not create a version. A unique `recordId + version` index backs it.
- `/verify/:id.json` returns `previousHashes` (newest first) and the verify page shows them collapsed under "Earlier versions".

## Consequences

- The hash identifies a version of the record, not a particular file.
- There is no backfill: records created before this change have no history rows, so `previousHashes` is empty for their older versions.
- The stored snapshot shape now falls under ADR-0004's versioning rule.
- No signature and no QR code.
- Names outside Latin-1 render as blanks in the PDF. Embedding a TTF is a follow-up.
