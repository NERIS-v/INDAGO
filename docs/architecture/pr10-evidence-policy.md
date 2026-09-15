# PR10 — Next-Best-Evidence / Evidence Utility & Selection: Contract Freeze

> Phase 5A-PR10. **Status: FROZEN (Contract + Policy only).**
> This document codifies the semantics a future PR10 implementer MUST build against.
> It does **not** implement any runtime behavior.

Baseline audit: [`docs/architecture/pr10-evidence-audit.md`](./pr10-evidence-audit.md).

---

## 1. Purpose

Freeze the contracts and policies for PR10 — *next-best-evidence request
selection* — so that a future engineer can implement the feature **without
inventing any semantics**. Six areas are frozen:

| Area | Concern |
| --- | --- |
| F1 | Canonical evidence-type vocabulary |
| F2 | Useful-composition policy + utility formula |
| EIG | `expectedInformationGain` naming/semantics (distinct from PR5 EIV) |
| F3 | Discrimination target of a proposed request |
| F4 | Selection bounds + deduplication identity |
| F5 | `NextBestEvidenceSelectionResult` semantics |
| F6 | Feasibility / cost component semantics |

This freeze changes **Zod contracts, policy constants, and contract docs
only**. It is deliberately silent on runtime calibration, generation,
acquisition, authorization, persistence, and lifecycle — those are future
implementation work (see [§15](#15-non-goals-and-future-runtime-requirements)).

---

## 2. EvidenceRequest vs SelectionResult — the two-level contract

PR10 distinguishes two levels (frozen in `packages/contracts/src/intelligence/
next-best-evidence.ts`):

- **`NextBestEvidenceCandidate`** — *"what evidence should potentially be
  requested?"* A candidate request **before** selection/acquisition/
  authorization. Carries `canonicalRequestKey`, `gapId`, `hypothesisIds`,
  `evidenceType`, `discriminatesAmongIds`, `utility`, `rationale`.
- **`NextBestEvidenceSelectionResult`** — *"which candidates were ranked/
  selected for which GraphHole/gap?"* A **deterministic ranked selection
  snapshot** bound to one selection run.

A `SelectionResult` does **NOT** imply that evidence was acquired, that a
request was authorized, that a lifecycle state exists, or that a PR7
`recommendedEvidence` is canonical. It is a transient/analysis-level contract
until the later persistence/lifecycle implementation stores requests. The
selection entry keys are exactly `{ rank, candidateRequest }` — the contract
explicitly refuses implied `authorization` / `acquired` / `status`.

---

## 3. PR5 `expectedInformationValue` vs PR10 `expectedInformationGain`

These are two distinct signals and **must not be conflated**:

- **PR5 `expectedInformationValue`** — candidate/GraphHole-level **deterministic
  decision-value** signal produced by graph-hole qualification, versioned by
  `GRAPH_HOLE_SCORING_POLICY_VERSION` (`'v2'`). This freeze does **not**
  redefine it.
- **PR10 `expectedInformationGain`** — request-level heuristic describing how
  much **one additional evidence request** is expected to discriminate among
  the **explicitly considered competing explanations**.

`expectedInformationValue ≠ expectedInformationGain` **unless a future policy
version deliberately changes that relationship** (documented in
`evidence-utility-policy.ts` and the `EvidenceUtilitySchema` header in
`domain/evidence-request.ts`). The contract rejects `expectedInformationValue`
appearing on a request (strict schemas) so the two never silently mix.

`EvidenceRequestSchema` utility carries the canonical field
`expectedInformationGain`; `eig` is an **alias** with a `superRefine`
enforcement that `eig === expectedInformationGain`.

---

## 4. Vocabulary authority (F1)

The **canonical evidence-type vocabulary** is the domain enum `EvidenceTypeSchema`
(`packages/contracts/src/domain/evidence.ts`):

`DOCUMENT | RECORD | TESTIMONY | PHYSICAL | DIGITAL | FINANCIAL | COMMUNICATION | OTHER`

- `packages/contracts/src/intelligence/evidence-vocabulary.ts` exposes ONE
  versioned frozen **reference** to it — `EVIDENCE_TYPE_VOCABULARY_V1`
  (`version: 'v1'`, `evidenceTypes` mirrors the enum in declaration order). It
  is **not** a second competing enum.
- The canonical identity of an evidence type *is* the enum value. A free-form
  descriptive subtype (e.g. `"federal response letter"`, `"ROC/MCA filing"`) is
  **NOT** an evidence type; specificity lives in free-text
  `description`/`rationale`, never in the evidence-type field.
- A vocabulary revision (new member, split, deprecation) is a **new policy
  version**, never an in-place mutation.

**Surfaces wired to the canonical vocabulary:**

| Surface | Contract |
| --- | --- |
| Evidence request | `EvidenceRequestSchema.evidenceType` → `EvidenceTypeSchema` |
| Graph-hole suggestion | `GraphHoleSchema.suggestedEvidenceTypes` → `z.array(EvidenceTypeSchema).optional()` |
| PR7 recommended evidence | `RecommendedEvidenceSchema.evidenceType` → `EvidenceTypeSchema` (graph-hole-analysis) |
| PR10 selection | `NextBestEvidenceCandidateSchema.evidenceType` → `EvidenceTypeSchema` |

**Not changed (documented):** `EvidenceRankingResultSchema.type` (`intelligence/
evidence-ranking.ts`) stays a free string — it is a historical PR0-era
ranked-evidence record, semantically unsafe to reuse for PR10. Any PR10
ranked-selection surface must use the new `NextBestEvidence*` contracts instead.

---

## 5. Utility components (F2)

`EvidenceUtilitySchema` (`domain/evidence-request.ts`) composes request-level
utility from normalized components, each a heuristic in `[0,1]`:

| Field | Meaning (frozen) |
| --- | --- |
| `expectedInformationGain` | Greater expected reduction of uncertainty among the explicitly considered competing explanations. **NOT a probability; NOT a calibrated information-theoretic quantity.** |
| `relevance` | Stronger direct connection to the GraphHole and the hypotheses being discriminated |
| `feasibility` | Easier / more realistically obtainable within the investigation's authorized scope and practical constraints |
| `cost` | More expensive / burdensome to obtain; normalized heuristic, NOT a monetary value unless a future policy says otherwise |
| `score` | Result of the frozen composition formula (see §6) |

`lambda` is **DEPRECATED**: optional, zero consumers in the repository, no
weight slot, explicitly ignored by the frozen policy, retained only for
strict-parse backward compatibility of legacy payloads.

---

## 6. Exact utility formula (F2)

Frozen in `EVIDENCE_UTILITY_POLICY_V1` (`packages/contracts/src/intelligence/
evidence-utility-policy.ts`):

```
effectiveCost = 1 - cost                     // EVIDENCE_UTILITY_COST_INVERSION
score = clamp01(round6(                      // CLAMP_01 then ROUND_6_DECIMALS
    wEIG * expectedInformationGain
  + wRel * relevance
  + wFeas * feasibility
  + wCost * effectiveCost ))
```

**Weights (sum exactly 1.0):**

| Component | Weight | Justification |
| --- | --- | --- |
| `expectedInformationGain` | **0.40** | PR10's sole purpose is selecting evidence that discriminates among competing explanations — dominant objective |
| `relevance` | **0.25** | A request only helps if it ties directly to the GraphHole + hypotheses being discriminated |
| `feasibility` | **0.20** | Selection must be actionable within authorized scope; hard-but-decisive evidence can still be the right pick |
| `effectiveCost` | **0.15** | Cost chiefly prunes / breaks ties — discriminative evidence over cheap evidence |

The exact weights are frozen; re-calibration is a **new policy version**.

---

## 7. Feasibility / cost semantics (F6)

Frozen as literals in `EVIDENCE_UTILITY_POLICY_V1.semantics`:

- `feasibility: 'HIGHER_FEASIBILITY_EASIER_WITHIN_SCOPE'`
- `cost: 'HIGHER_COST_MORE_BURDEN'` — and the cost **inversion** is explicit:
  `effectiveCost = 1 - cost`, so higher burden *lowers* the utility contribution.

Feasibility is assessed against the investigation's **authorized scope** (what
the investigation can legally/practically obtain), not against infinite
resources. Cost is a normalized burden heuristic — not a monetary value, and
not a calibrated probability.

---

## 8. Discrimination target (F3)

`discriminatesAmongIds` references the **explicitly considered competing
explanations** that the evidence request would help distinguish. It is
**ID-based, never free text**:

- **PR7 analysis level** (`graph-hole-analysis` `RecommendedEvidenceSchema`):
  `z.array(analysisHypothesisIdRef()).optional()` — bounded-context atomic
  hypothesis derivedIds (`atomic:RELATION_HYPOTHESIS:<id>`) from the supplied
  context. The embedded id is the same canonical hypothesis UUID
  (`hypothesis-context/src/atomic.ts`). An LLM recommendation is **not
  authoritative**; selection-level identity/ranking are deterministic.
- **PR10 selection level** (`NextBestEvidenceCandidateSchema`):
  `z.array(HypothesisIdSchema)` — canonical hypothesis UUIDs.

Same-input identity is closed-world; a request is de-duplicated/ranked on its
ID inputs (`gapId`, `evidenceType`, `discriminatesAmongIds`, `hypothesisIds`),
never on its prose.

---

## 9. Selection bounds (F4)

Frozen in `NEXT_BEST_EVIDENCE_POLICY_V1` (`next-best-evidence-policy.ts`):

| Bound | Constant | Value |
| --- | --- | --- |
| Ranked requests per gap | `MAX_EVIDENCE_REQUESTS_PER_GAP` | **5** |
| Gaps per selection run | `MAX_GAPS_PER_SELECTION_RUN` | **10** |
| Candidate requests considered per gap | `MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP` | **25** |

Bounds discipline mirrors `graph-hole-policy.ts`: every bound is a ceiling the
runtime must not silently exceed, and a hit is **always surfaced** as
`truncated: true` on the per-gap selection — never a silent drop.

**Deduplication identity (frozen):**
`NEXT_BEST_EVIDENCE_DEDUP_RULE = 'CANONICAL_EVIDENCE_REQUEST_IDENTITY'` over
inputs `{ gapId, evidenceType, discriminatesAmongIds, hypothesisIds }`.
`canonicalizeNextBestEvidenceRequest` (in `next-best-evidence.ts`) is
order-independent: hypothesis ids are deduped, then inputs are
canonicalized deterministically. The resulting `canonicalRequestKey` is **not**
an `EvidenceRequestId` — no persistent id exists at this contract level.

---

## 10. Ranking / tie-breaking (F2+F4)

`EVIDENCE_UTILITY_POLICY_V1.rankOrder` (enforced length 5) gives the total,
deterministic order. Ties at one step fall through to the next; the final step
is byte-stable, so the order is total:

1. `SCORE_DESC`
2. `EXPECTED_INFORMATION_GAIN_DESC`
3. `RELEVANCE_DESC`
4. `FEASIBILITY_DESC`
5. `CANONICAL_REQUEST_KEY_ASC`

The same order is declared on the bounds policy
(`NextBestEvidenceSelectionBoundsSchema.rankingOrder`) so selector and policy
cannot drift.

---

## 11. PR9 → PR10 authority boundary

- **PR7 analysis** (`graph-hole-analysis`) may *propose* `recommendedEvidence`
  (including `discriminatesAmongIds`) for a gap. These are **proposals**, not
  selections, and are not authoritative for ranking.
- **PR9 judge** and its rejection-criteria tooling are **out of scope** for this
  freeze and are **not modified**.
- **PR10 selection** is the deterministic consumer of the frozen utility policy;
  it ignores prose and uses ID-based identity (above). It must **not** reuse the
  `lambda` affordance or historical `EvidenceRankingResultSchema`.

---

## 12. Persistence boundary

This freeze introduces **no persistence schema**. The selection result is a
transient/analysis-level snapshot; no `<EvidenceRequest>` row is implied. A
future PR (store + lifecycle) owns persistence and will mint real
`EvidenceRequestId`s — at that point `canonicalRequestKey` remains the dedup
identity, distinct from any stored id. M-A12/prisma stores are untouched.

---

## 13. What was frozen (files)

Contracts / policies (`packages/contracts/src/…`):

- `domain/evidence-request.ts` — `evidenceType` → enum; `EvidenceUtilitySchema`
  rewritten (semantic describes, `eig` equality refine, `lambda` deprecated);
  EIV≠EIG header.
- `intelligence/evidence-vocabulary.ts` — NEW `EVIDENCE_TYPE_VOCABULARY_V1` reference.
- `intelligence/evidence-utility-policy.ts` — NEW `EVIDENCE_UTILITY_POLICY_V1`
  (formula, weights, semantics literals).
- `intelligence/next-best-evidence-policy.ts` — NEW `NEXT_BEST_EVIDENCE_POLICY_V1`
  (bounds, dedup rule, ranking order).
- `intelligence/next-best-evidence.ts` — NEW candidate / per-gap / selection-result
  contracts + `canonicalizeNextBestEvidenceRequest`.
- `intelligence/graph-holes.ts` — `suggestedEvidenceTypes` → enum array.
- `src/index.ts` — exports the four new modules.

Analysis surface (`packages/intelligence/graph-hole-analysis/…`):

- `src/contracts/analysis-v1.ts` — `RecommendedEvidenceSchema.evidenceType` →
  enum; optional ID-based `discriminatesAmongIds`.
- `src/index.ts` — exports `RecommendedEvidenceSchema` + type.

Tests: `packages/contracts/tests/pr10-evidence-contracts.test.ts`,
`packages/intelligence/graph-hole-analysis/tests/pr10-discrimination-target.test.ts`.
Fixture updates (canonical vocabulary): `contracts/tests/graph-hole-contracts
.test.ts`, `graph-hole-validation` fixtures + `validate-analysis.test.ts`,
`graph-hole-analysis/tests/analyst.test.ts`, web fall-fixtures and real-case
phase1/phase2 fixtures, web `real-case-phase1.test.ts`.

---

## 14. Verification performed

- Workspace typecheck: `pnpm -r typecheck` — **17/17 packages pass** (incl. web).
- Workspace build: `pnpm -r build` — **all pass** (incl. `next build`).
- Test suites (all green where an environment is available):
  - contracts **365** (incl. 31 new PR10 + updated graph-hole-contracts)
  - graph-hole-analysis **45** (incl. 5 new), graph-hole-validation **112**,
    graph-hole-detection **57**, graph-hole-region **105**, graph-hole-qualification
    **104**, graph-hole-judge **99**, entity-resolution **32**, lead-generation **33**,
    relation-resolution **37**, graphology-projection **42**, web **1172+** (the 1
    fixture-assertion failure found by the freeze was fixed),
    semantic-retrieval **47**, ingestion, hypothesis-context **20**, ai-agent-runtime **105**.
  - platform (`packages/platform`): **204 unit tests pass**; the platform
    integration suites fail to connect to the Neon test database
    (`ep-sweet-morning-…neon.tech:5432` unreachable). This is an
    **environmental** failure identical to the pre-freeze baseline; no platform
    code was touched.

---

## 15. Non-goals and future runtime requirements

Not implemented here (must be built by the future PR10 pass, in dependency order):

1. Utility **calculator** implementing the frozen formula (## 6).
2. **Candidate request generation** for a gap (bounded by
   `MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP`).
3. **Discrimination-aware ranking** per `rankOrder` (## 10), including the
   canonical-key final tiebreak.
4. **Bounded selection** surfaced with `truncated` (## 9).
5. **Persistence / store** minting real `EvidenceRequestId`s (## 12).
6. **Lifecycle + authorization** (draft → authorized/acquired → reuse) —
   explicitly out of the selection snapshot.
7. **Intelligence API** exposing selection to the platform.
8. **Web integration** for proposing/accepting evidence requests.
9. **Resolution Rate@K evaluation harness** to validate the frozen weighing.

Documented follow-ups carried by this freeze: PR8 **reference validation** for
the new `RecommendedEvidenceSchema.discriminatesAmongIds`
(`graph-hole-validation` `validateReferences.ts` enumerates references at
runtime — that pass is out of this freeze's scope and must add the field).