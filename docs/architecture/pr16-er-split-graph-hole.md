# Phase 5A-PR16 — ER-Split Explanation for Graph Holes (Policy Freeze)

**Owner:** Mayur | **Branch:** `feat/m-a13-graph-hole-region` | **Status:** FROZEN (see §End)

PR16 adds the structured, provenance-aware, bounded layer that **detects, ranks, and explains when an entity-resolution split could explain a qualified GraphHole**. It consumes the real PR14 gap-classification and the optional PR15 competing-explanation set, and reuses the existing M-A07/M-A08/M-A09 candidate surface (`EntityMentionCandidate`, `CandidatePair`, `EntityHypothesis`) as a **read-only universe**. PR16 is **explicitly NOT** M-A09 authority (it never accepts/rejects/reverses/merges/splits), NOT PR17 (evidence candidate generation), NOT PR18 (evidence utility), NOT PR19 (evidence independence), NOT PR20 (Resolution Rate@K), and NOT the canonical entity split itself (M-A09.5, future scope).

> **Canonical contract (to land in PR16-2):** `packages/contracts/src/intelligence/entity-split.ts` (types `ErSplitExplanation` / `ErSplitExplanationSet` + `ER_SPLIT_EXPLANATION_POLICY_VERSION`)
> **Runtime package:** `packages/intelligence/entity-split-analysis` (`@indago/entity-split-analysis`)
> **Tracker:** `docs/roadmap/phase-tracker.md` §5A "Generate entity-split explanations"

---

## 0. Position in the Phase 5 pipeline

```
PR1 bounded region ─┐
PR3 hypothesis ctx ─┤--> PR4 detection --> PR5 qualification --> PR14 classification --> PR15 explanations
PR13 projection ────┘                        (QualifiedGraphHoleCandidate)  (GapClassificationResult)
                                                                                       |
M-A07 mentions / M-A08 pairs / M-A09 hypotheses (read-only universe) ---------------> PR16 ER-split
                                                                                       explanation
```

PR16 consumes:
- the **same closed-world package PR14/PR15 consumed** (case, version, qualified candidate, region, in-scope nodes/edges/observations, PR3 hypothesis context),
- the **real PR14 result** for that candidate (required),
- the **real PR15 competing-explanation set** for that candidate (optional, gating/association only — PR16 does NOT modify it),
- a **bounded, caller-supplied slice of M-A08/M-A09 outputs**: `CandidatePair[]`, `EntityHypothesis[]`, and the `EntityMentionCandidate` universe those pairs reference.

Context integrity is enforced **by re-running the deterministic classifier** (`classifyGap(context)`) inside PR16 and requiring equality with the supplied classification (§7 `CONTEXT_MISMATCH`), exactly as PR15 does. PR16 never reaches a store, never retrieves beyond the supplied package, and (V1) never invokes an LLM — it is a **pure deterministic generator** (§17).

## 1. Scope and Ownership Boundary

| Cardinal input | Certified producer |
|---|---|
| `GapClassificationInput`-shaped closed-world package | PR1/PR3/PR5/PR13/PR14 input contract |
| `GapClassificationResult` (the real PR14 output) | PR14 (`@indago/gap-classification`) |
| `CompetingExplanationSet` (optional; the real PR15 output) | PR15 (`@indago/competing-explanations`) |
| `CandidatePair[]`, `EntityHypothesis[]`, `EntityMentionCandidate[]` (bounded read-only slice) | M-A08 (`@indago/ingestion` blocking), M-A09 (`@indago/entity-resolution`), M-A07 (`EntityMentionCandidate`) |
| Qualified GraphHole candidate | PR5 |

**PR16 MUST NOT:**
- accept, reject, reverse, merge, split, or otherwise mutate any `EntityHypothesis`, `CandidatePair`, or canonical entity — M-A09 holds all identity authority (audit: only ACCEPT authority exists today; REJECT/REVERSE/MERGE/SPLIT and M-A09.5 canonical split/merge are future scope, documented in §36);
- create/modify GraphHole candidates, GraphHole identity, qualification, or classification;
- create evidence requests, to-dos, or a second Hypothesis/Lead lifecycle;
- run new blocking or pair lifecycles (PR11 owns reblocking execution);
- mutate GraphVersion or canonical relations;
- reach into any store/search/LLM/retrieval boundary;
- persist anywhere by default (persistence is a caller concern, §27).

**PR16 IS:** an analytical aid. Its output is NOT a factual assertion that two mentions are the same actor, NOT an authorization to merge or split, NOT criminality, NOT a legal/admissibility conclusion.

## 2. Definition of an ER-Split Explanation (frozen)

An **ER-split explanation** is a structured, content-addressed, rank-ordered statement of **one distinct, plausible way that identity fragmentation could explain the qualified GraphHole**: the hole's expected relationship appears missing because the real-world actor may be **represented by two (or more) distinct canonical entities** that were never unified, each carrying part of the evidence that, combined, would bridge the hole.

Precisely: for a candidate pair `(c, d)` of entity mentions:
- `A1≈A2` — *mentions plausibly refer to the same actor* — is the **hypothesis of fragmentation** (identify-evidence `A1≈A2`);
- `E1 ≠ E2` — the mentions are currently linked into **distinct canonical entities** — is the **observed fragmentation state**.

The explanation claims neither fact. It claims the **combination** (`A1≈A2` evidence present, `E1`/`E2` still distinct, and the hole's boundary structure separates them) is a **structurally compatible reason the hole exists**. This is deliberately weaker than "the actor was split": it cannot be proven within a closed world, so it is always worded as a compatible explanation (§10 wording rules).

Three rigid properties (mirror PR15):

1. **GROUNDED — no manufacturing.** Every explanation is backed by a grounded signal: a real `CandidatePair` id (reused from M-A08), real blocking passes, a real `EntityHypothesis` (reused from M-A09), real supporting/contradicting observation ids, and real boundary node ids from the supplied package. Nothing is invented.
2. **PROVENANCE — every referenced id exists in the supplied context or the supplied M-A08/M-A09 slice.** `candidatePairId`, `candidateAId`/`candidateBId`, all `sharedSignals` reference ids, `structuralFit` node ids, and observation ids are validated against the supplied package at generation time (`CONTEXT_MISMATCH` / `INVALID_REFERENCE`). No cross-case, no cross-version ids.
3. **DETERMINISTIC — same package → same set, byte-for-byte.** Input ordering never matters; identity is content-addressed (§8); the emitted set is deduped, ranked, and bounded (§14/§15).

> **Epistemic rule:** "split-compatible" is never an assertion that a split occurred, that identity was deliberately fragmented, or that unifying `E1`/`E2` is an authorized act.

## 3. Audit finding: no existing canonical ErSplitExplanation

PR16-1 audit (greps across `packages/`) confirms there is **no canonical `ErSplitExplanation` contract** and no existing ER-split explanation generator. Existing surfaces, and why they are NOT reused as the explanation layer:

| Surface | Location | Why not reused for PR16 |
|---|---|---|
| `ENTITY_FRAGMENTATION_EXPLANATION` (alternative family) | `packages/intelligence/competing-explanations` (PR15) | **Coarse** by design: asserts only *"identity resolution is unproven; entities may not be unique"*. PR15 itself delegates the specific break-out: *"Specific entity-split configurations are outside V1 (PR16)."* PR16 is that break-out |
| `CandidatePair` | `packages/contracts/src/domain/candidate-pair.ts` (M-A08) | The pair abstraction — **reused as-is** (identity, left/right ordering, `blockingPasses`), never re-declared |
| `EntityHypothesis` / `CandidateResolution` | `packages/contracts/src/intelligence/entity-resolution.ts` + `packages/platform/prisma/schema.prisma` (M-A09) | The hypothesis surface — **reused as-is** (score, `comparisonStatus`, `status`, supporting/contradicting observation collections). PR16 never writes status |
| Entity split/merge catalogues | `packages/intelligence/entity-resolution` | Only `compareCandidates` + ACCEPT authority exist. **No canonical-split engine exists** — documented limitation (§36), PR16 proposes, never executes |
| `TargetedReblockRegionReference` / `selectCandidatesForRegion` | `packages/intelligence/targeted-reblocking` (PR11) | PR11 owns targeted reblocking **execution**. PR16 only emits a handoff (§27) |
| `AlternativeExplanation` / PR7 LLM `alternativeExplanations` | P4 leads / `graph-hole-analysis` | Different layers (lead templates / LLM analysis); not deterministic canonical contracts |

**Conclusion:** PR16 introduces a **new canonical contract** (`ErSplitExplanationSchema` / `ErSplitExplanationSetSchema`) in `@indago/contracts` and a **new runtime** `@indago/entity-split-analysis`. It reuses M-A07/M-A08/M-A09 ids and vocab exactly (candidate ids, pair ids, hypothesis ids, blocking-pass values, `EntityComparisonStatus`/`EntityResolutionStatus` by reference), never re-declared with drift.

## 4. The split hypothesis space (frozen V1)

PR16-1 explains **one** configuration class:

```text
TWO-MENTION FRAGMENTATION (V1)
  pair p = (c, d)                    — one M-A08 CandidatePair
  A1≈A2 evidence                     — blocking passes + hypothesis score (identity direction)
  E1 ≠ E2 observed                   — distinct canonical entities currently linked
  boundary separates E1-side from E2-side of the hole — structural bridging (the "missing" link)
  → "the expected relationship may be absent only because the actor is fragmented"
```

Out of scope for V1 formulation (documented for later PRs): splits across >2 mentions in one explanation; chain/pathological multi-split; entity-vs-relationship hybrid splits; split + concealment interaction scoring. PR16 never claims which of the two entities is "the real" actor.

## 5. Input Contract

`ErSplitExplanationInput` (type-only, lives in `@indago/entity-split-analysis`, mirrors PR14/PR15 input packages):

```ts
interface ErSplitExplanationInput {
  readonly context: GapClassificationInput;            // PR14 closed-world package (same shape, required)
  readonly gapClassification: GapClassificationResult; // the REAL PR14 result for context.qualifiedCandidate
  readonly competingExplanationSet?: CompetingExplanationSet; // the REAL PR15 result for the same candidate (optional)
  readonly candidatePairs: readonly CandidatePair[];   // bounded M-A08 slice (read-only)
  readonly entityHypotheses: readonly EntityHypothesis[]; // bounded M-A09 slice (read-only)
  readonly candidateUniverse: readonly EntityMentionCandidate[]; // M-A07 universe for the pairs (read-only)
  readonly erSplitPolicyVersion: 'v1';
  readonly computedAt: ObservedTime;                   // caller supplies; no clock inside
}
```

Boundary constraints (§7):
- `context.qualifiedCandidate` MUST be `qualified === true` (mirrors PR14/PR15).
- `context.classificationPolicyVersion` MUST be `'v1'`.
- `gapClassification` MUST match the deterministic recomputation of `classifyGap(context)` on `contextSha256`, `type`, `status`, and `reasonCodes`.
- `competingExplanationSet` (when supplied) MUST have `competingExplanationPolicyVersion === 'v1'`, MUST target the same `graphHoleId`, and its **embedded `classification` projection** (`type`/`status`/`classificationPolicyVersion`) MUST match the recomputed classification (§7). Note: PR15's set-level `contextSha256` is a digest of PR15's *derived signals* — not the raw closed-pack package digest — so it is echoed as `competingExplanationSetContextSha256` and never compared against PR16's package digest.
- Every `candidatePair.caseId` MUST equal `context.caseId`; every pair's `leftCandidateId`/`rightCandidateId` MUST exist in `candidateUniverse`; every `entityHypothesis.candidatePairId` MUST reference a supplied pair; every referenced observation id MUST exist in `context.observations`.
- `candidatePairs.length <= MAX_CANDIDATE_PAIRS_PER_QUERY` (250) and `entityHypotheses.length <= MAX_ENTITY_HYPOTHESES_PER_QUERY` (500) — hard bounds, rejected with `INVALID_INPUT`.

Boundedness is mandatory: the caller supplies the slice; PR16 performs **no retrieval** to discover additional pairs or hypotheses.

## 6. Normalized Signal Layer

All derivations are observed-fact functions over the supplied package (never content-semantic reading, never hidden retrieval):

| Signal | Derivation |
|---|---|
| `pair` | one `CandidatePair` from the supplied slice, id-matched |
| `blockingStrongIdentifier` | `EXACT_STRONG_IDENTIFIER ∈ pair.blockingPasses` (M-A08 pass 1 — deterministic equivalence claim on a strong identifier) |
| `blockingCanonicalValue` | `EXACT_CANONICAL_VALUE ∈ pair.blockingPasses` (M-A08 pass 2 — normalized stored value shared) |
| `blockingNameInitial` | `NAME_INITIAL_BLOCK ∈ pair.blockingPasses` (M-A08 pass 3 — deliberately weak, §12) |
| `hypothesis` | the highest-scoring `EntityHypothesis` in the slice with `candidatePairId === pair.id` (M-A09 reuse) |
| `hypothesisComparedMatch` | `hypothesis.comparisonStatus === 'RESOLVED_MATCH'` |
| `hypothesisScoreStrong` | `hypothesis.score >= RESOLUTION_MATCH_SCORE_THRESHOLD (0.5)` |
| `hypothesisContradictions` | `hypothesis.contradictingObservationIds` (validated in `context.observations`) |
| `hypothesisNonMatch` | `hypothesis.comparisonStatus === 'RESOLVED_NON_MATCH'` |
| `supportingObservationIds` | `hypothesis.supportingObservationIds` ∩ `context.observations` (validated; sorted unique) |
| `canonicalEntityA/B` | first canonical entity linked by the candidate's observation (`candidateUniverse[observationId].entityIds`), when exactly the unique linked entity; nullable otherwise |
| `unifiedPair` | `canonicalEntityA === canonicalEntityB` (both non-null) — the mentions already share a canonical entity: **not an open split; pair excluded entirely** (§9.5) |
| `boundarySet` | `context.qualifiedCandidate.nodeIds ∪ { neighbors via context.edges }` (GraphNodeId set, sorted unique) |
| `e1Side` / `e2Side` | boundary nodes covered by `canonicalEntityA` / `canonicalEntityB` respectively (§13) |
| `borderBridging` | ≥1 node on each side AND no boundary-subgraph path between any node of `e1Side` and any node of `e2Side` (§13) |
| `temporalCompatibility` | deterministic interval judgement between the two mentions' observations (§16) |

No fabricated fields, no content-semantic inference, no missing-data invention (absent data is **not** a negative — mirrors M-A09 `ABSENT ≠ DIFFERENT`).

## 7. Boundary validations (typed failures, thrown as `ErSplitExplanationError`)

| Failure | Code | Trigger |
|---|---|---|
| `INVALID_INPUT` | `ErSplitExplanationErrorCode.INVALID_INPUT` | structurally malformed input / missing required fields; bound exceeded; runtime output rejected by the frozen contract schema |
| `UNSUPPORTED_POLICY` | `ErSplitExplanationErrorCode.UNSUPPORTED_POLICY` | `erSplitPolicyVersion !== 'v1'` (or supplied `competingExplanationSet.competingExplanationPolicyVersion !== 'v1'`); `classificationPolicyVersion !== 'v1'` |
| `CONTEXT_MISMATCH` | `ErSplitExplanationErrorCode.CONTEXT_MISMATCH` | recomputed classification disagrees with supplied `gapClassification`; supplied `competingExplanationSet` targets a different hole or its embedded `classification` projection disagrees with the recomputed classification; candidate not qualified; a pair/hypothesis carries a different `caseId`; a candidate-referenced id absent from the supplied context/universe |
| `INVALID_REFERENCE` | `ErSplitExplanationErrorCode.INVALID_REFERENCE` | an emitted explanation would reference an id not in the supplied package (defensive; generation never constructs such refs) |

Runtime output is validated against the frozen contract schema after generation; drift is surfaced as `INVALID_INPUT` (mirror PR14/PR15), never silently passed.

## 8. Identity (content-addressed, order/execution independent)

`explanationId = sha256Hex(canonicalizeDeterministic(identityTuple))` where:

```ts
{
  caseId, graphVersionId, graphHoleId,
  candidatePairId,           // M-A08 pair id is itself deterministic + case-scoped + left<right canonical
  policyVersion: 'v1',
}
```

- `CandidatePairId` already canonicalizes pair orientation (deterministic from `(caseId, left < right)`), so an input where `(c,d)` is swapped collapses to the same pair and the same `explanationId`.
- V1 does **not** namespace identity by hypothesis score or context digest — the explanation is **for the pair within the hole**, and its evidence content travels in its fields. If a future policy needs to distinguish identical pairs across scoring-model versions, it bumps `erSplitPolicyVersion` (§39), never mutates V1 identity.
- `canonicalizeDeterministic` is the exported PR0 utility (sorted object keys, sorted string arrays) → input-order independence.
- `rankingKey` (§14) is also a canonicalized string; sorting it lexicographically **ascending** yields the final rank order.

## 9. Deterministic Generation Policy (frozen V1)

`generateErSplitExplanations(input)`:

1. **validate** boundary (§7) and hard bounds (§5);
2. **classify**: `recomputed = classifyGap(context)`; enforce equality vs supplied `gapClassification` (CONTEXT_MISMATCH otherwise);
3. **digest**: `contextSha256 = sha256Hex(canonicalizeDeterministic(context))`; when a PR15 set is supplied, enforce the equivalence of its embedded `classification` projection (`type`/`status`/`classificationPolicyVersion`) with the recomputed classification and echo the set's own digest as `competingExplanationSetContextSha256` (CONTEXT_MISMATCH otherwise);
4. **index** the universe (candidate id → candidate), hypotheses (by `candidatePairId`), observations (by id) — sorted-first construction, no unbounded memory;
5. **generate candidates** — for each supplied `CandidatePair` (ordered by id): resolve the pair, require `!unifiedPair` (§9.5), derive signals (§6), require identity evidence AND structural fit (§9b), compute identity + status + scores, preserve contradictions;
6. **identity + dedupe** (§8, §15);
7. **rank** (§14) and **bound** to `MAX_ER_SPLIT_EXPLANATIONS = 5` (set `truncated = true` when distinct candidates exceeded the bound);
8. **validate the emitted set** against the frozen contract schema (drift → `INVALID_INPUT`).

**§9b Emission rule (frozen):** an explanation is emitted **only when BOTH** `identitySupportScore > 0` (at least one positive shared signal) **AND** `structuralFitScore > 0` (at least one side covers boundary). A hypothesis pair with zero structural fit is not a hole-bridging split candidate; a structural bridge with zero identity evidence cannot be attributed to fragmentation. **No forced positives**: when no pair qualifies, the result is a valid, non-throwing, empty set (`explanations: []`, `truncated: false`) — an epistemic result, not an error (mirrors PR14/PR15). `INSUFFICIENT_CONTEXT` is **never** emitted as a row.

**§9.5 Unified pair exclusion (frozen):** when the two mentions already resolve to the **same canonical entity** (`canonicalEntityA === canonicalEntityB`, both non-null), the pair is already unified — it cannot be a fragmentation candidate, and emitting it would second-guess an accepted identity. Such pairs are **excluded before scoring**, no row is produced, and the event is recorded only in the result payload's `excludedPairCounts.unified` (§18). An `ACCEPTED`/`RESOLVED` `EntityHypothesis` on the pair is orthogonal: the hypothesis status is authoritative and never overridden; a unified/accepted pair never receives an ER-split explanation.

## 10. Statement & Status Semantics (frozen V1)

### 10.1 Statement template (frozen)

When `comparisonStatus` is `RESOLVED_MATCH` or a strong identifier pass is present:

> `The expected relationship may be missing because the same actor is represented by two distinct canonical entities within the bounded context: {A} and {B} share identity evidence ({signals}) but have not been unified, and the hole boundary separates their evidence. This is split-compatible and is NOT an assertion that a split occurred or that either entity is the actor.`

Otherwise (weaker evidence):

> `Fragmentation is one structurally compatible possibility: mentions {A} and {B} carry partial identity evidence ({signals}) and their distinct representations straddle the hole boundary. This formulation does not assert that the representations are actually the same actor.`

`{A}`/`{B}` are the candidate ids; `{signals}` is a deterministic summary of the shared-signal codes. Wording is pattern-compatible only (§22).

### 10.2 Status (frozen, reuses PR15 support-level vocabulary)

| Status | Condition (all required unless noted) |
|---|---|
| `CONTRADICTED` | any `contradictingObservationIds`, OR `comparisonStatus === RESOLVED_NON_MATCH`, OR `temporalCompatibility === INCOMPATIBLE` — overrides everything else (§17) |
| `SUPPORTED` | `direct` identity evidence (strong-identifier pass OR `RESOLVED_MATCH` with `score ≥ 0.5`) AND `borderBridging` AND no contradiction AND `identitySupportScore ≥ 0.55` |
| `PLAUSIBLE` | positive identity evidence (`identitySupportScore ≥ 0.30`) AND (`borderBridging` OR `blockingCanonicalValue`) AND no contradiction |
| `WEAKLY_SUPPORTED` | `identitySupportScore > 0` AND `structuralFitScore > 0` (e.g. only a `NAME_INITIAL_BLOCK` pass bridges the boundary) AND no contradiction |

`SUPPORTED`, `PLAUSIBLE`, `WEAKLY_SUPPORTED`, `CONTRADICTED` reuse the PR15 ordering exactly (`SUPPORTED > PLAUSIBLE > WEAKLY_SUPPORTED > CONTRADICTED`). `CONTRADICTED` explanations remain listed (evidence preserved — listing is not endorsement, §22).

### 10.3 Result payload (frozen)

```ts
{
  caseId, graphVersionId, graphHoleId,
  policyVersion: 'v1',
  contextSha256,
  explanations: ErSplitExplanation[],     // ranked, ≤ 5
  truncated: boolean,
  excludedPairCounts: { unified: number; nonSplit: number },
  generatedAt: ObservedTime,              // = input.computedAt (no clock)
}
```

## 11. Signals: NONE in V1

V1 emits **no membership/`ELECTION`-style and no inference/`EXTRA`-style signals.** Only enumerated positive/contextual signals (§6) drive emission. Bounded exceptions never appear in this policy's V1; they are future work.

## 12. Identity evidence weights (frozen V1)

`identitySupportScore = clamp01( d·0.55 + c·0.25 + n·0.10 + h − b )` with:

- `d = 1` when `blockingStrongIdentifier` OR (`hypothesisComparedMatch` AND `hypothesisScoreStrong`); else `0` — *justification:* a strong-identifier pass is M-A08's deterministic equivalence claim (highest trust; pass 1), and a high-scored `RESOLVED_MATCH` reuses M-A09's established engine (never re-invented).
- `c = 1` when `blockingCanonicalValue` — *justification:* pass 2 is a normalized stored-value match; meaningful but below a strong identifier.
- `n = 1` when `blockingNameInitial` — *justification:* pass 3 is deliberately weak by M-A08 design; a shared surname+initial is common and alone never implies identity.
- `h = min(0.25, 0.30 · hypothesis.score)` for the highest-scoring hypothesis on the pair (0 when none) — *justification:* score is M-A09's ranking/support signal in `[0,1]` **and is NOT a probability**; its ceiling contribution is bounded so the score can never exceed the strong-identifier contribution plus name/canonical evidence.
- `b = min(0.35, 0.10 · |hypothesisContradictions|) + (hypothesisNonMatch ? 0.25 : 0) + (temporalCompatibility === INCOMPATIBLE ? 0.20 : 0)` — *justification:* contradictions and proven non-match are first-class negatives (M-A09 `ABSENT ≠ DIFFERENT` is honored: absence never adds to `b`), capped so a single negative never fully zeroes out the signal layer.

`clamp01` bounds to `[0,1]`. The score **names itself a heuristic score, never a probability** (mirrors `ResolutionScoreSchema`/`AnalyticalConfidenceSchema`).

**Weak-prone rule:** a `NAME_INITIAL_BLOCK`-only pair (`d=c=0`, `n=1`) yields at most `0.10 + h` — by construction it can never reach `SUPPORTED` (§10.2) and never reaches `PLAUSIBLE` when `h < 0.20`.

## 13. Structural fit (frozen V1)

Given the closed package and one candidate uuid `Q`:

- `boundarySet = Q.nodeIds ∪ { v : edge.e1NodeId=v or edge.e2NodeId=v for some edge ∈ context.edges with e1NodeId ∈ Q.nodeIds or e2NodeId ∈ Q.nodeIds }` (sorted unique GraphNodeIds; ≥1 because `Q.nodeIds` ≥ 1 by PR5 contract).
- For a pair `(c,d)`: `e1Side = boundarySet ∩ { nodes e : canonicalEntityA ∈ obs(entity of e).entityIds … }` and `e2Side` likewise. Concretely: a boundary node belongs to a side when its `entityId` is present in `observation.entityIds` for the pair's candidate observation. (Observations map `observation → canonical entities`; `GraphNode.id` IS the canonical `EntityId`, so membership is a pure set check — no graph simulation.)
- `coverage = |(e1Side ∪ e2Side) ∩ boundarySet| / |boundarySet|`.
- `borderBridging = (e1Side ≠ ∅) ∧ (e2Side ≠ ∅) ∧ ¬(∃ path e1Side → e2Side in the boundary subgraph)` where the boundary subgraph is `context.edges` restricted to `boundarySet`. Path search is plain BFS over ≤ |boundarySet| nodes (bounded; O(V+E)).

`structuralFitScore = clamp01( 0.60 · bridging + 0.20 · coverage + 0.20 · bothSidesPresent )` where `bothSidesPresent = e1Side ≠ ∅ && e2Side ≠ ∅`.

*Justification:* `bridging` is the defining property — the hole's boundary splits cleanly into two evidence-bearing sides that are **not connected**, exactly the signature of a representation split (weight 0.60, dominant). `coverage` rewards explaining more of the boundary (0.20). `bothSidesPresent` pins the two-sided property even when coverage is low because the boundary is large (0.20). If either side is empty, `bridging` and `bothSidesPresent` are both 0 and the maximum score is `0.20·coverage`. A pair can never reach `SUPPORTED` without `borderBridging` (§10.2).

No graph is simulated or mutated; the boundary subgraph is an in-memory derived view over `context.edges` only.

## 14. Ranking (deterministic, frozen V1)

Sort a canonicalized `rankingKey` **ascending**; DESC fields flipped to fixed-width zero-padded digits — note that negated JSON numbers sort lexically in the wrong direction (`"-4" < "-5"`), so V1 emits fixed-width flipped strings instead of a negated numeric tuple (PR15-6 lesson):

1. **support level** DESC (`SUPPORTED > PLAUSIBLE > WEAKLY_SUPPORTED > CONTRADICTED`);
2. **structuralFitScore** DESC;
3. **identitySupportScore** DESC;
4. **evidence diversity** DESC — distinct `sourceId` values among `supportingObservationIds` (more independent sources higher; ≤ 30);
5. **candidateAId** ASC (deterministic tie-break);
6. **candidateBId** ASC;
7. **explanationId** ASC (final tie-break; deterministic hex, lexical).

`rankingKey` changes **iff** rank inputs change — content-addressed, order-independent, stable across callers.

## 15. Deduplication (frozen)

Identity is the §8 tuple (case, version, hole, pair, policy). Since pair identity is canonicalized, **reversed pair orientation collapses**; duplicate rows are dropped before ranking/bounding. `explanations.length` = count of distinct explanations emitted. Bounding to `MAX_ER_SPLIT_EXPLANATIONS = 5` keeps the top-N by rank; `truncated = true` when more distinct candidates existed.

## 16. Temporal compatibility (frozen V1)

Derived **only** from M-A12 domain validity (`observation.validityInterval` [validFrom, validTo]) with `eventTime` as a point anchor — **never** `createdAt`/`updatedAt`/system time:

| Case | Result |
|---|---|
| both candidates' observations have intervals and they **overlap** (`aStart ≤ bEnd && bStart ≤ aEnd`, open-ended = +Inf) | `COMPATIBLE` |
| both intervals present and **disjoint** | `INCOMPATIBLE` |
| exactly one interval present (other has `eventTime` anchor) | `PARTIALLY_COMPATIBLE` |
| neither observation carries a usable temporal fact | `INSUFFICIENT` |

`INCOMPATIBLE` forces `CONTRADICTED` (§17). No content-semantic inference, no clock, no manufacture of intervals.

## 17. Contradictions and their powers (frozen)

- Contradictory evidence is **preserved** (never resolved/overridden) and surfaces as `contradictingObservationIds` on the explanation.
- `hypothesisContradictions ≠ ∅` OR `hypothesisNonMatch` OR `temporalCompatibility === INCOMPATIBLE` ⇒ status `CONTRADICTED` (overrides support, §10.2).
- A `CONTRADICTED` explanation ranks below uncontradicted ones but remains listed.
- Absent data is never a contradiction (M-A09 `ABSENT ≠ DIFFERENT`).
- `requiresAuthorityDecision` and `requiresTargetedReblocking` are `false` for `CONTRADICTED` rows (§18).

## 18. Decision affordances (frozen V1)

| Field | Value | Meaning |
|---|---|---|
| `requiresAuthorityDecision` | `true` unless status is `CONTRADICTED` | confirming the split would require M-A09 authority (which does not yet implement split/merge, §36); PR16 proposes, never decides |
| `requiresTargetedReblocking` | `true` only when status is `SUPPORTED` | a supported split hypothesis is worth a targeted-reblocking probe to look for bridging evidence |
| `targetedReblockingHandoff` | present when `requiresTargetedReblocking` | `{ targetCandidateIds: [candidateAId, candidateBId], targetRegionId: context.region.regionId, reason: 'ENTITY_FRAGMENTATION_POSSIBILITY' }` — PR11 (`@indago/targeted-reblocking`) owns execution; PR16 never invokes it |
| `missingDiscriminatingSignals` | sorted enum codes | PR17-facing: where additional evidence would disambiguate. Frozen V1 enum: `STRONG_IDENTIFIER_ABSENT`, `CANONICAL_VALUE_ABSENT`, `TEMPORAL_EVIDENCE_ABSENT`, `CONTRADICTION_FREE_EVIDENCE_ABSENT`, `OBSERVATION_OVERLAP_ABSENT`. PR16 computes the list, PR17 owns acquisition |

`excludedPairCounts` on the payload reports how many supplied pairs were excluded (`unified`, `nonSplit`) for auditability.

## 19. Uncertainty (frozen heuristic)

`uncertainty = clamp01( 1 − 0.45·identitySupportScore − 0.30·structuralFitScore − (temporalCompatibility === COMPATIBLE ? 0.10 : 0) − (direct ? 0.05 : 0) )`.

It is a **deterministic heuristic** in `[0,1]` reflecting grounding strength — **NOT a probability**, NOT calibrated (mirrors `AnalyticalConfidenceSchema`). Higher = less certain.

## 20. Assumptions (frozen, ≤3, never presented as evidence)

1. A shared blocking pass + hypothesis score is identity evidence only in the `A1≈A2` direction; it does not prove the actor relationship.
2. Distinct canonical entities to the two sides of a boundary make fragmentation a structural possibility — not a fact.
3. Temporal comparison uses domain validity only; absence of temporal facts is uninformative (`ABSENT ≠ DIFFERENT`).

## 21. What Is Not Implemented

REJECT/REVERSE/MERGE/SPLIT authority; M-A09.5 canonical entity split/merge; executing reblocking (PR11); evidence acquisition (PR17); evidence utility/independence (PR18/PR19); Resolution Rate@K (PR20); LLM; UI; persistence; multi-mention chain splits; split + concealment interaction. V1 emits no ELECT/EXTRA-style signals and no forced positives.

## 22. Epistemic Rules

- "split-compatible"/"structurally compatible" is never an assertion that a split occurred.
- An ER-split explanation is **not** a canonical hypothesis, a Lead, a fact, or an authorization.
- `CONTRADICTED` explanations remain listed — listing is not endorsement.
- Explanations are ranked for **analyst utility**, not as a predictive posterior.

## 23. Reasoning Trace / Audit

Every explanation is self-describing (pair/hypothesis/observation/node provenance ids, signal codes, frozen statement, scored components). `explanationId` and `rankingKey` are content-addressed; callers can regenerate. No hidden reasoning artifacts exist in V1.

## 24. Determinism Guarantee

Same package → identical byte-for-byte output (ids, ordering, statements). Verified by tests against shuffled arrays/reordered objects. `computedAt`/`metadata` are caller-defined and do not enter identity/ranking.

## 25. Performance / Boundedness

Construction is O(pairs + hypotheses + observations + boundary + edges) with all sets sorted+deduped first; BFS bounded by the boundary subgraph O(V+E). Output ≤ 5 explanations; per-explanation arrays bounded (signals ≤ 6, observation refs ≤ 30, boundary ≤ 250). No unbounded memory.

## 26. Visualization is a Caller Concern

Presentation is out of scope; PR16 returns structured data only.

## 27. Persistence is a Caller Concern

PR16 returns a result payload; persisting (e.g. Prisma JSON column) is a caller decision. No `ER-Split` lifecycle table is created. The contract is JSON-serializable.

## 28. Example Enumeration (2+2)

- **Scenario A** (hypothesis-driven split): pair has an M-A09 hypothesis with `comparisonStatus = RESOLVED_MATCH`, `score = 0.72`, `supportingObservationIds` on both sides, `contradictingObservationIds = []`; observations' canonical entities are distinct and cover opposite sides of a boundary with no path between them → `identitySupportScore = 0.55 + 0 + 0 + 0.216 − 0 = 0.766`, bridging = true → **SUPPORTED**, `requiresTargetedReblocking = true`, handoff emitted.
- **Scenario B** (blocking-driven split, weak): pair has only `NAME_INITIAL_BLOCK`, no hypothesis; distinct canonical entities split the boundary → `identitySupportScore = 0.10`, bridging = true → **WEAKLY_SUPPORTED**; no reblocking handoff. Frozen V1 emission is a **superset** of the minimal example: the generator reports **every** absent discriminating dimension (all Absent-* codes the enum admits for which no grounded signal is present), so for this pair `missingDiscriminatingSignals ⊇ [STRONG_IDENTIFIER_ABSENT, CANONICAL_VALUE_ABSENT]` — the two codes shown here are the discriminator-category absent set, not an exhaustive enumeration (see §18 emission rules and the PR16-10 superset note).
- **Scenario C** (unified exclusion): the two candidates' observations already share a canonical entity (`canonicalEntityA === canonicalEntityB`) → the pair is excluded (`excludedPairCounts.unified += 1`), no row, no second-guessing of the accepted identity.
- **Scenario D** (contradiction): hypothesis has `contradictingObservationIds` (mutually exclusive fields) → status `CONTRADICTED` regardless of score; `requiresAuthorityDecision`/`requiresTargetedReblocking` false.

## 29. Not in the "Task": items explicitly out

PR16 shall not implement: (1) hypothesis lifecycle authority (accept/reject/reverse/merge/split), (2) canonical entity split/merge, (3) reblocking execution, (4) evidence requests or to-dos, (5) Lead/second-Hypothesis creation, (6) any persistence, (7) any LLM, (8) any UI.

## 30. Semantic grounding breaks map

| Fake/prohibited | PR16 behavior |
|---|---|
| "prove two entities are the same person" | prohibited — PR16 only reports `A1≈A2` evidence + `E1 ≠ E2` state + boundary compatibility |
| "the split explains everything" | no — explanations are ranked alternatives, never categorical |
| "unify these entities" | authority boundary — PR16 proposes, M-A09 decides |
| "temporal contradiction" from `updatedAt` | prohibited — §16 uses domain validity only |

## 31. The Empty Rule

If no supplied pair qualifies (§9b/§9.5), the generator returns `{ explanations: [], truncated: false, excludedPairCounts: {...}, … }` — an **empty, non-throwing result**, not an error (unless the candidate itself is missing → `INVALID_INPUT`/`CONTEXT_MISMATCH`).

## 32. Annotation: external hypotheses

PR16 does not model ER-split theories originating outside the tool. Such content is beyond V1.

## 33. Naming and drift guard

Every PR16 constant/signal namespaces itself `ErSplitExplanation` / `ER_SPLIT_EXPLANATION` / `ErSplit` to avoid confusion with `ENTITY_FRAGMENTATION_EXPLANATION` (PR15 coarse family), `AlternativeExplanation` (P4), PR7 LLM `alternativeExplanations`, and `CandidateResolution` (M-A09). Blocking-pass values, `EntityComparisonStatus`/`EntityResolutionStatus`, and all ids are imported by reference — never re-declared.

## 34. Audit trail (verification matrix — filled after PR16-6)

| Check | Expected |
|---|---|
| type — no single-label constraint violation | PENDING — per-pair status assertions (PR16-6) |
| id — no invented id (all refs exist in context/universe) | PENDING — closed-world reference tests |
| id — no cross-case / cross-version refs | PENDING — caseId equality + classification binding tests |
| authority — PR16 never writes hypothesis/pair/canonical state | PENDING — authority-boundary test (deep-frozen inputs) |
| basis — every signal code emitted matches its derivation | PENDING — per-pair signal assertions |
| time — no clock in the generator | PENDING — no clock/randomness; `computedAt` caller-supplied; byte-determinism tests |
| determinism — equal input → equal bytes | PENDING — reordered-input + repeated-call byte-identical tests |
| bound — explanations ≤ 5 and truncated reflects overflow | PENDING — contract bound + runtime cap tests |
| ceiling — no explanation exceeds its status ceiling (§10.2) | PENDING — ceiling assertions incl. weak-only never SUPPORTED |
| wording — split-compatible only | PENDING — statement template assertions |
| no LLM invocation | PENDING — pure deterministic generator (no LLM import/usage) |

(V1 verification: unit + boundary coverage at PR16-6; platform-integration evidence at PR16-8 will be written + typechecked, live execution pending Neon DB availability.)

## 35. Upstream Requirements & Dependencies

PR16 consumes PR14's `classifyGap` + `GapClassificationResult`, PR15's `CompetingExplanationSet` (optional), M-A07 `EntityMentionCandidate`, M-A08 `CandidatePair` (id, `blockingPasses`, `caseId`, candidate ids), M-A09 `EntityHypothesis` (score, `comparisonStatus`, `status`, supporting/contradicting collections), PR5 candidate, PR1 region, M-A12/M-A13 nodes/edges/observations. No new upstream changes required.

## 36. Assumptions / Risks

- Assumption: identity scores from M-A08/M-A09 are structurally sound (§12 predicates rely on them; full re-validation is their own certification).
- **Known limitation (audited):** M-A09 today implements only `compareCandidates` + the ACCEPT authority. REJECT/REVERSE/MERGE/SPLIT and M-A09.5 canonical split/merge **do not exist yet**. PR16 therefore proposes; confirming a split requires future M-A09 authority work — `requiresAuthorityDecision = true` documents this dependency on every supported/plausible explanation.
- Risk: ranking is heuristic, NOT calibrated probability.
- Risk: fragmentation bias — mitigated by the emission rule (both identity evidence AND structural fit required), the `SUPPORTED` ceiling on `direct` evidence, the unified-pair exclusion, and contradiction-first-class status.

## 37. Metadata

`metadata` on the payload is optional caller-attached (`MetadataSchema`), never affects identity. `computedAt` is caller-supplied; must be an `ObservedTime` (M-A12).

## 38. API: `generateErSplitExplanations`

```ts
generateErSplitExplanations(input: ErSplitExplanationInput): ErSplitExplanationSet
```

Returns the frozen `ErSplitExplanationSetSchema`-validated set. Throws `ErSplitExplanationError` for §7 failures. Non-throwing epistemic states (empty set) are RESULTS, not errors.

## 39. Frozen status of this document

This document and the V1 constants it references are **frozen** for V1. Any behavioral change bumps `erSplitPolicyVersion` and this document's status. Not intended as legal advice or any kind of guarantee of correctness for real-world investigative outcomes.

---

## §End — Certification Status

| Stage | Status |
|---|---|
| Policy freeze (PR16-1) | THIS COMMIT |
| Contract schemas + tests (PR16-2) | PENDING |
| Runtime scaffold + input/binding (PR16-3) | PENDING |
| Signals: structural/identity/temporal (PR16-4) | PENDING |
| Dedupe + ranking + generation (PR16-5) | PENDING |
| Unit tests (PR16-6) | PENDING |
| PR15-integration tests (PR16-7) | PENDING |
| Platform integration suite (PR16-8) | PENDING — written + typechecked; live execution DEFERRED (Neon DB unreachable — environmental, affects PR13/PR14/PR15 suites identically) |
| Docs + tracker (PR16-10) | PENDING |
| **Final status** | **IN PROGRESS** |