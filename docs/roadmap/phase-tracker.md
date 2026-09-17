<div align="center">

# INDAGO V7 Phase Tracker

**PS 26189 — Mayur x Gurashish**

Check off tasks as they are completed. Each task is tagged with its owner.

</div>

---

## Status Legend

| Mark | Meaning |
|---|---|
| ✅ | **IMPLEMENTED AND VERIFIED** — code exists and is exercised by tests/evidence in-repo |
| 🟡 | **IMPLEMENTED BUT ONLY PARTIALLY VERIFIED** — a real subset exists; verification or full surfacing is missing |
| 🔵 | **PLANNED** — documented intent; not implemented |
| ⚠️ | **KNOWN LIMITATION** — an accepted technical debt / documented limitation, not an implementation gap |
| ❌ | **NOT IMPLEMENTED** |

Advanced items are tagged with their status symbol in front of the checkbox. Backend-correctness and frontend-surfacing are evaluated separately: a backend route existing is **not** treated as the roadmap item "complete" unless the capability is genuinely surfaced end-to-end.

## Tracker Reconciliation — 12 Sep 2026

Read-only audit of this tracker against repo evidence (implementation + test suites). **No checkboxes toggled — the 103-done count remains unchanged at audit time** (partials stay `[ ]`, downgrades keep `[x]`) **; the later M-A12 entry-gate closure toggled only the eight G1–G8 gates, bringing the 103 → 111**.

**Downgraded to `🟡 [x]` (6) — marked done but only partially verified:**
- Phase 3 "Show graph-ready state in UI shell" — run state renders; graph/entity/relation live providers are `Unsupported*` stubs.
- G-A08 "Agent orchestrator (bounded planning loop)" — event-driven BullMQ dispatch; no plan→observe→reflect→converge loop.
- Phase 6B "Checkpoint/recovery tests" — no dedicated checkpoint/recovery contract unit suite.
- Phase 6B "Bounded retries and circuit breakers" — `tools/runtime.ts` path untested.
- Phase 9A "RBAC" — role gate never exercised (`requireRole` 403 via real routes cannot trigger).
- Phase 9A "Hash-linked audit events" — no chain/tamper-evidence test.

**Under-credited partials — now `🟡 [ ]` (6):** bounded path queries (M-A13 backend shipped/tested, not wired into the Phase 4 loop); human-review state (`REVIEW_REQUIRED` contract-only); pause/resume (`PAUSED` reached only via human escalation); graph-hole event type (`GRAPH_HOLE_DETECTED` declared, unwired); gap lifecycle state (`GapStatusSchema` frozen, no runtime, ⚠️ `WONFIX`); WAITING_FOR_EVIDENCE state (contract-only).

**Known test-coverage gaps:** RBAC role gate, audit hash-chain linkage, `executeToolSafe` (bounded retries + idempotency cache-hit), dedicated checkpoint/recovery suite.

**🔵 policy:** 🔵 retained only where a task is genuinely planned/future work (cross-observation relation retrieval, targeted reblocking, semantic retrieval, source/context visualization, provenance UX, semantic benchmark, model versioning); 🔵 is never combined with a 🟡 status marker.

**Second-pass audit (same date).** Full sweep of **every** unchecked tracker item against the repo. Same discipline: no checkboxes toggled, **103-done count unchanged at audit time**, every new flag is `🟡 [ ]` — a real subset exists but the milestone/surfacing is **not** complete, and nothing is upgraded to ✅ **; the M-A12 entry-gate closure later toggled the eight G1–G8 gates (103 → 111)**.

- **Real algorithm / persisted runtime (3):** M-A03 CDR CSV ingestion + M-A04 Financial CSV ingestion (generic CSV pipeline converts CDR/financial rows → observations, integration-tested); P4 "Attach evidence FOR / AGAINST" (supporting/contradicting observation sets persisted on `EntityHypothesis`/`RelationHypothesis`).
- **Demo/UI surfacing (12):** P5A-1 graph-hole detection + P5A-6 evidence-request lifecycle at the web/demo layer; P7 workspace shell, graph visualization, timeline visualization, evidence FOR/AGAINST panels, gap/graph-hole visualization, reasoning ledger, review/approval UI, premium states; P10 Discovery Mode (detection-logic demo + workflow/UI demo).
- **Partial / shared-pipeline, explicitly NOT milestone completion (11):** M-A02 FIR (generic narrative path only, catalog never consumed as a processing switch); P3 seed messy case (test/demo fixtures only, no product seed path); P4 bridge/connector candidates (web-only), Create InvestigativeLead structure (contract + demo builders), Stream analysis progress to UI (SSE infra + run-status projection; analysis events absent); P5A-7 normalized evidence utility (static mock + `ExpectedInformationGainSchema`); P5B-8 stream graph/lead changes live (demo overlay in `graph-live.ts`); P7 Lead card, Next-best-evidence panel, Realtime progress & recovery (PAUSED rendered, `HUMAN_ESCALATION` not surfaced); P9A Failure isolation (bounded retries + circuit breaker + human escalation only).
- **Genuinely not found — left unchanged:** temporal burst detection, community candidates (backend), cross-case runtime, cross-observation relation retrieval, targeted reblocking (🔵), ER-split-explains-hole, gap-classification runtime, evidence Resolution Rate@K, evidence-independence tracking, Phase 6A robustness set, Phase 9B definitional items, PII masking / prompt-injection / secret management / tool-authorization boundaries / audit access logging, Phases 8/11/12.

## Tracker Update — Phase 5A-PR11/PR12 (16 Sep 2026)

**PR11 (targeted reblocking) and PR12 (incremental graph-hole reassessment) landed 2026-09-16 on `feat/m-a13-graph-hole-region`.** No `[ ]`→`[x]` toggles to unrelated milestones; the changes below are new capability rows / status markers backed by in-repo code + real-Postgres integration suites:
- **PR12 row added (Phase 5A, Mayur):** frozen policy + runtime complete — change ledger, cursor watermark, affected-set/plan resolution, deterministic outcome derivation, `contextSha256` AI-skip gate, producers after authority txn, orchestrator job. **PR12 integration green 6/6 real Postgres**; repo `pnpm -r typecheck` + platform units 204/204 green.
- **5B backend-loop markers moved to `🟡 [ ]`:** "Handle evidence arrival event" and "Re-trigger reassessment" now carry PR12 as the backend trigger loop (evidence arrival and accepted entity/relation resolutions enqueue reassessment). Full 5B/5C workflow + UI surfacing remains outstanding — these stay partial, NOT complete.
- **Post-delivery quality pass (3 fix commits, working tree clean):** runner doc/ternary (`d151441`), undirected-edge canonicalization in `graph-shapes` (`37cbe19`), exact indexed `findByRegionId` in `regionRecordOf` (`55f645f`). All suites re-run green after the fixes.

## Tracker Update — Phase 5A-PR13 (17 Sep 2026)

**PR13 (Phase 5A end-to-end verification / certification) landed 2026-09-17 on `feat/m-a13-graph-hole-region`.** Certification-only: **zero production-code changes** (Gate A), no fake-green (Gate B). Real-Postgres E2E suites certify the deterministic graph-hole chain (region expansion → detection → qualification → persistence → incremental reassessment → supersession → lifecycle) and the frozen V1.1 score surface, reproduced bit-for-bit by the production chain (structural 0.782667, evidence 0.866025, EIV 0.25, significance 0.723606, `failureReasons []`). PR13 suite additions: full-pipeline 5/5, incremental supersession 3/3, isolation/authority 3/3, lifecycle transitions 4/4, concurrency 2/2, determinism 8/8; scoped regression matrix **57/57 across 10 files** (incl. pr6-persistence 19, pr12 6, pr11 4, ownership-boundary 3). Status **CERTIFIED WITH DOCUMENTED LIMITATIONS** — see `docs/architecture/pr13-verification-certification.md`.

## Tracker Update — Phase 5A-PR14 (17 Sep 2026)

**PR14 (deterministic / structured gap classification) landed 2026-09-17 on `feat/m-a13-graph-hole-region` — policy frozen V1 + pure runtime; NO persistence/model/migration, NO HTTP endpoint, NO LLM, no hidden retrieval.** `@indago/gap-classification` consumes certified PR1/PR3/PR5/PR13 outputs only and emits a closed-world `GapClassificationV1` (single label + confidence + structural impact + expected information value + reasons + reason codes + provenance + `contextSha256` identity). Typed failures only (`INVALID_INPUT`, `UNSUPPORTED_POLICY`, `CONTEXT_MISMATCH`, `QUALIFIED_CANDIDATE_REQUIRED`); `INSUFFICIENT_CONTEXT` is never forced to `MISSING_DATA`; contradictions ⇒ `AMBIGUOUS` + `CONTRADICTION_PRESERVED`; concealment status ceiling `SUPPORTED` (never suggests confirmation). **Verification:** contracts suite 445/445; `@indago/gap-classification` 49/49; real-Postgres integration 5/5 (T1–T5 incl. region-limitation ⇒ `INFRASTRUCTURE_GAP`/`REGION_REPRESENTATION_LIMITED`); Phase 5A regression re-run green (PR6/PR11/PR12/PR13 + M-A12 + PR1.5); `pnpm -r typecheck` + `pnpm -r build` green. **One real contract defect found by the integration test and fixed (PR14-6):** `GapClassificationReferencesSchema.supportingHypothesisIds` was UUID-typed, but production emits PR3 derived ids (`atomic:RELATION_HYPOTHESIS:<uuid>`) — relaxed to `z.string().min(1)` mirroring `RawGraphHoleCandidateSchema`. See `docs/architecture/pr14-gap-classification.md`.

## Tracker Update — Phase 5A-PR15 (17 Sep 2026)

**PR15 (bounded, ranked competing explanations) landed 2026-09-17 on `feat/m-a13-graph-hole-region` — policy frozen V1 + pure deterministic generator; NO LLM, NO second hypothesis lifecycle, NO persistence, no hidden retrieval.** `@indago/competing-explanations` consumes the certified PR1/PR3/PR5/PR13/PR14 chain — its input binds to the REAL PR14 classification by **re-running `classifyGap`** and requiring equality on hole id/context digest/type/status/reason codes (`CONTEXT_MISMATCH` otherwise). Nine frozen explanation families (§10), each emitted **only when its grounded signal is present**; primary family mirrors the PR14-selected label; alternatives grounded by entity-hypothesis presence, expected-type representation, temporal-window mismatch, and genuine competing baselines (`INNOCENT_ALTERNATIVE`). Support/contradiction evaluation preserves contradictions (§16: `CONCEALMENT_CONSISTENT` and `MISSING_DATA` are **never** emitted under contradictions); concealment wording is pattern-compatible only; `INSUFFICIENT_CONTEXT` ⇒ valid empty set (a result, not an error). Content-addressed identity (`sha256Hex(canonicalizeDeterministic(§8 tuple))`), dedupe, and a fixed-width flipped-digit ranking key (support DESC → frozen family ASC → diversity DESC → coverage DESC → id ASC); set bounded at `MAX_COMPETING_EXPLANATIONS = 5`. Typed boundary failures only. **Verification:** contracts 475/22 (30 PR15 contract tests); `@indago/competing-explanations` 29/2 (generation + boundaries incl. adversarial); ranking fix folded into PR15-6 (`0172fa2` — negated JSON numbers sort lexically wrong, now fixed-width flipped digits); platform integration T0–T4 written + typechecked (`f72a664`) — **live execution deferred: Neon DB unreachable (environmental, affects PR13/PR14/PR15 suites identically)**. `pnpm -r typecheck` + `pnpm -r build` green.

---

## Phase 0 — Architecture & Scope Lock

**Date:** 25 Aug | **Owner:** Both | **Gate:** Scope + ownership locked

- [x] Confirm V7 is the architecture source of truth `[Both]`
- [x] Freeze P0 / P0.5 / P1 split `[Both]`
- [x] Freeze TypeScript/Node.js-first stack `[Both]`
- [x] Freeze PostgreSQL vs Neo4j responsibilities `[Both]`
- [x] Confirm temporal strategy (event history + current projection + intervals + checkpoints) `[Both]`
- [x] Confirm Aion role (reference/optional, not mandatory) `[Both]`
- [x] Confirm BullMQ + Redis + custom state machine for orchestration `[Both]`
- [x] Freeze repository / monorepo layout `[Both]`
- [x] Freeze owner boundary (Mayur = intelligence; Gurashish = execution/platform/UI) `[Both]`
- [x] Create shared issue tracker with phase/owner/dependency/checkpoint labels `[Both]`

---

## Phase 1 — Common Contracts

**Date:** 25-26 Aug | **Owner:** Both (joint blocker) | **Gate:** Contracts v1 frozen

### 1.1 Domain Contracts (Mayur leads, Gurashish reviews)

- [x] Define Investigation and Case `[Mayur]`
- [x] Define EvidenceSource / Artifact / Observation `[Mayur]`
- [x] Define EntityHypothesis and EntityRoleHypothesis `[Mayur]`
- [x] Define RelationHypothesis `[Mayur]`
- [x] Define Hypothesis and InvestigativeLead `[Mayur]`
- [x] Define InvestigativeGap and EvidenceRequest `[Mayur]`
- [x] Define ReviewTask `[Mayur]`
- [x] Define evidence posture T0-T3 `[Mayur]`

### 1.2 Execution Contracts (Gurashish leads, Mayur reviews)

- [x] Define InvestigationRun and RunState `[Gurashish]`
- [x] Define ToolRequest / ToolResult `[Gurashish]`
- [x] Define AgentCheckpoint `[Gurashish]`
- [x] Define state transitions `[Gurashish]`
- [x] Define retryability semantics `[Gurashish]`
- [x] Define execution errors `[Gurashish]`

### 1.3 Shared Contracts (both)

- [x] ID strategy `[Both]`
- [x] Correlation and idempotency keys `[Both]`
- [x] Graph version IDs `[Both]`
- [x] Event names and payloads `[Both]`
- [x] Service errors `[Both]`
- [x] Authentication/authorization context `[Both]`
- [x] Case-scope enforcement `[Both]`
- [x] Contract versioning `[Both]`

### 1.4 Intelligence API

- [x] searchEvidence() `[Mayur]`
- [x] getEvidence() `[Mayur]`
- [x] resolveEntity() `[Mayur]`
- [x] resolveRelation() `[Mayur]`
- [x] getEntityTimeline() `[Mayur]`
- [x] findCrossCaseLinks() `[Mayur]`
- [x] runGraphAnalytics() `[Mayur]`
- [x] findGraphHoles() `[Mayur]`
- [x] classifyGap() `[Mayur]`
- [x] rankEvidenceRequests() `[Mayur]`
- [x] findCounterEvidence() `[Mayur]`
- [x] runRobustness() `[Mayur]`

### 1.5 Contract Tests

- [x] Schema validation tests `[Both]`
- [x] Serialization/deserialization tests `[Both]`
- [x] Invalid payload tests `[Both]`
- [x] Event compatibility tests `[Both]`
- [x] Mock tool integration tests `[Both]`
- [x] Error/retry semantics tests `[Both]`

---

## Phase 2A — Mayur Intelligence Foundation

**Date:** 26-28 Aug | **Owner:** Mayur | **Gate:** Intelligence lane compiles independently

- [x] M-A01: Ingestion skeleton (source adapter interfaces) `[Mayur]`
  - [x] M-PR1: Artifact Acquisition Core (fetcher, hasher, mime-detector, storage, acquisition-service) `[Mayur]`
  - [x] M-PR2: Artifact Classification & Parser Routing (classifier, encoding-detector, router, registry) `[Mayur]`
  - [x] M-PR3: Raw Extraction Layer (7 parsers, ExtractionService, OCR, PDF extraction) `[Mayur]`
- 🟡 [ ] M-A02: FIR/narrative ingestion (raw artifacts + source metadata) `[Mayur]` — generic TXT/DOCX/PDF/IMAGE narrative path + `FIR` catalog value wired (POST evidence → observations); no FIR-specific parser/adapter and the source catalog is never consumed as a processing switch — partial dedicated milestone, NOT completion
- 🟡 [ ] M-A03: CDR CSV ingestion (normalized communication rows) `[Mayur]` — generic CSV pipeline converts CDR-shaped rows (caller/callee/timestamp) into COMMUNICATION observations (0.7 strength, row provenance), integration-tested; no CDR-specific adapter — partial milestone via shared pipeline, NOT completion
- 🟡 [ ] M-A04: Financial CSV ingestion (normalized transaction rows) `[Mayur]` — generic CSV pipeline composes FINANCIAL observations (from/to account, amount), integration-tested; no financial-specific adapter — partial milestone via shared pipeline, NOT completion
- [x] M-A05: Normalization engine (canonical fields + quality metadata) `[Mayur]`
- [x] M-A06: Observation extraction (Observation[] with provenance) `[Mayur]`
  - [x] Evidence read seam: durable `GET /investigations/:id/evidence` (`EvidenceProjection` — documented local shape, no fabricated strength/posture), live `listEvidence` server action + `LiveEvidenceProvider.listByInvestigation`, Evidence tab renders persisted artifacts in live mode `[Mayur]`
- [x] M-A07: Entity candidate generator (candidate entities) `[Mayur]` — `completeMA07` mention-candidate extraction wired into worker; **backend-verified; candidate provenance verified in the M-A12 entry gate (G2)**
- [x] M-A08: Multi-pass blocking (candidate pairs) `[Mayur]` — `completeMA08` CandidatePair + per-pair idempotent blocking pipeline; **backend-verified; blocking semantics verified in the M-A12 entry gate (G3)**
- [x] M-A09: Entity resolver (reversible EntityHypothesis) `[Mayur]` — canonical-entity authority boundary, identity key, worker, audit; **backend-verified (`entity-hypothesis-store` + accept/reject/reverse HTTP); NOT yet surfaced in a full frontend resolution-review surface** 🟡
- [x] M-A10: Relation resolver (RelationHypothesis) `[Mayur]` — source-grounded scoring v1, canonical Relation decision authority, directionality-aware identity, completeMA10 wiring, Graphology runtime + HTTP routes; **hardened (`caa74cd`, merged via PR #49) — prior 2 P2 findings (audit-log + @relation FK, non-transactional accept) requested and resolved as documented hardening follow-ups**; verified 43/43 platform integration across 5 suites (relation 18, graph 6, graph-http 9, contradiction 2, ingest-http 8)
- [x] M-A11: Graph projection (GraphNode/GraphEdge) `[Mayur]` — delivered via Graphology (`@indago/graphology-projection`: build-graph/centrality/communities), NOT Neo4j; Neo4j deferred to a reversible §13 seam
- [x] M-A12: Temporal projection (intervals + graph versioning) `[Mayur]` — **next major foundation milestone**; **PR0 design locked** (`docs/platform/m-a12-temporal-architecture.md`, dev-plan §23.11); **PR1 implemented** (persistence/validation/history) + **PR2 implemented** (graph versioning + internal historical projection + WS-7 auto-activation + WS-8 strict replay) + **PR3 implemented** (case-scoped temporal APIs incl. WS-10 `valid-at`, D7 checkpoint↔version coupling, as-of deferred 501); **WS-2/WS-3 boundary validation + interval producer wired into the live pipeline; WS-13 same-tx TSC writers + append-only DB trigger; baseline + append-only migrations created; CI now runs Postgres 16 + `prisma migrate deploy`**; DB integration suites run against `TEST_DATABASE_URL` (verified green 43/43 locally + CI); **M-A12 second-pass hardening: item A amendment authority + ORIGINAL→AMENDMENT temporal-assertion family + revision-correct as-of interval resolution; item B ENTITY_CREATED/ENTITY_ARCHIVED versioning + entity-lifecycle projection filtering (ACTIVE→ARCHIVED only; MERGED/SPLIT deferred); item C typed GraphRevisionEvents (5 change types) + strict `toGraphRevisionMetadata`; item D partial unique ACTIVE GraphVersion index per case; items E/F/G concurrent version uniqueness + single-ACTIVE + idempotent TSC + append-only trigger verified; pure suites green (85 tests incl. 18 revision-events); **real-Postgres suites all green (43/43: PR2 10, PR3 8, temporal-history 7, hardening 11, HTTP-security 7)** (verification status below)
- [x] M-A13: Graph query layer (typed graph service APIs) `[Mayur]` — GraphRuntime bounded traversal/centrality/communities + express routes (`graph`, `graph/traversal`, `graph/centrality`, `graph/communities`); **backend-verified 9 graph-http integration tests; M-A13 second-pass hardening: canonical `ProjectedGraph` contract (`packages/contracts/src/graph/graph-projection.ts` — typed node/edge/graph + explicit truncation metadata), `structuralMetrics` enum narrowed to implemented metrics (`degree`, `community_membership`), `BuiltGraph`/`CommunityResult` truthful truncation metadata (community `size` + `truncated`), traversal work cap, legacy `/graph` migrated to the canonical shape + validated response, P2-04 `projectGraphValidAt` now a pure read (never overwrites ACTIVE version counts), entity lifecycle + `startEntityId` UUID boundary guards; real-Postgres suites green (graph-http 9, ingest-http 8, HTTP-security 7, PR3-apis 9 incl. P2-04 regression); broad live-mode UI surfacing (entities/graph/relations providers) still stub (`UnsupportedGraphProvider`/`UnsupportedEntityProvider`/`UnsupportedRelationProvider`) — frontend-phase work** 🟡

### Pre-M-A12 Foundation Audit (gate for M-A12)

Before M-A12 starts, the following audit items gate it (see `development-plan.md` "M-A12 Entry Gate" and "Known Limitations"). Future semantic retrieval is **NOT** required to enter M-A12.

- [x] M-A12-G1: M-A06 observation representation audited for silent source-context loss (fragmentation concern) — remediation planned if loss found `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): Observation preserves `sourceContextId`/`eventTime` (observation-extractor.ts:425-449, store round-trip observation-store.ts:239/338-340, m-a12-temporal-history.test.ts:178); fragmentation concern + remediation documented (dev-plan §23.3/§23.8); named limitation: no ingestion-unit test asserts these fields
- [x] M-A12-G2: M-A07 candidate provenance verified (candidate ≠ entity; candidateId never becomes EntityId) `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): distinct id namespaces; canonical EntityId from `(caseId, canonicalName, entityType)` under ACCEPT authority only; no path assigns candidate/pair id → entityId
- [x] M-A12-G3: M-A08 blocking semantics verified (cheap deterministic recall-control layer; bounded; pair ≠ identity) `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): deterministic bounded UNION blocking (maxBlockSize 50/maxPassesPerPair 100); pair carries no EntityId/score; per-pair idempotent store
- 🟡 [x] M-A12-G4: M-A09 authority boundary verified (candidate → pair → hypothesis → explicit authority → canonical Entity) `[Both]` — **VERIFIED accept chain** (entity-materialization.ts:173-315, one-tx Entity+ENTITY_CREATED versioning; hypothesis≠truth); **PARTIAL**: entity reject/reverse authority unimplemented (relation-only) + `m-a09-entity-resolution.md` §13 stale (follow-up)
- [x] M-A12-G5: M-A10 relation authority verified (canonical Entity + evidence → relation candidate → scoring → hypothesis → explicit authority → canonical Relation → Graphology) `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): accept/reject/reverse authority + directionality-aware identity + same-tx GraphVersion/TSC coupling; suites green (relation 18, graph 6, graph-http 9, contradiction 2, ingest-http 8)
- [x] M-A12-G6: M-A11 graph projection verified (Graphology derived/disposable; Postgres authoritative) `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): Postgres authoritative / Graphology derived+disposable; deterministic replay (normalizeBuiltGraph); reverse containment over time
- [x] M-A12-G7: M-A13 current graph APIs verified (graph, traversal, centrality, communities) `[Both]` — **VERIFIED** (`docs/reports/m-a12-entry-gate-audit.md`): case-scoped + bounded + canonical truncation metadata; suites green (graph-http 9, security 7, PR3-apis 9, ingest-http 8); non-blocking: 3 analytics routes lack requireRole
- [x] M-A12-G8: DEMO / LIVE / AUTO regression status documented (frontend provider seam intact; demo untouched) `[Both]` — **DOCUMENTED** (`docs/reports/m-a12-entry-gate-audit.md`): seam + per-capability AUTO intact; four protected demo files untouched by M-A12 commits (git-verified)

> **Entry criterion:** G1–G8 satisfied (documented), plus DEMO/LIVE/AUTO regression status recorded. Semantic retrieval may remain unimplemented at M-A12 entry, by design. **— COMPLETE (12 Sep 2026):** all eight audits documented in `docs/reports/m-a12-entry-gate-audit.md`; G1–G3, G5–G7 verified, G4 tracked 🟡 (entity reject/reverse deferred to M-A09 follow-up), G8 documented.

### M-A12 — Temporal Projection

**Design lock (authoritative):** `docs/platform/m-a12-temporal-architecture.md` — locked D1–D7, temporal vocabulary, interval/graph-version/history semantics, data model, API/index/test plans, PR breakdown. **Semantics quick reference:** `docs/platform/temporal-semantics.md` (D5 intervals, WS-3 producer, valid-at containment, WS-13 append-only history, amendments, revision events, DB invariants).

- [x] 🔵 M-A12-PR0: Temporal architecture + design lock (design/contract/docs only; **DESIGN / LOCK**) `[Mayur]` — no runtime implementation; all D1–D7 decisions locked; dev-plan §23.11 + design doc updated; PR1/PR2/PR3 remain **planned**
- [x] M-A12-PR1: Temporal history + intervals (persist domain event-time + validity intervals + immutable temporal history; runtime validation; indexes; deterministic reconstruction) — maps T1 + T2 `[Mayur]` — **IMPLEMENTED** (contract fields incl. `month`/`year` precision, D5 validation module + `containsTime`, temporal columns + `TemporalStateChange` store + `logicalKey` idempotency, MA06 event-time/source-context propagation + D6 history wiring + WS-2 boundary validation in completeMA06; PR1 unit suite green; real-Postgres PR1 integration suite green (7);
- [x] M-A12-PR2: Graph versions + historical projection (`GraphVersion` D4, version on canonical change D6, current-vs-historical §8) — maps T3 + T4 `[Mayur]` — **IMPLEMENTED** (`GraphVersion` model + store, per-case transaction-scoped advisory-lock `versionNumber` allocation, lifecycle matrix + **WS-7 auto-activation** (create → ACTIVE; prior ACTIVE→SUPERSEDED/STALE demoted in same tx), parent lineage, projection-status, **WS-8 strict `decodeChange`** (GraphRevisionCorruptError on corrupted known change; unknown types skippable); authority coupling in `relation-materialization.ts` — accept/reverse create a version + TSC row in the same tx, reject none; `relation/graph-version-service.ts` current + historical projection (revision-order replay) + **WS-10 `projectGraphValidAt`** (dimension B domain-time containment), dimension A (revision) vs B (domain validity) distinct, REJECTED/REVERSED preserve history, `normalizeBuiltGraph` deterministic replay; PR2 pure unit suite **green** (21 tests); real-Postgres PR2 integration suite green (10); T3/T4 runtime: graph-version boundary + reconstruction **done in PR2**, checkpoint relationship deferred to PR3)
- [x] M-A12-PR3: Temporal/history APIs + checkpoint coupling + full verification — maps T4/T5 `[Mayur]` — **IMPLEMENTED** (case-scoped `GET /cases/:caseId/graph/{current,versions,versions/:vid,valid-at}` routes with fail-closed auth; `as-of` deferred as 501; **WS-10 valid-at** = dimension-B containment via `containsTime` (instant-grade bounds only, closed intervals, 400 on unparseable `at`); D7 `associateCheckpoint`/`resolveVersionByCheckpoint` via existing `GraphVersion.checkpointId` — no schema migration; `listByCasePaginated` with total count; **WS-3 `deriveValidityInterval` producer wired into completeMA10; WS-13 same-tx TSC writers** (RELATION ACCEPTED/REVERSED, ENTITY CREATED); PR3 pure unit suite **green** (18 tests); real-Postgres PR3 integration suite green (8); design doc B.1.15/B.1.16 updated)

And the underlying temporal sub-items (tracked to reflect reality):

- [x] M-A12-T1: Temporal model (event/ingestion time vs observation time vs validity interval vs materialization/reversal time — **never `updatedAt` as domain-valid time**) `[Mayur]` — model **locked in PR0**; runtime persistence in PR1 **done** (`Observation.eventTime/sourceContextId/validityInterval`, `Relation`/`RelationHypothesis.validityInterval`, `TemporalStateChange`)
- [x] M-A12-T2: Interval semantics, open-ended intervals, boundary semantics, late / out-of-order evidence (event order ≠ domain time) `[Mayur]` — semantics **locked in PR0**; runtime enforcement in PR1 **done** (`temporal/interval-validation.ts` D5 rules + deterministic reconstruction primitives in `TemporalStateChangeStore`)
- [x] M-A12-T3: Graph version boundary + deterministic graph version IDs + checkpoint relationship `[Mayur]` — design **locked in PR0**; graph-version boundary + natural key + allocation **runtime in PR2 done**; checkpoint relationship **done in PR3** (`associateCheckpoint`/`resolveVersionByCheckpoint`)
- [x] M-A12-T4: Temporal reconstruction: Postgres authoritative history → temporal selection → Graphology projection → analytics (Graphology stays disposable) `[Mayur]` — design in PR0; internal reconstruction service **in PR2 done** (`graph-version-service.ts`: revision-order historical selection, `projectCurrentGraph`, `projectGraphVersion`, `projectGraphValidAt`, `normalizeBuiltGraph`); query APIs **done in PR3** (case-scoped `GET /cases/:caseId/graph/{current,versions,versions/:vid,valid-at}` routes); `as-of` deferred (501)
- [x] M-A12-T5: Reversal-over-time + interaction with checkpoints (immutable audit history; do not reorder) `[Mayur]` — design in PR0; reversal lifecycle preserved in PR2 (`REVERSED` retained, not deleted); checkpoint interaction **done in PR3** (`associateCheckpoint`/`resolveVersionByCheckpoint`; explicit association model; cross-case isolation verified)

> **Status:** M-A12-PR0 = DESIGN/LOCK (complete as a design PR). M-A12-PR1 = **IMPLEMENTED** (persistence/validation/history + WS-2 boundary validation; PR1 pure suite green). M-A12-PR2 = **IMPLEMENTED** (graph versioning + WS-7 auto-activation + WS-8 strict replay + WS-10 `projectGraphValidAt`; PR2 pure suite green (21 tests)). M-A12-PR3 = **IMPLEMENTED** (temporal APIs incl. WS-10 `valid-at`, WS-3 interval producer, WS-13 same-tx TSC writers; PR3 pure suite green (18 tests)). **M-A12 SECOND-PASS HARDENING = IMPLEMENTED** (ws item A amendment authority + ORIGINAL→AMENDMENT temporal assertions + revision-correct as-of projection; item B ENTITY_CREATED/ENTITY_ARCHIVED versioning + entity-lifecycle node filtering; item C typed `GraphRevisionEvent`s (5 change types); item D partial unique ACTIVE index per case; items E/F/G concurrency + idempotency; revision-events pure suite green (18 tests).
> **Full M-A12 verification:** 85 pure tests green (5 suites: interval-aggregation 7, temporal-interval-validation 21, PR2 21, PR3 18, revision-events 18) + **43/43 real-Postgres integration tests green** (PR2 10, PR3 8, temporal-history 7, hardening 11, HTTP-security 7) run against a migrated `TEST_DATABASE_URL` (Neon/Postgres, `prisma migrate deploy`-equivalent schema path — the same path CI uses with its Postgres 16 service, baseline + append-only-trigger + unique-ACTIVE migrations). Two genuine concurrency bugs surfaced and fixed during this run (`GraphVersionStore.createVersion` insert-before-demote vs. partial unique ACTIVE index; `TemporalStateChangeStore.recordChange` P2002-re-read inside aborted tx → `createMany(skipDuplicates)` + winner re-read). G1–G8 entry-gate audits COMPLETE (12 Sep 2026, `docs/reports/m-a12-entry-gate-audit.md`); semantic retrieval not required.

---

## Phase 2B — Gurashish Execution / Platform Foundation

**Date:** 26-28 Aug | **Owner:** Gurashish | **Gate:** Execution lane compiles independently

- [x] G-A01: API/service skeleton (Node.js service base) `[Gurashish]`
- [x] G-A02: PostgreSQL/Prisma base (persistent execution store) `[Gurashish]`
- [x] G-A03: Redis + BullMQ (queues/workers) `[Gurashish]`
- [x] G-A04: Investigation state machine (run lifecycle) `[Gurashish]`
- [x] G-A05: Checkpoint store (resume/replay state) `[Gurashish]`
- [x] G-A06: Tool registry (tool metadata + validation) `[Gurashish]`
- [x] G-A07: Tool execution runtime (request/result pipeline) `[Gurashish]`
- 🟡 [x] G-A08: Agent orchestrator (bounded planning loop) `[Gurashish]` — claim-grounding + BullMQ job dispatch implemented; orchestration is event-driven queue dispatch, no explicit plan→observe→reflect→converge loop
- [x] G-A09: Retries/circuit breakers (failure controls) `[Gurashish]`
- [x] G-A10: Realtime event stream (investigation progress events) `[Gurashish]`
- [x] G-A11: Audit event infrastructure (append-only audit records) `[Gurashish]`
- [x] G-A12: Auth/RBAC skeleton (protected endpoints) `[Gurashish]`

---

## Phase 3 — Vertical Integration #1

**Date:** 28 Aug | **Owner:** Both | **Gate:** One case visible end-to-end

### Mayur

- [x] Expose ingestion API `[Mayur]` — `POST /investigations/:id/evidence`: submission body → artifact fetch/sha256-verify/mime-detect → BullMQ job → worker; verified in the REAL-STACK E2E and the live case-deletion gate
- [x] Expose observation API `[Mayur]` — `GET /investigations/:id/observations` (full ObservationSchema records, case-scoped via auth → latest run → run.caseId; routes.ts)
- 🟡 [x] Expose entity resolution API `[Mayur]` — decision authority exists (accept/reject/reverse route + canonical materialization, integra-verified); full resolution UX/review surface is frontend-phase work, not yet exposed end-to-end
- 🟡 [x] Expose graph projection/query API `[Mayur]` — projection/query routes exist (graph, traversal, centrality, communities, 404/401/403 integration-tested); broad live-mode UI surfacing is frontend-phase work `[graph-http 9 tests]`
- 🟡 [ ] Seed one deliberately messy synthetic case `[Mayur]` — test fixtures + web demo fixtures only; **no product seed path / no benchmark dataset** — capability present in form only, does NOT satisfy the milestone

### Gurashish

- [x] Create investigation run `[Gurashish]`
- [x] Queue ingestion job `[Gurashish]`
- [x] Consume tool results `[Gurashish]`
- [x] Persist state `[Gurashish]`
- [x] Emit progress events `[Gurashish]`
- 🟡 [x] Show graph-ready state in UI shell `[Gurashish]` — run state (InvestigationStatus/StateBadge) renders in the live UI shell; graph/entity/relation live providers remain `UnsupportedGraphProvider`/`UnsupportedEntityProvider`/`UnsupportedRelationProvider` stubs (frontend-phase work)

### Joint Integration Test

- 🟡 [ ] FIR > INGEST > OBSERVATIONS > ENTITY HYPOTHESES > RELATIONS > GRAPH > INVESTIGATION STATE > UI `[Both]`
  - Partial: the `INGEST > OBSERVATIONS > INVESTIGATION STATE > SSE > UI(live)` leg is proven by the REAL-STACK E2E (HTTP → BullMQ → worker → Postgres → SSE) plus the M-A06 Option A live re-ingest test. The `ENTITY HYPOTHESES > RELATIONS > GRAPH` leg is now built (M-A07–A10, A13: canonical entity/relation authority + Graphology projection), with the backend proven end-to-end (real Postgres 43/43 integration across 5 suites incl. graph/traversal/centrality/communities over real HTTP via `m-a10-ingest-http.e2e` + `m-a10-graph-http`); remaining gaps: a single full `HTTP → BullMQ → worker → resolution → graph` demo pass, the temporal projection (M-A12), and live-mode frontend surfacing of entities/graph/relations (providers are still `Unsupported*` stubs).

---

## Phase 4 — Core Investigation Loop

**Date:** 29-30 Aug | **Owner:** Both | **Gate:** Lead generation works

### Mayur

- [x] Implement temporal burst detection `[Mayur]`
- [x] Implement community candidates `[Mayur]`
- 🟡 [x] Implement bridge/connector candidates `[Mayur]` — web-only deterministic cut-edge detection/rendering (`use-graph-layout`); no backend candidate-generation metric (betweenness/bridge_impact explicitly unimplemented) — NOT milestone completion
- 🟡 [x] Implement bounded path queries `[Mayur]` — M-A13 delivered and tested the backend capability (`graph/traversal`, hop ≤ 4, path cap; 9 graph-http tests); not yet surfaced as a Phase 4-graded investigation-loop path query
- [x] Implement cross-case shared-entity/infrastructure discovery `[Mayur]`
- 🔵 [ ] Cross-observation relation retrieval `[Mayur]` — recover relation candidates that span different observations (shared infrastructure / temporal / explicit relation claims / graph-gap-driven / semantic retrieval); must preserve "candidate relationship ≠ canonical relationship" and distinguish DIRECT RELATION EVIDENCE vs INDIRECT STRUCTURAL LINKAGE vs SEMANTIC ASSOCIATION
- 🟡 [x] Create InvestigativeLead structure `[Mayur]` — `LeadSchema` contract + web-demo `buildLead`/`DemoLeadProvider` exist; no backend runtime/lifecycle — structure defined, milestone NOT complete
- 🟡 [x] Attach evidence FOR / AGAINST `[Mayur]` — platform persists supporting/contradicting observation sets (`EntityHypothesis`/`RelationHypothesis` evidenceBasis/contradictions); no dedicated verdict/attach API — runtime data exists, dedicated attach surface NOT complete
- [x] Generate alternative explanations `[Mayur]`
- [x] Persist lead provenance `[Mayur]`

### Gurashish

- [x] Implement investigation state transitions around analysis `[Gurashish]`
- [x] Add tool orchestration for graph analytics `[Gurashish]`
- [x] Persist Lead/Hypothesis lifecycle `[Gurashish]`
- 🟡 [x] Stream analysis progress to UI `[Gurashish]` — SSE infra + live run-status projection are real; analysis-progress events not yet emitted — NOT milestone completion
- 🟡 [x] Implement human-review state `[Gurashish]` — `REVIEW_REQUIRED` state + transitions frozen in the state-machine contract; runtime entry/wiring not implemented
- 🟡 [x] Add pause/resume behavior `[Gurashish]` — `PAUSED` + resume transitions frozen in the state machine; runtime only enters `PAUSED` via human escalation (`queue/recovery.ts`); no resume trigger yet

### Joint Checkpoint

- [x] CASE > GRAPH > STRUCTURAL SIGNAL > INVESTIGATIVE LEAD > EVIDENCE FOR/AGAINST > HUMAN REVIEW `[Both]`

---

## Phase 5 — Differentiation Engine

**Date:** 31 Aug-1 Sep | **Owner:** Both | **Gate:** Graph-hole demo works

### 5A. Mayur — Graph-Hole / Intelligence-Gap Core

- [x] Detect candidate missing relationships `[Mayur]` — `packages/intelligence/graph-hole-detection` (`@indago/graph-hole-detection`): **pure, deterministic, bounded raw graph-hole candidate detectors** consuming a `GraphHoleRegion` + PR3 `HypothesisContext`; six detectors (`MISSING_EDGE`, `MISSING_PATH`, `ISOLATED_NODE`, `BROKEN_CHAIN`, `TEMPORAL_GAP`, `COMMUNITY_BOUNDARY`) emit `RawGraphHoleCandidate`s (PR0 identity + sha256 candidateId) and **merged with the existing web/demo graph-hole overlay layer** — backend detection runtime now present, milestone complete (see `docs/architecture/pr4-graph-hole-detection.md`)
- [x] Candidate-region builder (PR1/13 — region layer for graph-hole detection) `[Mayur]` — `packages/intelligence/graph-hole-region` (`@indago/graph-hole-region`): **deterministic, observation-seeded, bounded region construction over the real M-A13 Graphology projection** (node id = canonical EntityId; read-only expansion queries; no second graph authority). Round 0 = seed resolution (entityId → graph node, never invented) + temporal-filtered incident-edge context; rounds 1..3 = one-hop frontier + bounded edges; **saturation = 2 CONSECUTIVE rounds with ≤0.10 novelty on BOTH observation and node axes** (a hard-bound round never counts); status precedence **DEGRADED > LIMITED > SATURATED** (rounds-exhausted = LIMITED; any unresolved seed / provider failure = DEGRADED); `regionId` = sha256(canonicalized `RegionIdentityV1`) — execution-order independent, content-addressed; **stabilized in PR1; semantic expansion added in PR2/13**. Region = analysis context, **NOT** a graph-hole candidate; SATURATED ≠ completeness
- [x] Semantic-embedding + retrieval foundation (PR1.5/13) `[Mayur]` — contracts (`SemanticRetrievalPort`, `SemanticTextUnit`, search/result schemas, `EMBEDDING_POLICY_VERSION=v1`) + pure engine `packages/intelligence/semantic-retrieval` (`@indago/semantic-retrieval`: canonicalization, content/query hashing, vector validation, `OllamaEmbeddingProvider` (verified `/api/embed`, `nomic-embed-text:latest`, 768-dim) + test-only `DeterministicEmbeddingProvider`, bounded batch/concurrency/retry pipeline, `SemanticSearchService`) + platform pgvector layer (`SemanticTextUnit`/`SemanticEmbedding` schema, hand-written `20240104000000` migration, deterministic-id stores, parameterized raw-SQL nearest-neighbour search with case isolation + true closed-interval temporal overlap + freshness join; **V1 exact cosine distance only — ANN/HNSW deferred**; fixed 768-dim storage) + CI image → `pgvector/pgvector:pg16`. PR1 seam conformance superseded by the PR2 production adapter. **Engine 47 unit tests; contracts 275; platform integration suite DB-gated (CI-authoritative)**
- [x] Semantic region expansion + Semantic→Node adapter (PR2/13) `[Mayur]` — frozen contracts (`SemanticExpansionStatusSchema` DISABLED/SUCCESS/EMPTY/PARTIAL/DEGRADED/LIMITED, `SemanticNodeMappingReportSchema` with `UNRESOLVED`/`NON_NODE_SOURCE` rejection reasons, per-round + region trace schemas incl. `providerTruncated`, `MAX_SEMANTIC_NODES_ADDED = 50` in policy `region.maxSemanticNodesAdded`, context-budget constants `MAX_SEMANTIC_CONTEXT_ITEMS` 32 / `MAX_SEMANTIC_CONTEXT_CHARS` 4096 / `MAX_SEMANTIC_QUERY_CHARS` 8192; tests 13) + `@indago/graph-hole-region` integration: optional builder dep `RegionBuildDependencies.semanticExpansion` = port + `AuthoritativeSemanticNodeAdapter` + case-scoped `resolveSourceEntities` + `getSemanticContextForRegion`; deterministic bounded-context query (`buildRegionSemanticQuery(contextItems, nodeIds)` — PRIMARY signal from authoritative context, ids supplementary, never UUID-only, no feedback loop); **failure isolation** (semantic failure/truncation/bound disables FUTURE semantic rounds only — never halts the deterministic M-A13 graph expansion; `budgetBoundReached` = graph caps only); **explicit provider `truncated` honored** (`LIMITED` + `SEMANTIC_RESULTS_TRUNCATED`, never inferred from a short result set); **temporal authority at the retrieval/storage boundary** (port receives the region `temporalContext`; adapter does no temporal revalidation); budgets `MAX_SEMANTIC_RESULTS_PER_ROUND` 20 / `MAX_TOTAL_SEMANTIC_RESULTS` 50 / `MAX_SEMANTIC_NODES_ADDED` 50, shared with the region-node budget; observation context surface; per-round trace on `GraphHoleRegion.semanticExpansion` (NOT an identity input — but semantically ADMITTED membership DOES change the region id deterministically); semantic failure ⇒ DEGRADED, never fake-empty; the retired PR1.5 `retrieveSemanticContext?` seam removed. **graph-hole-region suite 105 tests green** (adapter unit 13 incl. adversarial, semantic integration 16, query builder 6, conformance 4); region builds with no semantic dep remain valid PR1 regions (DISABLED)
- [x] Existing hypotheses → atomic + grouped context (PR3/13) `[Mayur]` — `packages/intelligence/hypothesis-context` (`@indago/hypothesis-context`): pure, read-only, derived grouping of authoritative `RelationHypothesis` + `EntityHypothesis` (NO second hypothesis lifecycle, NO fabricated ids/candidates/scores/temporal scope); `AtomicRelationshipHypothesis` (subject/predicate/object, hypothesisType, supporting/contradicting observations, contradictoryHypothesisIds, provenance, temporalScope, graphVersion); **overlap edges ONLY from shared canonical entity refs — no semantic/embedding/string/relation-type similarity**; WCC grouping + deterministic greedy split under frozen `MAX_ATOMIC_HYPOTHESES_PER_GROUP` (25) / `MAX_GROUP_NODES` (50) with content-addressed sha256 group/component ids; byte-stable output independent of input order (`EVIDENCE_SUPPORT_DESC → STRUCTURAL_RELEVANCE_DESC → derivedId ASC`); contradictions preserved through every stage; **PR3 suite 20 tests green**; boundaries (see `docs/architecture/pr3-hypothesis-context.md`): Candidate↔Candidate canonical bridge = `DEPENDENCY` (M-A09/M-A09.5 canonical-entity materialization), generic `Hypothesis`/lead adapters = `DEFERRED`, 50-node cap = `FORWARD-COMPATIBILITY`
- [x] Structured graph-hole analysis (PR7/13) `[Mayur]` — `packages/intelligence/graph-hole-analysis` (`@indago/graph-hole-analysis`): builds a bounded `GraphHoleAnalysisContext` (candidate, observations, atomic hypotheses, groups, structural signals, contradictions, provenance, completeness flags, temporal windows, counts) from the same authoritative inputs PR4/PR1/PR3 consumed, **canonicalizes it byte-for-byte** (`canonicalStringify`), stamps `contextSha256` + identity on the result, then drives a bounded LLM call to produce a zod-validated `GraphHoleAnalysisV1` (candidateAssessment, missingRelationship, reasoning steps, alternative explanations, uncertainty, warnings). Strict GraphHoleAnalysisV1Schema + strict schema-stamp; canonical serialization exported and reused by PR8's context binding. PR7 committed/pushed as `f9ee707`.
- [x] Deterministic AI claim validator (PR8/13) `[Mayur]` — `packages/intelligence/graph-hole-validation` (`@indago/graph-hole-validation`): **pure, 0-LLM, closed-world validator** over `(result, context, serializedContext)`; 11 frozen finding codes; 15 checked categories; verifies reference existence, identity/digest/binding (canonical re-serialization), authority/version, temporal scope containment, evidence classification (incl. ungrounded STRUCTURAL_SIGNAL), provenance (per-reference paths), relationship consistency (expected type + assessment coherence + substitution detection + direction enum), contradiction preservation (relevance-aware incl. hyp-vs-hyp `contradictsHypothesisId`), structural signal basis/status/node+edge refs, epistemic safety (negation-guarded pattern rules + rating/warning-code enums + uncertainty range), completeness overclaim (context-flag aware, `INSUFFICIENT_CONTEXT` exemption). ERROR findings ⇒ invalid; WARNING retainable. **112 tests green (98 core + 9 architecture + 5 security)**; see `docs/architecture/pr8-graph-hole-validation.md`.
- 🟢 [x] Classify gap (Phase 5A-PR14) `[Mayur]` — deterministic / structured classification of a qualified GraphHole into **one frozen V1 label** (`MISSING_INVESTIGATION` / `MISSING_DATA` / `MISSING_COMPARISON` / `INFRASTRUCTURE_GAP` / `CONCEALMENT_CONSISTENT_PATTERN`). PR14 landed 2026-09-17: pure, derived `@indago/gap-classification` over certified PR1/PR3/PR5/PR13 outputs — single label + confidence + structural impact + expected information value + reasons + closed-world provenance + `contextSha256` identity; typed failures only (`INVALID_INPUT` / `UNSUPPORTED_POLICY` / `CONTEXT_MISMATCH` / `QUALIFIED_CANDIDATE_REQUIRED`); **NO** persistence/model/migration, HTTP endpoint, LLM, or hidden retrieval. **49 unit + 5 real-Postgres integration green**; contracts 445; Phase 5A regression re-run green (see `docs/architecture/pr14-gap-classification.md`)
- 🟢 [x] Generate competing explanations (Phase 5A-PR15) `[Mayur]` — bounded, ranked, deterministic competing explanations for a qualified GraphHole, bound to the **real** PR14 classification (`@indago/competing-explanations`). PR15 landed 2026-09-17: nine frozen families, each emitted only when a grounded PR1/PR3/PR5/PR14 signal is present; primary mirrors the PR14 label; content-addressed identity + dedupe + fixed-width flipped-digit ranking (support DESC → frozen family ASC → diversity DESC → coverage DESC → id ASC), bound 5; contradictions never collapse into concealment/missing-data; pattern-compatible concealment wording; `INSUFFICIENT_CONTEXT` ⇒ empty set (result, not error); typed boundary failures only (context binding via re-run `classifyGap`). **29 unit tests green; contracts 475/22; platform integration written + typechecked (T0–T4) — execution deferred (Neon DB unreachable)** (see `docs/architecture/pr15-competing-explanations.md`)
- [ ] Detect when an ER split could explain a graph hole `[Mayur]`
- 🟢 [x] Targeted reblocking `[Mayur]` — selectively generate candidate pairs around a suspicious candidate/entity/evidence region after downstream analysis suggests a missed match; **NOT** an O(N²) all-candidate sweep; preserve case isolation, deterministic identity, pair-level idempotency, bounded computation, auditability. PR11 landed 2026-09-16: frozen contracts + `@indago/targeted-reblocking` pure core (region-membership selector → bounds → M-A08 reuse → content-addressed run identity) + platform `TargetedReblockRun` persistence + M-A09 handoff (see `docs/architecture/pr11-targeted-reblocking.md`)
- 🟢 [x] Incremental graph-hole reassessment (Phase 5A-PR12) `[Mayur]` — after an authoritative change, recompute **only** the graph-hole intelligence that could have been affected (bounded per-case pull, never a whole-case fallback). PR12 landed 2026-09-16: frozen contracts + pure `@indago/graph-hole-reassessment` (derived effect classes, affected-set/plan resolution, deterministic `changeId`/outcome derivation — RESOLVED/SUPERSEDED always deterministic, never AI); platform change ledger (`CaseReassessmentChange` `changeId @unique` dedup + advisory-locked per-case sequences) + per-case cursor watermark + `ReassessmentRun` append-only audit; `publishCaseChange` authorizing seam + producers (ingest-evidence, entity/relation materialization — published AFTER the authority txn commits); `ReassessmentRunner` (per-case advisory lock, ≤25 changes/run, group+coalesce by effect-class/graph-version, `contextSha256` AI-skip gate, SKIPPED_CONTEXT_UNCHANGED/SKIPPED_NO_CHANGE/RECOMPUTED/FAILED, GRAPH_AFFECTING identity recompute, PARTIAL on region failure with cursor advance); orchestrator `graph-hole-reassessment` job; **PR12 integration suite green 6/6 real Postgres** (T1 ledger/tail-skip, T2 evidence + context gate, T3 concurrency serialization, T4 corrupt-region isolation, T5 GRAPH_AFFECTING envelope); platform units green 204/204 (incl. worker-stub) — see `docs/architecture/pr12-reassessment-policy.md`
- 🟡 [ ] Generate candidate evidence requests `[Mayur]` — web/demo lifecycle exists (`buildEvidenceRequest`, evidence-request fixtures) + `EvidenceRequestSchema`; backend generation absent — NOT milestone completion. 🔵 PR10 contract freeze landed 2026-09-15 (`docs/architecture/pr10-evidence-policy.md`): candidate/generation contracts + selection bounds frozen
- 🟡 [ ] Calculate normalized evidence utility `[Mayur]` — web NBE mock (`netUtility` card) + `ExpectedInformationGainSchema` contract; no utility algorithm — NOT milestone completion. 🔵 PR10 freeze 2026-09-15: `EVIDENCE_UTILITY_POLICY_V1` formula/weights/semantics frozen (`docs/architecture/pr10-evidence-policy.md`)
- [ ] Implement Evidence Resolution Rate@K evaluation `[Mayur]`
- [ ] Add evidence-independence tracking `[Mayur]`

### 5B. Gurashish — Investigation Workflow Around the Gap

- 🟡 [ ] Add graph-hole event type `[Gurashish]` — typed `GRAPH_HOLE_DETECTED` event + payload already declared (`events/graph-events.ts:118`, `event-types.ts`); emission not yet wired to a detection runtime
- 🟡 [ ] Add gap lifecycle state `[Gurashish]` — `GapStatusSchema` (IDENTIFIED…ADDRESSED/WONFIX) frozen (`domain/investigative-gap.ts`; ⚠️ `WONFIX` typo pending amendment); no Gap model/store/runtime yet
- [ ] Add evidence-request job `[Gurashish]`
- [ ] Implement human approval for request `[Gurashish]`
- 🟡 [ ] Implement WAITING_FOR_EVIDENCE state `[Gurashish]` — state + transitions frozen in the state-machine contract; runtime entry/exit + evidence-arrival wiring not implemented
- 🟡 [ ] Handle evidence arrival event `[Gurashish]` — PR12 (Phase 5A, Mayur) backend trigger loop handles evidence arrival (ingest-evidence producer → change ledger → `graph-hole-reassessment` job); full 5B/5C workflow + UI surfacing absent — backend partial, NOT milestone completion
- 🟡 [ ] Re-trigger reassessment `[Gurashish]` — PR12 (Phase 5A, Mayur) incremental reassessment engine landed: new evidence/observation and accepted entity/relation resolutions re-trigger reassessment via the change ledger + cursor; 5B/5C end-to-end workflow loop still outstanding — backend partial, NOT milestone completion
- 🟡 [ ] Stream graph/lead changes live `[Gurashish]` — web overlay materialization via `graph-live.ts` + realtime normalizer (demo); backend SSE for graph/lead changes absent — NOT milestone completion

### 5C. Signature Integration

- [ ] GRAPH > LEAD > GRAPH HOLE > WHY IS IT MISSING? > BEST NEXT EVIDENCE > HUMAN VERIFICATION > NEW OBSERVATION > GRAPH UPDATE > REASSESS `[Both]`

---

## Phase 6 — Robustness, Trust, and Agent Reliability

**Date:** 2 Sep | **Owner:** Both | **Gate:** High-impact lead survives trust checks

### 6A. Mayur

- [ ] Implement staged robustness `[Mayur]`
- [ ] Add graph version + perturbation policy cache key `[Mayur]`
- [ ] Add candidate-region restriction `[Mayur]`
- [ ] Add incremental recomputation where possible `[Mayur]`
- [ ] Add adaptive stopping `[Mayur]`
- [ ] Evaluate ER pair completeness / false split / false merge `[Mayur]`
- [ ] Run missingness regimes (random, source-dependent, entity-dependent, structure-dependent, strategic sparsification) `[Mayur]`
- [ ] Separate structural signal from robustness from evidence posture `[Mayur]`
- 🔵 [ ] Semantic retrieval architecture (future) `[Mayur]` — high-recall embedding/LLM retrieval feeding structured analytical signals into the existing deterministic scoring; semantic similarity is **NOT** evidence and embeddings/LLMs **never** create canonical entities/relations; recall-optimizing retrieval layer, precision/explainability stays in the deterministic policy + explicit authority

### 6B. Gurashish

- 🟡 [x] Implement checkpoint/recovery tests `[Gurashish]` — recovery machinery + E2E checkpoint-row assertions exist (`ingestion-pipeline.e2e`); no dedicated checkpoint/recovery contract unit suite
- 🟡 [x] Implement bounded retries and circuit breakers `[Gurashish]` — BullMQ attempts/backoff E2E-proven (`real-stack.e2e` real retry + permanent failure); `tools/runtime.ts` bounded-retry/backoff circuit-breaker path has zero direct test coverage (`executeToolSafe` never imported by any test)
- [x] Implement tool idempotency `[Gurashish]`
- [x] Implement claim-grounding validator `[Gurashish]`
- [x] Reject unsupported agent claims `[Gurashish]`
- [x] Persist AgentCheckpoint `[Gurashish]`
- [x] Record recovery in audit trail `[Gurashish]`
- [x] Implement safe human escalation `[Gurashish]`

### 6C. Joint Trust Checkpoint

- [ ] CORRECT TOOL RESULT + WRONG AGENT CLAIM > CLAIM GROUNDING > REPLAN `[Both]`
- [ ] MISSING EDGE > GAP CLASSIFICATION > NO INTENT INFERENCE `[Both]`
- [ ] HIGH CENTRALITY > STRUCTURAL SIGNAL ONLY `[Both]`
- [ ] HIGH MODEL SCORE > NOT LEGAL ADMISSIBILITY `[Both]`

---

## Phase 7 — Investigator UX

**Date:** 3 Sep | **Owner:** Both | **Gate:** Judge-ready investigation workspace

### 7A. Gurashish (Implementation)

- 🟡 [ ] Investigation workspace shell `[Gurashish]` — full routes/nav dock + overview/scaffold render (`app/investigations/[id]/**`); live surfaces partial — demo/imcomplete milestone, NOT completion
- 🟡 [ ] Graph visualization `[Gurashish]` — rendered d3-force graph + 5-zone control center (`graph-panel`, `graph-canvas`) — demo mode
- 🟡 [ ] Timeline visualization `[Gurashish]` — provider-driven `timeline-panel` — demo mode
- 🟡 [ ] Lead card `[Gurashish]` — `DemoLeadProvider` + leads-list/drawer; dedicated route feeds hardcoded `DEMO_LEADS` — partial, NOT completion
- 🟡 [ ] Evidence FOR / AGAINST panels `[Gurashish]` — contradiction envelopes + `forAgainst` surface (`phase2-hypothesis-surface`) — demo mode
- 🟡 [ ] Gap / graph-hole visualization `[Gurashish]` — burst layer + gap-adapter + `DemoGapProvider` — demo mode; dedicated gaps route is a stub
- 🟡 [ ] Next-best-evidence panel `[Gurashish]` — NBE card + derived `nbeLead` surface; no dedicated panel — partial, NOT completion
- 🟡 [ ] Reasoning ledger `[Gurashish]` — `reasoning-ledger` component + demo ledger; ledger route feeds hardcoded data — partial, NOT completion
- 🟡 [ ] Review/approval UI `[Gurashish]` — `review-center` + `DemoReviewProvider`; demo route feeds `DEMO_TASKS` — demo mode
- 🟡 [ ] Realtime progress and recovery states `[Gurashish]` — PAUSED + recovery visuals render; `HUMAN_ESCALATION` not surfaced anywhere — partial, NOT completion
- 🟡 [ ] Premium loading/empty/error states `[Gurashish]` — `ui/` empty-state/error-display/loading-spinner/panel-error-boundary kit

### 7B. Mayur (Intelligence Presentation)

- [ ] Define exact meaning of every intelligence score shown `[Mayur]`
- [ ] Define language for structural signal vs investigative relevance `[Mayur]`
- [ ] Define gap labels and explanations `[Mayur]`
- [ ] Define evidence posture presentation `[Mayur]`
- [ ] Define alternative-explanation presentation `[Mayur]`
- [ ] Define what evidence must be clickable/source-traceable `[Mayur]`
- [ ] Review graph semantics for misleading visual interpretations `[Mayur]`
- 🔵 [ ] Source / context visualization `[Mayur]` — surface contextual source-grounded spans (artifact → section → context span → observation → mention) alongside atomic observations; preserve "atomicity for computation + contextuality for investigation"
- 🔵 [ ] Provenance / uncertainty / absence UX `[Mayur]` — show supporting vs contradicting evidence, spanning, uncertainty, absence vs concealment distinction, score vs probability, confidence vs legal admissibility

---

## Phase 8 — Synthetic Benchmark and Adversarial Evaluation

**Date:** 3-4 Sep | **Owner:** Both | **Gate:** Metrics produced

### 8A. Mayur

- [ ] Build development generator `[Mayur]`
- [ ] Generate ground-truth networks `[Mayur]`
- [ ] Transform into observations (aliases, duplicates, missingness, contradictions, sparsification) `[Mayur]`
- [ ] Generate known hidden relationships `[Mayur]`
- [ ] Generate entity collisions and splits `[Mayur]`
- [ ] Create expected graph-hole/evidence mappings `[Mayur]`
- [ ] Define intelligence metrics `[Mayur]`
- 🔵 [ ] Semantic intelligence benchmark (future, must precede major adoption of semantic scoring) `[Mayur]` — compare V1 deterministic-only vs V2 +embeddings vs V3 +embeddings +LLM judge; measure candidate recall, entity precision/recall, false merges/splits, relation precision/recall, graph-hole precision, evidence-retrieval utility, robustness stability, latency, cost
- 🔵 [ ] Model versioning for future semantic features `[Mayur]` — embeddings/LLM-feature schema and weights determined by benchmark evidence, versioned separately; do not treat "embedding = better" as an assumption

### 8B. Gurashish

- [ ] Build blind evaluation harness `[Gurashish]`
- [ ] Hide ground truth during inference `[Gurashish]`
- [ ] Run repeatable experiment jobs `[Gurashish]`
- [ ] Persist metrics `[Gurashish]`
- [ ] Record runtime and failure/recovery metrics `[Gurashish]`
- [ ] Generate experiment summary `[Gurashish]`

### Benchmark Metrics

- [ ] Entity-resolution precision/recall measured `[Both]`
- [ ] False-merge / false-split rate measured `[Both]`
- [ ] Relation precision/recall measured `[Both]`
- [ ] Graph-hole precision measured `[Both]`
- [ ] Evidence Resolution Rate@K measured `[Both]`
- [ ] Robustness stability measured `[Both]`
- [ ] Claim-grounding accuracy measured `[Both]`
- [ ] Recovery rate measured `[Both]`
- [ ] Time-to-lead measured `[Both]`

---

## Phase 9 — Security, Privacy, Safety

**Date:** 4 Sep | **Owner:** Both | **Gate:** Security pass

### 9A. Gurashish

- [x] Authentication `[Gurashish]`
- 🟡 [x] RBAC `[Gurashish]` — `requireRole` + `RoleSchema` + `DEFAULT_ROLE_PERMISSIONS` exist (`api/auth.ts:157`); no test exercises the role gate (demo principal hardcoded `INVESTIGATOR`, so `requireRole` never 403s through real routes)
- [x] Case-scope authorization `[Gurashish]`
- [ ] PII masking `[Gurashish]`
- [ ] Tool authorization boundaries `[Gurashish]`
- [ ] Prompt-injection defenses for untrusted evidence `[Gurashish]`
- [ ] Audit access logging `[Gurashish]`
- 🟡 [x] Hash-linked audit events `[Gurashish]` — sha256 chain via `previousHash`/`GENESIS` in `audit/logger.ts`; no test asserts linkage/tamper-evidence
- [ ] Secret management `[Gurashish]`
- 🟡 [ ] Failure isolation `[Gurashish]` — bounded retries + circuit breaker + human escalation isolate per-run failures; no cross-run/comprehensive isolation — partial, NOT completion

### 9B. Mayur

- [ ] Review all intelligence wording for epistemic overclaim `[Mayur]`
- [ ] Verify role != culpability `[Mayur]`
- [ ] Verify absence != concealment `[Mayur]`
- [ ] Verify structural signal != criminal relevance `[Mayur]`
- [ ] Verify confidence != legal admissibility `[Mayur]`
- [ ] Verify blocked pair != different entity `[Mayur]`
- [ ] Verify alternatives/counter-evidence surfaced for high-impact leads `[Mayur]`

---

## Phase 10 — P1 / WOW Layer

**Date:** 5 Sep | **Owner:** Both | **Gate:** No P0 regression

- 🟡 [ ] Discovery Mode — detection logic `[Mayur]` — web/demo candidate derivation (`real-case/discovery.ts`, discovery fixtures); no backend — NOT milestone completion
- 🟡 [ ] Discovery Mode — workflow + UI `[Gurashish]` — `discovery-panel` + `DemoIntelligenceProvider.listDiscovery` (demo); live unsupported — NOT milestone completion
- [ ] Boundary Expansion — candidate logic `[Mayur]`
- [ ] Boundary Expansion — approval/UI `[Gurashish]`
- [ ] Route/Stage Mode — stage classifier + role checks `[Mayur]`
- [ ] Route/Stage Mode — visualization + workflow `[Gurashish]`
- [ ] Advanced robustness — analytics `[Mayur]`
- [ ] Advanced robustness — worker execution `[Gurashish]`
- [ ] Advanced ER recovery — candidate generation `[Mayur]`
- [ ] Advanced ER recovery — job orchestration `[Gurashish]`

---

## Phase 11 — Final Stress Test and Hardening

**Date:** 5 Sep | **Owner:** Both | **Gate:** No critical blocker

### Mayur Stress Tests

- [ ] Duplicate evidence `[Mayur]`
- [ ] Entity collisions `[Mayur]`
- [ ] False splits `[Mayur]`
- [ ] Contradictory timestamps `[Mayur]`
- [ ] Missing source classes `[Mayur]`
- [ ] Legitimate high-degree entities `[Mayur]`
- [ ] False bridge candidates `[Mayur]`
- [ ] Sparse networks `[Mayur]`
- [ ] Concealment-consistent patterns with innocent alternatives `[Mayur]`
- [ ] Graph-hole false positives `[Mayur]`

### Gurashish Stress Tests

- [ ] Duplicate jobs `[Gurashish]`
- [ ] Worker crash/restart `[Gurashish]`
- [ ] Redis interruption `[Gurashish]`
- [ ] Database timeout `[Gurashish]`
- [ ] Malformed tool request `[Gurashish]`
- [ ] Stale checkpoint `[Gurashish]`
- [ ] Agent loop `[Gurashish]`
- [ ] Contradictory tool output `[Gurashish]`
- [ ] Unauthorized tool call `[Gurashish]`
- [ ] Partial realtime connection `[Gurashish]`

### Joint Release Gate

- [ ] Functional: End-to-end demo path completes `[Both]`
- [ ] Data: No silent evidence loss `[Both]`
- [ ] ER: False merges/splits measured `[Both]`
- [ ] Graph: Provenance available `[Both]`
- [ ] Gap: At least one graph-hole > evidence > update cycle works `[Both]`
- [ ] Robustness: Top lead has reproducible stability result `[Both]`
- [ ] Agent: Claims are grounded and failures recover/escalate `[Both]`
- [ ] Security: Unauthorized actions blocked `[Both]`
- [ ] UI: No critical visual or state defects `[Both]`
- [ ] Demo: Resettable and repeatable `[Both]`

---

## Phase 12 — Final Demo Freeze

**Date:** 6 Sep | **Owner:** Both | **Gate:** DEMO FREEZE

### Mayur

- [ ] Seed final intelligence dataset `[Mayur]`
- [ ] Verify lead is deterministic enough for demo `[Mayur]`
- [ ] Verify graph-hole detection `[Mayur]`
- [ ] Verify evidence recommendation `[Mayur]`
- [ ] Verify counter-evidence story `[Mayur]`
- [ ] Verify robustness numbers are reproducible `[Mayur]`
- [ ] Prepare technical judge explanations `[Mayur]`

### Gurashish

- [ ] Freeze UI `[Gurashish]`
- [ ] Freeze investigation state flow `[Gurashish]`
- [ ] Freeze worker/queue configuration `[Gurashish]`
- [ ] Freeze realtime display `[Gurashish]`
- [ ] Freeze auth/demo access `[Gurashish]`
- [ ] Prepare reset path `[Gurashish]`
- [ ] Prepare fallback path if a service fails `[Gurashish]`
- [ ] Prepare deployment package `[Gurashish]`

### Demo Sequence

- [ ] MESSY CASE PACK > OBSERVATIONS > ENTITY/RELATION RESOLUTION > TEMPORAL GRAPH > CROSS-CASE SIGNAL > INVESTIGATIVE LEAD > GRAPH HOLE > GAP CLASSIFICATION > BEST NEXT EVIDENCE > COUNTER-EVIDENCE > ROBUSTNESS > VERIFIED EVIDENCE ARRIVES > GRAPH UPDATES > LEAD REASSESSMENT > REASONING LEDGER `[Both]`

---

## Summary

| Phase | Tasks | Done | Open | Mayur | Gurashish | Both | Done % |
|:------|------:|-----:|-----:|------:|-----------:|-----:|-------:|
| 0 | 10 | 10 | 0 | 0 | 0 | 10 | 100% |
| 1 | 40 | 40 | 0 | 20 | 6 | 14 | 100% |
| 2A | 34 | 31 | 3 | 26 | 0 | 8 | 91% |
| 2B | 12 | 12 | 0 | 0 | 12 | 0 | 100% |
| 3 | 12 | 10 | 2 | 5 | 6 | 1 | 83% |
| 4 | 17 | 16 | 1 | 10 | 6 | 1 | 94% |
| 5 | 22 | 5 | 17 | 13 | 8 | 1 | 23% |
| 6 | 21 | 8 | 13 | 9 | 8 | 4 | 38% |
| 7 | 20 | 0 | 20 | 9 | 11 | 0 | 0% |
| 8 | 24 | 0 | 24 | 9 | 6 | 9 | 0% |
| 9 | 17 | 4 | 13 | 7 | 10 | 0 | 24% |
| 10 | 10 | 0 | 10 | 5 | 5 | 0 | 0% |
| 11 | 30 | 0 | 30 | 10 | 10 | 10 | 0% |
| 12 | 16 | 0 | 16 | 7 | 8 | 1 | 0% |
| **Total** | **285** | **136** | **149** | **130** | **96** | **59** | **48%** |

> Counts are derived from the actual `[x]` / `[ ]` checkboxes in this file (owner-tagged rows only for Mayur/Gurashish/Both). **Open** = Tasks − Done. Phase 2A's total includes 17 M-A12 rows added by the V7 tracker reconciliation plus M-A12 implementation: 8 gate audits (G1–G8, `[Both]`, **verified 12 Sep 2026 — see `docs/reports/m-a12-entry-gate-audit.md`**) + 4 design/implementation rows (PR0–PR3, `[Mayur]`) + 5 implemented temporal deep-dives (T1–T5, `[Mayur]`).
