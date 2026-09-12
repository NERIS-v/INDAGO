# M-A12 Entry-Gate Audit — G1–G8

**Date:** 12 Sep 2026

**Scope:** Read-only verification of the M-A12 entry-gate audits defined in
`docs/roadmap/development-plan.md` §23.5 ("M-A12 Entry Gate", lines 798–814) against
repo evidence (source, tests, git history). No code was modified by this audit. Integration
suites were **not re-run** here; test counts cited are source-verified and match the green
claims already recorded in `docs/roadmap/phase-tracker.md` (M-A12 43/43 real-Postgres, 85 pure).

**Entry criterion (dev-plan:814):** G1–G8 satisfied (documented) + DEMO/LIVE/AUTO regression
status recorded. Semantic retrieval is **NOT** required to enter M-A12.

## Verdict summary

| ID | Entry-gate audit (dev-plan:805–812) | Verdict |
|---|---|---|
| G1 | M-A06 observation representation audited for silent source-context loss | **PASS** (2 named limitations) |
| G2 | M-A07 candidate provenance verified | **PASS** |
| G3 | M-A08 blocking semantics verified | **PASS** |
| G4 | M-A09 authority boundary verified | **PARTIAL** (🟡 — accept chain verified; entity reject/reverse gap) |
| G5 | M-A10 relation authority verified | **PASS** |
| G6 | M-A11 graph projection verified | **PASS** |
| G7 | M-A13 current graph APIs verified | **PASS** (1 non-blocking asymmetry) |
| G8 | DEMO/LIVE/AUTO regression status documented | **PASS** (artifact: this document) |

**Entry gate: SATISFIED.** All eight audits are documented below; semantic retrieval remains
explicitly out of scope for M-A12 entry.

---

## G1 — M-A06 observation representation / silent source-context loss — PASS

**Required evidence:** M-A06 observation representation audited for silent source-context loss;
remediation planned **if** loss found.

**Findings**
- `ObservationSchema` carries `sourceContextId`, `eventTime`, and `validityInterval`
  (`packages/contracts/src/domain/observation.ts:46-73`).
- `observation-extractor.ts` `assemble` builds provenance and derives `sourceContextId`
  (`:425-449`); `deriveSourceContextId` returns `undefined` only when coordinate/row context
  is absent (`:420-423`) — guarded and documented, **not silent**: provenance always retains
  `sourceId`/`artifactId`, and the observation `identityKey`
  (`evidenceId|sourceId|locationKey|type|canonicalContent`) is provenance-rooted, so a dedup
  re-pass loses nothing. `finalizeObservation` propagates `eventTime` only from a confident
  `observedAt` (`:513-544`; "normalization, not new extraction … Never invented when absent").
- Store round-trip persists and re-reads `sourceContextId` without fragment drift
  (`packages/platform/src/persistence/observation-store.ts:239,338-340`).
- Fragmentation concern + planned remediation are documented: dev-plan §23.3 (`:752-771`) and
  §23.8 (`:847`, "establish contextual-evidence representation if needed");
  `docs/roadmap/README.md:74`; `docs/roadmap/observation-corroboration.md` (provenance-rooted
  identity).

**Tests:** `platform/tests/integration/m-a12-temporal-history.test.ts:178` asserts
eventTime/sourceContextId persist + read back (D1/D2); `observation-store.test.ts:192` idempotent
re-pass (`created=0`); `observation-extractor.test.ts` §39–§43 provenance/determinism rules.

**Named limitations (recorded, non-blocking)**
1. No ingestion-**unit** test asserts `sourceContextId`/`eventTime` propagation (coverage is at
   the platform store/integration layer only).
2. `sourceContextId` is absent when the extractor has no coordinate/row context — by design,
   but worth the explicit note.

---

## G2 — M-A07 candidate provenance — PASS

**Required evidence:** candidate ≠ entity; `candidateId` never becomes `EntityId`.

**Findings**
- Distinct identity namespaces: `indago:entity-mention-candidate`
  (`entity-mention/entity-mention-id.ts:24-25`), `indago:candidate-pair`
  (`blocking/blocking-identity.ts:23-24`), `indago:entity`
  (`entity-resolution/src/canonical-entity-identity.ts:30`).
- Canonical `EntityId` is derived deterministically only from `(caseId, canonicalName,
  entityType)` (`canonical-entity-identity.ts:12-26`).
- Materialization authority: canonical Entity is created only via explicit authority ACCEPT
  (`platform/src/persistence/entity-store.ts:7-28`,
  `platform/src/entities/entity-materialization.ts`); the HTTP accept path
  (`platform/src/api/routes.ts:407-500`, materialize at `:449`) produces a fresh deterministic
  EntityId — never the hypothesis/candidate id.
- Boundary contracts: candidate is explicitly **not** an Entity (`entity-mention-candidate.ts:13-30`);
  hypothesis stores `candidatePairId`/`supportingCandidateIds` but derives its own id.
- Repo-wide grep for any assignment of candidate/pair ids into an `entityId` slot: **no matches**.

**Tests:** `entity-mention-extractor.test.ts` (never assigns EntityId/score); `entity-resolution/tests/canonical-entity-identity.test.ts` (deterministic, case-scoped, type-sensitive);
`platform/tests/integration/entity-mention-store.test.ts:40-42` (idempotent re-pass);
`entity-hypothesis-store.test.ts:42-46` (full FK chain Source → Evidence → Observation →
EntityMentionCandidate → CandidatePair → EntityHypothesis);
`m-a12-hardening.integration.test.ts:260-350` (candidate → pair → PROPOSED hypothesis →
explicit accept → canonical Entity with ENTITY_CREATED versioning + TSC in same tx).

Satisfies the phase-tracker M-A07 "candidate-provenance recheck" annotation
(`phase-tracker.md:144`).

---

## G3 — M-A08 blocking semantics — PASS

**Required evidence:** cheap deterministic recall layer; bounded; pair ≠ identity.

**Findings**
- Deterministic, multi-pass, **UNION not cascade**, indexed grouping bounded at
  `O(N + generatedPairs)` with a `maxBlockSize` cap; same-observation exclusion; no
  clock/Prisma/BullMQ in the engine (`ingestion/src/blocking/blocking-engine.ts:1-24`).
- Explicit bounds: `maxBlockSize: 50`, `maxPassesPerPair: 100`
  (`blocking/types.ts:29-34`); deterministic pass rules with conservative NULL/OTHER handling
  (`blocking-passes.ts:1-41`).
- Unordered, case-scoped pair identity (canonical min/max lexical ordering, A↔B ≡ B↔A)
  (`blocking/blocking-identity.ts:37-41`).
- `CandidatePair` carries **no EntityId and no score** — pre-resolution by design
  (`contracts/src/domain/candidate-pair.ts:11-36`).
- Store writes per-pair idempotently (`skipDuplicates`), deliberately no whole-batch gate
  (`platform/src/persistence/candidate-pair-store.ts:8-13`).

**Tests:** `ingestion/tests/blocking/blocking-engine.test.ts` (determinism, UNION, unordered
pairs, case-scope, same-observation, boundedness); `platform/tests/integration/candidate-pair-store.test.ts`
(6; real-Postgres round-trip, idempotency, rows carry no EntityId).

---

## G4 — M-A09 authority boundary — PARTIAL (🟡)

**Required evidence:** candidate → pair → hypothesis → explicit authority → canonical Entity.

**Findings (verified)**
- Full accept chain implemented and guarded: pure engine maps score → PROPOSED at most
  (`intelligence/entity-resolution/src/resolver.ts:151-213`); worker skips non-PROPOSED
  (`platform/src/queue/ingest-evidence.ts:1115`); `EntityHypothesisStore.markAccepted` refuses
  non-PROPOSED (`entity-hypothesis-store.ts:271-293`); canonical materialization is
  PROPOSED-only (`entity-materialization.ts:173-315`; PROPOSED guard `:191-193`, deterministic
  EntityId `:207`, hypothesis ACCEPT + Entity + ENTITY_CREATED GraphVersion + TSC in **one tx**
  `:230-314`); HTTP route role-guarded (`api/routes.ts:416-500`).
- "Hypothesis ≠ canonical truth" preserved: score → PROPOSED only; REJECTED/REVERSED statuses
  preserved on retry.

**Tests:** `entity-hypothesis-store.test.ts` (17; status-preservation `:531/:599/:565`, no-fake-entityId
`:802`, concurrency convergence `:410`); `m-a10-relation.test.ts` entity-authority block
("REJECTED refused, no entity created" `:388`, "PROPOSED → canonical Entity with REAL persisted
EntityId" `:428`, re-accept convergence `:449`, deterministic id `:462`).

**Gap (why PARTIAL):**
1. **Entity reject/reverse authority is not implemented.** `EntityHypothesisStore` exposes only
   `markAccepted`; grep for `markRejected`/`reverseHypothesis` matches only the **relation**
   store/authority (`relation-hypothesis-store.ts:495-509`, `relation-materialization.ts:315/355`).
   `routes.ts` has relation reject (`:874`) / reverse (`:932`) but no entity reject/reverse.
   `REVERSED` is retained on reprocess but unreachable via any shipped entity authority path.
2. Stale doc: `docs/platform/m-a09-entity-resolution.md:359-367` §13 Known Limitations #1/#7
   contradict the shipped M-A09.5 materialization (which binds `entityId` on ACCEPT).

**Status:** tracked as `🟡 [x]` — the gate criterion (authority creates canonical state;
hypothesis ≠ truth) is verified, flagged partial for the entity reject/reverse + stale-doc gap.
Entity reject/reverse authority is an M-A09 completeness follow-up, **not** an M-A12 entry blocker.

---

## G5 — M-A10 relation authority — PASS

**Required evidence:** canonical Entity + evidence → relation candidate → scoring → hypothesis →
explicit authority → canonical Relation → Graphology.

**Findings**
- Candidate generation co-occurrence + source-grounded (`relation-resolution/src/resolver.ts:102-177:
  detectRelationCandidates`, `:284-334`); worker consumes canonical Entities
  (`platform/src/queue/ingest-evidence.ts:1269`).
- Scoring v1 + threshold 0.25 → PROPOSED only, never auto-accepted
  (`scoring.ts:173-240`, `types.ts:87-113`).
- Explicit accept/reject/reverse authority with atomic transitions
  (`relation-hypothesis-store.ts:160-170,431,487-509`; `relation-materialization.ts:131/315/355`;
  HTTP `routes.ts:790/874/932`).
- Directionality-aware canonical identity (directed preserved verbatim A→B ≠ B→A; undirected
  canonicalized) (`identity.ts:16-22,69-102`, `relation-store.ts:67-77`).
- **Same-tx coupling:** accept creates GraphVersion (`:234-256`) + TSC (`:283-299`); reverse
  creates version (`:417-434`) + TSC (`:438-454`); reject creates neither — confirmed by
  `m-a12-pr2-versioning.integration.test.ts:334`.
- Graphology integration is derived/read-only (`graph-runtime.ts:70-160`).

**Tests (source-verified counts):** `m-a10-relation.test.ts` **18** (incl. lifecycle matrix `:1048`,
concurrency `:1197`, REVERSED-never-reset `:604`); `m-a10-graph.test.ts` **6** (reversed edge
removed `:539`); `m-a10-graph-http.test.ts` **9**; `m-a10-contradiction.test.ts` **2**
(hardContradiction −0.25 with persisted provenance `:196`); `m-a10-ingest-http.e2e.test.ts` **8**
(authority via HTTP `:255/:316/:345`, GET /graph ACTIVE-only `:377`, 403 foreign-case `:437`).

---

## G6 — M-A11 graph projection — PASS

**Required evidence:** Graphology derived/disposable; Postgres authoritative.

**Findings**
- Authority direction explicit: "AUTHORITATIVE SOURCE: PostgreSQL. Graphology is a DERIVED,
  rebuildable projection." (`graphology-projection/src/types.ts:10-12`, `index.ts:4-11`);
  `build-graph.ts` is a PURE module (`:17-18`, deterministic sorted insertion `:77-165`).
- Graph rebuilt from authoritative stores on every call (`graph-runtime.ts:70-91` → `entityStore.listByCase`
  + `relationStore.listActiveByCase`; `:145-185`); historical projection replays persisted
  GraphVersion chains (`graph-version-service.ts:389-439,454-586`).
- Deterministic replay via `normalizeBuiltGraph` (`graph-version-service.ts:657-774`); historical
  reconstruction never reads surviving Graphology state (`:418-448`).
- Reverse containment over time: reversed edges disappear from later projections without erasing
  history (`relation-store.ts:344-362`, `relation-materialization.ts:413-450`,
  `graph-version-service.ts:265-293` replayLifecycle `reversedAtVersion`).
- Only Postgres write from a projection is truthful bookkeeping — `projectionStatus` +
  `nodeCount`/`edgeCount` on the version row the service owns via a documented, idempotent
  "EXPLICIT MATERIALIZATION SEAM" (`graph-version-store.ts:405-429`,
  `graph-version-service.ts:414-435,568-583`) — **not** topology/node/edge content.

**Tests:** `graphology-projection/tests/graph-projection.test.ts:69-84` (determinism);
`platform/tests/m-a12-pr2-graph-projection.test.ts:313-317` (order-independent snapshots);
`m-a12-pr3-apis.integration.test.ts:373-406` (deterministic replay after checkpoint association);
`:411-457` (reverse over time: v1 has edge, v2 does not); read-only analytics
`graph-projection.test.ts:137-216`.

---

## G7 — M-A13 current graph APIs — PASS

**Required evidence:** graph, traversal, centrality, communities verified.

**Findings**
- Case-scoped routes (client never supplies the boundary; `verifyCaseAccess`):
  `GET /investigations/:id/graph` (`routes.ts:589-634`), `/graph/traversal` (`:637-696`),
  `/graph/centrality` (`:699-741`), `/graph/communities` (`:745-779`).
- Work caps at boundary + runtime: `parseGraphQueryParam` `hops ∈ [0,4]`, `maxPaths/maxResults ∈
  [1,1000]`, rejects floats/NaN/Infinity (`routes.ts:50-89`); `TRAVERSAL_BOUNDS` maxHops 4 /
  maxPaths 1_000 / maxExpandedWalksPerLevel 100_000 (`graphology-projection/src/traversal.ts:50-65,183-185`).
- Canonical contract with explicit truncation metadata: `GraphTruncationSchema` +
  `ProjectedGraphSchema` (`contracts/src/graph/graph-projection.ts:34-101`); community/centrality
  truncation (`communities.ts:19-30`, `centrality.ts:30-33`); `StructuralMetricTypeSchema` narrowed
  to `degree`/`community_membership` (truthful to implementation, `graph-analysis.ts:61-67`).
- P2-04 `projectGraphValidAt` never overwrites ACTIVE version counts (pure read; `:504-550` regression).

**Tests (source-verified counts):** `m-a10-graph-http.test.ts` **9** (200 incl. ACTIVE-only +
truncation `:171-179`, traversal bounded `:182`, centrality rank `:241`, communities `:254`,
400 bounds `:194/:230`, 404 `:267`, 401 `:275`, 403 fail-closed `:283`);
`m-a12-graph-http.security.test.ts` **7**; `m-a12-pr3-apis.integration.test.ts` **9**
(incl. P2-04 `:504`); `m-a10-ingest-http.e2e.test.ts` **8**.

**Named limitation (non-blocking):** `traversal`, `centrality`, and `communities` carry
`requireAuth` but NOT `requireRole(["INVESTIGATOR","ADMIN"])` (only `graph` and PR3 routes do).
Case-scoping still enforces the boundary via `verifyCaseAccess` — an asymmetry, not an auth hole.

---

## G8 — DEMO / LIVE / AUTO regression status — PASS (documented here)

**Required evidence:** frontend provider seam intact; demo untouched — **documented**.

### Provider seam

- Single public API; UI never imports Demo/Live directly (`packages/web/src/lib/providers/index.ts:1-7`).
- Mode switch: `NEXT_PUBLIC_DATA_MODE` (`DATA_MODE_ENV`, `config.ts:22`) + `NEXT_PUBLIC_DEMO_CASE_ID`
  (`DEMO_CASE_ID_ENV`, `:21`); `resolveDataModeForWorkspace()` (`config.ts:72-112`): no var → dev
  defaults `"auto"`, prod defaults `"live"`; explicit `"demo"` requires a demo case;
  `"auto"` in dev serves demo only for the demo/real case ids. `assertNoImplicitFallback()`
  (`:116-126`) blocks prod `auto` without a demo case.
- **AUTO semantics:** per-capability, not whole-bundle. `createWorkspaceProviders()` (`factory.ts:86-106`);
  each slot picks live when a live impl exists, else demo (`factory.ts:123-188`); failures surface
  typed `ProviderError`; **no catch-and-fallback** (`:117-121`).
- Decision table: live=true only for investigation/evidence/observations/cases/realtime; everything
  else (entities, graph, relations, intelligence, timeline, leads, gaps, review, robustness,
  hypotheses, crossCase, network.*) is `{ demo: true, live: false }`
  (`capabilities.ts:69-99`); `resolveCapabilityStatus()` (`:134-148`).

### Demo untouched — git evidence

| Protected file | Last commit touched | Pre-M-A12? |
|---|---|---|
| `packages/web/src/lib/network/flow/flow-model.ts` | `c4219dc` (2026-09-06) | Yes |
| `packages/web/src/lib/providers/demo/demo-fixtures/relations.ts` | `da75cdb` (2026-09-04) | Yes |
| `packages/web/src/lib/providers/real-case/phase2.ts` | `0a81455` (2026-09-08) | Yes |
| `packages/web/src/lib/providers/real-case/breakthrough.ts` | `d2b7559` (2026-09-08) | Yes |

All M-A12 / temporal / graph-versioning / revision-event commits (09-10) are confined to
`packages/platform`, `packages/contracts`, `packages/graphology`, CI, and docs — **none touched
the four protected files**. Corroborating doc: `docs/platform/temporal-semantics.md:7-8`
("Scope: **live mode only** … Demo mode … is untouched").

### UI surface matrix (demo = works / live = stub)

| Surface | Demo | Live |
|---|---|---|
| Graph (+ control center) | `DemoGraphProvider` + `flow-model.ts` | `UnsupportedGraphProvider` (stub) |
| Timeline | `DemoTimelineProvider` | `UnsupportedTimelineProvider` (stub) |
| Discovery | `DemoIntelligenceProvider.listDiscovery` | `UnsupportedIntelligenceProvider` (stub) |
| Gaps | `DemoGapProvider` (+ gaps route stub) | `UnsupportedGapProvider` (stub) |
| Review | `DemoReviewProvider` (+ review route stub) | `UnsupportedReviewProvider` (stub) |
| Leads | `DemoLeadProvider` (+ leads route stub) | `UnsupportedLeadProvider` (stub) |
| Entities / Relations | `DemoEntityProvider` / `DemoRelationProvider` | `UnsupportedEntityProvider` / `UnsupportedRelationProvider` (stubs) |
| Robustness / Hypotheses / CrossCase | demo impls present | `Unsupported*` stubs |
| Investigations / Evidence / Observations / Cases / Realtime | — | `LiveInvestigationProvider` / `LiveEvidenceProvider` / `LiveObservationProvider` / `LiveCaseProvider` / `createLiveRealtimeProvider` |

**Regression status:** provider seam intact; demo fixtures untouched by M-A12 work; AUTO
(per-capability live-else-demo in dev, hard-live in prod) has no silent fallback. Recorded here as
the G8 documentation artifact.

---

## Conclusion

All eight entry-gate audits (G1–G8) are complete and documented. **G1–G3, G5–G7 PASS clean;**
**G4** is tracked `🟡` (accept-chain boundary verified; entity reject/reverse deferred to an M-A09
follow-up); **G8** required the documentation artifact, which is this report. The M-A12 entry
criterion (dev-plan:814) is **satisfied**. Semantic retrieval remains explicitly out of scope.

**Follow-ups (not M-A12 blockers, not part of this audit):**
- Entity reject/reverse authority (`EntityHypothesisStore.markRejected`/reverse + HTTP routes).
- Refresh `docs/platform/m-a09-entity-resolution.md` §13 to match the shipped M-A09.5 materialization.
- Add the G1 ingestion-unit assertion for `sourceContextId`/`eventTime` propagation.
- Add `requireRole` to the three v1 graph analytics routes (G7 asymmetry).