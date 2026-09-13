# PR4 — Deterministic Raw Graph-Hole Candidate Detectors: Design, Status & Boundaries

**Phase 5A-PR4** · `packages/intelligence/graph-hole-detection`
(`@indago/graph-hole-detection`)

This is the authoritative design/status note for PR4. It records the implementation
surface and — explicitly and honestly — the boundaries that are intentionally NOT
covered today.

> **PR4 status:** the backend detection runtime is complete and merged with the
> existing web/demo overlay layer; the listed items are explicit dependency /
> extension boundaries and do not require reopening PR4.

None of the items below is a bug, a blocker, or incomplete implementation. Each is
labelled `DEPENDENCY`, `DEFERRED`, or `FORWARD-COMPATIBILITY` and remains true while the
boundary it names is unchanged.

---

## Implementation surface (summary)

- **Pure, read-only, bounded detection.** PR4 consumes a `GraphHoleRegion` (PR1/13) and
  the derived PR3 `HypothesisContext` (already built, or built from the authoritative
  relation/entity hypotheses) and produces bounded `RawGraphHoleCandidate` records. It
  has zero side effects: no persistence, no second hypothesis lifecycle, no LLM/Ollama,
  no embeddings, no semantic or string similarity, no canonical entity/relation
  creation.
- **Six deterministic detectors** in a frozen order (`DETECTOR_ORDER`):
  `MISSING_EDGE`, `MISSING_PATH`, `ISOLATED_NODE`, `BROKEN_CHAIN`, `TEMPORAL_GAP`,
  `COMMUNITY_BOUNDARY`.
- **Closed world, not invention.** Every candidate = *structural expectation +
  supporting context + unexplained absence*. An absent edge alone is NEVER a
  candidate. Expected relationship types always come from an authoritative
  hypothesis predicate (`relationTypeOrNull`) — never invented; `null` otherwise.
  Provenance is single-entry, referencing only observation sources that actually
  resolve in the supplied input — if any referenced observation has no source record,
  detection refuses to run (`MISSING_OBSERVATION_SOURCE`) rather than fabricate it.
- **Determinism.** local `src/sha256.ts` (Node `crypto`, exactly as PR3) + a canonical
  identity
  (`caseId, graphVersionId, holeType=detectorType, canonicalNodeIds sorted-unique,
  expectedRelationshipType?, temporalScope?, detectionPolicyVersion`) →
  `candidateId = sha256(canonical identity)`. First-wins dedup in frozen order, then
  byte-stable sort by `candidateId`.
- **Explicit bounds (never silent).** Per-run budget tracking (`DetectorRun`) with
  `boundKind` (`PAIR_EVALUATIONS`, `TRAVERSAL_QUERIES`, `CANDIDATES`,
  `COMMUNITIES_ABSENT`) and a 10-candidate region cap with drop accounting
  (`droppedCandidateCount`, `regionCandidateCapReached`).
- **Region scope is enforced.** Nodes/edges/hypotheses outside `region.nodeIds` /
  `region.edgeIds` are excluded from every detector, never dropped silently: a
  referenced-but-out-of-scope node simply never forms a candidate pair.
- **Verification:** package suite 52 tests green (per-detector 28, orchestration 11,
  adversarial 13); contract suite extended and green; package typecheck + recursive
  build green.

## Detector semantics (summary contract)

| Detector | Expectation source | Structural basis | Extra guard clauses |
| --- | --- | --- | --- |
| MISSING_EDGE (m1) | single RELATION_HYPOTHESIS jointly referencing the pair | SHARED_HYPOTHESIS_CONTEXT | typed only when predicate is an authoritative RelationType |
| MISSING_EDGE (m2) | one PR3 group, both nodes embedded, shared supporting observation | OBSERVED_NEIGHBOR_CONTEXT | untyped (`null`); never duplicates m1 |
| MISSING_PATH | two distinct atomics A—x—B sharing intermediate canonical node | EXPECTED_PATH_BROKEN | no direct edge; no ≤4-hop observed path (`traverseBounded`) |
| ISOLATED_NODE | hypothesis reference OR region seed resolution | HYPOTHESIS_REFERENCED_NODE / SEED_REFERENCED_NODE | degree 0 required |
| BROKEN_CHAIN | observed simple chain whose tail has an asserted-but-unmaterialized pair C—D; D continues the structure | CHAIN_EXPECTED_CONTINUATION | one candidate per broken link (longest-side wins, deterministic) |
| TEMPORAL_GAP | asserted pair with strictly disjoint closed day-windows | TEMPORAL_DISCONTINUITY | open/missing endpoints = NULL, never a gap |
| COMMUNITY_BOUNDARY | caller-provided communities map + ≥1 inter-community edge + hypothesis/shared-evidence pair | CROSS_COMMUNITY_HYPOTHESIS_CONTEXT | graceful no-op without communities |

## Contract-surface notes

The candidate contract (`packages/contracts/src/intelligence/graph-hole-detection.ts`)
is defined, strict, and envelope-checked: `RawGraphHoleCandidateSchema.parse` validates
every detector output in `materializeCandidate`. `supportingObservationIds` /
`contradictingObservationIds` are observations only (they may be empty); `nodeIds` are
canonical graph nodes; `expectedRelationshipType` is nullable (invention barred).

---

## 1. Community membership source

**Label: `DEPENDENCY`** — COMMUNITY_BOUNDARY depends on a caller-supplied deterministic
community map from the M-A10/M-A13 `detectCommunities` pass.

PR4 never computes communities; without a map the detector is a graceful no-op and its
accounting can surface `COMMUNITIES_ABSENT`. The boundary hole still requires ≥1
observed inter-community edge plus a shared hypothesis expectation — an untraversed
boundary alone is never a candidate. Delivering the authoritative
graph-projection community pass into the production boundary is out of scope here.

## 2. Confidence / risk scoring

**Label: `DEFERRED`** — PR4 emits structural candidates with accounting, not
probability.

No confidence, likelihood, prior, or ranking exists yet. Candidate ordering is purely
byte-stable (by `candidateId`); `detectorMetadata` carries only `pairEvaluations`,
`boundReached`, and `boundKind`. Qualification / scoring / ranking (the
structural-confidence layer of the roadmap) is intentionally a later phase and would
consume this raw candidate stream.

## 3. Temporal authority beyond DAY granularity

**Label: `FORWARD-COMPATIBILITY`** — PR4 deliberately only compares day-granular
authoritative endpoints.

`TemporalInterval` values at a coarser or fine granularity are `null`-relevant: a
day-window cannot be extracted from open/missing endpoints, and PR4 never guesses an
unseen boundary. Finer-granularity reasoning (hours/minutes) would be a new,
version-bumped analysis pass, not a correction to this one.

## 4. Candidate classification / concealment semantics

**Label: `DEFERRED`** — PR4 detects *structure*, not *intent*.

There is no criminality, intent, concealment, or evasion semantics anywhere in the
detectors. The roadmap's gap-classification step (`missing investigation / data /
comparison / infrastructure / concealment-consistent pattern`) is a later consumer of
the raw candidate set and is out of PR4 scope.