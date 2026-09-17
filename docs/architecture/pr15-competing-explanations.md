# Phase 5A-PR15 — Competing Explanations (Policy Freeze)

**Owner:** Mayur | **Branch:** `feat/m-a13-graph-hole-region` | **Status:** FROZEN (see §End)

PR15 adds the structured, provenance-aware, bounded layer that generates **competing alternative explanations** for a qualified GraphHole given its PR14 gap-classification. It is a **downstream, derivative analytical layer** over already-certified PR0–PR14 outputs, and is **explicitly NOT** PR16 (ER-split / relationship-split detail), PR17 (evidence candidate generation), PR18 (evidence utility), PR19 (evidence independence), or PR20 (Resolution Rate@K).

> **Canonical contract:** `packages/contracts/src/intelligence/competing-explanations.ts`
> **Runtime package:** `packages/intelligence/competing-explanations` (`@indago/competing-explanations`)
> **Tracker:** `docs/roadmap/phase-tracker.md` §5A "Generate competing explanations"

---

## 0. Position in the Phase 5 pipeline

```
PR1  bounded region ──┐
PR3  hypothesis ctx ──┤--> PR4 detection --> PR5 qualification --> PR14 classification --> PR15 explanations
PR13 projection ──────┘                        (QualifiedGraphHoleCandidate)  (GapClassificationResult)
```

PR15 consumes:
- the **same closed-world package PR14 consumed** (case, version, qualified candidate, region, in-scope nodes/edges/observations, PR3 hypothesis context), and
- the **real PR14 result** for that candidate (`GapClassificationResult`).

Context integrity is enforced **by re-running the deterministic classifier** (`classifyGap(context)`) inside PR15 and requiring the recomputed classification to equal the supplied one (§7 `CONTEXT_MISMATCH`). PR15 never reaches a store, never retrieves beyond the supplied package, and (V1) never invokes an LLM — it is a **pure deterministic generator** (§17).

## 1. Scope and Ownership Boundary

| Cardinal input | Certified producer |
|---|---|
| `GapClassificationInput`-shaped closed-world package | PR1/PR3/PR5/PR13/PR14 input contract |
| `GapClassificationResult` (the real PR14 output) | PR14 (`@indago/gap-classification`) |
| Qualified GraphHole candidate | PR5 |
| Bounded region context | PR1/PR2/PR13 |
| Grouped hypothesis context | PR3 |
| In-scope canonical nodes/edges/observations | M-A12/M-A13 projection + stores |

**PR15 MUST NOT:**
- create/modify GraphHole candidates, GraphHole identity, qualification, or classification;
- create, merge, split, or otherwise mutate canonical entities/relations;
- create, acquire, or authorize evidence acquisition;
- create a second Hypothesis / Lead lifecycle — PR15 explanations are **derived analytical objects, not canonical hypotheses or facts**, and carry no accept/reject/merge authority;
- mutate GraphVersion, CandidatePairs, or invoke M-A09 authority;
- reach into any store/search/LLM/retrieval boundary;
- persist anywhere by default (persistence is a caller concern, §27).

**PR15 IS:** an analytical aid. Its output is NOT a factual accusation, NOT criminality, NOT intent, NOT a legal/admissibility conclusion.

## 2. Definition of a Competing Explanation (frozen)

A **competing explanation** is a structured, content-addressed, rank-ordered statement of **one distinct, plausible way the qualified GraphHole could exist**, grounded in the supplied closed-world evidence and evaluated against the supplied PR14 classification.

Three rigid properties:

1. **GROUNDED — no manufacturing.** Every emitted explanation is backed by a grounded signal derivable from the supplied package (a candidate reference, an in-scope observation/hypothesis, a region limitation flag, an edge/relationship-type fact, a temporal fact). A family is emitted **iff** its grounded signal is present; the generator never invents a reason to emit a family.
2. **PROVENANCE — every referenced id exists in the supplied context.** `supportingObservationIds`, `contradictingObservationIds`, `supportingHypothesisIds`, `contradictingHypothesisIds`, and `structuralSignalIds` are validated against the supplied package at generation time (`CONTEXT_MISMATCH` / `INVALID_REFERENCE`). No invented ids, no cross-case, no cross-version ids.
3. **DETERMINISTIC — same package → same set, byte-for-byte.** Input ordering never matters; identity is content-addressed from the canonicalized identity tuple (§8); the emitted set is deduped, ranked, and bounded (§14/§15).

> **Epistemic rule (mirrors PR14):** "pattern-compatible" and "structurally plausible" language is never an assertion of fact. `CONCEALMENT_CONSISTENT_EXPLANATION` (§10.9) is worded *pattern-compatible*, never proof of concealment.

## 3. Audit finding: no existing canonical CompetingExplanation

PR15-1 audit (greps across `packages/`) confirms there is **no canonical `CompetingExplanation` contract** and no existing `generateCompetingExplanations` runtime. Existing surfaces, and why they are NOT reused:

| Surface | Location | Why not reused for PR15 |
|---|---|---|
| `AlternativeExplanation` (domain) | `packages/contracts/src/domain/alternative-explanation.ts` | Deterministic **lead-attached** templates (P4 `lead-generation`); describes why a source-pair link might be non-bridging, not a GraphHole explanatory layer |
| `GraphHoleAnalysisV1.alternativeExplanations` | `packages/intelligence/graph-hole-analysis` (+ `graph-hole-validation`) | PR7 **LLM analyst** output; validated, not canonical downstream, not deterministic |
| `CompetingExplanations` extraction | `packages/intelligence/next-best-evidence/src/discrimination.ts` | Transient PR7-extraction interface for NBE discrimination; no canonical contract, no generator |
| `GapClassificationResult` | `packages/contracts/src/intelligence/gap-classification.ts` | PR14 **classification** (WHY). Complementary, not the explanatory layer. PR14 delegates: `SUGGESTED_ACTIONS['MISSING_COMPARISON'] = 'generate competing explanations (PR15 owner)'` |
| Prisma `Lead.alternativeExplanations` JSON | `packages/platform/prisma/schema.prisma` | P4 lead storage; unrelated to GraphHole explanations |

**Conclusion:** PR15 introduces a **new canonical contract** (`CompetingExplanationSetSchema` / `CompetingExplanationSchema`) in `@indago/contracts` and a **new runtime** `@indago/competing-explanations`. It reuses PR14 vocab where semantically identical — basis codes reuse PR14 reason-code enumerations by reference, never re-declared with drift.

## 4. Taxonomy (frozen V1)

Nine explanation families. A **primary family** explains the same deficit the PR14 classification selected (always emitted first, §9); the remaining families are **structural/evidence alternatives** emitted only when their grounded signal is present:

```text
MISSING_INVESTIGATION_EXPLANATION      primary for MISSING_INVESTIGATION
MISSING_DATA_EXPLANATION               primary for MISSING_DATA
MISSING_COMPARISON_EXPLANATION         primary for MISSING_COMPARISON
INFRASTRUCTURE_EXPLANATION             primary for INFRASTRUCTURE_GAP
CONCEALMENT_CONSISTENT_EXPLANATION     primary for CONCEALMENT_CONSISTENT_PATTERN
ENTITY_FRAGMENTATION_EXPLANATION       alternative (identity-unresolved signal)
RELATION_REPRESENTATION_EXPLANATION    alternative (relationship-type-unrepresented signal)
TEMPORAL_EXPLANATION                   alternative (temporal-scope-mismatch signal)
INNOCENT_ALTERNATIVE_EXPLANATION       alternative (genuine competing-baseline signal)
```

### 4.1 Family notes (frozen)
- **`ENTITY_FRAGMENTATION_EXPLANATION` is deliberately coarse in V1.** It asserts only *"identity resolution is unproven; the candidate's entities may not be unique within the bounded context"* — the *specific* ER-split break-out is **PR16's owner**. PR15 never enumerates specific split configurations.
- **`CONCEALMENT_CONSISTENT_EXPLANATION`** is worded pattern-compatibly (§10.9); it must never imply intent, guilt, motive, or deliberate concealment.
- Families are **never manufactured** (§2): each family is emitted iff its grounded signal is present.

## 5. Input Contract

`CompetingExplanationInput` (type-only, lives in `@indago/competing-explanations` because it references PR14 runtime types — mirrors `GapClassificationInput`):

```ts
interface CompetingExplanationInput {
  readonly context: GapClassificationInput;            // PR14 closed-world package (same shape)
  readonly gapClassification: GapClassificationResult; // the REAL PR14 result for context.qualifiedCandidate
  readonly competingExplanationPolicyVersion: 'v1';
  readonly computedAt: ObservedTime;                   // caller supplies; no clock inside
}
```

Boundary constraints (§7):
- `context.qualifiedCandidate` MUST be `qualified === true` (mirrors PR14).
- `context.classificationPolicyVersion` MUST be `'v1'`.
- `gapClassification.graphHoleId` MUST equal the recomputed classification's `graphHoleId`.
- `gapClassification` MUST match the deterministic recomputation of `classifyGap(context)` on `contextSha256`, `type`, `status`, and `reasonCodes`.

## 6. Normalized Explanation Signal Layer

The generator reuses **PR14's `buildClassificationSignals`** as the authoritative signal source (derivations are identical, never re-invented) plus a small set of per-explanation derivations from the bounded `edges` and the PR3 atomic set:

| Signal | Derivation (all observed-fact, from supplied package) |
|---|---|
| `classification` | Recomputed PR14 result (authority check §7) |
| `regionTruncated` / `regionLimited` | Region flags + `REGION_TRUNCATING_LIMITATIONS` (mirror PR14) |
| `observationContextLimited` | Region `CONTEXT_OBSERVATION_BOUND_REACHED` |
| `candidateSupportingObservationIds` | Candidate raw refs (validated in context) |
| `candidateContradictingObservationIds` | Candidate raw refs (validated in context) |
| `candidateSupportingHypothesisIds` | Candidate raw grounded-hypothesis refs (validated in context) |
| `candidateNodeIds` | Candidate anchor nodes (validated in context) |
| `endpointObservationIds` | In-scope observations touching candidate entity ids (sorted unique) |
| `expectedRelationshipType` | Candidate raw expected relationship (nullable) |
| `expectedRelationTypeRepresented` | In-scope `edges` contain that relation type, or a PR3 relation-atomic predicate equals it |
| `temporalMismatch` | All dated endpoint observations fall outside the candidate/region temporal window (deterministic overlap, §13) |
| `entityHypothesisPresent` | PR3 `ENTITY_HYPOTHESIS` atomics referencing candidate entity ids, or candidate refs of that type |
| `comparisonBaselinePresent` | PR14 flag: competing atomics on the candidate actor set |
| `contradictionPresence` | PR14 flag: candidate refs + in-scope atomic contradictions (preserved, never resolved) |
| `endpointObservationPresence` | PR14 flag: every candidate node has ≥1 in-scope observation |
| `inScopeObservationTypes` | PR14 sorted-unique observation types |

No fabricated fields, no content-semantic reading, no hidden retrieval.

## 7. Boundary validations (typed failures, thrown as `CompetingExplanationError`)

| Failure | Code | Trigger |
|---|---|---|
| `INVALID_INPUT` | `CompetingExplanationErrorCode.INVALID_INPUT` | structurally malformed input / missing required fields; runtime output rejected by the frozen contract schema |
| `UNSUPPORTED_POLICY` | `CompetingExplanationErrorCode.UNSUPPORTED_POLICY` | `competingExplanationPolicyVersion !== 'v1'` |
| `CONTEXT_MISMATCH` | `CompetingExplanationErrorCode.CONTEXT_MISMATCH` | recomputed classification disagrees with supplied `gapClassification` (digest/type/status/reasonCodes); a candidate-referenced id absent from the supplied context; candidate not qualified |
| `INVALID_REFERENCE` | `CompetingExplanationErrorCode.INVALID_REFERENCE` | an emitted explanation would reference an id not in the supplied context (defensive; generation never constructs such refs) |

Runtime output is validated against the frozen contract schema after generation; drift is surfaced as `INVALID_INPUT` (mirror PR14), never silently passed.

## 8. Identity (content-addressed, order/execution independent)

`explanationId = sha256Hex(canonicalizeDeterministic(identityTuple))` where:

```ts
{
  caseId, graphVersionId, graphHoleId,
  classificationType,          // the PR14 type this explanation competes under (nullable — §19)
  explanationType,             // one of the nine families
  basis,                       // basis code (§12)
  expectedRelationshipType,    // nullable
  supportingObservationIds, supportingHypothesisIds,   // sorted unique (input-order free)
  contradictingObservationIds, contradictingHypothesisIds,
  structuralSignalIds,
  policyVersion: 'v1',
}
```

- Tuples whose **type + core claim + support/contradiction set** are identical collapse to **one** explanation (§15 dedupe). Different `statement` templates never occur for equal tuples.
- `canonicalizeDeterministic` is the exported PR0 utility (sorted object keys, sorted string arrays) → input-order independence.
- `rankingKey` (§14) is also a canonicalized string; sorting it lexicographically **ascending** yields the final rank order.

## 9. Deterministic Generation Policy (frozen V1)

`generateCompetingExplanations(input)`:

1. **validate** boundary (§7);
2. **classify**: `recomputed = classifyGap(context)`; enforce equality vs supplied `gapClassification` (CONTEXT_MISMATCH otherwise);
3. **build signals** (§6);
4. **generate candidates** — primary family from the classification type (§10), plus each alternative family whose grounded signal is true (§10.5–10.8);
5. **identity + dedupe** (§8, §15);
6. **rank** (§14) and **bound** to `MAX_COMPETING_EXPLANATIONS = 5` (set `truncated = true` when distinct candidates exceeded the bound);
7. **validate the emitted set** against the frozen contract schema (drift → `INVALID_INPUT`).

`INSUFFICIENT_CONTEXT` classification (`gapClassification.type === undefined`) yields a **valid, non-throwing, empty set** (`explanations: []`, `truncated: false`) — an epistemic result, not an error (mirrors PR14). Every explanation in a non-empty set carries the classification `type` it competes under.

## 10. Family Emission Rules (frozen V1)

Primary families reuse the same support-reference derivations PR14 uses for each category (endpoint observations for concealment, candidate supporting observations+hypotheses for comparison, candidate hypotheses otherwise). Alternatives reuse contradiction/structural signals derived in §6.

### 10.1 MISSING_INVESTIGATION_EXPLANATION (primary for MISSING_INVESTIGATION)
**Basis:** `QUESTION_IDENTIFIED_NOT_EVALUATED` (when a question/expected relationship was framed) or `INVESTIGATION_NOT_CONCLUDED` (otherwise).
**Statement (frozen):**
- Q: `The expected {REL} relationship was identified as a question but has not been conclusively evaluated by investigation so far; the hole persists because the question is open, not because evidence of absence exists.`
- NC: `The hole reflects an investigative question that has not yet been concluded; the absence of a resolved evaluation is the explanation, and the absence does not assert the relationship does not exist.`

### 10.2 MISSING_DATA_EXPLANATION (primary for MISSING_DATA)
**Basis:** `REQUIRED_INFORMATION_ABSENT`.
**Statement (frozen):** `The expected {REL} relationship cannot yet be resolved because the necessary evidence is absent from the bounded context; absence of evidence is not evidence of absence.`

### 10.3 MISSING_COMPARISON_EXPLANATION (primary for MISSING_COMPARISON)
**Basis:** `COMPARISON_BASELINE_ABSENT`.
**Statement (frozen):** `The supported indication of {REL} cannot be adequately evaluated because a competing or alternative interpretation is not yet established; no meaningful comparison baseline exists in the bounded context.`

### 10.4 INFRASTRUCTURE_EXPLANATION (primary for INFRASTRUCTURE_GAP)
**Basis:** `REGION_REPRESENTATION_LIMITED` when region truncation/limits apply, else `SOURCE_CATEGORY_UNAVAILABLE`.
**Statement (frozen):** `The hole is consistent with a technical or representation limitation — the relevant source or relationship structure is not fully represented in the bounded context — rather than with the relationship being absent in reality.`

### 10.5 RELATION_REPRESENTATION_EXPLANATION (alternative)
**Grounded signal:** candidate `expectedRelationshipType` is non-null AND that type is not represented by any in-scope edge or PR3 relation atomic.
**Basis:** `RELATIONSHIP_TYPE_UNREPRESENTED`.
**Statement (frozen):** `The relationship type {REL} is not represented by any in-scope edge or relationship hypothesis; the hole may reflect that this relationship structure cannot be represented or detected within the bounded context.`

### 10.6 TEMPORAL_EXPLANATION (alternative)
**Grounded signal:** dated endpoint observations all fall outside the candidate/region temporal window (§13 — no content-semantic inference).
**Basis:** `TEMPORAL_SCOPE_MISMATCH`.
**Statement (frozen):** `Relevant observations fall outside the declared temporal window; the hole may be a boundary/observation-window artefact rather than the absence of the underlying relationship.`

### 10.7 ENTITY_FRAGMENTATION_EXPLANATION (alternative — coarse, PR16 owns detail)
**Grounded signal:** an in-scope `ENTITY_HYPOTHESIS` atomic references a candidate entity id, or a candidate supporting hypothesis is itself an entity hypothesis (identity unresolved).
**Basis:** `ENTITY_IDENTITY_UNRESOLVED`.
**Statement (frozen):** `Identity resolution of the candidate's entities is not fully proven within the bounded context; the same real-world actor could be represented by multiple entities, so the missing link may be an identity artefact rather than absence. Specific entity-split configurations are outside V1 (PR16).`

### 10.8 INNOCENT_ALTERNATIVE_EXPLANATION (alternative)
**Grounded signal:** a genuine competing baseline exists (PR14 `comparisonBaselinePresent` — in-scope competing atomic hypotheses on the candidate actor set).
**Basis:** `LEGITIMATE_STRUCTURAL_ALTERNATIVE`.
**Statement (frozen):** `A legitimate, structurally supported alternative interpretation is present in the bounded context; it competes with the selected classification and may fully explain the hole absent any negative intent.`

### 10.9 CONCEALMENT_CONSISTENT_EXPLANATION (primary for CONCEALMENT_CONSISTENT_PATTERN)
**Basis:** `PATTERN_COMPATIBLE_ABSENCE`.
**Statement (frozen):** `The available structural/evidence pattern is compatible with behaviour consistent with concealment as ONE possible explanation, and is NOT an assertion that concealment occurred; the absence pattern does not establish intent, criminality, or guilt on its own.` (Wording is deliberately pattern-compatible only.)

## 11. Signals: NONE in V1

V1 emits **no membership/`ELECTION`-style and no inference/`EXTRA`-style signals.** Only enumerated structural/representation signals (§6) drive emission. Bounded exceptions never appear in this policy's V1; they are future work.

## 12. Basis codes (frozen V1)

Closed enum, reusing PR14 semantics by reference:

```text
QUESTION_IDENTIFIED_NOT_EVALUATED      (§10.1)
INVESTIGATION_NOT_CONCLUDED            (§10.1)
REQUIRED_INFORMATION_ABSENT            (§10.2)
COMPARISON_BASELINE_ABSENT             (§10.3)
REGION_REPRESENTATION_LIMITED          (§10.4)
SOURCE_CATEGORY_UNAVAILABLE            (§10.4)
RELATIONSHIP_TYPE_UNREPRESENTED        (§10.5)
TEMPORAL_SCOPE_MISMATCH                (§10.6)
ENTITY_IDENTITY_UNRESOLVED             (§10.7)
LEGITIMATE_STRUCTURAL_ALTERNATIVE      (§10.8)
PATTERN_COMPATIBLE_ABSENCE             (§10.9)
```

## 13. Temporal overlap discipline

Reuses the PR14 pure interval-overlap check (M-A12 `TemporalInterval` semantics; same algorithm as the PR7 analyst): two intervals overlap iff `aStart <= bEnd && bStart <= aEnd`, where an interval with no `validTo` is open-ended (`+Inf`). `temporalMismatch` is true **only** when ≥1 dated endpoint observation exists and **all** dated endpoint observations fall outside the window. Observations without a `validityInterval` contribute nothing (no manufactured mismatch). No clock, no content-semantic inference.

## 14. Ranking (deterministic, frozen V1)

Rank order is produced by sorting a canonicalized `rankingKey` **ascending**. The fields below are normalized (DESC fields negated) so ascending lexicographic order equals rank priority:

1. **support level** DESC (`SUPPORTED > PLAUSIBLE > WEAKLY_SUPPORTED > CONTRADICTED`; the only stronger-than-PLAUSIBLE level is `SUPPORTED`, reserved for primary families).
2. **family priority** DESC: primary (classification-matching) family first; alternatives in a **frozen order**: `MISSING_COMPARISON`-adjacent genuine alternatives before representation/temporal alternatives (frozen: primary → `ENTITY_FRAGMENTATION_EXPLANATION` → `RELATION_REPRESENTATION_EXPLANATION` → `TEMPORAL_EXPLANATION` → `INNOCENT_ALTERNATIVE_EXPLANATION`; concealment primary never emits alternatives that would contradict its epistemic ceiling — see §16 ceiling rule).
3. **evidence diversity** DESC — count of distinct `sourceId` values among supporting observations (more independent sources rank higher; bounded ≤ 30).
4. **structural coverage** DESC — `supportingObservationIds.length + supportingHypothesisIds.length`.
5. `explanationId` ASC (tie-break; deterministic hex, lexical).

`rankingKey` therefore changes **iff** rank inputs change — it is content-addressed, order-independent, and stable across callers.

## 15. Deduplication (frozen)

Identity is the §8 tuple: family + basis + classification type + expected relationship + support/contradiction/structural id sets (all canonicalized). **Identical type + core claim + support/contradiction set → one explanation.** Duplicates beyond the first are dropped before ranking/bounding. `explanationCount` = number of distinct explanations emitted. Bounding to `MAX_COMPETING_EXPLANATIONS = 5` keeps the top-N by rank; `truncated = true` when more distinct candidates existed.

## 16. Epistemic ceilings (frozen)

| Classification | Ceiling rule |
|---|---|
| `CONFIDENT` | primary family may be `SUPPORTED`; alternatives `PLAUSIBLE` |
| `SUPPORTED` (concealment pattern) | explanation `CONCEALMENT_CONSISTENT_EXPLANATION` is `SUPPORTED` (pattern-compatible, §10.9); alternatives `PLAUSIBLE` — never stronger |
| `AMBIGUOUS` | primary family `PLAUSIBLE`; contradictions preserved in every family (`CONTRADICTED` when contradictory evidence is present) |
| `INSUFFICIENT_CONTEXT` | empty set (no explanations, §9) |

When contradictions are present: **`CONCEALMENT_CONSISTENT_EXPLANATION` and `MISSING_DATA_EXPLANATION` are never emitted** (mirrors PR14 — contradictions must not collapse into those categories); primary families that are emitted carry `CONTRADICTED`. `reference` reuse: `supportingObservationIds` may contain contradictory refs only when the family is explicitly a contradiction-preserving family (CONCEALMENT never; primary only under AMBIGUOUS).

## 17. Explanations: no LLM in V1

V1 is a **pure deterministic generator** — frozen templates, derived signals, content-addressed identity. There is no LLM invocation, no market/creative step, and no probabilistic sampling. If an advanced PR later introduces LLM-assisted explanation drafting, it MUST remain bounded by this policy's determinism, provenance, and epistemic ceilings, and MUST not weaken identity/ranking/audit guarantees.

## 18. User/Analyst Interaction and Lead Attachments — Not in V1 Range

PR15-V1 does not add user/AI-interaction events, does not attach explanations to Leads, and does not create to-do items. Explanation sets are returned to the caller; persistence is a caller concern (§27). Authorized accept/reject decisions on hypotheses remain outside PR15.

## 19. Explanations Related to and Beyond PR14 Classification (nullable type)

`gapClassificationType` on each explanation is the (nullable) PR14 `type` for the set. When `type` is null (INSUFFICIENT_CONTEXT) no explanations are emitted. A family beyond the current classification type is emitted only via an explicit alternative family (§10.5–10.8) with its grounded signal present.

## 20. Semantic Grounding

Explanations carry `assumptions` (≤3, strings) explicitly labeled as assumptions — never presented as evidence. Statements are frozen templates; no free-form text injection. `uncertainty` is a **deterministic heuristic** (`AnalyticalConfidenceSchema`, [0,1]) reflecting the strength of grounding and presence of contradictions; it is **NOT a probability** unless separately calibrated (policy contract comment and doc statement — mirrors `AnalyticalConfidenceSchema`).

## 21. What Is Not Implemented

PR16 (ER-split/relationship-split detail), PR17 (evidence candidates), PR18 (evidence utility), PR19 (evidence independence), PR20 (Resolution Rate@K). V1 emits no membership/ELECTION signals, no inference/EXTRA signals, no user-interaction events, no Lead attachments, no auto-persistence, no LLM.

## 22. Epistemic Rules

- "pattern-compatible"/"structurally plausible" is never an assertion of fact.
- An explanation is **not** a canonical hypothesis, a Lead, a fact, or an authorization.
- `CONTRADICTED` explanations remain listed (evidence preserved) — listing is not endorsement.
- Explanations are ranked for **analyst utility**, not as a predictive posterior.

## 23. Reasoning Trace / Audit

The set is self-describing (provenance ids, basis codes, assumptions). Each explanation exposes its full reference surface; callers can regenerate. Identity + rankingKey are content-addressed so any two calls on equal input produce equal outputs (verified by tests). No hidden reasoning artifacts exist in V1.

## 24. Determinism Guarantee

Same input package → identical byte-for-byte output set (ids, ordering, statements). Verified by tests against shuffled arrays/reordered objects. `computedAt` and `metadata` are defined by the caller and do not enter identity/ranking.

## 25. Performance / Boundedness

O(candidate refs + in-scope atomics + edges + observations) construction; output bounded ≤ 5 explanations, each with bounded reference arrays. No unbounded memory (all sets sorted+deduped first).

## 26. Visualization is a Caller Concern

Presentation (what the model/tool shows) is out of scope; PR15 returns structured data only.

## 27. Persistence is a Caller Concern

PR15 returns a `CompetingExplanationSet`; persisting it (e.g. Prisma JSON column) is a caller decision. The contract is JSON-serializable; `metadata` is optional caller-attached.

## 28. Example Enumeration (2+2)

- **Scenario A** (concealment): endpoint observation present, no direct-link evidence, no competing baseline, region not truncated → primary `CONCEALMENT_CONSISTENT_EXPLANATION` (`SUPPORTED`); relation-representation only if the expected type is unrepresented; no other families without signals.
- **Scenario B** (infrastructure): region truncated + `CONTEXT_OBSERVATION_BOUND_REACHED` → primary `INFRASTRUCTURE_EXPLANATION` (`SUPPORTED`, basis `REGION_REPRESENTATION_LIMITED`).
- **Scenario C** (missing comparison, contradictions to DATALINK + hypothesis): primary `MISSING_COMPARISON_EXPLANATION` (`CONTRADICTED`, AMBIGUOUS); `INNOCENT_ALTERNATIVE_EXPLANATION` (`PLAUSIBLE`) when a competing atomic baseline exists.
- **Scenario D** (missing data): supporting hypotheses exist, no supporting observations → primary `MISSING_DATA_EXPLANATION` (`SUPPORTED` *as documented — "supported" means strongly grounded structurally, NOT confirmed fact*).

## 29. Not in the "Task": items explicitly out

PR15 shall not implement: (1) multi-label/split PR14 classifications, (2) accepting/rejecting explanations with lifecycle authority, (3) generating evidence requests or to-dos, (4) Lead/second-Hypothesis creation, (5) any persistence, (6) any LLM, (7) any UI.

## 30. Contradictions and their powers

- Contradictory evidence is **preserved** (never resolved/overridden) and surfaces on every applicable explanation as `contradicting*` ids.
- A `CONTRADICTED` explanation still ranks below uncontradicted primary alternatives but above `INSUFFICIENT_CONTEXT` (which never appears as a row in V1).

## 31. The Empty Rule

If the candidate/reference sets are empty and no family has a grounded signal, the generator returns `{ explanations: [], truncated: false }` — an **empty, non-throwing result**, not an error (unless the candidate itself is missing → `INVALID_INPUT`/`CONTEXT_MISMATCH`).

## 32. Annotation: alternative hypotheses external to the tool

PR15 does not model explanations originating outside the tool (e.g. documents asserting competing hypotheses). Such content is beyond V1.

## 33. Naming and drift guard

Every PR15 constant and basis code namespaces itself with `CompetingExplanation` / `COMPETING_EXPLANATION` to avoid confusion with `AlternativeExplanation` (P4), `GraphHoleAnalysisV1.alternativeExplanations` (PR7), and `GapClassification*` (PR14). No accidental reuse of PR7's LLM `alternativeExplanations` field — PR15 IDs are content-addressed and deterministic, provenance-enforced.

## 34. Audit trail (verification matrix)

| Check | Expected |
|---|---|
| type — no single-label constraint violation | hidden |
| id — no invented id (all refs exist in context) | hidden |
| id — no cross-case / cross-version refs | hidden |
| basis — every code emitted matches its family's grounded signal | hidden |
| time — no clock in the generator | hidden |
| determinism — equal input → equal bytes | hidden |
| bound — explanations ≤ 5 and truncated reflects overflow | hidden |
| ceiling — no explanation exceeds its classification ceiling (§16) | hidden |
| concealment wording — pattern-compatible only | hidden |
| no LLM invocation | hidden |

(The verification matrix is completed after implementation+tests.)

## 35. Upstream Requirements & Dependencies

PR15 consumes PR14's `classifyGap` and `buildClassificationSignals`, PR3 atomics, PR5 candidate, PR1 region, M-A12/M-A13 nodes/edges/observations. No new upstream changes required.

## 36. Assumptions / Risks

- Assumption: PR14 classification is structurally sound (§12/§16 predicates rely on it; full re-validation is PR14's own certification).
- Risk: ranking is a heuristic; it is NOT calibrated probability.
- Risk: concealment bias — mitigated by the SUPPORTED ceiling + pattern-compatible wording + contradiction-preserving rules.

## 37. Metadata

`metadata` on the set is optional caller-attached (`MetadataSchema`), does not affect identity. `computedAt` is caller-supplied; must be an `ObservedTime` (M-A12).

## 38. API: `generateCompetingExplanations`

```ts
generateCompetingExplanations(input: CompetingExplanationInput): CompetingExplanationSet
```

Returns the frozen `CompetingExplanationSetSchema`-validated set. Throws `CompetingExplanationError` for §7 failures. Non-throwing epistemic states (INSUFFICIENT_CONTEXT → empty set) are RESULTS, not errors (mirrors PR14).

## 39. Frozen status of this document

This document and the V1 constants it references are **frozen** for V1. Any behavioral change bumps `competingExplanationPolicyVersion` and this document's status. Not intended as legal advice or any kind of guarantee of correctness for real-world investigative outcomes.

---

## §End — Certification Status

| Stage | Status |
|---|---|
| Policy freeze (PR15-1) | COMPLETE |
| Contract schemas + tests (PR15-2) | PENDING |
| Runtime scaffold + generation (PR15-3) | PENDING |
| Support/contradiction evaluation (PR15-4) | PENDING |
| Ranking + identity (PR15-5) | PENDING |
| Unit tests (PR15-6) | PENDING |
| Platform integration (PR15-7) | PENDING |
| Fixes (PR15-8) | PENDING |
| Docs + tracker (PR15-9) | PENDING |
| Regression matrix (PR6–PR15) | PENDING |
| **Final status** | **PENDING — CERTIFIED / CERTIFIED WITH DOCUMENTED LIMITATIONS / BLOCKED (choose at §End update)** |