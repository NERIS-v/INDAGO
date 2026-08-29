# M-A05: Normalization Engine

## Overview

M-A05 turns a persisted `RawExtraction` (M-PR3) into a **deterministic, canonical
`NormalizedExtraction`** — one normalized row per ingestion attempt — with
explicit quality metadata. It answers:

> "WHAT IS THIS MATERIAL, CANONICALLY?"

It deliberately does **NOT** answer: "What does this mean, or who is involved?" —
those are M-A06+ (observations, entities, resolution).

The engine is a **pure, synchronous module** in `@indago/ingestion`. It never
talks to a database, queue, network, or the platform — it maps
`RawExtraction → NormalizedExtraction` under an explicit, versionable policy.

## Architecture

```
Immutable RawExtraction (M-PR3)
      |
      v
NormalizationService.normalize(raw, provenance)   [pure, sync, deterministic]
      |
      +-- canonicalize fields  (type detection -> canonical value)
      +-- source references    (mac/line/row/block provenance mirrored)
      +-- quality metadata     (completeness, statusCounts, per-field confidence)
      +-- lexical statistics   (bounded token/bigram counts)
      v
NormalizedExtraction  (@indago/contracts, strict Zod)
      |
      v
@indago/platform worker (ingest-evidence.ts completeNormalization)
      |
      +-- upsertNormalizedExtractionByAttempt (attemptId-keyed, P2002-safe)
      +-- audit NORMALIZATION_STORED
      +-- transitions: INGESTING -> NORMALIZING -> ANALYZING
      +-- audit NORMALIZATION_COMPLETED (only when THIS call applied the transition)
```

### Ownership Boundary

M-A05 is owned by **MAYUR**. The normalization engine does NOT touch:
- HTTP/API infrastructure, Express, UploadThing
- Redis, BullMQ, or any queue
- Prisma, Neo4j, or any database
- Vertical AI (no LLM/OCR reruns — OCR confidence is summarized, never recomputed)

## Files

### `@indago/ingestion` (pure engine)

| File | Purpose |
|------|---------|
| `src/normalization/normalization-service.ts` | `NormalizationService.normalize()` — canonicalization, quality, lexical stats |
| `src/normalization/stored-extraction.ts` | JSON-safe raw-extraction row projection (`RawExtractionBodySchema`, `PersistedRawExtractionRowSchema`, `parseStoredRawExtraction`) with Date coercion and corrupt-row rejection |
| `src/normalization/index.ts` | Barrel exports: `NormalizationService`, `NORMALIZER_ID`, `NORMALIZER_VERSION`, stored-extraction helpers |

### `@indago/contracts` (annotated schemas)

| File | Purpose |
|------|---------|
| `src/intelligence/normalization.ts` | `NormalizedFieldSchema`, `QualityMetadataSchema`, `LexicalStatisticsSchema`, `NormalizationConfigSchema` + `DEFAULT_NORMALIZATION_CONFIG`, `NormalizationProvenanceSchema`, `NormalizedExtractionSchema` (all `.strict()`) |

### `@indago/platform` (durable wiring)

| File | Purpose |
|------|---------|
| `src/queue/ingest-evidence.ts` | `completeNormalization` (idempotent forward + re-entrant paths), `failNormalizationPermanently` |
| `src/queue/transitions.ts` | `transitionRunToNormalizing`, `transitionRunToAnalyzing` (returns whether applied — the idempotency fence) |
| `src/persistence/ingestion-store.ts` | `upsertNormalizedExtractionByAttempt`, `findNormalizedExtractionByAttempt`, `listRawExtractions` |
| `prisma/schema.prisma` | `NormalizedExtraction` model (JSONB columns; `attemptId` unique) |
| `src/audit/logger.ts` | Hash-chained `AuditEvent` rows, broadcast over SSE |

### Tests

| File | Coverage |
|------|----------|
| `tests/normalization/normalization-service.test.ts` (42) | Determinism (deep-equal), AMBIGUOUS-never-guess, INVALID/UNPARSED, date table (zones → UTC), numbers/currency/uuid/email/url/fraction/phone shapes, source refs, quality, config bounds |
| `tests/normalization/stored-extraction.test.ts` (13) | Per-format round-trips, `extractedAt` coercion, null warnings, corrupt-row rejection |
| `tests/normalization/barrel-exports.test.ts` (4) | Public exports + forbidden-import guard (no Prisma/BullMQ/Redis/React/Express/UploadThing) |
| `tests/integration/ingestion-pipeline.e2e.test.ts` | Real worker → real Postgres: normalized row, `normalizerId/Version`, canonical fields (statuses + rawValue), quality completeness, `tokenCount`, lifecycle audits |
| `tests/integration/ingestion-store.test.ts` | Upsert idempotency, concurrent P2002 collapse, find-by-attempt, raw-extraction filters |
| `tests/integration/real-stack.e2e.test.ts` | HTTP → BullMQ → worker → Postgres → SSE; normalized row + `NORMALIZATION_STORED` before ANALYZING; retry/permanent-failure |

## Key Design Decisions

### 1. Pure & deterministic (testable without infrastructure)

`normalize()` is a synchronous pure function over an immutable `RawExtraction`.
The same input always produces byte-identical output — verified by deep-equal
tests. The platform stores BOTH the raw extraction and the canonical
normalization so re-navigation never mutates source truth.

### 2. Never reruns OCR; never guesses ambiguous input

OCR confidence is summarized from the extraction unchanged (no re-OCR). When a
candidate cannot be resolved mechanically it is reported `AMBIGUOUS` with a
`null` canonical value — never a guess. Truly unparseable/invalid material is
`UNPARSED` / `INVALID` with the raw value preserved.

### 3. Deterministic date/number handling

- ISO datetimes with explicit zones resolve to **UTC** at confidence 1.0
  (`+05:30`, `-04:00`, `Z`); zone-less ISO datetimes are `AMBIGUOUS` (no assumed
  zone).
- DD/MM vs MM/DD ambiguity (`1/2/2024`) and month-only (`12/2023`) resolve to
  `AMBIGUOUS`.
- Currency preserves declared decimal precision: `$1,234.50 → 1234.50`.

### 4. Explicit policy configuration

All knobs (maxFields, maxFieldLength, token/unique/bigram caps, policy versions)
live in `NormalizationConfigSchema` / `DEFAULT_NORMALIZATION_CONFIG`. A behavior
change is a version bump — never a silent environment tweak.

### 5. Idempotent, re-entrant completion (platform side)

`completeNormalization` re-enters safely: an already-written normalized row
skips recomputation AND the `NORMALIZATION_STORED` audit. A re-entry whose run
is still INGESTING (the NORMALIZING transition failed on a prior pass) walks the
ladder `INGESTING → NORMALIZING (skip-if-past)` then `NORMALIZING → ANALYZING`,
leaving the run ANALYZING — never stranded mid-ingest.

### 6. P2002-safe persistence

`upsertNormalizedExtractionByAttempt` collapses concurrent duplicate inserts on
the `attemptId` unique constraint by re-reading the winner — proved by a
`Promise.all` race test against real Postgres.

### 7. Permanent failure is terminal

A normalize/`parseStoredRawExtraction` contract violation is never retried:
`NORMALIZATION_FAILED` audit once + run → FAILED + `UnrecoverableError` so
BullMQ stops. The successful extraction attempt stays truthful (SUCCEEDED).

## State Machine Impact

`CREATED → INGESTING → NORMALIZING → ANALYZING` is enforced via
`DEFAULT_RUN_STATE_CONFIGURATION.validTransitions`. `transitionRunToAnalyzing`
returns whether THIS call applied `NORMALIZING → ANALYZING`, so
`NORMALIZATION_COMPLETED` is audited exactly once (re-entrant retries on an
already-ANALYZING run audit nothing).

## Verification

| Layer | Result |
|-------|--------|
| `@indago/ingestion` typecheck + tests | 360/360 |
| `@indago/contracts` typecheck + tests | 133/133 |
| `@indago/platform` typecheck + unit tests | 123/123 |
| `@indago/platform` integration (real Neon Postgres + Upstash Redis + BullMQ + SSE) | 24/24 |