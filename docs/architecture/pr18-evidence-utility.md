# Phase 5A-PR18 — Evidence Utility Calculation & Next-Best-Evidence Selection

> **Status: CERTIFIED WITH DOCUMENTED LIMITATIONS** — candidate-driven utility runtime implemented + verified (unit + real-chain integration); real-Postgres execution `DEFERRED — ENVIRONMENTAL` (Neon unreachable, affects PR13–PR18 suites identically).
>
> **One-line claim:** PR18 scores, ranks, and selects the candidate evidence requests PR17 already generated, using the FROZEN PR10 evidence-utility policy. It never generates candidates (PR17), never re-implements the utility formula or identity (PR10), never evaluates evidence independence (PR19), never evaluates Resolution Rate@K (PR20), never acquires evidence, and never authorizes.

---

## 1. Mission

> **Among the candidate evidence requests already generated (PR17), which ones provide the greatest expected investigative utility under the frozen V1 policy?**

```text
GraphHole
   ↓
PR14 Gap Classification
   ↓
PR15 Competing Explanations
   ↓
PR16 ER-Split explanation
   ↓
PR17 Candidate Evidence Requests
   ↓
PR18 Evidence Utility  <-- this PR
   ↓
deterministic ranked / selected evidence requests
```

PR18 answers *"What is most useful to investigate?"* It proposes a ranked selection. It does not decide truth.

## 2. Ownership

- **PR17** generates candidates. **PR18** scores/selects candidates. **PR19** evaluates evidence independence. **PR20** evaluates Resolution Rate@K.
- The frozen utility policy, formula, identity, and ranking order are **PR10-owned**. PR18 **imports** them — it does not re-implement, re-derive, or fork them. There is exactly one utility policy owner (`@indago/next-best-evidence` + `@indago/contracts` `EVIDENCE_UTILITY_POLICY_V1`).

## 3. PR17 input

PR18 consumes the **real PR17 output** — `CandidateEvidenceRequest[]` from `generateCandidateEvidenceRequests` — plus a bounded closed-world projection of the certified PR14/PR15/PR16 chain (see §20 API). It never invents candidates, never re-hashes request identity, and never fabricates a candidate representation.

## 4. PR10 contract reuse

Reused verbatim (imported, not copied):

- `EVIDENCE_UTILITY_POLICY_V1` (weights, cost inversion, clamp01+round6, rank order) — `@indago/contracts`.
- `computeEvidenceUtility` (frozen weighted composition + typed component validation) — `@indago/next-best-evidence`.
- `computeExpectedInformationGain`, `computeEvidenceRelevance`, `computeEvidenceFeasibility`, `computeEvidenceCost` — the deterministic component derivations.
- `canonicalizeNextBestEvidenceRequest` — the single request-identity function (dedup key).
- `compareRankedCandidates` + `EVIDENCE_UTILITY_RANK_ORDER` — the frozen ranking.
- `isCoveredByExistingEvidence` — the fail-closed existing-evidence exclusion.
- `MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP` / `MAX_EVIDENCE_REQUESTS_PER_GAP` — the selection bounds.
- `NextBestEvidenceCandidateSchema` — the output seam.
- Typed `NextBestEvidenceError` — the failure surface.

## 5. Utility formula

```text
effectiveCost = 1 - cost
score = clamp01( round6(
    0.40 * expectedInformationGain
  + 0.25 * relevance
  + 0.20 * feasibility
  + 0.15 * effectiveCost ))
```

Weights sum to exactly **1.00** (frozen in `EVIDENCE_UTILITY_POLICY_V1`). Rounding = 6 decimal places. Verified by 5 independently hand-calculated fixtures (see `tests/pr18/formula.test.ts`). Note: the value `0.785` in earlier draft text was a typo; the correct independent calculation for `EIG=0.80, relevance=0.70, feasibility=0.90, cost=0.20` is **0.795** (0.32 + 0.175 + 0.18 + 0.12).

## 6. EIG semantics

Reuses PR10's `computeExpectedInformationGain`: a normalized V1 heuristic in `[0,1]` — **not** a probability, not an information-theoretic entropy reduction, not a posterior. For a candidate, the discrimination target is its **hypothesis ids** (`CandidateEvidenceRequest.hypothesisIds`, the canonical UUIDs PR17 derived from the explanations' supporting derivedIds). EIG blends discrimination breadth (targets / represented hypotheses), average uncertainty, and unresolved-target ratio against per-hypothesis support/contradict signal counts built from the bound PR15/PR16 explanation sets. Empty target ⇒ EIG = 0 (fail-closed).

**`expectedInformationValue` (PR5, candidate-level) ≠ `expectedInformationGain` (PR18, request-level).** They are distinct signals and are never aliased or substituted.

## 7. Relevance

Reuses PR10's `computeEvidenceRelevance` over deterministic structured signals: gap-expectation link, discrimination breadth, observation grounding (how many of the candidate's supporting observation refs resolve in the supplied context), and per-target temporal fit. No hidden or invented relevance model.

## 8. Feasibility

Reuses PR10's `computeEvidenceFeasibility`: `0.70 * typeBaseline + 0.30 * sourceAvailability`. When no source-availability override is supplied, the frozen neutral `MISSING_SOURCE_AVAILABILITY` (0.5) applies — **never** an assumed maximum. No external/provider/live lookup. Feasibility is **not** authorization (a highly feasible request may still require human approval / legal process / source authorization).

## 9. Cost

Reuses PR10's `computeEvidenceCost`: `0.70 * typeBaseline + 0.30 * (1 - accessibility)`, with the frozen neutral accessibility default. Higher cost = more burden; lower cost = higher utility. Cost is **never** inferred from importance, risk, probability, GraphHole score, or evidence strength.

## 10. Normalization / rounding

Every component is validated finite and within `[0,1]` by `computeEvidenceUtility` (typed `NAN_OR_INFINITE_COMPONENT` / `OUT_OF_RANGE_COMPONENT` — never silent clamping, never zeroing an invalid score). The final score is always **recomputed** by the frozen formula from validated components; an externally supplied `score` is never trusted. Output transform: `clamp01` then `round6`.

## 11. Ranking

Deterministic total order per the frozen `EVIDENCE_UTILITY_RANK_ORDER`:

```text
SCORE_DESC → EXPECTED_INFORMATION_GAIN_DESC → RELEVANCE_DESC
→ FEASIBILITY_DESC → CANONICAL_REQUEST_KEY_ASC
```

The final canonical-key step makes the order total. Input order never matters — ranked output is byte-identical for any input permutation (no array-position tie-breaker).

## 12. Deduplication

Dedup by the **PR10 canonicalRequestKey** (the single source of truth — never re-hashed, never text-based). PR17 candidates that collapse to the same identity merge their explanation/provenance (source explanation ids, supporting/structural ids); a non-duplicate with distinct identity is kept even if wording is similar.

## 13. Selection

After scoring + ranking, the bounded top-N (`MAX_EVIDENCE_REQUESTS_PER_GAP`) is selected. `consideredCount` (distinct candidates considered) and `rankedRequests` (selected) are **distinct** concepts and both surfaced. A request not selected is still a valid candidate unless it failed validation.

## 14. Truncation

`truncated` is surfaced (on the result and in accounting) when either the upstream candidate set exceeds the PR10 consider cap (defensive; PR17 already caps at 10) or the selected set exceeds `MAX_EVIDENCE_REQUESTS_PER_GAP`. A truncated selection is described as "best among considered candidates", never "best possible evidence". Truncation is never silent.

## 15. Identity

The request identity is **exactly** PR17's / PR10's `canonicalRequestKey`. PR18 does not re-hash, add an identity layer, generate a second key, or use description text as identity.

## 16. Temporal behavior

Temporal scope is respected in relevance (per-target temporal fit). `computedAt` is a required, caller-supplied ISO-8601 UTC value — **no wall clock**. `updatedAt` is never treated as domain time.

## 17. Provenance

Every ranked request carries its structured utility components (`expectedInformationGain`/`eig`, `relevance`, `feasibility`, `cost`, `score`) so an engineer can manually reproduce the score from the inputs + frozen formula. Candidate→gap→explanation(s)→components→score→rank is traceable via `canonicalRequestKey`, `sourceExplanationIds`, and the utility record.

## 18. Case / GraphVersion isolation

PR18 consumes one closed-world context per invocation; every candidate must address the evaluation `gapId` (else typed `INCONSISTENT_GAP_ID`), and every discrimination/source explanation id must be in the bound represented set (else typed `CONTEXT_MISMATCH`). Cross-case/version context is enforced by the single closed-world boundary — never a whole-case search, never a silent current-version substitution.

## 19. Persistence

PR18 is **PERSISTENCE-FREE**. It reuses PR10's non-persisting selection semantics; it does not create a second evidence-request store and does not treat a recommendation as acquisition. (Persistence remains a platform/lifecycle concern.)

## 20. API

`@indago/next-best-evidence` exports:

- `selectBestEvidenceFromCandidates(input: CandidateEvidenceSelectionInput): CandidateEvidenceSelectionResult` — the PR18 entry.
- `buildDerivedCandidateContext(ctx): DerivedCandidateContext` — bounded lookups.
- `scoreCandidate(candidate, deps)` — per-candidate scoring (reused component path).
- Types: `CandidateEvidenceSelectionInput`, `CandidateUtilityContext`, `RankedCandidateRequest`, `CandidateSelectionAccounting`, `RepresentedExplanation`.

Input: `{ investigationId, gapId, candidateRequests: CandidateEvidenceRequest[], context: CandidateUtilityContext, existingEvidence?, sourceAvailabilityByType?, sourceAccessibilityByType?, policyVersion: 'v1', computedAt: ObservedTime }`.

`CandidateUtilityContext` is the certified-chain projection (gap temporal scope, gap-expectation derivedIds, represented explanations' hypothesis signals, represented explanation ids, observations) — derived from the real PR14/PR15/PR16 chain, never fabricated.

## 21. DB limitation

`DEFERRED — ENVIRONMENTAL`. A real-Postgres integration suite (`packages/platform/tests/integration/pr18-evidence-utility.integration.test.ts`) is committed with the clean-skip guard; it exercises the full PR14→15→16→17→18 chain over persisted production shapes when `TEST_DATABASE_URL` is reachable and cleanly defers when it is not (same convention as PR13–PR17).

## 22. PR19 handoff

PR18 emits a ranked/selected set where each request exposes `utility` and provenance. PR19 (evidence independence) consumes that seam to adjudicate non-redundancy; PR18 does **not** implement independence (different ids ≠ independent; only PR10's exact-duplicate rule is applied here).

## 23. PR20 handoff

PR18 knows nothing about Resolution Rate@K; the ranked/selected seam is the input surface PR20 will evaluate resolution against.

## 24. Out of scope (frozen)

PR18 does not implement: PR19 evidence independence, PR20 Resolution Rate@K, PR21 5C integration, evidence acquisition, human approval, `WAITING_FOR_EVIDENCE`, 5B evidence job, source authorization, LLM ranking, new evidence-request generation, new identity scheme, or the evidence-request lifecycle.

**Preserved distinction:** `expectedInformationValue ≠ expectedInformationGain`.