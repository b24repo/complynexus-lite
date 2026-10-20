# ComplyNexus Lite POC (Sprint 0)

Low-regret core of ComplyNexus Lite: the readiness record domain (state machine, badge rule,
canonical hash, 15-control assessment), the 46-case test library, the guided self-test engine
with a rule-based grader, a thin JSON API and a server-rendered public verify page.

Out of scope: endpoint test runner, auth, notifications and schedulers, fix-it plans, React UI. See `docs/adr/` for decisions.

## Commands

```bash
npm install        # creates package-lock.json
npm ci
npm run lint
npm test           # vitest with coverage thresholds (lines 80, functions 80, branches 75)
npm run build
npm run dev        # PORT=3000, copy .env.example to .env first
SKIP_MONGO_TESTS=1 npm test  # skip the MongoDB tests (they download MongoDB 8.2.6 once)
MONGODB_URI=mongodb://localhost:27017 npm run dev  # use MongoDB instead of memory
```

## API

| Method and path | Purpose |
|---|---|
| `POST /api/agents`, `GET /api/agents/:id` | create and read an agent profile |
| `POST/GET /api/agents/:id/assessment` | 15 answers; creates or re-versions the record |
| `POST /api/agents/:id/changes` | founder-declared agent change (CA-1) |
| `GET /api/library` | the 46 test cases with prompts |
| `POST /api/agents/:id/guided-runs` | start a guided run (attestation and safety booleans) |
| `GET /api/guided-runs/:runId` | run with batch prompts |
| `POST /api/guided-runs/:runId/batches/:index` | submit pasted replies for a batch |
| `GET /api/guided-runs/:runId/results` | summary, failed cases, not-run groups |
| `GET /api/records/:recordId` | record after time transitions |
| `GET /api/records/:recordId/badge` | badge eligibility |
| `PATCH /api/records/:recordId/public` | show or hide the test summary |
| `POST /api/records/:recordId/revoke` | admin only, header `X-Admin-Key` |
| `GET /verify/:recordId`, `GET /verify/:recordId.json` | public page and public JSON |

## Rules to design boards

| Rule | Code | Board |
|---|---|---|
| 15 controls and severities | `src/domain/controls.ts` | Controls |
| Score, bands, priorities | `src/domain/assessment.ts` | Assessment |
| Statuses and deadlines | `src/domain/record.ts` | States, Retest |
| Category verdicts | `src/domain/scoring.ts` | Tests, GuidedResults |
| Batches of 5 | `src/guided/engine.ts` | GuidedRun |
| Public page copy | `src/api/views/verify.ts` | VerifyCurrent, VerifySelfRun, VerifyAssessed |

## Quick smoke script

```bash
B=http://localhost:3000
A=$(curl -s $B/api/agents -H 'content-type: application/json' -d '{"orgName":"Acme","name":"Bot","purpose":"x","ownerName":"Mei","buildType":"no_code","canActIrreversibly":"yes","approvalMode":"each","tools":[]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
# answer all 15 controls (see test/fixtures/bookbot.ts), then:
curl -s $B/api/agents/$A/assessment -H 'content-type: application/json' -d @answers.json
curl -s $B/api/library | head -c 200
curl -s -X POST $B/api/agents/$A/guided-runs -H 'content-type: application/json' -d '{"size":"essentials","attestation":true,"safety":{"testRecipient":true,"freshChat":true,"unedited":true}}'
# submit batches, then open $B/verify/CNL-<year>-0001
```

## Porting

Set `RESEND_API_KEY` and `MAIL_FROM` to send email through Resend; otherwise notifications are printed.

`MongoRepository` is implemented (`src/infra/repo/mongo.ts`, ADR-0005). Set `MONGODB_URI` (and
optionally `MONGODB_DB`) to use it, otherwise the server runs in memory; indexes are created at
boot. Remaining porting work: a scheduler that runs `applyTimeTransitions` over all records
(ticket L-31). For AWS, the Express app is a plain `createApp(deps)` and fits Lambda or a
container (reuse one `MongoClient` across invocations).
