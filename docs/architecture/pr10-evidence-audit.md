# PR10 — Next-Best-Evidence / Evidence Utility & Selection: Contract Audit

**Status:** AUDIT ONLY — no implementation performed
**Scope:** "Make a GraphHole actionable by identifying which additional evidence would best discriminate among competing explanations."
**Date:** 2026-09-15
**Branch:** `feat/m-a13-graph-hole-region` (HEAD `f9a3e54`; working tree also carries uncommitted PR9 hardening)

> **Follow-up (same date):** the audit's "READY WITH CONTRACT FREEZE" finding has
> been acted on — the freeze (vocabulary, utility formula/policy, EIG naming,
> discrimination target, selection bounds, selection-result semantics) is
> codified in [`pr10-evidence-policy.md`](./pr10-evidence-policy.md). This audit
> remains the baseline/evidence record for that freeze; the freeze adds no
> runtime behavior.

> The audit distinguishes **documented intent** from **enforced behavior** throughout, and does **not** treat any LLM structured output as authoritative. Classifications: **A** existing/reusable · **B** existing but underspecified · **C** conflicting/fragmented · **D** missing contract · **E** implementation gap.

---

## 1. Executive Summary

The Phase 5A pipeline already produces nearly every *input* that next-best-evidence selection needs, and the core *output contract* (EvidenceRequest) already exists in strict, versioned form. What PR10 is missing is not the raw building blocks — it is (a) a **coherent evidence-type vocabulary** across the pipeline, (b) a **frozen utility-composition protocol** (the actual `score` formula), and (c) any **implementation** (no runtime computes utility, no store, no lifecycle).

The single most important positive finding: **PR5 already computes a deterministic, policy-versioned expected-information-value (`expectedInformationValue`)** over frozen components (`uncertaintyPotential` 0.50 / `hypothesisCoverage` 0.30 / `evidenceDiversity` 0.20; `packages/intelligence/graph-hole-qualification/src/scoring.ts:30-46`), consumed by `CandidateAnalysisSchema.expectedInformationValue`, `QualifiedGraphHoleCandidate.expectedInformationValue`, and later by gap classification *web fixtures only* — never by a gap-classification runtime.

The single largest gap: **`EvidenceUtilitySchema`'s `score` ("Combined utility score") has no defined composition anywhere** (`packages/contracts/src/domain/evidence-request.ts:31-47`). Every utility object in the repo is a hand-set web fixture (`packages/web/src/lib/providers/real-case/case-a.ts:673`, `case-b.ts:709`, `demo/demo-fixtures/evidence-requests.ts:26`). `phase-tracker.md:286` confirms: *"web NBE mock (`netUtility` card) + `ExpectedInformationGainSchema` contract; no utility algorithm — NOT milestone completion."*

**Readiness recommendation: READY WITH CONTRACT FREEZE.** The contract surface is close enough that PR10 implementation can begin **after** the (small) freeze list in §15 — most critically: propagate the canonical evidence-type vocabulary, define the utility `score` composition, and resolve the expected-information naming drift (§5, C1). Nothing in this audit requires blocking on unsupported "presumed" contracts; the required contracts exist or are trivially freezeable.

---

## 2. Areas Inspected

- **Contracts package:** `common/confidence.ts` (score schemas incl. `ExpectedInformationGainSchema`), `domain/evidence.ts`, `domain/evidence-request.ts`, `domain/investigative-gap.ts`, `domain/relation.ts`, `intelligence/evidence-ranking.ts`, `intelligence/gap-classification.ts`, `intelligence/graph-holes.ts`, `intelligence/graph-hole-candidate.ts`, `intelligence/graph-hole-qualification.ts`, `intelligence/graph-hole-region.ts`, `intelligence/graph-hole-policy.ts`, `intelligence/route-stage.ts`, `intelligence/graph-hole-persistence.ts`, `agent/agent-decisions.ts`. Docs: `uncertainty-model.md`, `evidence-model.md`, `scoring-semantics.md`, `graph-hole-policy.md`.
- **Intelligence packages:** hypothesis-context, graph-hole-analysis (`contracts/analysis-v1.ts`, `analysis-policy.ts`, `context/*`), graph-hole-validation (PR8), graph-hole-judge (PR9 gate), graph-hole-qualification (`scoring.ts`, `ranking.ts`, `orchestrate.ts`) and its detection/region siblings (`bounds.ts`, `types.ts`).
- **Infrastructure:** `ai-agent-runtime` structured-output validation (feature-package zod >= provider JSON Schema).
- **Platform:** `prisma/schema.prisma` model inventory (persistence), `graph-hole-store.ts`.
- **Web/demo:** `lib/providers/types.ts` (GapProvider surface), `real-case/phase1.ts`, `real-case/phase2.ts`, `demo-fixtures/*`, NBE `netUtility` card.
- **Roadmap:** `development-plan.md` (§5.1, §5.4 intelligence API, §9A/9B, §21 ownership, §22 skim), `phase-tracker.md` (M-A12 audit, P5A-7, P7, §5A/5B), `README.md`.
- **PR9** (integration boundary): `graph-hole-judge`, `docs/architecture/pr9-llm-judge*.md`, policy constants.

Verification was by direct file read + repo-wide grep; four parallel explore sweeps (contracts / hypothesis-context+analysis+validation / judge+detection+qualification+region+retrieval / persistence+web ranking) were used for discovery and their findings spot-verified above.

---

## 3. Reusable Contracts  (A)

| # | Contract | Location | Why reusable |
|---|----------|----------|--------------|
| A1 | `ExpectedInformationGainSchema` | `contracts/src/common/confidence.ts:70-73` | Canonical [0,1] "expected reduction in uncertainty; normalized heuristic, not calibrated probability" — adopted by 8+ consumers. |
| A2 | `EvidenceRequestSchema` | `contracts/src/domain/evidence-request.ts:49-74` | Strict, complete request record: `gapId`, `hypothesisIds[]`, `evidenceType`, `description`, nested `utility`, `rationale`, `status`, `authorizedBy?`, `resultingEvidenceIds[]`, provenance timestamps. |
| A3 | `EvidenceRequestStatusSchema` | `contracts/src/domain/evidence-request.ts:20-28` | 7-state lifecycle: DRAFT/SUBMITTED/AUTHORIZED/IN_PROGRESS/COMPLETED/REJECTED/CANCELLED — the state machine skeleton. |
| A4 | `EvidenceUtilitySchema` | `contracts/src/domain/evidence-request.ts:31-47` | Field surface: `expectedInformationGain` + `eig` alias, `relevance`, `feasibility`, `cost`, `lambda?`, `score` — a utility **record** (composition undefined, see B2/D3). |
| A5 | `InvestigativeGapSchema.expectedInformationValue` + `evidenceRequestIds` | `contracts/src/domain/investigative-gap.ts:77,83` | The gap→request link already exists at contract level; `GapPrioritySchema` freezes LOW/MEDIUM/HIGH/CRITICAL. |
| A6 | PR5 EIV formula + components | `qualification/src/scoring.ts:30-46`; `contracts/src/intelligence/graph-hole-qualification.ts:95-103` | **Only deterministic EIG computation in the codebase**: `EIV = 0.50·uncertaintyPotential + 0.30·hypothesisCoverage + 0.20·evidenceDiversity`, frozen weights, `normalizeScore()` clamp01+round6, order-independent sums. |
| A7 | `CandidateAnalysisSchema.expectedInformationValue` (+ `evidenceSupportScore`, `significance`) | `contracts/src/intelligence/graph-hole-candidate.ts:131-138` | Candidate-level deterministic EIV, E-value support, and prioritization — PR10's primary scoring input. |
| A8 | `QualifiedGraphHoleCandidateSchema` | `contracts/src/intelligence/graph-hole-qualification.ts:117-145` | Qualified + ranked candidate with score components, failure reasons, `regionStatus`, `scoringPolicyVersion`. |
| A9 | `GapClassificationResultSchema.expectedInformationValue` + `suggestedActions` | `contracts/src/intelligence/gap-classification.ts:51-66` | Gap-level EIV + suggested action surface. |
| A10 | `RouteStageCandidate.score` (EIG) + `estimatedEffort` | `contracts/src/intelligence/route-stage.ts:37-50` | Reuses EIG schema for stage scoring; `estimatedEffort` LOW/MEDIUM/HIGH = a coarse feasibility primitive. |
| A11 | `GraphHoleAnalysisV1.recommendedEvidence` + `alternativeExplanations` | `graph-hole-analysis/src/contracts/analysis-v1.ts:237-245, 288` | **Auditable, LLM-proposed evidence recommendations** (open-string `evidenceType`, see B6) and **competing explanations** — the "discriminate among competing explanations" evidence trail. |
| A12 | `GraphHoleSchema.suggestedEvidenceTypes` | `contracts/src/intelligence/graph-holes.ts:88` | Structural detector's evidence-type suggestion (free strings, see B3). |
| A13 | `EvidenceTypeSchema` | `contracts/src/domain/evidence.ts:25-34` | Canonical 8-value enum: DOCUMENT/RECORD/TESTIMONY/PHYSICAL/DIGITAL/FINANCIAL/COMMUNICATION/OTHER. |
| A14 | Evidence posture tiers T0–T3 | `contracts/docs/evidence-model.md:35-49` | Documented posture/strength semantics for Evidence packages. |
| A15 | `GraphHoleCandidateIdentityV1Schema` + `canonicalizeGraphHoleCandidateIdentity` | `contracts/src/intelligence/graph-hole-candidate.ts:54-78` | Deterministic candidate identity (basis for gap/request correlation and idempotency). |

---

## 4. Evidence-Type Vocabulary  (B3, C3, D1, E)

**Finding 4A (B3): `EvidenceRequestSchema.evidenceType` is a free-form string.** `contracts/src/domain/evidence-request.ts` — the domain has a canonical `EvidenceTypeSchema` (`domain/evidence.ts:25-34`) yet the request contract does not reference it. `RecommendedEvidenceSchema.evidenceType` (`analysis-v1.ts:238`) is likewise a string, as is `EvidenceRankingResultSchema.type` (`evidence-ranking.ts:43`).

**Finding 4B (C3): actually four vocabularies are in circulation.**
1. `EvidenceTypeSchema` enum (8 canonical values) — `domain/evidence.ts`.
2. `GraphHoleSchema.suggestedEvidenceTypes: z.array(z.string())` — free strings ("federal response letter", "task force routing record", etc. in `web/src/lib/providers/real-case/case-a.ts:585`, `contracts/tests/graph-hole-contracts.test.ts:56`).
3. `RecommendedEvidenceSchema.evidenceType` — open string ("matches repository evidence vocabulary").
4. `EvidenceRankingResultSchema.type` — open string.

**Finding 4C (D1): no shared, versioned `EvidenceTypeVocabularySchema`.** The canonical enum is not wired into the pipeline contracts, so nothing enforces that a recommended/requested evidence type belongs to the canonical set.

**Finding 4D (E1): no normalization/validation path converts free-form suggestions to canonical enum** (web fixtures bypass the enum entirely; the PR8 validator checks evidence *classification* codes, not evidence-type vocabulary membership).

---

## 5. EIG Findings  (A1, B2, C1)

**Finding 5A (A1): `ExpectedInformationGainSchema` is the canonical numeric contract.** `z.number().min(0).max(1)` with doc string "Expected reduction in uncertainty. Normalized heuristic, not calibrated probability." (`common/confidence.ts:70-73`); documented semantics in `uncertainty-model.md:56-61` (used in *investigative gaps, evidence requests, route staging*). Exported via `contracts/index.ts`.

**Finding 5B (C1): three field names denote the same heuristic.**
- `expectedInformationValue` — `InvestigativeGap` (:77), PR5 candidate/qualified candidate (`graph-hole-candidate.ts:135`, `graph-hole-qualification.ts:129`), `GapClassificationResult` (:58), `route-stage` counter `score` (:39).
- `expectedInformationGain` — `EvidenceUtilitySchema` (`evidence-request.ts:32`), `AgentDecision` (`agent/agent-decisions.ts:42`).
- `eig` — alias field on `EvidenceUtilitySchema` (:34).

`PR5`'s own comment explicitly distances the runtime value from "information gain" semantics (`scoring.ts:32`: "NOT a calibrated information-theoretic quantity and NOT 'information gain'") while the request contract couples `expectedInformationGain` ≡ `eig` — a naming/semantics drift that a PR10 calculator must resolve before it is frozen.

**Finding 5C (B2): semantics are documentation-only, not machine-enforced.** The schema constrains range only; nothing rejects a value described as a calibrated probability. Consistent with the rest of the codebase (docs carry the epistemic warnings, timing them into enforcement is a PR10 decision, not this audit's).

**Finding 5D (A6): the only computed EIG is PR5's.** Repo-wide grep: `expectedInformationValue` is *computed* only at `qualification/src/scoring.ts` (consumed via `orchestrate.ts:184-200` and persisted by `platform/persistence/graph-hole-store.ts:301`); all other occurrences are contract fields or web fixtures. No EvidenceRequest in the repo has a computed utility.

---

## 6. Competing-Hypothesis Findings  (A11, B7)

**Finding 6A (A11): competing explanations exist in the PR7 output.** `GraphHoleAnalysisV1.alternativeExplanations` (`analysis-v1.ts:199-214`, :288) captures title/description + supporting/contradicting observation IDs + referenced hypothesis IDs + analyst `uncertainty` ("not a probability of fact"); `MissingRelationshipSchema` (`:177-197`) captures the directional expectation and support/contradiction sets.

**Finding 6B: discrimination signal is also latent in PR5's EIV formula.** `uncertaintyPotential = 1 − |2·supportBalance − 1|` peaks when supporting/contradicting evidence is *balanced* (`scoring.ts:33-38`) — i.e., the "which evidence would best discriminate" heuristic already exists deterministically at candidate level.

**Finding 6C (B7): the analysis `uncertainty` [0,1] on alternatives has no defined aggregation** for picking among hypotheses, and `RecommendedEvidenceSchema` references `supportingObservationIds` only (no `contradictingObservationIds`, no targeted-hypothesis field) — recommendations cannot currently express *which* competing explanation they discriminate. This is a PR10 freeze-time consideration (§15 F7).

---

## 7. Utility-Primitive Inventory  (A4, B1, D2, E)

| Primitive | Present as | Computed? | Classification |
|-----------|-----------|-----------|----------------|
| `expectedInformationGain` / `eig` | contract field (`evidence-request.ts:32,34`) | No — web fixtures only | B1 |
| `relevance` [0,1] | contract field (:36) | No | B1 |
| `feasibility` [0,1] | contract field (:38) | No | B1 |
| `cost` [0,1] | contract field (:40) | No — no derivation semantics | B1/D3 |
| `lambda?` [0,1] | contract field (:42) | No — semantics undefined | D2 |
| `score` "Combined utility score" | contract field (:44) | **No composition anywhere** | **D2 (core gap)** |
| `expectedInformationValue` (PR5) | computed EIV 0.50/0.30/0.20 | Yes — deterministic, policy-versioned | A6 |
| `estimatedEffort` LOW/MEDIUM/HIGH | route-stage (:46) | No — static | B1 |
| `AlternativeExplanation.uncertainty` | analysis-v1.ts:211 | No — LLM-proposed | B2 |

**Finding 7A (D2 — the core missing contract): no utility-composition protocol.** There is no definition of how `relevance`, `feasibility`, `cost`, and EIG combine into `score`, no weight schema, no policy version stamp, and no provenance of components. PR5 demonstrates the house pattern to copy (frozen weights + `scoringPolicyVersion` + per-component breakdown + `normalizeScore`) but PR10 has nothing equivalent.

**Finding 7B (E): no runtime computes any utility primitive.** Every value in `case-a.ts:673`, `case-b.ts:709`, `demo-fixtures/evidence-requests.ts:26` is hand-set. `phase-tracker.md:286` explicitly marks "Calculate normalized evidence utility" as NOT milestone completion.

**Finding 7C (B1): `ScoreComponentsSchema` in PR5 mixes evidence-support and EIV components; the utility contract would need its own component record, not a reuse of `ScoreComponents`.**

---

## 8. GraphHole/Context Input Inventory  (A8, A11, A12)

What a PR10 selector would actually receive today, in pipeline order:

1. **PR4 detected candidate** — `RawGraphHoleCandidateSchema` + `GraphHoleCandidateIdentityV1Schema` (`graph-hole-candidate.ts:54-68`); `GraphHoleSchema` with `type`, `expectedEdgeType` (`RelationTypeSchema`), `significance`, `suggestedEvidenceTypes` (free strings).
2. **PR5 qualified candidate** — `QualifiedGraphHoleCandidateSchema` (`graph-hole-qualification.ts:117-145`): `structuralScore`, `evidenceSupportScore`, `expectedInformationValue` (computed), `significance`, `scoreComponents`, deterministic `rankingKey`, `regionStatus`, `scoringPolicyVersion`.
3. **PR0/domain gap** — `InvestigativeGapSchema` (`investigative-gap.ts:66-92`): `type`, `status`, `priority`, `impact`, optional `expectedInformationValue`, `relatedEntityIds`, `relatedHypothesisIds`, optional `evidenceRequestIds`.
4. **PR7 analysis (LLM-proposed, non-authoritative)** — `GraphHoleAnalysisV1`: `candidateAssessment`, `missingRelationship` (support/contradict observation IDs), `alternativeExplanations`, `reasoning` steps, `recommendedEvidence`, `uncertainty`, closed-vocabulary `warnings`.
5. **PR8 validated analysis** — deterministic validator output (reference integrity, claim grounding, epistemic safety), 112 tests.
6. **PR9 gate** — deterministic judge-policy acceptance (`docs/architecture/pr9-llm-judge*.md`).

Missing from the input inventory for a bounded selector: a **gap→hypothesis discrimination target** (which alternatives to discriminate — present only as analysis alternatives, not as a structured selection input) and a **conflict/duplicate guard** across multiple gaps recommending the same evidence in the same run (§13).

---

## 9. Authority & Determinism  (A15, E2, D6)

**Finding 9A: the authority boundary is healthy and PR10-compatible.**
- LLM proposes: `GraphHoleAnalysisV1` (PR7) is explicitly model-authorable surface, but every reference is an ID into the supplied bounded context; `analysis-policy.ts` stamps schema version.
- Determinism gates: PR8 = pure, 0-LLM closed-world validator (11 frozen finding codes, 15 categories, reference existence + canonical re-serialization + epistemic safety), 112 tests. PR9 = deterministic judge adjudication "The LLM proposes a structured quality assessment. The deterministic PR9 policy decides." (v2 gate, frozen floors/weights, `evaluateJudgeDecision`).
- Deterministic identity: `canonicalizeGraphHoleCandidateIdentity` / SHA-256 candidate id.

**Finding 9B (E2): EvidenceRequest authorization is NOT enforced.** `EvidenceRequestStatusSchema` includes `AUTHORIZED` and the status lifecycle, `development-plan.md` §9B lists "human approval for request" and `WAITING_FOR_EVIDENCE`, but **no model, no store, no state machine, and no enforcement** exist — a request can never leave DRAFT in-app. Demo statuses are fixture-only (`phase-tracker.md:285`).

**Finding 9C (D6): PR10 itself would introduce the first cross-package "selection" authority, with no existing bound contract to inherit** (see §13).

**Conclusion:** PR10 should compute `score` deterministically from frozen policy (mirroring PR5), treat the LLM's `recommendedEvidence` as a *proposed* input, and enforce `AUTHORIZED → IN_PROGRESS → COMPLETED` via the status machine on a real store.

---

## 10. Feasibility & Cost Semantics  (B1, D3)

**Finding 10A (B1): field-level primitives exist, semantics don't.**
- `EvidenceUtilitySchema.feasibility` [0,1] and `cost` [0,1] — named but unreferenced anywhere outside `evidence-request.ts` (grep: no consumer, no fixture sets them except full utility objects that fill all fields by convention).
- `RouteStageCandidate.estimatedEffort` LOW/MEDIUM/HIGH (`route-stage.ts:46`) — disconnected from the utility `cost` dimension.
- No contract states what `feasibility`/`cost` mean, what inputs derive them, or whether `score` is EIG-only or effort-discounted.

**Finding 10B (D3): no derivation contract.** PR10 would have to define the deterministic feasibility/cost inputs (source coverage, posture, source availability) before the fields become meaningful; the audit flags this as a freeze-time requirement, not an implementation task.

---

## 11. Persistence Ownership  (D4, E2)

**Finding 11A (D4): there is NO EvidenceRequest persistence.** `platform/prisma/schema.prisma` model inventory (verified): InvestigationRun, AgentCheckpoint, ToolExecution, AuditEvent, Artifact, IngestionAttempt, RawExtraction, NormalizedExtraction, Source, Evidence, Observation, EntityMentionCandidate, CandidatePair, EntityHypothesis, Entity, RelationHypothesis, Relation, TemporalStateChange, Case, GraphVersion, Lead, LeadEvidenceLink, LeadEvent, SemanticTextUnit, SemanticEmbedding, GraphHoleRegionAnalysis, GraphHole, GraphHoleDetectorContribution, GraphHoleAssessment. **No `EvidenceRequest`, no `InvestigativeGap`, no `Gap` model.** `graph-hole-store.ts` persists qualified candidates; the InvestigativeGap / EvidenceRequest layer is absent.

**Finding 11B (E2): no EvidenceRequest CRUD/lifecycle runtime.** Matches `phase-tracker.md:285` ("web/demo lifecycle exists (`buildEvidenceRequest`, fixtures) + `EvidenceRequestSchema`; backend generation absent").

**Finding 11C: ownership is unambiguous** — `development-plan.md:668` maps "Evidence planner → Mayur → EvidenceRequest"; PR6 demonstrated the Prisma + store pattern the EvidenceRequest store should follow.

---

## 12. PR9 Integration Findings

**Finding 12A: PR9 provides the required "is the analysis trustworthy enough to act on" gate that bounds PR10's inputs.**
- `QualifiedGraphHoleCandidate` → PR7 analysis → **PR8 deterministic validation** → **PR9 judge-policy acceptance** are the only surfaces a PR10 selector should consume.
- PR9's frozen dimensions (Expected Gain / Reasoning Coherence / Evidence Foundation / Utility Clarity / Grounding Quality / Analytical Confidence; HARD_FLOOR EG .70 / ED .90 / UC .70; QUALITY_FLOOR RC / GQ / AC .60; OVERALL_MIN_SCORE .70; v2 policy) already reject low-quality analyses before any evidence-request generation could read them.

**Finding 12B: the PR9 `Utility Clarity` dimension is the closest existing "utility" adjudication** and is qualitatively distinct from a computed PR10 `score`; PR10 must not overload PR9's terminology.

**Finding 12C: the pipeline is complete and green** (99/99 nucleus tests; 112 PR8 tests; PR9 v2 gate shipped; all docs updated) — PR10 implementation would sit downstream with zero PR9-modification required.

---

## 13. Bounds & Anti-Abuse Findings  (A, D6)

**Existing bounds a PR10 selector inherits:**
- Detection bounds: `DetectorBoundKindSchema` = PAIR_EVALUATIONS / TRAVERSAL_QUERIES / CANDIDATES / COMMUNITIES_ABSENT (no CHAIN_EVALUATIONS); `maxChainEvaluationsPerDetector` 2500 (`detection/src/bounds.ts:20`).
- Region truncation: `REGION_TRUNCATING_LIMITATIONS` 7 codes (`region/src/types.ts:41-49`).
- Request bounding: `EvidenceRankingRequestSchema.maxResults` (int 1..100, default 20) (`evidence-ranking.ts:24`); `RouteStageRequestSchema.maxCandidates` (≤ 20, default 5) (`route-stage.ts:33`).
- Determinism discipline: strict zod schemas (unknown keys rejected), frozen policy versions, `normalizeScore` clamp01+round6, sorted reduction, deterministic sorting/ranking keys.
- Embedding pipeline: 10 `EmbeddingErrorCode` values, 3 transient retry codes.

**Finding 13A (D6): PR10 has NO selection bounds of its own yet.** No contract limits: how many evidence requests one gap may spawn (per gap / per run), whether duplicate evidence requests across gaps are deduplicated (via candidate-identity-style hashing), or how many gaps may be selected in one pass. PR10 should freeze these into the use policy before implementation (see §15 F4), reusing the detection bounds style.

**Finding 13B (A): PR10 can inherit proven bound mechanics** (deterministic identity hashing → dedup; closed reason enums; policy-version stamps; sorted-max evaluation guards) without inventing a new anti-abuse framework.

---

## 14. A–E Classification (Complete Matrix)

**A — Existing and reusable (15):** A1 `ExpectedInformationGainSchema` · A2 `EvidenceRequestSchema` · A3 `EvidenceRequestStatusSchema` · A4 `EvidenceUtilitySchema` · A5 `InvestigativeGap` link · A6 PR5 EIV formula/components · A7 `CandidateAnalysisSchema.expectedInformationValue` · A8 `QualifiedGraphHoleCandidateSchema` · A9 `GapClassificationResult` · A10 `RouteStageCandidate` · A11 `GraphHoleAnalysisV1.recommendedEvidence`+`alternativeExplanations` · A12 `GraphHoleSchema.suggestedEvidenceTypes` · A13 `EvidenceTypeSchema` · A14 evidence posture T0–T3 · A15 candidate identity canonicalization.

**B — Existing but underspecified (8):**
- B1 Utility primitive fields exist but nothing computes them, and `estimatedEffort` is disconnected from `cost`.
- B2 EIG/analysis semantics are documentation-only (number-range schema only).
- B3 `EvidenceRequestSchema.evidenceType` free string (canonical enum exists but unused).
- B4 `eig` alias (must stay equal to `expectedInformationGain`; no sanity refine).
- B5 `RecommendedEvidenceSchema` lacks `contradictingObservationIds` / targeted-hypothesis discriminator.
- B6 `EvidenceRankingResultSchema.type` free string; dimensionless `score`.
- B7 `AlternativeExplanation.uncertainty` has no aggregation semantics.
- C1 (cross-listed) naming drift (see C1).

**C — Conflicting / fragmented (4):**
- C1 `expectedInformationValue` (PR5/domain/gap-classification/route-stage) vs `expectedInformationGain`/`eig` (evidence-request, agent-decisions) — same heuristic, three field names, PR5 explicitly says its value is *not* "information gain".
- C2 `EvidenceRankingSchema` (`evidence-ranking.ts`) — separate "evidence ranking" result (`score` = "Combined ranking score", free-string `type`) overlaps PR10's discrimination objective under different semantics; risk of consumer conflation.
- C3 Four evidence-type vocabularies (§4): enum vs three free-string surfaces.
- C4 Gap-classification `expectedInformationValue` is required (`gap-classification.ts:58`) but optional on `InvestigativeGap` (`:77`) — requiredness inconsistency between the classifier output and the domain object.

**D — Missing contract (5):**
- D1 No shared/versioned `EvidenceTypeVocabularySchema` wired through the pipeline.
- D2 No utility-composition protocol (`score`, `lambda`, weights, policy version, component provenance) — **core PR10 gap**.
- D3 No feasibility/cost derivation semantics.
- D4 No EvidenceRequest (or InvestigativeGap) persistence model in Prisma.
- D6 No PR10 selection-bounds contract (max requests/gap, cross-gap dedup, per-run caps).

**E — Implementation gap (6):**
- E1 No evidence-utility computation runtime (web mock only).
- E2 No EvidenceRequest lifecycle runtime / store / authorization enforcement.
- E3 `rankEvidenceRequests()` (intelligence API, `development-plan.md:175`) unimplemented; GapProvider exposes only `evidenceRequests(investigationId, query?)` (`web/src/lib/providers/types.ts:937`).
- E4 No gap-classification runtime (so `InvestigativeGap.expectedInformationValue` is never computed) — `phase-tracker.md:281`.
- E5 Evidence-independence tracking unimplemented (`development-plan.md:320`) — EIV diversity depends on it at multi-request selection time.
- E6 Evidence Resolution Rate@K evaluation unimplemented (`development-plan.md:319`; `phase-tracker.md:287`).
- E7 No evidence-type vocabulary normalization (free strings never mapped to `/` constrained to the canonical enum).

---

## 15. Contract-Freeze Changes (Recommended — Schema Only, NOT Implemented Here)

Freeze these *before* any `EvidenceRequest`-generation implementation is merged. Each mirrors an existing house pattern and is a schema/policy change, not new runtime.

- **F1** Add a shared `EvidenceTypeVocabularySchema` (reuse `EvidenceTypeSchema` from `domain/evidence.ts`) and reference it from `EvidenceRequestSchema.evidenceType`, `GraphHoleSchema.suggestedEvidenceTypes`, and `RecommendedEvidenceSchema.evidenceType` (replacing free strings). Resolves B3, B6, C3, D1.
- **F2** Freeze a `GraphHoleEvidenceUtilityPolicyV1`-style record: components (`eig` + `relevance` + `feasibility` + `cost` optional) + frozen weights (`lambda` semantics or removal) + `utilityPolicyVersion` stamp + per-component breakdown + provenance, mirroring PR5 (`graph-hole-qualification.ts:95-109`, `graph-hole-policy.ts`). Resolves D2, B1.
- **F3** Resolve the naming drift: pick `expectedInformationGain` (alias `eig`) as canonical on EvidenceRequest; deprecate `expectedInformationValue` in PR10-facing fields or map explicitly; document PR5's value as a *component input*, not the same quantity. Resolves C1, C4.
- **F4** Add PR10 selection-bounds contract (maxEvidenceRequestsPerGap, maxGapsPerSelectionRun, cross-gap dedup rule keyed on candidate identity hash, deterministic sort tokens) reusing the detection bounds style. Resolves D6, 13A.
- **F5** Add `NextBestEvidenceSelectionSchema`: per-gap ranked outcomes `{ gapId, evidenceRequestIds, discriminatesAgainst: hypothesisId/groupId refs, utilityBreakdown, boundReason? }` as the PR10 output/documented result surface. Resolves D5, B5.
- **F6** Document feasibility/cost derivation semantics (what makes an evidence type feasible/expensive deterministically) without implementing the calculator. Resolves D3.

---

## 16. Explicit "Do Not Implement Yet" List

AUDIT ONLY — the following are deliberately left **unimplemented**:

1. No new utilities / score calculators, no `NextBestEvidence` algorithm, no EIG computation anywhere (E1).
2. No Prisma models or migrations for EvidenceRequest / InvestigativeGap (D4, E2).
3. No new packages, no new intelligence API endpoints, no `rankEvidenceRequests()` (E3).
4. No normalization of evidence-type free strings to the canonical enum in existing fixtures (E7, 4D).
5. No reuse of `EvidenceRankingSchema` as the PR10 selection contract; its semantics are separate and untouched (C2).
6. No change to PR5 scoring/ranking, PR8 validation, or PR9 judge policy behavior.
7. No reinterpretation of any score (EIG, `significance`, `EvidenceRankingResult.score`, analyst `uncertainty`) as a probability or calibrated confidence.
8. No gap-classification runtime, evidence-independence tracking, or Resolution Rate@K (E4, E5, E6) — these are adjacent Phase-5A milestones, not PR10 prerequisites.
9. Nothing beyond the §15 schema/policy freeze may be committed as if implemented.

---

## 17. PR10 Implementation Dependency Graph (Desired Order, Unimplemented)

```
[PR4 detection]            raw candidate + suggestedEvidenceTypes (free)
      │
[PR5 qualification]        expectedInformationValue (computed, policy-V)  ← A6
      │
[PR0 gap classification]   InvestigativeGap (type/priority/impact, EIV?)    ← E4 runtime missing
      │
[PR7 analysis]             alternativeExplanations + recommendedEvidence (proposed)  ← A11
      │
[PR8 validation]           deterministic closed-world validator             (green)
      │
[PR9 judge gate]           deterministic accept/reject                     (green)
      │
      └────────────► [PR10 selection layer]        BLOCKED ONLY BY §15 FREEZE
                         │  inputs: A6 EIV, A7 score components, A11 recommendations,
                         │          frozen EvidenceType vocabulary (F1),
                         │          utility policy (F2), bounds (F4)
                         ▼
                    NextBestEvidenceSelection (F5) + EvidenceRequest
                         │  status machine A3 / A2
                         ▼
                    [PR6-style store]  EvidenceRequest model (D4 — after freeze)
                         │
                    Evidence independence (E5) → Resolution Rate@K (E6)  [adjacent milestones]
```

Order enforced by the freeze: **F1 (vocabulary) → F2 (utility protocol) → F3 (naming) → F4 (bounds) → F5 (selection output) → F6 (feasibility/cost semantics)** must land as schema + policy only; only then may the selection runtime, store, and lifecycle be implemented. PR9/PR8 sit upstream and unchanged.

---

## Appendix — Verification Notes

- Repo-wide `ExpectedInformationGain` / `expectedInformationValue` / `expectedInformationGain` / `eig` grep (90 hits) enumerated for §5/§7.
- Prisma model inventory verified by direct read (`platform/prisma/schema.prisma`).
- `rankEvidenceRequests` appears only in `development-plan.md:175` (intelligence API list) and `phase-tracker.md`; the web `GapProvider` exposes `evidenceRequests(investigationId, query?)` only.
- All web utility objects are hand-set fixtures; no computed utility exists (grep: no `score` derivation).