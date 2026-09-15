# PR10 — Next-Best-Evidence Runtime: Design, Status & Boundaries

**Phase 5A-PR10** · `packages/intelligence/next-best-evidence` (`@indago/next-best-evidence`)

Authoritative design/status note for the PR10 **runtime**: the deterministic,
persistence-free pipeline that turns a PR7/PR8/PR9-qualified graph hole plus its
bounded context into a **ranked selection of next-best evidence requests**.
It consumes the frozen PR10 contracts/policy exactly — it does not invent
semantics, calibration, or lifecycle behavior.

> **PR10 status:** contract/policy freeze ([`pr10-evidence-policy.md`](./pr10-evidence-policy.md))
> is the baseline; this runtime is the implementation of it. No LLM call, no
> persistence, no `EvidenceRequest` creation, no web/platform integration — all
> explicitly out of scope per §15 of the freeze. Referenced-id resolution is
> **closed-world** against the supplied context only.

---

## Implementation surface (summary)

- **Deterministic, pure core.** Candidate normalization → per-component utility
  (EIG, relevance, feasibility, cost) → frozen composition → dedup → ranking →
  bounded selection. Identical inputs ⇒ byte-identical output; input *order* of
  recommendations, hypotheses, and observations is irrelevant (see §5).
- **Consumes PR5/PR7/PR8/PR9, never re-implements them.** The PR9 gate is
  asserted verbatim (`qualified`, `valid`, `evaluation.passed`,
  `nextStatus === 'ACTIVE'`, non-empty context, UUID ids); candidates are
  generated from `analysis.recommendedEvidence` ONLY.
- **Closed-world reference resolution, fail-closed.** PR7 advisory target
  derivedIds (`atomic:RELATION_HYPOTHESIS:<uuid>` /
  `atomic:ENTITY_HYPOTHESIS:<uuid>`) resolve ONLY against the supplied atomic
  context. Any unresolvable reference drops the whole candidate, surfaced
  via `unresolvedReferenceDrops` — never silently.
- **Frozen formulas, runtime-installed component weights.** The score formula
  and its weights come from `EVIDENCE_UTILITY_POLICY_V1`; the *component*
  subweights of EIG and relevance, the type baselines for feasibility/cost, and
  the missing-signal neutral values are owned by this runtime in
  `src/policy.ts`, all `normalizeScore`d onto `[0,1]`.
- **Bounds surfaced, never silent.** `MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP`
  (25), `MAX_EVIDENCE_REQUESTS_PER_GAP` (5), `MAX_GAPS_PER_SELECTION_RUN` (10) —
  truncation is reported through `consideredCount`/`truncated`/`selectionRun`/
  `runTruncated`.
- **Schema-strict output.** The ranked candidate surface + selection result
  strictly satisfy the frozen `NextBestEvidenceCandidateSchema` /
  `NextBestEvidenceSelectionResultSchema` (extra keys stripped, `rank` desugared
  from provenance).

---

## 1. Pipeline

```
gapInput (candidate, analysis, validation, decision, hypothesisContext, observations)
   │
   ▼
assertSelectionGate ................. PR9 gate, typed NextBestEvidenceError
   ▼
extractCompetingExplanations ........ decision.supportingHypothesisIds (atomic derivedIds)
   ▼  buildAtomicLookup / buildUuidToAtomicMap, observation-id set (closed world)
   ▼
resolveDiscriminationTarget ......... per recommendation: derivedId→UUID, then
   │                               validate ⊆ competing set; else FAIL-CLOSED drop
   ▼
buildCandidateDraft ................. evidenceType, rationale, RESOLVED target UUIDs,
   │                               grounded observations, per-target temporal fit
   ▼
computeEvidenceUtility .............. EIG / relevance / feasibility / cost → score
   ▼
isCoveredByExistingEvidence ......... §7 exclusion: exact type AND full target coverage
   ▼
deduplicateAndRank .................. canonical identity, deterministic per-group
   │                               winner, frozen rank order
   ▼
cap at MAX_EVIDENCE_REQUESTS_PER_GAP (truncated surfaced), accounting
   ▼
selectNextBestEvidence .............. bounds run to 10 gaps, assembles frozen result
```

---

## 2. Module map

`packages/intelligence/next-best-evidence/src/`:

| Module | Responsibility |
| --- | --- |
| `types.ts` | Runtime gap input (`NextBestEvidenceGapInput`, `Pr10AtomicHypothesis`, `Pr10Observation`) + `GapSelectionAccounting` |
| `errors.ts` | `NextBestEvidenceError` + `NEXT_BEST_EVIDENCE_ERROR_CODE` (`GATE_NOT_SATISFIED`, `INVALID_INPUT`, `NAN_OR_INFINITE_COMPONENT`, `OUT_OF_RANGE_COMPONENT`, `DIVERGENT_EIG_ALIAS`, …) |
| `policy.ts` | Runtime-owned constants: EIG/relevance subweights, type baselines, missing-signal neutrals |
| `determinism.ts` | `clamp01`, `round6`, `normalizeScore`, `mean` — numeric formatting discipline |
| `references.ts` | `ATOMIC_DERIVED_ID_PREFIX` regex, `resolveDerivedIdsToUuids`, `canonicalHypothesisIdFromDerivedId`, `buildUuidToAtomicMap`, `buildAtomicLookup` |
| `discrimination.ts` | `extractCompetingExplanations`, `resolveDiscriminationTarget` (closed-world, fail-closed) |
| `components.ts` | `computeExpectedInformationGain`, `computeEvidenceRelevance`, `computeEvidenceFeasibility`, `computeEvidenceCost`, `computeEvidenceUtility` (single sync formula, typed validation) |
| `coverage.ts` | `isCoveredByExistingEvidence` (§7, exact type + full target coverage) |
| `normalize.ts` | `buildCandidateDraft` (uses resolved target UUIDs, never raw derivedIds) |
| `dedup.ts` | `canonicalIdentityKey`, `compareRankedCandidates`, `deduplicateAndRank` (order-of-input independent) |
| `select.ts` | `selectForGap` — per-gap core, bounds (25/5), accounting |
| `gate.ts` | `assertSelectionGate` — consumes PR9, typed failures with `details.reason` |
| `orchestrate.ts` | `selectNextBestEvidence` — top-level entry, REQUIRED `computedAt` boundary, run bound (10), frozen selection result snapshot |
| `index.ts` | Public exports |

---

## 3. Utility components (runtime-owned)

All components are deterministic and `normalizeScore`d. Constants live in
`src/policy.ts`.

### 3.1 Expected information gain (EIG)

```
discriminationBreadth = count(resolvedTargets ∩ competing) / max(1, count(competing))
averageUncertainty    = mean over targets of balance(supporting, contradicting)
                        supporting/0 balancing with PR7's neutral epistemic prior (0.5)
unresolvedTargets     = count(targets with zero supporting signal) / max(1, count(targets))
EIG = 0.50*breadth + 0.30*uncertainty + 0.20*unresolved    — EIG = 0 when no target
```

A target with zero supplied signals in the bounded context contributes maximum
uncertainty and counts as unresolved (fail-closed, never invented signal).
**Fail-closed:** a targetless candidate keeps `EIG = 0` — discrimination is
never invented.

### 3.2 Relevance

```
gapExpectationLink  = any(target ∈ gapExpectationUuids) ? 1 : 0     (0.45)
discriminationBreadth as in EIG                                     (0.25)
observationGrounding = groundedObservations / totalCandidateObservationRefs,
                       grounded = ref present in supplied observations   (0.20)
temporalFit          = mean per-target of intervalsOverlap(candidateScope, atomicScope),
                       with neutral 0.5 when either scope is absent      (0.10)
```
`relevance = 0` when the candidate has **no validated target** (fail-closed —
a targetless proposal links to nothing specific).

### 3.3 Feasibility and cost

```
feasibility = 0.7*TYPE_BASELINE + 0.3*availability    availability missing → 0.5 neutral
cost        = 0.7*TYPE_BASELINE_COST + 0.3*(1 − accessibility)   accessibility missing → 0.5
```

| Evidence type | FEAS_BASELINE | COST_BASELINE |
| --- | --- | --- |
| DOCUMENT | 0.70 | 0.40 |
| RECORD | 0.65 | 0.45 |
| TESTIMONY | 0.50 | 0.65 |
| PHYSICAL | 0.40 | 0.70 |
| DIGITAL | 0.75 | 0.35 |
| FINANCIAL | 0.55 | 0.55 |
| COMMUNICATION | 0.65 | 0.45 |
| OTHER | 0.50 | 0.50 |

Baselines with neutral availability/accessibility mean `feasibility`/`cost`
degenerate to the frozen type baselines when no acquisition metadata exists
(acquisition is out of scope for this runtime pass).

### 3.4 Composition

Executed literally from `EVIDENCE_UTILITY_POLICY_V1`:
`effectiveCost = 1 − cost`; `score = clamp01(round6(0.40*eig + 0.25*relevance +
0.20*feasibility + 0.15*effectiveCost))`. `eig === expectedInformationGain`
always; the alias assertion is tested. A caller-supplied `eig` that diverges
from `expectedInformationGain` is rejected with `DIVERGENT_EIG_ALIAS` — one
field never silently overrides the other.

---

## 4. Dedup identity and rank order

- **Identity:** frozen `canonicalizeNextBestEvidenceRequest({gapId, evidenceType,
  discriminatesAmongIds, hypothesisIds})`; runtime sets `hypothesisIds` to the
  validated resolved `targetUuids` (documented decision). Target arrays are
  order-independent. A targetless candidate’s identity is the same-type/targetless
  key — still deduplicated and ranked.
- **Per-group winner:** chosen purely by the frozen rank order steps. When the
  frozen steps cannot separate two members of the *same* identity group (identical
  key + identical utility), the winner is the lexicographically smallest
  `rationale` — an input-order-independent, byte-stable total order. When the
  rationale is identical too (fully identical members), the winner is the member
  with the smaller `recommendationIndex` — another input-order-independent
  structural key, stripped before the frozen selection output. Dedup collapse is
  counted and surfaced (`deduplicatedCount`).
- **Rank order:** `SCORE_DESC → EXPECTED_INFORMATION_GAIN_DESC → RELEVANCE_DESC →
  FEASIBILITY_DESC → CANONICAL_REQUEST_KEY_ASC` (from `EVIDENCE_UTILITY_RANK_ORDER`).
- The pool is ranked BEFORE the per-gap cap so consuming N% never changes which
  candidates win the 5 slots.

---

## 5. Determinism

- **`computedAt` is a REQUIRED input** at the orchestration boundary
  (`selectNextBestEvidence(input, { computedAt })`). There is **no wall clock**,
  **no silent default**, **no environment/filesystem time**, **no randomness**.
  The value is validated deterministically against the ISO-8601-UTC shape AND
  the repository's frozen `ObservedTimeSchema` convention
  (`{ value: string, precision: 'exact' }`); a missing or malformed value fails
  closed at the boundary with `INVALID_INPUT` — `MISSING_COMPUTED_AT` or
  `INVALID_COMPUTED_AT` — and never reaches the selection result.
- **Byte-identical recomputation:** same input + same `computedAt` ⇒
  byte-identical complete output (Test B); **different `computedAt` changes ONLY
  the `computedAt` field** — candidate order, utility, rankings, accounting and
  provenance are timestamp-independent (Test C). A wall-clock trap confirms the
  deterministic selection path performs zero clock reads (Test D).
- **Invariant to input order** of: recommendations (dedup winner + rank), the
  hypothesis context, and the observations — asserted on the complete serialized
  result (not merely ranked candidate ids).
- **Provenance** records `{ gapId, rank, canonicalRequestKey }` — deliberately
  **without** `recommendationIndex`, because that ordinal is input-positional and
  would break order-invariance. `canonicalRequestKey` is the order-independent
  traceability anchor. No emitted metadata field is input-order-dependent.
- The full-tie break in `deduplicateAndRank` (when two members share the same
  identity, identical utility and identical rationale) resolves deterministically
  by the smaller `recommendationIndex` — an input-order-independent structural
  key that is stripped before the frozen selection output, so it cannot affect the
  emitted result.

---

## 6. Surfaces / error and accounting contract

**Orchestration errors** (`selectNextBestEvidence`):

| Code | Meaning |
| --- | --- |
| `GATE_NOT_SATISFIED` | PR5/PR8/PR9 gate failed for a gap (machine-readable `details.reason`) |
| `INVALID_INPUT` | `computedAt` missing (`MISSING_COMPUTED_AT`) or malformed (`INVALID_COMPUTED_AT`); always fails at the boundary, never a wall-clock default |

**Utility component errors** (`computeEvidenceUtility`):

| Code | Meaning | Details fields |
| --- | --- | --- |
| `NAN_OR_INFINITE_COMPONENT` | A utility component is NaN, +∞ or −∞ | `component`, `value`, `expected`, `category: 'NAN_OR_INFINITE'` |
| `OUT_OF_RANGE_COMPONENT` | A finite utility component is outside [0, 1] | `component`, `value`, `expected: '[0, 1]'`, `category: 'OUT_OF_RANGE'` |
| `DIVERGENT_EIG_ALIAS` | Caller-supplied `eig` differs from `expectedInformationGain` (frozen alias) | `expectedInformationGain`, `eig`, `expected: 'eig === expectedInformationGain'` |

Components are **never clamped** — invalid input always fails closed; the final
score is always recomputed from validated components via the frozen formula
(an externally supplied `score` is never trusted).

**Per-gap accounting** (`gapSummaries`): `recommendationsSeen`,
`unresolvedReferenceDrops`, `existingEvidenceExclusions`,
`deduplicatedCandidates`, `distinctCandidates`, `candidatesConsidered`,
`candidatesRanked`, `truncated`. **Run-level** metadata:
`selectionRun { gapsRequested, gapsProcessed, runTruncated }`. Truncation is
always surfaced, never silent.

---

## 7. Boundaries (explicitly NOT covered by this runtime)

1. **Generation** beyond `analysis.recommendedEvidence` (no LLM call here).
2. **Persistence / `EvidenceRequest` creation / lifecycle / authorization.**
3. **Acquisition metadata** for availability/accessibility (only neutral defaults
   exist today).
4. **Intelligence API / platform** and **web integration**.
5. **Resolution Rate@K evaluation harness** for the frozen weights.

---

## 8. Verification

- Package tests: `@indago/next-best-evidence` **103** (references, components
  incl. adversarial typed-validation matrix, coverage, dedup, gate, select Cases
  A–J, determinism, and the hardening suite: Tests A–D, metadata determinism,
  frozen rank-order audit, duplicate-ordering stability).
- Regressions re-run green: contracts **365**, graph-hole-analysis **45**,
  graph-hole-qualification **104**, graph-hole-validation **112**, graph-hole-judge
  **99**.
- `pnpm -r typecheck` and `pnpm -r build` pass across the workspace (incl. web).
- Import smoke: `import('@indago/next-best-evidence')` → 34 public exports.
- Known environmental failure (pre-existing, outside this work): platform
  integration suites cannot reach the Neon test database.