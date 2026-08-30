# Entity Resolution (FUTURE)

> [!warning]
> **STATUS: FUTURE / NOT IMPLEMENTED**
>
> This document describes planned or exploratory architecture. It is not
> evidence that the capability currently exists in the repository.

## Scope

Entity Resolution is the step that turns **candidates** (mentions from
observations) into **canonical entities** and links them across evidence.

This document records:
- what already exists (contract-only structures),
- what the roadmap supports,
- what remains undefined (TBD / Architecture decision required).

It does **not** design unsupported mechanics as if they were decided.

## Definitions (repository-backed)

| Concept | Current state at `HEAD` |
| --- | --- |
| Entity | `EntitySchema` in `packages/contracts/src/domain/entity.ts` — contract only |
| Entity candidate | `EntityCandidateSchema` — resolution-output record bound to a canonical `EntityId` (not mention-derived) |
| Resolution candidate | `EntityResolutionCandidateSchema` in `packages/contracts/src/intelligence/entity-resolution.ts` — near-duplicate of the above; consumers aside from contracts: none |
| Resolution request/result | `EntityResolutionRequestSchema` / `EntityResolutionResultSchema` — contract only |
| Hypothesis | `EntityHypothesisSchema` / `EntityRoleHypothesisSchema` in `entity.ts` — contract only |
| Resolution score | `ResolutionScore` (contract comment: "ranking signal, not identity certainty") — contract only |
| Candidate mentions | `ObservationSchema.candidateMentions` (`string[]`, 0–50, 1–200 chars) — the only mention artifact, produced deterministically by `extractCandidateMentions` |
| Persistence | **none** — there is no EntityStore, CandidateStore, or ResolutionStore; Prisma (`packages/platform/prisma/schema.prisma`) has 12 models, none entity/candidate/mention-related |
| API | **none** — no entity/candidate/resolution routes exist in `packages/platform/src/api/routes.ts` |
| Worker | **none** — `packages/platform/src/queue/ingest-evidence.ts` ends at ANALYZING with no M-A07/M-A08 hook |

## Dependency chain

```
Observation
   ↓  (M-A07) entity candidate
   ↓  (this document) Entity Resolution
Canonical Entity
   ↓  (future) Relations
Graph
```

Resolution is strictly downstream of M-A07 candidate generation, which is
itself deferred/next. Nothing in the repository implements either.

## Pipeline expectations (roadmap-supported, not implemented)

### Candidate → canonical entity

- One or more candidates (mentions) from one or more observations resolve to a
  canonical `Entity` (canonical `EntityId`).
- `EntityResolutionResultSchema` is the declared output shape.
- The resolution **algorithm is undefined**: `Architecture decision required.`
  Deterministic rules, similarity, or later ML matching are all open; nothing
  is committed.

### ResolutionScore

- Defined as a ranking signal, not identity certainty.
- Distinct from `EvidenceStrength` (`Observation.strength`: 0.7 structured /
  0.6 narrative / 0.5 reconstructed) and from normalization confidence.
- The scoring formula is `TBD`.

### Hypotheses

- `EntityHypothesisSchema` / `EntityRoleHypothesisSchema` exist as contracts
  (role, status flags, confidence). No producer, no consumer.

### Aliases / external identifiers

- `sourceIdentifiers` and alias concepts appear on the entity contract.
- Gazetteer / alias resolution is future and unscheduled.

### Merge / split

- Identity merge/split of canonical entities is a future capability; only
  discussed, not contracted. Probabilistic/digest vs. sequence identity model
  is `Architecture decision required.`

### Uncertainty

- Entity status / uncertainty enums exist on contracts (e.g.
  `UNRESOLVED`/candidate status vocabulary). How uncertainty is surfaced in
  API and UI is `TBD`.

### Provenance

- Fact: Entity → ... → Observation → Evidence → Artifact provenance chain
  already exists for observations and must be preserved and extended, never
  severed, when resolution is added. Observation `identityKey` is a
  SHA-256→UUIDv4 digest; `SourceId`/`EvidenceId` follow the same pattern;
  `EntityId` is contract-only (`uuid`).

## Contract-only vs. to-build inventory

| Artifact | Contract exists | Producer | Persistence | API |
| --- | --- | --- | --- | --- |
| Entity | ✅ | ❌ | ❌ | ❌ |
| EntityCandidate | ✅ | ❌ | ❌ | ❌ |
| EntityResolutionRequest | ✅ | ❌ | ❌ | ❌ |
| EntityResolutionResult | ✅ | ❌ | ❌ | ❌ |
| EntityHypothesis | ✅ | ❌ | ❌ | ❌ |
| ResolutionScore semantics | ✅ (comment) | — | — | — |
| Entity store / tables | ❌ | — | ❌ | — |
| Resolution worker phase | ❌ | — | — | — |

## Design constraints (explicit, from roadmap)

- Resolution **must not run before M-A07 exists** — there is no candidate
  source to consume.
- Resolution decisions are **backend**; the frontend can surface them via the
  existing DEMO/LIVE provider boundary without changing Demo fixtures.
- A model must never create canonical identities on its own (see
  `entity-candidate-ml-layer.md`).
- `Observation.entityIds` is currently always `[]` and
  `candidateEntityHypothesisIds` is never populated by the live pipeline;
  whether M-A07/resolution populates them is an explicit open decision.

## Unknowns

1. Can a single observation yield multiple candidates (it can —
   `candidateMentions` is a list), so resolution input is 1:N. How N candidates
   group is `TBD`.
2. Identity model: digest-derivable (provenance-hash) vs. database-assigned.
3. Whether canonical entities pre-exist as a catalog (gazetteer) or are
   created on first evidence.
4. Whether resolution happens inline in the worker at ANALYZING time or as a
   separate job in the run lifecycle.

"Future-scope consolidation complete. The roadmap distinguishes current
implementation from planned and exploratory capabilities without changing
application behavior."