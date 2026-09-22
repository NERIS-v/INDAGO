# INDAGO Benchmark Deep Audit — Pipeline Coverage, Omitted Intelligence, Leakage, Metrics, and Failure Root Causes

**Status:** Formal engineering audit (documentation only). No benchmark, production, or artifact changes made.
**Git SHA:** `7b16c9eb1a774db41403a506ded87c4fa9c7c8b7`
**Benchmark:** `bench:pilot` (`packages/platform/tests/benchmark/run-pilot.ts`), full = 45 packages (15 cases × 3 conditions: CLEAN / NOISY_MISSING / ADVERSARIAL).
**Provenance rules:** CODE > DOCUMENTATION. IMPORTED ≠ EXECUTED. IMPLEMENTED ≠ WIRED. WIRED ≠ BENCHMARKED. TEST MOCK ≠ REAL PROVIDER. LLM PACKAGE ≠ LLM EXECUTION.

Evidence for every claim is cited as `file:line` against the audited revision. Where a claim is architectural/inferred rather than runtime-proven, it is labeled `[ARCHITECTURAL]`; where it requires an experiment it is labeled `[TO BE MEASURED]`.

---

## 1. Executive Summary

1. The benchmark does **NOT** execute the complete implemented INDAGO intelligence stack.
2. It evaluates the **deterministic core** — which is exactly the portion currently wired into production `src` and into the benchmark.
3. **Semantic retrieval** is IMPLEMENTED but NOT production-wired and NOT benchmark-executed.
4. **AI analyst (PR7) / validator (PR8) / judge (PR9)** are IMPLEMENTED but NOT production-wired and NOT benchmark-executed.
5. **PR16 entity-split analysis → PR17** is omitted from the benchmark (PR17 accepts it only as an optional `erSplit` input).
6. **Targeted reblocking** and **reassessment** are event-driven capabilities (triggered by accepted changes/new evidence) and are not exercised by this static, event-less benchmark.
7. **OCR/extraction** is not actually exercised; benchmark inputs are fabricated `RawExtraction` objects (`makeTxt`).
8. A confirmed **ground-truth leakage** path exists (`pipeline.ts:353-370`), plus truth-steered planted-hole region anchoring.
9. The benchmark contains **metric defects** (relation-precision tautology, suppressed type-accuracy, misnamed robustness, FPR doc/code mismatch, near-tautological entity precision).
10. Therefore current benchmark numbers must **NOT** be described as full-system, validated, or production performance. They are a historical prototype result of the deterministic core under a specific harness.

---

## 2. Capability Inventory Table

Legend — Implemented: exists in source. Production wired: reachable from a non-test production `src` path. Benchmark wired: referenced by `packages/platform/tests/benchmark/*`. Executed: actually invoked during the recorded benchmark run. Can affect current metric: whether the capability's output feeds any scored number.

| Capability | Implemented? | Production wired? | Benchmark wired? | Executed? | Can affect current metrics? | Reason omitted if not executed |
|---|---|---|---|---|---|---|
| Ingestion (fetch/classify/storage) | YES `@indago/ingestion` | YES (platform `queue/ingest-evidence.ts`) | YES | PARTIAL (local storage only; no fetch) | minor (none scored) | artifact fetch is harness-local by design |
| Extraction / OCR / parsing | YES (`createTesseractOcrProvider`, `ingestion/src/extraction`) | YES | NO | **FABRICATED INPUT** | YES (all downstream inputs) | benchmark builds `RawExtraction` directly via `makeTxt` (`parserId: 'benchmark-parser'`, `extractionMethod: 'text-decode'`); real OCR not exercised |
| Normalization | YES | YES | YES | YES REAL | YES | — |
| Observation extraction | YES | YES | YES | YES REAL | YES | — |
| Entity mention candidates | YES | YES | YES | YES REAL | YES | — |
| Blocking | YES | YES | YES | YES REAL | YES | — |
| Entity resolution | YES (`compareCandidates`, `deterministicEntityId`) | YES | YES | YES REAL | YES | — |
| PR16 entity split | YES (`@indago/entity-split-analysis`) | NO (intra-intelligence only) | NO | NO | marginal (optional PR17 `erSplit` input) | benchmark never supplies `erSplit`; no over-merge fixtures |
| Relation resolution | YES (`resolveRelationsForCase`) | YES | YES | YES REAL | YES | — |
| Graph projection | YES (`buildGraph` + analytics) | YES | YES | YES REAL | YES | — |
| Temporal graph / versioning | YES (contracts + platform `graph-version-service`, `temporal/*`) | YES | YES | YES REAL | YES | — |
| PR1 graph-hole region | YES (`buildRegion`, `ProjectedGraphExpansionProvider`) | YES (`reassessment-runner.ts`) | YES | YES REAL | YES | — |
| Semantic retrieval | YES (`@indago/semantic-retrieval`) | **NO** (seam never injected) | NO | NO | bounded (region context only) | UNWIRED; see §5 |
| PR4 detection | YES (`detectGraphHoleCandidates`) | YES | YES | YES REAL | YES | — |
| PR5 qualification | YES (`qualifyAndRankGraphHoleCandidates`; frozen `MIN_STRUCTURAL_SCORE=MIN_SIGNIFICANCE=0.70` in `@indago/contracts/src/intelligence/graph-hole-policy.ts:94,97`) | YES | YES | YES REAL | YES (primary filter — root cause) | — |
| PR7 AI analyst | YES (`analyzeGraphHole`) | **NO** (null AI port; no caller) | NO | NO | **NO (structurally zero, §6)** | UNWIRED; requires injected `AiRuntime` |
| PR8 validator | YES (`validateGraphHoleAnalysis`) | NO | NO | NO | NO (validates analyst output only) | UNWIRED |
| PR9 AI judge | YES (`runJudgeDecision`) | NO | NO | NO | NO (downstream of analyst) | UNWIRED |
| PR14 gap classification | YES (`classifyGap`) | YES | YES | YES REAL | YES | — |
| PR15 competing explanations | YES (`generateCompetingExplanations`) | YES (intra-intel) | YES | YES REAL | YES | — |
| PR17 evidence requests | YES (`generateCandidateEvidenceRequests`) | YES (intra-intel) | YES | YES REAL | YES | — |
| PR18 next-best evidence | YES (`selectBestEvidenceFromCandidates`) | **NO** (only benchmark + integration test call it) | YES | YES REAL | YES | UNWIRED in product |
| Lead generation | YES (`buildBridge/Community/TemporalBurstLeadDraft`) | YES (`lead-runtime.ts`) | YES | YES REAL | NO (no hole-metric effect) | — |
| Targeted reblocking | YES | YES (reassessment-time only, `services/targeted-reblocking.ts`) | NO | NO | marginal (evidence-driven recovery) | event-driven; needs new evidence input; out of static scope |
| Reassessment | YES (`@indago/graph-hole-reassessment` + platform worker) | YES (queue `graph-hole-reassessment`, `orchestrator.ts:44-45`) | NO | NO | NO (static run) | event-driven; triggered only by accepted case changes |
| Hypothesis context (PR3) | YES (`buildHypothesisContext`) | YES (`reassessment/region-context.ts:31`) | YES | YES REAL | YES | — |
| Claim grounding | YES (platform `security/grounding.ts`) | YES (append-only agent guard) | NO | NO | NO (not a metric stage) | guard only; no metric effect |
| AI runtime | YES (`@indago/ai-agent-runtime`; Ollama + Gemini) | **NO** (`createAiRuntime` callers are tests only) | NO | NO | NO | UNWIRED |
| Orchestrator / queue | YES (`queue/orchestrator.ts`) | YES | NO | NO | NO (static run) | event-driven |

**Aggregate classification:**
- Deterministic core: implemented, production-wired, benchmark-wired, executed. This is the full *wired* product surface the benchmark already covers (extraction excepted).
- AI analyst/validator/judge, semantic retrieval: **IMPLEMENTED + UNWIRED** (test-only in practice).
- PR16, PR18: implemented, deterministic, benchmark-partially/excluded; PR16 omitted, PR18 executed-but-unwired-in-product.
- Targeted reblocking, reassessment, orchestrator: implemented + wired, but **event-driven** — categorically outside a static snapshot benchmark.

---

## 3. Production Call Graph

Currently wired production path (`packages/platform/src`):

```
ingest-evidence (queue/ingest-evidence.ts)
  → ingestion (fetch → classify → normalize)          [extraction/OCR real here]
  → observation extraction / entity mention extraction
  → blocking
  → entity resolution (compareCandidates)
  → relation resolution (resolveRelationsForCase)
  → differential update (entity/relation materialization)
  → publishCaseChange → enqueue 'graph-hole-reassessment'   (publish-case-change.ts:104-109)
      → orchestrator worker (orchestrator.ts:44-45) → reassessment-worker.ts
      → ReassessmentRunner.runBatch (reassessment-runner.ts)
          → PR1 buildRegion (no semanticExpansion injected: reassessment-runner.ts:755-785)
          → hypothesis context (region-context.ts:31)
          → PR4 detection (region-recompute.ts:15-16)
          → PR5 qualification (region-recompute.ts:17)
          → deterministic gap runtime (GraphHoleGapRuntimePort; region-pipeline.ts:69-77)
```

**Where execution STOPS with respect to AI and semantic layers (all verified):**
- `AiAnalysisPort` is declared (`reassessment/types.ts:67,99-100`) but **never instantiated**; grep for `aiAnalysis|AiAnalysisPort|AiAnalysisInput|AiAnalysisResult` matches only `reassessment/types.ts`. Default is `null` → stage fail-closed.
- `createAiRuntime` has **zero non-test callers** (definition at `ai-agent-runtime/src/core/runtime.ts:256` only).
- `analyzeGraphHole` has **zero non-test callers** (definition `graph-hole-analysis/src/analyst/analyze.ts:52`; calls `runtime.generateStructured` at `:67`; tests call it at `tests/analyst.test.ts:136,221`).
- `runJudgeDecision` / `judgeGraphHole` have **zero non-test callers** (`graph-hole-judge/src/orchestrate/run-judge-decision.ts:76,100`; `judge-executor.ts:104,113`).
- Semantic retrieval: `PostgresEmbeddingRepository`/`PostgresSemanticSearchRepository` singletons exist (`persistence/embedding-repository.ts:157`, `semantic-search-repository.ts:127`) but **zero call sites**; region seam optional (`graph-hole-region/src/types.ts:148`) and production runner builds deps **without** `semanticExpansion`.
- Web layer exposes **no** AI/semantic execution (`grep web/src` → none).
- `platform/package.json:30` declares `@indago/graph-hole-analysis` as a dependency but **no `platform/src` file imports it**.

Do not call any of the above "active". They are implemented but uncalled.

---

## 4. Benchmark Call Graph

Executed harness (`run-pilot.ts` → `generateCaseCorpus` → `runPipeline` → `runHoleChain` → `evaluateHoleRobustness` → `computeCaseMetrics` → `buildReport`/`writeBenchmarkArtifacts`), separated by execution class:

**REAL EXECUTED CODE (real `@indago/*` engines, imports in `pipeline.ts` / `holes.ts`):**
- ingestion: `NormalizationService`, `blockCandidates`, `extractEntityMentions`, `extractObservations`, `finalize*`
- entity resolution: `compareCandidates`, `deterministicEntityId`
- relation resolution: `resolveRelationsForCase`, `detectExplicitRelationContradictions` (+ frozen `RELATION_PROPOSAL_THRESHOLD`)
- graphology-projection: `buildGraph`, `detectBridgeCandidates`, `detectCommunityCandidates`, `detectTemporalBursts`, `traverseBounded`
- lead-generation: `buildBridgeLeadDraft`, `buildCommunityLeadDraft`, `buildTemporalBurstLeadDraft`
- hole chain (real): `buildRegion` + `ProjectedGraphExpansionProvider` (PR1), `buildHypothesisContext` (PR3), `detectGraphHoleCandidates` (PR4), `qualifyAndRankGraphHoleCandidates` (PR5, frozen 0.70/0.70 gates), `classifyGap` (PR14), `generateCompetingExplanations` (PR15), `generateCandidateEvidenceRequests` (PR17), `selectBestEvidenceFromCandidates` (PR18)
- util/determinism: fixed `nowIso=2026-01-01T00:00:00.000Z`, seeded sha256 RNG, homogeneous per-harness scoring (`metrics.ts`, `robustness.ts`)

**FABRICATED / INJECTED INPUT:**
- `makeTxt` builds `RawExtraction` directly (`parserId: 'benchmark-parser'`, `extractionMethod: 'text-decode'`, `pipeline.ts`). Real document fetch, parsing, and Tesseract OCR (`createTesseractOcrProvider`) are **not** run.
- Corpus records are synthetic/de-identified but truth-derived (see §8 leakage).

**OMITTED IMPLEMENTED SUBSYSTEMS (not referenced anywhere in `tests/benchmark/`, verified by grep):**
- `@indago/graph-hole-analysis` (PR7 analyst), `@indago/graph-hole-validation` (PR8), `@indago/graph-hole-judge` (PR9)
- `@indago/semantic-retrieval` (all of it)
- `@indago/entity-split-analysis` (PR16 — the `erSplit` input to PR17)
- `@indago/targeted-reblocking`, `@indago/graph-hole-reassessment` (event-driven)

**Benchmark call shape vs analysis-aware surfaces:** `classifyGap`, `generateCompetingExplanations`, `generateCandidateEvidenceRequests`, and `selectBestEvidenceFromCandidates` are invoked with **no** analyst/judge/validator object (`holes.ts:772-828`). PR18's typed input (`pr18/types.ts`) contains **no** `GraphHoleAnalysisV1`/`GraphHoleDecisionResolution` fields; those types are read only by the PR10 discrimination/gate surface, which the benchmark never calls.

---

## 5. Semantic Retrieval Audit

**Was semantic retrieval used in the benchmark?** **NO.** No reference to `@indago/semantic-retrieval`, `SemanticSearchService`, `EmbeddingPipeline`, or any provider exists in `tests/benchmark/`.

**Is semantic retrieval wired into the production pipeline?** **NO.** Implemented end-to-end but uncalled:
- Implementation: `OllamaEmbeddingProvider` (`semantic-retrieval/src/providers/ollama.ts:139-153`, default `nomic-embed-text:latest`), `DeterministicEmbeddingProvider` (test-only, `EMBEDDING_PROVIDER=deterministic-test`, `src/providers/deterministic.ts:46-85`), `EmbeddingPipeline`, `SemanticSearchService`.
- pgvector persistence exists: migration `20240104000000_semantic_embedding_retrieval` (adds `vector(768)`), `PostgresEmbeddingRepository`, `PostgresSemanticSearchRepository` — singletons with zero call sites.
- Region seam exists: `graph-hole-region/src/types.ts:148` (`semanticExpansion?`), invoked at `build-region.ts:238` (`port.retrieve`), degrades on failure. Production reassessment runner constructs region deps **without** it (`reassessment-runner.ts:755-785`); rehydrated regions rebuild with `status:'DISABLED'` (`reconstruct-region.ts:89-99`).
- Retrieval is contractually a **recall/context-expansion layer, never authority**: `contracts/src/intelligence/semantic-retrieval.ts:22-30` ("Semantic retrieval is a RECALL/context layer. It is NOT the authority for entity/relation resolution… Semantic ranking never creates graphs, entities, relations, hypotheses"). Entity and relation resolution explicitly exclude embeddings (`entity-resolution/src/comparison-evidence.ts:5`).
- Therefore **semantic retrieval has contributed nothing** to any current benchmark result.

**Plausible causal position `[ARCHITECTURAL]`:** region/context expansion → detector candidate availability (more candidate nodes/observations in a region before PR4/PR5). It does **not** alter PR5 structural/significance scores, entity identity, or relation authority.

**Do NOT claim semantic retrieval improves metrics until experimentally measured** (RUN B).

---

## 6. LLM Audit

**Was the LLM actually called during the benchmark?** **NO.** No LLM, no AI runtime, no analyst is imported or invoked by `tests/benchmark/` (grep → zero matches across the benchmark directory).

Documented state:
- AI runtime exists: `@indago/ai-agent-runtime` (`createAiRuntime`, `generateStructured`, providers `gemini` + `ollama`, budgets/retries/timeouts in `config/load.ts:71-116`, `budgets/limits.ts:34-43`).
- Analyst exists: `analyzeGraphHole` — one `generateStructured` call, Zod-strict schema, fail-closed (no catch; errors propagate, `analyze.ts:6-10`), identity stamped by feature, runtime **injected** (`analyze.ts:44`).
- Judge exists: `runJudgeDecision` / `judgeGraphHole` (single call, fail-closed).
- `createAiRuntime` **only test callers** (`ai-agent-runtime/tests/*`; `graph-hole-analysis/tests/analyst.test.ts:135,218` construct a real Ollama runtime in tests).
- Analyst/judge **require an injected runtime**; **no production runtime is instantiated**; **the benchmark injects none**.
- No `GEMINI_API_KEY`/`AI_PROVIDER` selection is required, referenced, or consumed by any benchmark path.
- SQL → none of the recorded benchmark metrics contain any measured LLM contribution. Max: `platform/.env.example` holds placeholder AI env vars; `.env` exists but no provider is selected (`AI_PROVIDER` unset).

**Causal limitation `[ARCHITECTURAL, source-proven]`:**
- PR5 qualification runs **before** the analyst. A candidate already rejected by PR5's frozen gates (or never generated) cannot reach the analyst, so the LLM **cannot recover graph-hole recall / hit-rate / ERR@3**.
- Current downstream scoring/classification/explanation/evidence/NBE paths do **not** consume analyst output (call shapes in §4).
- Do **not** claim "LLM can never help INDAGO." State precisely: **under the CURRENT architecture and CURRENT benchmark wiring, the LLM cannot improve the primary graph-hole hit/ERR metrics.** Any effect on explanation-quality/evidence-quality metrics would require new wiring (`erSplit`/analysis-aware surfaces) and is `[TO BE MEASURED]`.

---

## 7. Omitted Capabilities

| Capability | Why omitted | Benchmark or architecture limitation? | Can theoretically affect current metrics? | Known or expected effect? |
|---|---|---|---|---|
| Semantic retrieval | Not benchmark-wired; production seam never injected | Both: benchmark omits it AND production is unwired | Only via region context/candidate availability | EXPECTED ~zero on hits (does not change PR5 scores) `[TO BE MEASURED]` |
| AI analyst (PR7) | Requires injected runtime; none exists in product or benchmark | Benchmark omits it; architecture leaves it unwired | NO for hit/ERR (post-PR5); NO for other metrics (no consumer reads it) | KNOWN zero for current metric set (call shapes prove it) |
| Validator (PR8) | Downstream of analyst | Architecture unwired | NO (validates analyst output only) | KNOWN zero |
| AI judge (PR9) | Downstream of analyst | Architecture unwired | NO for current metric set | KNOWN zero |
| PR16→PR17 (entity split) | `erSplit` is optional; benchmark never supplies it; fixtures have no over-merges | Benchmark omission (capability is deterministic, real) | YES in principle (evidence-request candidate count/types) | EXPECTED zero on current fixtures `[TO BE MEASURED]` |
| Targeted reblocking | Event-driven; requires new evidence events | Architecture limitation (categorical) | NO in a static snapshot | NOT APPLICABLE statically |
| Reassessment | Event-driven (accepted case changes); benchmark is a static snapshot | Architecture limitation (categorical) | NO in a static snapshot | NOT APPLICABLE statically |
| Claim grounding | Append-only agent guard, not a metric stage | Neither (guard only) | NO | KNOWN zero |
| OCR / extraction | Benchmark fabricates `RawExtraction`; real OCR on synthetic docs not feasible/desired here | Benchmark limitation (input fabrication) | YES (all downstream inputs) | UNKNOWN; documented as FABRICATED INPUT |
| Lead-generation alternative explanations | Not invoked by benchmark; no hole-metric effect | Benchmark omission | NO | KNOWN zero for scored metrics |

---

## 8. Benchmark Leakage Audit

Confirmed ground-truth leakage (do **not** hide):

1. **`pipeline.ts:353-370`**: `keyToCanonical` is derived from `corpus.truth.identities` (`:353-355`); `authorizedPairs` is built from `corpus.truth.edges` filtered to `witnessRecordIds.length > 0` (`:357-367`); graph edge `materializable` is filtered by `authorizedPairs` (`:368-370`). Graph construction (i.e., the graph the PR4 detectors see) is therefore **gated on hidden truth**.
   - Partial mitigation: `witnessRecordIds` identify *observed* records, so it approximates "documented by observed evidence" — but the mechanism consults `corpus.truth.*` directly, violating the benchmark's own separation contract (`corpus.ts:19-21`: "the hidden truth is used exclusively for scoring").
2. **Truth-steered planted-hole anchoring**: each planted hole carries a hidden `seedOwner` (`corpus.ts:102`); the harness builds each evaluation region from that truth-known anchor (unit-style tu.ne). Recall is therefore **conditional on being given a truth-selected seed** — disclosed, not hidden.
3. Contradictions surfaced to the pipeline are reconstructed from observed CONTRADICTION records (observed-side), which is acceptable; the `truth.edges`/`truth.identities` usage above is the leak.

**Why this violates strict observation-only benchmarking:** inference must derive materializable relations **only** from observed evidence/observations; hidden truth may be consumed post-hoc for scoring only.

**Corrected benchmark requirement (TRACK 2):**
- Replace the leakage block with observation-derived authorization: a `proposable` relation materializes iff its pair is documented by ≥1 non-withheld observed OBSERVATION (support ≥ `RELATION_PROPOSAL_THRESHOLD`).
- Remove every `corpus.truth.*` reference from the inference path (`pipeline.ts`).
- Every corrected run must record `groundTruthAccessed: false` (and TRACK 1 runs record `groundTruthAccessed: true`).

---

## 9. Metric Audit

Documented defects (pre-audit formulas; historical numbers must remain reproducible and labeled pre-audit):

| # | Defect | Location | Effect |
|---|---|---|---|
| 1 | **Relation-precision tautology** | `metrics.ts:230-240` | `matchedResolutions` is incremented *inside* the same `.filter()` that yields `resolvableCount`, so `precisionAtThreshold = matched/resolvable` is 1.0 whenever nonzero (0 when none). Aggregate `relationPrecision 0.8667` (13×1.0 + 2×0) is meaningless. Relation **recall** (`expectedKeys`) is genuine. |
| 2 | **Entity precision near-tautological** | `metrics.ts:206` | `resolvedSurfaces / run.entities.length` over a roster-grounded corpus; each entity produced by the KB already carries its canonical surface. |
| 3 | **Relation type accuracy suppressed** | `metrics.ts:242` | genuine signal `correctTypeResolutions` is mostly 0 across hits yet **never surfaced** in condition-summary/viability. |
| 4 | **"robustness" mislabeled** | `robustness.ts:224`, `report.ts:146` | `holesDetectedStrict/holesDetected` = strict-attribution consistency of hits, **not** noise resistance. Rename → `hitConsistency`. |
| 5 | **No genuine noise-resilience metric** | — | Add a properly defined resilience proxy (e.g., hit-consistency across CLEAN→NOISY→ADV per hole, or qualification-score margin). `[TO BE DEFINED]` |
| 6 | **FPR implementation/doc mismatch** | `metrics.ts:281` vs `condition-summary.md` | code: `rawCandidates / totalPairEvaluations`; doc text claims "qualified candidates / detector pair-evaluations". Align one to the other. |
| 7 | **Remove tautological formulas before A/B comparison** | #1 (#2) | Any A/B must use corrected formulas only; historical numbers unchanged and labeled pre-audit. |

---

## 10. Failure Root Cause Analysis

Conditions: NOISY config = alias .40 / dup .12 / del .18 / withheld-edge .22 / shifts 2; ADV config = alias .50 / dup .16 / del .22 / withheld-edge .30 / shifts 3 + shared-id collisions (`corpus.ts:737-739`).

| Hole | Condition | Earliest information-loss stage | Observed cause | PR5 effect | LLM recover? | Semantic recover? | Reassessment / reblocking recover? | Why / why not |
|---|---|---|---|---|---|---|---|---|
| GAP-01 | CLEAN | — | hit r1, qualified (struct 0.7445 / sig 0.7417, MISSING_INVESTIGATION, CONFIDENT) | passed | n/a | n/a | n/a | baseline detector+gate works |
| GAP-01 | NOISY / ADV | PR5 qualification (candidate exists) | deletions+aliasing drain evidential support; region connectivity drops (~0.8 → ~0.5) | LOW_STRUCTURAL_SCORE + LOW_SIGNIFICANCE → rejected | NO | NO | possibly (but static) | LLM runs post-gate; semantic cannot raise structural/significance scores; reblocking needs new evidence not present |
| GAP-02 | CLEAN / NOISY / ADV | — | hit all 3 (r2/r2/r1, 0.7325-0.7675) | passed | n/a | n/a | n/a | robust to shared-id/alias mix |
| GAP-03 | ×3 | region/detection → qualification | TEMPORAL_GAP raw 1/3/3, all below gates | honest-0 (documented) | NO | NO | unlikely | temporal signal never clears 0.70; nothing post-PR5 can inject it |
| GAP-04 | CLEAN / NOISY | — | hit r1 (0.7175/0.7255) | passed | n/a | n/a | n/a | — |
| GAP-04 | ADV | PR5 (raw 5 → 0) | shared-id + alias/noise collapse all candidate scores | all 5 rejected | NO | NO | possibly (static: no) | same gate-position argument |
| NBE-01/NBE-02/SYS-01 | ×3 each | region construction (floor/limited) | no candidate signal generated inside region | nothing to qualify | NO | marginal | YES in principle, NOT APPLICABLE statically | detectors never emit candidates; region context is empty; reblock/reassess would need an event-driven run |

**Emphasis:** evidence/region loss is **upstream** of PR5; the frozen 0.70/0.70 qualification is the **second major filter**; the LLM is **downstream of both** and cannot recover any of these failures. Earliest loss stage across failures = region/evidence construction and noise-driven deletion of evidence.

---

## 11. Current Benchmark Interpretation

The existing benchmark is a **historical/internal prototype result of the deterministic core** (with the documented leakage and metric defects). It must **NOT** be presented as:
- full INDAGO system accuracy (LLM/semantic layers unimplemented in this run),
- production validation (production wiring differs; extraction fabricated),
- independent validation (leaked truth-gating; truth-steered region anchors),
- field / real-corpus performance (synthetic, de-identified corpus),
- calibrated robustness (no genuine noise-resilience metric; "robustness" is hit-consistency),
- an empirical proof of LLM performance (LLM never executed).

---

## 12. Corrected Experimental Plan (documented, NOT yet executed)

**Freeze first:** copy current `benchmark/` artifacts → `benchmark/backup-before-audit/` (no writes made yet — pending approval).

- **TRACK 1** (historical, `groundTruthAccessed: true`):
  - RUN A = current harness, byte-identical behavior, for comparison only.
- **TRACK 2** (observation-only inference, `groundTruthAccessed: false`):
  - RUN B0 = corrected baseline (no ground-truth inference leakage; §8 requirement).
  - RUN B = B0 + semantic retrieval (real `OllamaEmbeddingProvider` injected into region seam; no authority changes; if model absent → `NOT EXECUTED` + reason).
  - RUN C = B0 + actual LLM analyst/runtime (real `createAiRuntime`; provider/model recorded; no scoring plumb; records Δ=0 for current metrics + analyst statistics).
  - RUN D = B0 + semantic retrieval + analyst + PR16→PR17 (`erSplit` supplied and grounding re-run) + validator annotations — all currently implemented, valid, legitimate stages only.

Shared requirements:
- fixed corpus, fixed seeds, fixed benchmark version;
- isolated output directories per run;
- **fixed (corrected) metric formulas** (§9) — no A/B on tautologies;
- full execution telemetry (stage entrypoint, engine, implementation class, durations);
- LLM telemetry: calls, tokens, latency, retries, validation failures (no secrets, no raw prompt bodies);
- `groundTruthAccessed` recorded per run;
- no hidden truth used by inference; no production authority-boundary changes;
- **no lowering of frozen qualification gates** (0.70/0.70) to inflate scores;
- no fixture retargeting to force desired outcomes;
- negative results reported.

---

## 13. Final Verdict

**Q1. Did the benchmark execute the complete implemented INDAGO pipeline?** **NO.** It executed the deterministic core (fully, extraction excepted) and skipped every implemented-but-unwired surface (semantic retrieval, AI analyst/validator/judge, PR16→PR17, and — categorically — the event-driven targeted-reblocking/reassessment paths).

**Q2. Which implemented capabilities were omitted?** Semantic retrieval; AI analyst (PR7); validator (PR8); AI judge (PR9); PR16 entity-split → PR17 `erSplit`; targeted reblocking (static scope); reassessment (static scope); claim grounding (no metric effect); real OCR/extraction (fabricated inputs instead); lead-generation alternative-explanations (no metric effect).

**Q3. Was the LLM executed?** **NO.** Reason: no `AiRuntime` is instantiated by any non-test caller; the chain ends at PR5 qualification; the benchmark injects no runtime.

**Q4. Can the LLM improve current graph-hole hit/ERR metrics under the present architecture?** **NO** — not as a matter of experiment but of execution flow: qualification precedes the analyst, so rejected/absent candidates never reach it; and the consumers of analysis (validator, judge, PR10 NBE discrimination) are unwired and uncalled by the benchmark. Only "under the current architecture and wiring" — not a general claim about LLMs.

**Q5. Can semantic retrieval potentially affect current metrics?** Only through region/context expansion → candidate availability; it cannot alter PR5 scores or entity/relation authority. Expected impact low; **not yet measured** (`[TO BE MEASURED]`, RUN B).

**Q6. Which omitted capability has actually been demonstrated to improve results?** **None — not yet measured.** No A/B has been run.

**Q7. What is the current root cause of the failed planted holes?** Earliest information-loss stage = **evidence/region construction** (noise-driven deletion/aliasing of the records that witness planted relations, and empty floor regions for NBE/SYS), followed by the **frozen 0.70/0.70 PR5 qualification gates** as the second filter; the LLM is downstream of both and therefore irrelevant to these failures.

**Q8. Which benchmark numbers are currently trustworthy after accounting for leakage/metric defects?** Only: (a) structural counts (45 packages, 24 planted holes, 8/condition); (b) **relation recall**, entity-surface recall@1, observation coverage, classification coverage, err@3 (these formulas are genuine); (c) hit-rate *as a harness-conditional prototype signal*, not as system accuracy. Tautological relation precision, the suppressed relation-type accuracy, "robustness", and the FPR proxy are **not** trustworthy until corrected. Everything is pre-audit until TRACK 2 re-runs.

**Q9. Which claims are safe for demo/judging context?** Only explicitly-scoped claims: "A deterministic prototype harness over the wired intelligence core produced N qualified hole-fills out of M planted, with ERR@3/recall values X, under noise levels Y and frozen 0.70 gates, on a synthetic de-identified corpus; LLM and semantic-retrieval were not part of this run." Never claim accuracy, validation, robustness, or LLM contribution.

**Q10. What must happen before publishing a corrected benchmark?**
1. Backup `benchmark/` → `benchmark/backup-before-audit/`.
2. Apply §9 metric corrections.
3. Apply §8 observation-only leakage fix (`groundTruthAccessed: false`).
4. Execute TRACK 2 (RUN B0/B/C/D) in isolated dirs with fixed corpus/seed/formulas.
5. Record provider/model + LLM/semantic telemetry; report negatives.
6. Re-emit reports and the capability impact matrix only from TRACK 2 results.

---

*Documentation only. No benchmark, production-code, or artifact changes were made. A/B experiments, metric corrections, and the leakage fix remain pending review and approval.*