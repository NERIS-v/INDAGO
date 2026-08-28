# I-PR2: Pre-Producer UI / Evidence Submission Hardening — Final Report

## Status: COMPLETE

---

## 1. Objective

Build the end-to-end evidence submission flow from the web UI through the platform API to the BullMQ ingestion queue, ensuring that:

- The browser sends only user-entered metadata and provider-supplied file references
- System-generated IDs (operationId, correlationId, idempotencyKey) are created server-side only
- No file bytes transit BullMQ — only URL references
- Canonical contracts (`SourceSchema`, `EvidenceSchema`, `ArtifactReferenceSchema`, `EvidenceTypeSchema`) are reused, not duplicated
- Exactly ONE producer enqueues ingest-evidence jobs
- Exactly ONE schema defines the ingest-evidence queue payload
- `caseId` is resolved from the canonical Prisma column (`run.caseId`), never from `contextData`

---

## 2. Canonical Metadata Model

The I-PR2 boundary reuses existing contracts without introducing new domain schemas:

| Canonical Contract | Location | Used For |
|---|---|---|
| `SourceSchema` | `contracts/src/domain/source.ts` | Source metadata fields (name, description) |
| `EvidenceSchema` | `contracts/src/domain/evidence.ts` | Evidence metadata fields (title, description, type, observedAt) |
| `EvidenceTypeSchema` | `contracts/src/domain/evidence.ts` | 8-value enum classification |
| `ArtifactReferenceSchema` | `contracts/src/intelligence/artifact-reference.ts` | Queue-safe artifact location (URL + metadata) |
| `IngestionJobPayloadSchema` | `contracts/src/intelligence/ingestion-job-payload.ts` | **The single canonical** BullMQ job shape |
| `EventTimeSchema` | `contracts/src/common/timestamps.ts` | Date + precision pair |

**New contracts introduced by I-PR2** (`contracts/src/intelligence/evidence-submission.ts`):

| Contract | Purpose |
|---|---|
| `UploadedFileReferenceSchema` | What the browser receives after UploadThing upload |
| `EvidenceSubmissionRequestSchema` | Browser → Platform API request body |

> `EvidenceIngestionJobSchema` was removed. `IngestionJobPayloadSchema` is the single canonical queue schema.

---

## 3. Field Classification

### 3.1 User-Entered Fields (Browser)

| Field | Maps To | Validation |
|---|---|---|
| `sourceName` | `SourceSchema.name` | `string.min(1).max(200)` |
| `sourceDescription` | `SourceSchema.description` | `string.max(5000).optional()` |
| `evidenceType` | `EvidenceTypeSchema` | 8-value enum |
| `evidenceTitle` | `EvidenceSchema.title` | `string.min(1).max(500)` |
| `evidenceDescription` | `EvidenceSchema.description` | `string.max(10000).optional()` |
| `observedAt` | `EvidenceSchema.observedAt` | `EventTimeSchema.optional()` |
| `notes` | (free text) | `string.max(5000).optional()` |

### 3.2 Provider-Supplied Fields (UploadThing)

| Field | Source | Validation |
|---|---|---|
| `fileKey` | UploadThing response | `string.min(1)` |
| `fileUrl` | UploadThing CDN URL | `string.url()` |
| `fileName` | UploadThing response | `string.min(1).max(500)` |
| `fileSize` | UploadThing response | `number.int().nonnegative()` |
| `mimeType` | UploadThing response | `string.max(200).optional()` |

### 3.3 System-Generated Fields (Server Only)

| Field | Generated At | Method |
|---|---|---|
| `caseId` | `routes.ts` | `run.caseId` — canonical Prisma column |
| `operationId` | `routes.ts` | `randomUUID()` — per-submission batch |
| `correlationId` | `routes.ts` | `randomUUID()` — per-submission batch |
| `idempotencyKey` | `routes.ts` | `evidence-{investigationId}-{fileKey}` — per-file |
| `artifactId` | I-PR3 worker (future) | `deterministicArtifactId(contentHash)` |
| `contentHash` | I-PR3 worker (future) | `computeContentHash(fetched.body)` — SHA-256 of bytes |
| `sourceId` | I-PR3 worker (future) | Generated during ingestion pipeline |

---

## 4. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER (Next.js Web App)                                       │
│                                                                   │
│  Step 1: EvidenceMetadataForm                                    │
│    → User fills: sourceName, evidenceType, evidenceTitle, etc.  │
│                                                                   │
│  Step 2: FileUpload                                              │
│    → UploadThing SDK → platform /api/uploadthing                 │
│    → Receives: [{ fileKey, fileUrl, fileName, fileSize }]        │
│                                                                   │
│  Step 3: EvidenceReview                                          │
│    → Shows metadata + file summary                               │
│    → User clicks "Submit Evidence"                               │
│                                                                   │
│  submitEvidence() (server-action)                                │
│    → EvidenceSubmissionRequestSchema.safeParse() ← validation    │
│    → POST /api/v1/investigations/:id/evidence                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PLATFORM (Express API)                                          │
│                                                                   │
│  POST /api/v1/investigations/:id/evidence                       │
│    Auth ordering:                                                │
│      1. requireAuth — authenticate (middleware)                  │
│      2. requireRole — RBAC gate (middleware)                     │
│      3. Resolve investigation from DB                            │
│      4. Resolve caseId from run.caseId (Prisma column)          │
│      5. verifyCaseAccess — case boundary check                  │
│      6. Validate payload + enqueue jobs                         │
│                                                                   │
│    → EvidenceSubmissionRequestSchema.safeParse(req.body)         │
│    → db.investigationRun.findFirst({ investigationId })          │
│    → For each file:                                              │
│        operationId = randomUUID()                                │
│        correlationId = randomUUID()                              │
│        idempotencyKey = evidence-{invId}-{fileKey}              │
│        artifactReference = { url, originalFilename, ... }        │
│        queue.add("ingest-evidence", IngestionJobPayload)        │
│    → Audit: EVIDENCE_QUEUED                                      │
│    → SSE: EVIDENCE_SUBMITTED                                     │
│    → 202 { operationId, correlationId, jobsEnqueued }           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  BULLMQ QUEUE                                                    │
│    IngestionJobPayload (per file)                                │
│    → URL reference only — NO bytes                               │
│    → investigationId, caseId, artifactReference                 │
│    → sourceName, evidenceType, evidenceTitle                    │
│    → operationId, correlationId, idempotencyKey                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  I-PR3 WORKER (future)                                          │
│    → Fetches bytes from artifactReference.url                   │
│    → Computes contentHash (SHA-256)                              │
│    → Generates artifactId                                        │
│    → Runs ingestion pipeline: acquire → classify → extract      │
└──────────────────────────────────────────────────────────────────┘
```

### Single Producer Invariant

The only code path that calls `investigationQueue.add("ingest-evidence", ...)` is:
- `packages/platform/src/api/routes.ts` — the evidence submission endpoint

UploadThing `onUploadComplete` does **NOT** enqueue ingestion. It stores the file, audits the upload event (`EVIDENCE_UPLOADED`), and returns. Evidence ingestion is triggered exclusively by the explicit evidence submission endpoint.

---

## 5. Identity Flow

| ID | Generated By | Purpose | Lifetime |
|---|---|---|---|
| `investigationId` | Caller (pre-existing UUID) | Links submission to investigation | Persistent |
| `caseId` | `run.caseId` (Prisma column) | Case boundary enforcement | Persistent |
| `operationId` | `routes.ts` `randomUUID()` | Groups all files in one submission batch | Per-submission |
| `correlationId` | `routes.ts` `randomUUID()` | Links related jobs across queue | Per-submission |
| `idempotencyKey` | `routes.ts` deterministic string | Deduplicates BullMQ jobs | Per-file |
| `artifactId` | I-PR3 worker (future) | Content-addressable artifact identity | Persistent |
| `contentHash` | I-PR3 worker (future) | SHA-256 of fetched bytes | Persistent |
| `sourceId` | I-PR3 worker (future) | Deduplicates source creation | Persistent |
| `fileKey` | UploadThing provider | Provider-side file reference | Per-upload |

### Idempotency Key Identity

- Same `investigationId` + same `fileKey` → same `idempotencyKey`
- Different `investigationId` + same `fileKey` → different `idempotencyKey`
- Same `investigationId` + different `fileKey` → different `idempotencyKey`

BullMQ deduplicates by `jobId` — passing `{ jobId: idempotencyKey }` to `queue.add()` ensures at-most-once delivery per file per investigation.

---

## 6. UX Flow

Three-step evidence submission wizard:

1. **Evidence Context** — User enters source name, evidence type (dropdown), title, descriptions, date, notes. Required: source name + title.
2. **Files** — UploadThing file picker. Uploads happen immediately. User sees file count and can proceed when at least one file is uploaded.
3. **Review & Submit** — Displays metadata summary + file list with sizes. Submit button triggers `submitEvidence()` server action. On success, hides form and refreshes investigation status.

Navigation: Back button returns to previous step. Cancel returns to investigation detail view.

---

## 7. Contracts Added (I-PR2)

### `UploadedFileReferenceSchema`
```ts
{
  fileKey: string.min(1),
  fileUrl: string.url(),
  fileName: string.min(1).max(500),
  fileSize: number.int().nonnegative(),
  mimeType?: string.max(200),
}
```

### `EvidenceSubmissionRequestSchema`
```ts
{
  investigationId: InvestigationIdSchema (UUID),
  sourceName: string.min(1).max(200),
  sourceDescription?: string.max(5000),
  evidenceType: EvidenceTypeSchema (8-value enum),
  evidenceTitle: string.min(1).max(500),
  evidenceDescription?: string.max(10000),
  observedAt?: EventTimeSchema,
  files: UploadedFileReferenceSchema[].min(1).max(50),
  notes?: string.max(5000),
}
```

### `IngestionJobPayloadSchema` (the single canonical queue schema)
```ts
{
  investigationId: InvestigationIdSchema,        // required
  caseId: CaseIdSchema,                          // required
  artifactReference: ArtifactReferenceSchema,    // required
  idempotencyKey: string.min(1),                 // required
  correlationId: CorrelationIdSchema,             // required
  operationId: OperationIdSchema,                 // required
  sourceName: string.min(1).max(200),            // required
  sourceDescription?: string.max(5000),           // optional
  evidenceType: EvidenceTypeSchema,               // required
  evidenceTitle: string.min(1).max(500),          // required
  evidenceDescription?: string.max(10000),        // optional
  observedAt?: EventTimeSchema,                   // optional
}  // .strict() — rejects unknown keys
```

> Required fields are mandatory because the single producer (`routes.ts`) always provides them.

---

## 8. Files Created / Modified

### New Files (I-PR2)
| File | Purpose |
|---|---|
| `packages/contracts/src/intelligence/evidence-submission.ts` | I-PR2 contracts (2 schemas) |
| `packages/contracts/tests/evidence-submission.test.ts` | 15 contract tests |
| `packages/web/src/components/evidence/evidence-metadata-form.tsx` | Step 1: metadata form |
| `packages/web/src/components/evidence/evidence-review.tsx` | Step 3: review + submit |
| `packages/web/src/components/evidence/evidence-submission.tsx` | 3-step container |
| `packages/web/tests/evidence-metadata-form.test.tsx` | 6 component tests |
| `packages/web/tests/evidence-review.test.tsx` | 7 component tests |

### Modified Files (I-PR2)
| File | Changes |
|---|---|
| `packages/contracts/src/index.ts` | Added evidence-submission + ingestion-job-payload exports |
| `packages/contracts/src/domain/audit-event.ts` | Added `EVIDENCE_QUEUED` to AuditActionSchema |
| `packages/contracts/src/intelligence/ingestion-job-payload.ts` | Promoted caseId/operationId/sourceName/evidenceType/evidenceTitle to required; updated comments for single-producer model |
| `packages/platform/prisma/schema.prisma` | Added `caseId` to InvestigationRun |
| `packages/platform/src/api/routes.ts` | Evidence submission endpoint; uses `run.caseId`; auth ordering: requireAuth → requireRole → resolve → caseId → verifyCaseAccess → validate → enqueue |
| `packages/platform/src/api/uploadthing.ts` | No producer — only stores/audits; uses `run.caseId` |
| `packages/platform/src/api/auth.ts` | Demo allowedCases uses UUIDs |
| `packages/platform/src/queue/orchestrator.ts` | Updated comment |
| `packages/platform/package.json` | Added dev/start/test/prebuild/predev scripts + tsx |
| `packages/web/src/app/investigations/[id]/investigation-detail.tsx` | Replaced FileUpload with EvidenceSubmission |
| `packages/web/src/components/upload/file-upload.tsx` | Added onFilesUploaded callback |
| `packages/web/src/lib/upload/uploadthing.ts` | Added fileSize to result |
| `packages/web/src/lib/api/types.ts` | Replaced local interfaces with contracts re-exports |
| `packages/web/src/lib/api/server.ts` | Added safeParse validation before network call |
| `packages/web/src/lib/api/server-action.ts` | Added submitEvidence action |
| `packages/web/src/lib/contracts/types.ts` | Added EVIDENCE_TYPE_LABELS |
| `packages/web/tests/uploadthing-sdk.test.ts` | Updated mock for fileSize field |

---

## 9. Consistency Audit Results

| Check | Result | Details |
|---|---|---|
| Single producer | **PASS** | Only `routes.ts` calls `queue.add("ingest-evidence", ...)` |
| Single queue schema | **PASS** | `IngestionJobPayloadSchema` is the only ingest-evidence schema |
| Duplicate schemas | **FIXED** | Web local interfaces replaced with contracts re-exports |
| `EvidenceIngestionJobSchema` removed | **PASS** | Zero references in source or tests |
| Bytes in BullMQ | **PASS** | URL references only; bytes fetched by worker |
| Platform imports in web | **PASS** | Zero forbidden imports found |
| Client-side ID generation | **PASS** | No generation; type references only |
| No artifactId/contentHash/sourceId in web/platform | **PASS** | Only in contracts domain schemas |
| EvidenceSubmissionRequestSchema validation | **PASS** | safeParse in both web server.ts and platform routes.ts |
| `contextData.caseId` eliminated | **PASS** | All access via `run.caseId` (Prisma column) |
| `.strict()` on queue schema | **PASS** | `IngestionJobPayloadSchema` uses `.strict()` |
| Authorization ordering | **PASS** | Auth → Role → Resolve → CaseId → CaseAccess → Validate → Enqueue |
| Audit action `EVIDENCE_QUEUED` | **PASS** | Added to `AuditActionSchema` enum |

---

## 10. Test Summary

| Package | Test Files | Tests | Status |
|---|---|---|---|
| `@indago/contracts` | 7 | 111 | ✅ All passing |
| `@indago/platform` | 3 | 49 | ✅ All passing |
| `@indago/web` | 9 | 69 | ✅ All passing |
| `@indago/ingestion` | 24 | 280 | ✅ All passing |
| **Total** | **43** | **509** | ✅ |

### Typecheck Status

| Package | Status |
|---|---|
| `@indago/contracts` | ✅ Clean |
| `@indago/platform` | ✅ Clean |
| `@indago/web` | ✅ Clean |
| `@indago/ingestion` | ✅ Clean |

---

## 11. Limitations Deferred to I-PR3

| Item | Reason Deferred |
|---|---|
| Worker processing of IngestionJobPayload | I-PR3 scope — ingestion pipeline consumer |
| `artifactId` generation | Requires contentHash from fetched bytes |
| `contentHash` computation | Requires fetching bytes from URL |
| `sourceId` generation | Requires source deduplication logic |
| Source/Evidence DB record creation | Requires Prisma models not yet defined |
| `caseId` migration on existing data | Requires running PostgreSQL + `prisma db push` |
| Audit log persistence | Currently console-only; needs DB model |
| CI pipeline configuration | No `.github/workflows/` in repo yet |

---

## 12. How to Run

```bash
# Build contracts (required before platform/web typecheck)
pnpm --filter @indago/contracts build

# Typecheck all packages
pnpm --filter @indago/contracts typecheck
pnpm --filter @indago/platform exec prisma generate && pnpm --filter @indago/platform typecheck
pnpm --filter @indago/web typecheck
pnpm --filter @indago/ingestion typecheck

# Run all tests
pnpm --filter @indago/contracts test
pnpm --filter @indago/platform test
pnpm --filter @indago/web test
pnpm --filter @indago/ingestion test

# Start platform (requires PostgreSQL + Redis)
cd packages/platform && pnpm dev

# Start web app (connects to platform on port 3000)
cd packages/web && pnpm dev
```
