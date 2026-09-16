# Phase 5A-PR14 — Deterministic / Structured Gap Classification (Policy Freeze)

**Owner:** Mayur | **Branch:** `feat/m-a13-graph-hole-region` | **Status:** FROZEN / IMPLEMENTED / VERIFIED (see §End)

PR14 adds the missing intelligence layer that classifies **WHY a qualified GraphHole exists** into one of five frozen investigative-gap categories. It is a **downstream, derivative classification layer** over already-certified PR1–PR13 outputs. PR14 is NOT a redesign of PR0–PR13 and does NOT implement PR15 (competing explanations), PR16 (ER-split analysis), PR17 (evidence candidates), PR18 (evidence utility), PR19 (evidence independence), or PR20 (Resolution Rate@K).

> **Canonical contract:** `packages/contracts/src/intelligence/gap-classification.ts`
> **Runtime package:** `packages/intelligence/gap-classification` (`@indago/gap-classification`)
> **Tracker:** `docs/roadmap/phase-tracker.md` §5A "Classify gap"

---

## 1. Scope and Ownership Boundary

PR14 consumes only already-certified upstream outputs and never re-discovers them:

| Cardinal input | Certified producer |
|---|---|
| Qualified GraphHole (PR5 `QualifiedGraphHoleCandidate`) | PR4 detection + PR5 qualification (`graph-hole-qualification`) |
| Bounded region context (PR1 `GraphHoleRegion`) | PR1/PR2/PR13 (`graph-hole-region`) |
| Grouped hypothesis context (PR3 `HypothesisContext`) | PR3 (`hypothesis-context`) |
| In-scope canonical nodes/edges/observations | M-A12/M-A13 projection + stores |
| Qualification result / scores | PR5 (frozen V1.1 scoring) |

**PR14 MUST NOT:**
- create GraphHole candidates, modify GraphHole identity, or modify qualification;
- modify canonical entities/relations, create entity merges/splits;
- create, acquire, or authorize evidence acquisition;
- mutate GraphVersion, M-A08 CandidatePairs, or invoke M-A09 authority;
- bypass PR8 validation or override PR9 decision state;
- reach into any store/search/LLM/retrieval boundary. The classifier is a **pure function** over the supplied bounded package.

**PR14 IS:** an analytical classification. Its output is NOT a factual accusation, NOT criminality, NOT intent, NOT legal/admissibility conclusion.

## 2. Taxanomy (frozen V1)

Single-label, five categories (tracker taxonomy). `CONCEALMENT_CONSISTENT` (PR0-era abbreviation) is superseded by the tracker spelling.

```text
MISSING_INVESTIGATION
MISSING_DATA
MISSING_COMPARISON
INFRASTRUCTURE_GAP
CONCEALMENT_CONSISTENT_PATTERN
```

### 2.1 MISSING_INVESTIGATION
Graph structure/evidence indicates an investigative question needs further investigation, but the primary deficit is that **the investigation has not yet answered the relevant question**. E.g. a candidate relationship is structurally expected but no sufficient investigation evaluated it; available evidence identifies a question but not its resolution. It does NOT assert the relationship exists.

### 2.2 MISSING_DATA
The relevant question **cannot be resolved because necessary evidence/data is absent from the bounded context**. E.g. an expected event class has no observations, a key interval has no evidence, a required source category is absent. **Absence of evidence ≠ evidence of absence** unless existing domain semantics establish that conclusion. `MISSING_DATA` is distinguishable from "the classifier was not given enough context" (§10).

### 2.3 MISSING_COMPARISON
The current interpretation cannot be adequately evaluated because a **competing baseline / alternative / comparison context is absent** (no meaningful comparison population, no alternative candidate explanation yet compared). PR14 may *identify* the classification; **PR15 owns the generation of competing explanations.**

### 2.4 INFRASTRUCTURE_GAP
The unresolved hole is **primarily caused by a missing/incomplete technical/system representation** (source not ingested, relationship type not represented, pipeline absent, projection cannot represent required structure, known source category unavailable, region/context representation-limited). Informational/system limitation — **never a generic fallback for uncertainty**.

### 2.5 CONCEALMENT_CONSISTENT_PATTERN
The available structural/evidence pattern is **compatible with a concealment-oriented explanation**, while evidence is insufficient to establish concealment as fact. Requires a **higher epistemic bar than generic uncertainty**, with explicit predicate requirements (§7) and a strict epistemic status ceiling (§9). It must never imply intent, criminality, guilt, motive, or deliberate concealment.

> **CONSISTENT WITH ≠ PROVES ≠ CONFIRMS.** The category name deliberately ends in `_PATTERN`.

## 3. Single-Label Decision (audited, kept)

The canonical contract (`GapClassificationResultSchema`) exposes **one `type`**. Prudential audit (PR14-1) found no multi-label support and no second `InvestigativeGap` lifecycle to extend. Per §6 of the PR14 brief: since the current contract supports one classification, PR14 implements a **deterministic primary-classification policy** and documents it (§6). **No `primaryClassification`/`secondaryClassifications[]` split is introduced** — that would be a silent domain-contract change; if multi-label is ever needed it is a forward-compatible separate PR bumping `classificationPolicyVersion`.

## 4. Input Contract

`GapClassificationInput` (type-only, lives in `@indago/gap-classification` because it references `GraphHoleRegion`/`HypothesisContext` runtime types — mirrors `GraphHoleAnalysisInput` in PR7):

```ts
interface GapClassificationInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly qualifiedCandidate: QualifiedGraphHoleCandidate; // MUST be qualified === true
  readonly region: GraphHoleRegion;                         // producing bounded region
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly observations: readonly Observation[];
  readonly hypothesisContext: HypothesisContext;           // PR3 grouped context
  readonly classificationPolicyVersion: 'v1';
  readonly computedAt: ObservedTime;                        // caller supplies; no clock inside
}
```

The classifier never reaches beyond this data.

## 5. Normalized Signal Layer (GapClassificationSignals)

The classifier does **not** read heuristics against nested GraphHole objects directly. `buildClassificationSignals(input)` (deterministic, bounded) emits a flat, contract-frozen `GapClassificationSignals` containing ONLY facts supportable from the supplied input:

| Signal | Meaning / derivation |
|---|---|
| `candidateId`, `caseId`, `graphVersionId`, `regionId` | identity |
| `regionStatus`, `regionTruncated`, `regionLimited` | region representation status |
| `holeType`, `expectedRelationshipType`, `structuralBasis` | candidate structural facts (raw) |
| `nodeIds` | structural anchor nodes |
| `temporalScopeDeclared`, `temporalContextDeclared` | interval presence (never `updatedAt`) |
| `structuredScore`, `evidenceSupportScore`, `expectedInformationValue`, `significance` | frozen PR5 scores (copied, not recomputed) |
| `independentSupportUnitCount` | PR5 support units (copied) |
| `supportingObservationCount`, `contradictingObservationCount` | candidate raw refs |
| `supportingHypothesisCount` | candidate raw grounded-hypothesis refs |
| `inScopeObservationCount`, `inScopeAtomicHypothesisCount`, `inScopeGroupCount` | bounded selections |
| `contradictionPresence`, `contradictionCount` | candidate refs + in-scope atomic contradictions (preserved, never resolved) |
| `comparisonBaselinePresent`, `alternativeCoverage` | in-scope competing atomic hypotheses on the candidate actor set |
| `endpointObservationPresence` | every candidate node has ≥1 in-scope observation |
| `inScopeObservationTypes` | sorted unique observation `type` values (never content inference) |
| `contextCompleteness.{semanticRetrievalTruncated,regionLimited,observationContextLimited,hypothesisContextLimited,hypothesisGroupingTruncated,temporalContextLimited,contextBudgetLimited}` | PR7-style observed-fact completeness flags |

No fabricated fields. No content-semantic reading. No hidden retrieval.

## 6. Deterministic V1 Decision Policy (frozen)

`classifyGap` proceeds: **validate → derive signals → compute context digest → evaluate predicates → resolve {type,status,reasonCodes}**.

**Validations (typed failures, thrown as `GapClassificationError`):**
| Failure | Code | Trigger |
|---|---|---|
| `INVALID_INPUT` | `GapClassificationErrorCode.INVALID_INPUT` | structurally malformed input / missing required fields |
| `UNSUPPORTED_POLICY` | `GapClassificationErrorCode.UNSUPPORTED_POLICY` | `classificationPolicyVersion !== 'v1'` |
| `QUALIFIED_CANDIDATE_REQUIRED` | `GapClassificationErrorCode.QUALIFIED_CANDIDATE_REQUIRED` | `qualified === false` (PR14 is downstream of qualification only) |
| `CONTEXT_MISMATCH` | `GapClassificationErrorCode.CONTEXT_MISMATCH` | caseId/graphVersionId/regionId disagreement, or candidate reference not present in supplied input |

**Context digest (`contextSha256`):** SHA-256 over `canonicalizeDeterministic({signals, classificationPolicyVersion})`. Same logical input in any ordering → same digest. Deterministic identity binding (content-addressed, no random UUID).

**Context eligibility (INSUFFICIENT_CONTEXT guard):** if `inScopeObservationCount === 0 && inScopeAtomicHypothesisCount === 0 && supportingObservationCount === 0 && contradictionPresence === false` the classifier **lacks enough context**; it returns `status: INSUFFICIENT_CONTEXT` with **no `type`** — it does **NOT** force `MISSING_DATA` (§11). This distinguishes "the case genuinely lacks data" from "the classifier was not given enough context".

**Category predicates (computed over signals only):**

| # | Category | Predicate (ALL must hold) |
|---|---|---|
| P1 | `CONCEALMENT_CONSISTENT_PATTERN` | `contrPres=false`; `systemCause=false`; `clearlySignificant` (`significance ≥ MIN_SIGNIFICANCE OR structuralScore ≥ MIN_STRUCTURAL_SCORE`); `endpointObservationPresence=true`; `supportingObservationCount=0`; `comparisonBaselinePresent=false` |
| P2 | `INFRASTRUCTURE_GAP` | `systemCause=true` where `systemCause = regionTruncated ∨ region status LIMITED/DEGRADED ∨ semanticRetrievalTruncated ∨ observationContextLimited ∨ hypothesisGroupingTruncated` |
| P3 | `MISSING_DATA` | `contrPres=false`; `systemCause=false`; `questionIdentified` (`expectedRelationshipType≠null ∨ supportingHypothesisCount>0`); `supportingObservationCount=0`; NOT P1 |
| P4 | `MISSING_COMPARISON` | `contrPres=false`; `systemCause=false`; `questionIdentified`; `supportingObservationCount≥1`; `comparisonBaselinePresent=false` |
| P5 | `MISSING_INVESTIGATION` | `contrPres=false`; `systemCause=false`; NOT P1/P3/P4 (incl. the question-not-yet-framed case `expectedRelationshipType=null ∧ supportingHypothesisCount=0`) |

P1–P5 are **mutually exclusive by construction** (P3 excludes P1, P5 excludes P3/P4, P2/P1/P3/P4 each require their own antecedent), so a given input fires **at most one**. There is no random selection, no N², no recursion.

**Epistemic status resolution:**
| Condition | status |
|---|---|
| not context-eligible (guard above) | `INSUFFICIENT_CONTEXT` (no `type`) |
| `contradictionPresence=true` | `AMBIGUOUS` — the winning non-forbidden category (P1/P3 are forbidden under contradiction; P2/P4/P5 may win), `CONTRADICTION_PRESERVED` reason emitted. Contradictions are never collapsed into `MISSING_DATA` or `CONCEALMENT_CONSISTENT_PATTERN` (§13). |
| winning category = `CONCEALMENT_CONSISTENT_PATTERN` | `SUPPORTED` always (epistemic ceiling — pattern-compatible, never `CONFIDENT`) |
| otherwise | `CONFIDENT` |

**Reason codes** (closed enum, deterministic):
- Question/framing: `QUESTION_IDENTIFIED`, `INVESTIGATION_NOT_CONCLUDED`
- Data: `REQUIRED_INFORMATION_ABSENT`
- Comparison: `COMPARISON_BASELINE_ABSENT`
- Infrastructure: `REGION_REPRESENTATION_LIMITED`, `SOURCE_CATEGORY_UNAVAILABLE`
- Concealment-pattern: `STRUCTURAL_EXPECTATION_STRONG`, `ENDPOINT_EVIDENCE_PRESENT`, `ABSENT_DIRECT_LINK_EVIDENCE`, `CONCEALMENT_PATTERN_COMPATIBLE`
- Epistemic: `INSUFFICIENT_CONTEXT`, `CONTRADICTION_PRESERVED`

**Priority (deterministic heuristic, documented — not a probability):**
`significance ≥ 0.85 → CRITICAL; ≥ MIN_SIGNIFICANCE (0.70) → HIGH; ≥ 0.5 → MEDIUM; else LOW`.

**`impact`** = candidate `significance` (reused frozen PR5 value — "how much this gap affects investigation confidence"). **`expectedInformationValue`** = candidate PR5 `expectedInformationValue`. These are copies of certified upstream scores, never re-derived.

**`suggestedActions`** — canned, category-bound strings (documented in the policy module). `MISSING_DATA` → "request evidence covering the expected relationship window"; `MISSING_COMPARISON` → "generate competing explanations (PR15 owner)"; `MISSING_INVESTIGATION` → "evaluate the grounded investigative question"; `INFRASTRUCTURE_GAP` → "represent the missing source/relationship type"; `CONCEALMENT_CONSISTENT_PATTERN` → "treat as pattern-compatible only; do not assert concealment". Never an authorization.

## 7. Determinism Requirements

Same GraphHole + same bounded context + same policy version ⇒ byte-identical result. Input ordering of observations/hypotheses/contradictions/references/nodes/edges must not matter (all collections are deduped and sorted before signal derivation). No clock/random IDs inside the classifier (`computedAt` is a caller-supplied input). Context digest derives from canonicalized input.

## 8. Temporal Semantics

Respects M-A12 temporal authority. Only domain-event time (`observation.eventTime`), validity intervals (`observation.validityInterval`, candidate `temporalScope`, region `temporalContext`) are used — never `updatedAt`/`createdAt` as domain evidence. `TEMPORAL_GAP`/`TEMPORAL_DISCONTINUITY` holes and declared scales feed `temporalScopeDeclared`/`temporalContextDeclared` only for eligibility/completeness; a late-arriving observation never becomes "event never occurred" evidence and never triggers `CONCEALMENT_CONSISTENT_PATTERN`.

## 9. Provenance Model

Every result carries `supportingReferences`:
- `supportingObservationIds` — the observed-fact ids the predicates leaned on (candidate raw supporting observations ∪ endpoint-touch observations used),
- `supportingHypothesisIds` — candidate raw grounded-hypothesis ids,
- `structuralSignalIds` — candidate anchor node ids.

All ids are guaranteed to exist in the supplied context (validated at `CONTEXT_MISMATCH` time; PR8-style closed-world discipline). No ids are invented.

## 10. Bounds

The classifier only consumes the already-bounded PR1/PR3/PR13 context (region caps, hypothesis caps, observation budget). It performs NO case-wide scans, NO unbounded recursion, NO N² comparisons, NO unbounded evidence loading, NO semantic retrieval. All internal work is linear in the size of the supplied bounded collections.

## 11. Persistence / API Boundary

**Persistence:** NONE. The classification is a **derived** output. The `InvestigativeGap` lifecycle (`GapStatusSchema`) remains contract-only (unchanged — the PR10 audit finding D4/E4 carries forward). No new Prisma model, no migration, no `InvestigativeGap` row, no parallel `GraphHoleClassification` lifecycle. Writes of duplicate classifications are avoided precisely by NOT writing at all.

**API boundary:** `classifyGap(input)` is a **pure intelligence API** exported by `@indago/gap-classification`. No HTTP endpoint, no worker, no tool, no service method added. Backend existence is not claimed as complete frontend functionality.

## 12. Failure Semantics

Contracted typed failures (thrown `GapClassificationError`, code ∈ closed enum): `INVALID_INPUT`, `UNSUPPORTED_POLICY`, `QUALIFIED_CANDIDATE_REQUIRED`, `CONTEXT_MISMATCH`. A non-throwing epistemic state `INSUFFICIENT_CONTEXT` is the contract result for the "not enough context" case. The classifier never silently returns a plausible category for invalid input.

## 13. Determinism identity

Classification identity is derived from content: `contextSha256` = SHA-256(canonicalizeDeterministic(signals + policyVersion)). `graphHoleId` on the result = the candidate id (content-addressed SHA-256). Contained by the same `(caseId, graphVersionId)`.

## 14. Versioning

- `GAP_CLASSIFICATION_POLICY_VERSION = 'v1'` — feature-owned classification semantics (this document). A predicate/threshold/reason-code change bumps it and re-identifies outputs.
- Consumed but not re-declared: `GRAPH_HOLE_POLICY_VERSION`, `GRAPH_HOLE_SCORING_POLICY_VERSION` (qualified candidates carry their own).
- The category enum is `GapClassificationTypeSchema` (PR0-frozen, now with the tracker spelling `CONCEALMENT_CONSISTENT_PATTERN`).

## 15. Epistemic Safety (frozen invariants)

- Structural gap ≠ criminal relationship.
- Absence ≠ concealment.
- High structural relevance ≠ culpability.
- Candidate relationship ≠ canonical relationship.
- Concealment-consistent pattern ≠ concealment confirmed (status ceiling `SUPPORTED`; reason code never suggests confirmation; no intent/criminality/fact fields exist in the contract).
- The classifier output is an analytical label — no legal/admissibility conclusion.

## 16. Future Extension (PR15+ seams)

- `MISSING_COMPARISON` identifications are explicit inputs for **PR15** (competing-explanation generation) — PR14 never generates explanations itself.
- `status`/`reasonCodes`/`supportingReferences`/`contextSha256` are the consumption surface for **PR17** evidence candidates.
- No placeholder/fake functionality is introduced to reserve these seams.

---

## End — Final Verification Matrix (PR14)

| Test / Area | Expected | Observed | Status |
|---|---|---|---|
| Contract correctness (schema parse/reject) | see contracts tests | see §Verification | ✅ |
| Category semantics (5 positives, 5 negatives) | deterministic | ✅ | ✅ |
| Determinism (order permutations → byte-stable) | ✅ | ✅ | ✅ |
| Ambiguity (mutual-exclusion policy, contradiction) | deterministic | ✅ | ✅ |
| Insufficient context (not → MISSING_DATA) | ✅ | ✅ | ✅ |
| Temporal handling (eventTime/validity; never updatedAt) | ✅ | ✅ | ✅ |
| Contradiction handling (preserved; not resolved) | ✅ | ✅ | ✅ |
| Provenance (every ref exists in supplied context) | ✅ | ✅ | ✅ |
| Case isolation | ✅ | ✅ | ✅ |
| GraphVersion isolation | ✅ | ✅ | ✅ |
| Identity/context binding (contextSha256 + graphHoleId) | ✅ | ✅ | ✅ |
| Bounds (linear, bounded inputs) | ✅ | ✅ | ✅ |
| Authority boundaries (no mutation capability) | ✅ | ✅ | ✅ |
| Persistence (none added; derived only) | ✅ N/A | ✅ | ✅ |
| Real-Postgres integration | ✅ | ✅ | ✅ |
| Regressions (PR6–PR13 re-run) | green | ✅ | ✅ |
| `pnpm -r typecheck` | green | ✅ | ✅ |
| Build (`pnpm -r build`) | green | ✅ | ✅ |

(Exact counts reported in the delivery summary / tracker entry.)