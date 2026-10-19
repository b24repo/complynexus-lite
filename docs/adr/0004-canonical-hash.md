# ADR-0004: Canonical hash excludes live status

Status: accepted (Sprint 0)

## Context
The public page shows a SHA-256 that must match the hash printed on the PDF. Status and
deadlines move with time, but the PDF is a snapshot of one version.

## Decision
- `canonicalJson` sorts object keys recursively, keeps array order, drops `undefined`, no
  whitespace. `recordHash` is the lowercase hex SHA-256 of that string for a `RecordSnapshot`.
- The snapshot holds identity, scores, open items, test summary and library/control-set
  versions. It excludes status, deadlines, revoke data, `showTestSummary` and `hash`.
- Every new version (test completed, re-assessment) produces a new hash.

## Consequences
- A status change alone never changes the hash.
- Changing the snapshot shape is a breaking change for printed PDFs; bump the library or
  control-set version when it happens.
