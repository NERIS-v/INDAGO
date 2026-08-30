# Observation Corroboration (FUTURE)

> [!warning]
> **STATUS: FUTURE / NOT IMPLEMENTED**
>
> This document describes planned or exploratory architecture. It is not
> evidence that the capability currently exists in the repository.

## Purpose

Record the previously discussed distinction between two behaviors that are
frequently conflated:

```
exact observation deduplication
        ≠
semantic corroboration
```

This document is not evidence that either behavior beyond exact
deduplication exists in the repository.

## Current behavior (implemented)

### Exact deduplication

- Each Observation carries a stable deterministic identity:
  `identityKey = SHA-256(["indago:observation","v1",evidenceId,sourceId,locationKey,type,canonicalContent])` → UUIDv4, `@unique`.
- The ingestion worker (`packages/platform/src/queue/ingest-evidence.ts`)
  rehydrates/preserves stored rows on retry and deduplicates observations with
  an identical identity key.
- Result: the **same** content from the **same** evidence collapses to one
  observation. This is exact, key-based deduplication — not semantic reasoning.

### Independent source preservation

- Observations derived from **different evidence** (a different
  source/artifact or a different page/span) are **preserved as separate rows**,
  even if the canonical content is identical (e.g. the same figure quoted in
  two independent reports).
- This is deliberate: identity is rooted in evidence provenance, so separate
  evidence never silently merges.

## Future capability (not implemented)

```
semantically similar observations
        ↓
corroboration / claim resolution
```

- Group observations that **say the same thing** across independent sources.
- Detect **contradiction** between observations.
- Produce claim grouping that spans evidence.

Potential future tools (discussed, unscheduled):
- embeddings / semantic similarity
- claim grouping
- contradiction detection

## Hard constraints (preserve)

1. **Semantic similarity MUST NOT replace evidence identity.** Grouping is a
   derived, reviewable layer on top of persisted observations; it must not
   rewrite `identityKey` or collapse rows that exact identity says are
   distinct.
2. Independent sources → separate observations stays true even after grouping
   exists.
3. Corroboration is a **future** capability and out of scope for M-A06 (which
   ended at deterministic extraction + the visual-line merge).
4. No contract, store, API, or worker phase for corroboration exists at HEAD.

## Status summary

| Concern | Status |
| --- | --- |
| Exact deduplication (identity order) | IMPLEMENTED (`identityKey`, `@unique`) |
| Independent-source preservation | IMPLEMENTED (evidence-rooted rows) |
| Semantic similarity | FUTURE / NOT IMPLEMENTED |
| Corroboration / claim resolution | FUTURE / NOT IMPLEMENTED |
| Contradiction detection | FUTURE / NOT IMPLEMENTED |
| Embeddings / ML similarity | FUTURE / NOT IMPLEMENTED |

"Future-scope consolidation complete. The roadmap distinguishes current
implementation from planned and exploratory capabilities without changing
application behavior."