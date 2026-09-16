# Graph-Hole Policy (V1 Freeze)

Phase 5A-PR0 contract and policy freeze for the graph-hole / intelligence-gap core.
Single authoritative source of truth for thresholds, scoring, saturation, grouping, and support-unit rules.

> **Docs:** `packages/contracts/docs/graph-hole-policy.md`
> **Roadmap:** `docs/roadmap/phase-tracker.md` §5A (Graph-Hole / Intelligence-Gap Core)

---

## What is frozen

| Area | Location |
|---|---|
| Policy constants (V1 thresholds, bounds) | `graph-hole-policy.ts` — all `MAX_*`, `MIN_*`, `SATURATION_*` constants |
| Structural-score weights | `graph-hole-policy.ts` → `STRUCTURAL_SCORE_WEIGHTS` |
| Significance weights | `graph-hole-policy.ts` → `SIGNIFICANCE_WEIGHTS` |
| Scoring calibration (V1.1/v2) | `graph-hole-policy.ts` → `GRAPH_HOLE_SCORING_POLICY_VERSION`, `*_WEIGHTS`, `*_SATURATION`, `GEOMETRIC_MEAN_EPSILON` |
| Support-unit resolution rule | `graph-hole-policy.ts` → `resolveSupportUnitKey()`, `countIndependentSupportUnits()` |
| Saturation definition | `graph-hole-policy.ts` → `RegionSaturationDefinitionSchema` |
| Qualification gates | `graph-hole-policy.ts` → `GraphHoleQualificationGateSchema` (11 gates) |
| Grouping policy | `graph-hole-policy.ts` → `HypothesisGroupingPolicySchema`, `GROUP_SPLIT_ORDER` |
| Top-level instance | `graph-hole-policy.ts` → `GRAPH_HOLE_POLICY_V1` |
| Region identity | `graph-hole-region.ts` → `RegionIdentityV1Schema`, `RegionStatusSchema` |
| Candidate identity | `graph-hole-candidate.ts` → `GraphHoleCandidateIdentityV1Schema`, `StructuralScoreProfileSchema` |
| Canonical serialization | `identity-canonicalization.ts` → `canonicalizeDeterministic()` |
| GraphHole identity | `graph-holes.ts` → `GraphHoleSchema` (required `id`, `caseId`, optional `detectionPolicyVersion`) |
| Gap classification | `gap-classification.ts` → `GapClassificationTypeSchema`, tightened `GapClassificationResultSchema` |
| Hole event payload | `graph-events.ts` → `GraphHoleDetectedPayloadSchema` (includes `holeId`, `caseId`, `holeType`) |

---

## V1 frozen values

### Structural-score weights (§13)

| Component | Weight |
|---|---|
| `patternStrength` | 0.30 |
| `connectivitySupport` | 0.25 |
| `contextualSupport` | 0.20 |
| `temporalSupport` | 0.15 |
| `communitySupport` | 0.10 |

**Sum = 1.0.** Absent component = NOT applicable; runtime renormalizes remaining applicable weights (never treats absent as zero).

### Significance weights (§14)

| Component | Weight |
|---|---|
| `structuralScore` | 0.60 |
| `evidenceSupportScore` | 0.25 |
| `expectedInformationValue` | 0.15 |

`significanceMeaning = 'INVESTIGATIVE_PRIORITIZATION_VALUE_NOT_PROBABILITY'` — this is a ranking signal, never probability.

### Scoring calibration (V1.1, `GRAPH_HOLE_SCORING_POLICY_VERSION = "v2"`)

The scoring revision is versioned **independently** from the region and detection
policies (repo convention: one version constant per subsystem). `GRAPH_HOLE_POLICY_VERSION`,
`DETECTION_POLICY_VERSION`, `SEMANTIC_RETRIEVAL_POLICY_VERSION`, and
`EMBEDDING_POLICY_VERSION` stay `'v1'` because candidate/region identity inputs
and detection outputs are unchanged. Every `QualifiedGraphHoleCandidate` and
`GraphHoleQualificationResult` reports `scoringPolicyVersion: "v2"`.

Frozen constants (`graph-hole-policy.ts`):

| Constant | Value | Meaning |
|---|---|---|
| `EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS` | `0.50 / 0.30 / 0.20` | geometric-mean exponents over `supportBreadth / supportConsistency / provenanceCompleteness` |
| `PATTERN_STRENGTH_INFLUENCE_WEIGHTS` | `0.60 / 0.40` | `patternStrength = basisStrength × (0.60 + 0.40×evidenceRatio)`, ratio defaults 0.5 ⇒ never exceeds basis |
| `EXPECTED_INFORMATION_VALUE_WEIGHTS` | `0.50 / 0.30 / 0.20` | linear weights over `uncertaintyPotential / hypothesisCoverage / evidenceDiversity` |
| `SUPPORT_BREADTH_SATURATION` | `4` | `min(U,4)/4` |
| `HYPOTHESIS_COVERAGE_SATURATION` | `3` | `min(H,3)/3` |
| `EVIDENCE_DIVERSITY_SATURATION` | `4` | `min(U,4)/4` |
| `GEOMETRIC_MEAN_EPSILON` | `0.000001` | floor for the geometric mean so a zero component defects to ε, never exactly 0 |

V1.1 semantics: the evidence-support score is a **weighted geometric mean, never
an arithmetic sum** — more evidence can never inflate it past its natural ceiling
(two perfect units cap at `sqrt(0.5) ≈ 0.707107`). `expectedInformationValue`
estimates the opportunity for useful resolution/discrimination among competing
explanations — a heuristic, NOT a probability and NOT calibrated information
gain; the contradiction count itself is never rewarded. Benchmark calibration is
required before any empirical claim about precision, recall, calibration, or
investigator utility.

### Qualification gates (11, all mandatory)

All 11 gates must be satisfied simultaneously (`requiresAllHardGates = true`):

1. `GRAPH_VERSION_EXISTS`
2. `PROJECTION_NOT_TRUNCATED`
3. `REGION_SATURATED`
4. `CASE_ISOLATION_VALID`
5. `MINIMUM_INDEPENDENT_SUPPORT_UNITS` (≥ 2)
6. `MINIMUM_STRUCTURAL_SCORE` (≥ 0.70)
7. `MINIMUM_SIGNIFICANCE` (≥ 0.70)
8. `CANDIDATE_NOT_RESOLVED`
9. `CANDIDATE_NOT_DUPLICATE`
10. `TEMPORAL_CONTEXT_VALID`
11. `COMPUTATION_BOUNDS_SATISFIED`

`truncatedProjectionBehavior = 'SUPPRESS'` — truncated projections suppress normal-mode qualification entirely.

### Region bounds

| Bound | Value |
|---|---|
| `maxExpansionRounds` | 3 |
| `maxRegionNodes` | 100 |
| `maxRegionEdges` | 250 |
| `maxContextObservations` | 150 |
| `maxSemanticResultsPerRound` | 20 |
| `maxTotalSemanticResults` | 50 |
| `maxGraphHolesPerRegion` | 10 |

### Saturation

A region becomes `SATURATED` only when:
- Two consecutive expansion rounds each satisfy: `newUniqueObservations / total ≤ 0.10` AND `newUniqueNodes / total ≤ 0.10`
- No hard budget was exhausted during those rounds

`SATURATED` means retrieval produced sufficiently little new context — NOT mathematical completeness.

### Grouping (§18–§20)

- **Overlap rule:** `SHARED_CANONICAL_GRAPH_NODE_OR_ENTITY` — one shared canonical node/entity creates an overlap edge
- **Component model:** `WEAKLY_CONNECTED_COMPONENTS` — groups are weakly connected components of the hypothesis-overlap graph
- **Directionality:** `directionalityAware = false` — direction does not affect grouping
- **Split ordering:** `EVIDENCE_SUPPORT_DESC` → `STRUCTURAL_RELEVANCE_DESC` → `HYPOTHESIS_ID_ASC`
- **Limits:** max 25 atomic hypotheses per group; max 50 nodes in shared-context subgraph

Community membership ≠ hypothesis grouping (§20): Louvain communities are an additional graph signal, never a group definition.

---

## Support-unit independence rule (§9)

Resolution priority: `sourceContextId` → `artifactId` → `contentHash` → `sourceId`

`countIndependentSupportUnits()` counts distinct resolved keys. Intentionally conservative V1 baseline.

---

## Identity contracts

### Region identity (`RegionIdentityV1`)

| Field | Notes |
|---|---|
| `caseId` | Required (UUID) |
| `graphVersionId` | Required (UUID) |
| `temporalContext` | Optional `TemporalInterval` |
| `seedObservationIds` | Required array (sorted before canonicalization) |
| `nodeIds` | Required array (sorted) |
| `edgeIds` | Required array (sorted) |
| `regionPolicyVersion` | Literal `'v1'` |
| `semanticRetrievalPolicyVersion` | Literal `'v1'` |

`regionId` = SHA-256(canonicalizeRegionIdentity(identity)) (computed in later PRs).

### Candidate identity (`GraphHoleCandidateIdentityV1`)

| Field | Notes |
|---|---|
| `caseId` | Required (UUID) |
| `graphVersionId` | Required (UUID) |
| `holeType` | `GraphHoleTypeSchema` — structural detection category (NOT `GapType`) |
| `canonicalNodeIds` | Required, `min(1)` — sorted before canonicalization |
| `expectedRelationshipType` | Optional `RelationType` |
| `temporalScope` | Optional `TemporalInterval` |
| `detectionPolicyVersion` | Literal `'v1'` |

`candidateId` = SHA-256(canonicalizeGraphHoleCandidateIdentity(identity)).

One region may produce several candidates. Multiple detector paths must converge on the same candidate identity for the same logical gap.

---

## GraphHole contract

`GraphHoleSchema` carries explicit identity fields:

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | `GraphHoleCandidateIdSchema` — deterministic candidate identifier |
| `caseId` | Yes | Case UUID |
| `graphVersionId` | Yes | Graph version UUID |
| `type` | Yes | `GraphHoleTypeSchema` (structural detection category) |
| `detectionPolicyVersion` | No | Literal `'v1'` (detection policy consumed to produce this candidate) |
| `investigationGapId` | No | Associated `InvestigativeGap`, if classified |
| `nodeIds` | Yes | Canonical graph nodes involved |
| `expectedEdgeType` | Yes | `RelationType` — missing edge type |
| `significance` | Yes | Structural signal [0, 1] — NOT probability |

---

## Gap classification (tightened)

`GapClassificationTypeSchema` — five Phase 5 semantic categories:

1. `MISSING_INVESTIGATION`
2. `MISSING_DATA`
3. `MISSING_COMPARISON`
4. `INFRASTRUCTURE_GAP`
5. `CONCEALMENT_CONSISTENT_PATTERN`

⚠️ **CONCEALMENT_CONSISTENT_PATTERN is hypothesis-oriented only.** It must NEVER become an assertion of concealment. It means "the available pattern is consistent with concealment as ONE possible explanation" — no legal or factual meaning on its own.

`GapPrioritySchema` — canonical domain enum: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`.

The Phase 5A runtime classifier (PR14, `@indago/gap-classification`) is a **pure derived layer**: it supplies `GapClassificationResult` with a single `type` from the five categories above, an epistemic `status` (`CONFIDENT` | `SUPPORTED` | `AMBIGUOUS` | `INSUFFICIENT_CONTEXT`), deterministic `reasonCodes`, auditable `supportingReferences`, and a `contextSha256` content digest. It consumes only already-certified PR1/PR3/PR5/PR13 outputs, pursues NO persistence, and follows the frozen policy in `docs/architecture/pr14-gap-classification.md`.

---

## Semantic invariants (V1 frozen)

- A graph hole is a structural/evidentiary candidate — NOT a fact, NOT proof, NOT criminality, NOT intent
- `StructuralSignal` ≠ criminal relevance
- `Significance` = investigative prioritization value, NOT probability
- More evidence cannot inflate a V1.1 score past its natural ceiling (weighted geometric mean + saturation + bounded pattern strength)
- Community membership ≠ hypothesis grouping
- Absence ≠ concealment
- Truncated projections suppress normal-mode qualification

---

## What is NOT implemented

This module is **policy/schema only**. The following are explicitly deferred:

- `findGraphHoles` (detection algorithm) — PR1
- `buildRegion` / `expandRegion` — PR1
- `semanticSearch` — PR2
- `groupHypotheses` — PR3
- AI calls / qualification runtime — PR5–PR7
- Persistence (Prisma models / migrations)
- Workflow state transitions
- Region hashing (`regionId = SHA-256(...)`) — PR1
- Candidate hashing (`candidateId = SHA-256(...)`) — PR1

---

## Cross-references

- `GRAPH_HOLE_POLICY_V1` — consumed by later PR1 (region builder), PR3 (grouping), PR5 (qualification), PR7 (AI context)
- `docs/roadmap/phase-tracker.md` §5A — roadmap tracker for Graph-Hole / Intelligence-Gap Core
- `packages/contracts/tests/graph-hole-policy.test.ts` — direct policy constant + support-unit tests
- `packages/contracts/tests/graph-hole-contracts.test.ts` — identity/canonicalization + contract validation tests
