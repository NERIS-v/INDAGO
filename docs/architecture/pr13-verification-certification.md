# PR13 — Phase 5A Graph-Hole Verification & Certification: Release Report

**Phase 5A-PR13** — end-to-end verification / integration certification of the Phase 5A
graph-hole intelligence chain:

```
region expansion → deterministic region identity → detection (Mode1/Mode2)
→ qualification → persistence → incremental reassessment → supersession → lifecycle
```

**Scope of certification:** every production seam below is exercised against a REAL
Postgres database (`.env` `TEST_DATABASE_URL`) with the PRODUCTION wiring — no mocks,
no stubs, no fake-green:

- `GraphHoleRegionAnalysisStore.persistRegionAnalysis` / authority guards
- `GraphHoleStore.persistGraphHole` / `transitionStatus`
- `ObservationStore`, `EntityHypothesisStore`, `RelationHypothesisStore`,
  `RelationStore`, `GraphVersionStore`
- `ReassessmentRunner.runBatch` + advisory-lock serialization
- `RegionPipeline.executeGraphAffecting` + `sameLogicalGap` supersession
- `computeReassessmentContextSha256` (the §12 context hash economy)
- frozen contracts (`@indago/contracts`, `@indago/graph-hole-region`,
  `@indago/graph-hole-reassessment`)

Status: **CERTIFIED WITH DOCUMENTED LIMITATIONS** (limitations in §15–§16 are
pre-existing, frozen, out-of-PR13-merge-scope).

---

## 1. Purpose

PR13 is the discipline gate: prove by running the REAL code — not by re-reading
the PRD — that the Phase 5A graph-hole region pipeline (PR1–PR6) and the PR11/PR12
incremental reassessment layer behave exactly as the frozen policies and contracts
declare. Every assertion below was written only AFTER a probe of the production
package confirmed the behavior (probe-first discipline), so the tests certify, not
imagine.

## 2. Certification basis

- **Real Postgres:** all seven E2E suites connect to the configured
  `TEST_DATABASE_URL` and run the production stores/runners directly.
- **Probe-first:** each suite's expected outcomes were first confirmed by running
  the production code (probes) and reading the frozen contracts; the test files
  then freeze those outcomes as assertions.
- **Pure determinism:** the offline determinism suite certifies the identity/context
  digests without a database.

## 3. Delivered artifacts

| File | Purpose | Status |
| --- | --- | --- |
| `tests/integration/pr13-fixtures.ts` | shared Phase 5A seeding (`seedPhase5ACase`, `seedPhase5ADV3`) + production helpers (`buildProductionRegion`, `recomputeViaProduction`, `makeProjectionService`) | ✔ |
| `tests/integration/pr13-full-pipeline.integration.test.ts` | region → detection → qualification → persistence E2E | 5/5 ✔ |
| `tests/integration/pr13-incremental.integration.test.ts` | V3 supersession + change-ledger dedup | 3/3 ✔ |
| `tests/integration/pr13-isolation.integration.test.ts` | authority boundaries + cross-case isolation | 3/3 ✔ |
| `tests/integration/pr13-reblocking.integration.test.ts` | lifecycle transitions (`REJECTED`/`REVIVAL`/`RESOLVED` + illegal refusals) | 4/4 ✔ |
| `tests/integration/pr13-concurrency.integration.test.ts` | advisory-lock serialization + parallel-case isolation | 2/2 ✔ |
| `tests/pr13-determinism.test.ts` | pure digest determinism + frozen transition matrix | 8/8 ✔ |
| `docs/architecture/pr13-verification-certification.md` | this report | ✔ |

## 4. Gate A — scope and no-redesign audit (PASS)

PR13 made **zero production-code changes**. `git status` of the PR13 commit contains
only test files and this report; no file under `src/`, no contract under
`packages/contracts/`, no policy document, no Prisma schema was modified. The
happy-path fixes landed during certification were fixes to the FIXTURES/tests (they
were calling the production code incorrectly), not to production:

- `type: 'INVESTIGATION'` (not a legal `ObservationType`) → `'FINANCIAL'` in
  `buildObservation`.
- `supportingHypothesisIds` uses the PR3 atomic id form `atomic:RELATION_HYPOTHESIS:<id>`
  (detector-derived id), not the bare hypothesis id.
- `independentSupportUnitIds` prefix is `sourceContext:<evidenceId>` (the region
  context re-anchors `sourceContextId` to the observed evidence id).
- `persistGraphHole` stores `contextSha256` only when passed explicitly (T3 now does).
- Regions must be persisted (via `persistRegionAnalysis`) before a hole is persisted —
  that is how the reassessment affected-set discovers regions.
- `GraphHoleRegion` carries `roundRecords`, not a `saturation` field.

## 5. Gate B — no-fake-green guard (PASS)

- No suite is skipped when a database is present (`describe.skipIf(!TEST_DATABASE_URL)`
  only skips when NO test database is configured, which is explicitly surfaced).
- Every score/status/identity assertion is compared against REAL production behavior
  observed in probes (see §13 for the probe-read numbers).
- The determinism suite flips assertions to `not.toBe` on every identity dimension —
  a hash that ignores any identity field fails the suite.
- Concurrency T1 asserts the SECOND parallel runner processes ZERO changes (idle),
  which cannot pass under a locking-free implementation.

## 6. Fixture layer

`pr13-fixtures.ts` mirrors the Phase 5A V1 graph exactly as prod builds it:

- entities A, B, C (+ D for V3) via `EntityStore.materializeEntity` (deterministic,
  case-bound ids `cased:entity:<canonical>:<caseHash>`);
- observations `obsA1/A2/B1/B2/C1` (FACTUAL/FINANCIAL/etc., `type`-valid),
  `evidenceA/B/C` source context ids;
- V1 edge A–C, V2 edge B–C (+ phantom A–B *missing* edge → the MISSING_EDGE
  candidate), V3 edge A–D via `GraphVersionStore.createVersion`;
- `seedPhase5ADV3` for the incremental/concurrency/lifecycle suites.

`makeProjectionService` wires the REAL `GraphVersionStore`-backed projection used by
the reassessment runner.

## 7. Full-pipeline certification (GREEN 5/5)

Single-candidate MISSING_EDGE A–B chain:

1. SATURATED region: 3 expansion rounds (`roundRecords`), round 1 adds entity C with
   node-novelty 1/3, rounds 2–3 add nothing (novelty 0) → `SATURATED`; no
   truncation, empty limitations.
2. Detection+qualification via production `recomputeViaProduction` → exactly one
   qualified candidate with **the frozen PR5 score surface**:
   `structuralScore 0.782667`, `evidenceSupportScore 0.866025`,
   `expectedInformationValue 0.25`, `significance 0.723606`, `failureReasons []` —
   all reproduced bit-for-bit from the production chain (see §13 probe).
3. Candidate shape: `supportingHypothesisIds ["atomic:RELATION_HYPOTHESIS:<hyGapId>"]`,
   atomic PR3 `independentSupportUnitIds ["sourceContext:<evidenceA>",
   "sourceContext:<evidenceB>", "sourceContext:<evidenceC>"]`.
4. Durable persist → ACTIVE hole linking region (`graphHoleRegionAnalysis`),
   signed `contextSha256` (64-hex), deterministic `candidateId`, `identityKey`,
   contribution rows. Re-publish is dedup-guarded (`skipDuplicates`).
5. Authority guards on both persist seams (EVIDENCE_AFFECTING recompute of an
   unchanged context is `SKIPPED_CONTEXT_UNCHANGED`).

## 8. Incremental supersession certification (GREEN 3/3)

Growing A–B–C to V3 (entity D, ACCEPTED rAD):

- `relationAcceptedTrigger` → `GRAPH_AFFECTING` publish → `runBatch` → one region
  recomputed with `outcome SUPERSEDED`, `recomputeIdentity true`,
  `assessmentsAppended 1`, `holesSuperseded 1`.
- Old hole demoted to **SUPERSEDED** with a SUPERSESSION assessment carrying the
  successor `candidateId`; the assessment's `graphVersionId` remains v2 (history is
  frozen); the successor is ACTIVE on v3 with `supersedesGraphHoleId` = old hole id.
- Because candidate identity includes `graphVersionId`, the successor is a NEW
  `candidateId` (probe: v2 `22b65cc3…` vs v3 `eb5d73af…`) — a real supersession, not
  an in-place overwrite. `sameLogicalGap` matched on canonical node set.
- Duplicate re-publication is idempotent: same `changeId`, `deduplicated true`, the
  ledger keeps exactly one ACTIVE + one SUPERSEDED.

## 9. Isolation & authority certification (GREEN 3/3)

- `persistRegionAnalysis` refuses a foreign-case region → `AUTHORITY_MISMATCH`.
- `persistRegionAnalysis` refuses a tampered `regionId` (no longer hashes from the
  identity) → `INVALID_IDENTITY`.
- Two identically-seeded cases produce disjoint region ids, context shas, and
  candidate ids; a hole persisted in case A is NOT readable under case B's scope
  (`findByIdentityKey` → null). No cross-case bleed anywhere.

## 10. Lifecycle-transition certification (GREEN 4/4)

- ACTIVE → REJECTED (REJECTION assessment) → ACTIVE (REVIVAL assessment) round-trip
  on the SAME physical hole row (no replacement row); assessments appended in
  `sequence` order with correct `status` + `reason`.
- Illegal transitions refused with `INVALID_TRANSITION`: ACTIVE→ACTIVE,
  REJECTED→SUPERSEDED, REJECTED→RESOLVED, and everything leaving terminal
  SUPERSEDED/RESOLVED.
- ACTIVE → RESOLVED is legal and terminal (RESOLUTION assessment persists).
  **Correction recorded:** the earlier plan assumed a `BLOCKED` status; the frozen
  enum has no `BLOCKED` — the reblocking suite was re-scoped to the real
  REJECTED/REVIVAL semantics against `canTransitionGraphHoleStatus`.
- `transitionStatus` on an unknown candidate → `NOT_FOUND`.

## 11. Concurrency certification (GREEN 2/2)

- **T1:** two parallel `runBatch` on the same case over the same pending change —
  `pg_advisory_xact_lock(hashtextextended(caseId,0))` serializes them: exactly one
  batch processes the change (SUPERSEDED region result), the other is idle (0
  processed). No double-processing, no lost updates.
- **T2:** two parallel runBatches on independent cases — case A's supersession does
  not touch case B (B keeps one ACTIVE v2 hole; A has ACTIVE+SUPERSEDED); cross-case
  identity read is null. Fail-closed.

## 12. Determinism certification (GREEN 8/8, offline)

- Candidate and region canonical serializations collapse node/seed/edge ID order and
  object-key insertion order to the SAME canonical string; every identity dimension
  (caseId, graphVersionId, holeType, node set, expectedRelationshipType, policies)
  is hash-sensitive (`not.toBe` on each).
- `computeReassessmentContextSha256` is order-insensitive over sketch arrays and
  sensitive to region state every place it should be.
- **Honest finding:** `caseId` is deliberately OUT-OF-BAND from the context hash —
  changing caseId alone leaves `contextSha256` unchanged (region tracing +
  `graphVersionId` carry case identity, and `candidateId` includes `caseId`). This is
  the production §12 economy; documented, not forced.
- Frozen `GRAPH_HOLE_STATUS_TRANSITIONS` matrix holds exactly (per-status legal
  target sets verified against the contract).

## 13. Frozen-contract conformance — probe-read numbers

The production chain, probed before test-writing, reproduced the V1.1 frozen surface
bit-for-bit single candidate MISSING_EDGE A–B:

| Metric | Frozen V1 | Probe via production `recomputeViaProduction` |
| --- | --- | --- |
| `region.status` | SATURATED (3 rounds, 2 consecutive ≤0.10 novelty) | SATURATED, `expansionRounds 3` |
| `structuralScore` | 0.782667 | 0.782667 |
| `evidenceSupportScore` | 0.866025 | 0.866025 |
| `expectedInformationValue` | 0.25 | 0.25 |
| `significance` | 0.723606 | 0.723606 |
| `failureReasons` | `[]` | `[]` |

Additionally probed and certified: DEGRADED limitation vocabulary
(`OBSERVATION_RESOLUTION_FAILED` — drove the fixture fix, §4), the V2→V3 successor
candidate ids, the `sourceContext:`/`atomic:` id formats, and the SUPERSESSION
assessment reason which embeds the successor candidate id.

## 14. Regression matrix (GREEN 10 files / 57 tests)

The directly-affected persistence/reassessment surface plus every PR13 suite, run
together against the same real Postgres:

| Suite | Tests | Result |
| --- | ---: | --- |
| pr13-full-pipeline | 5 | ✔ |
| pr13-incremental | 3 | ✔ |
| pr13-isolation | 3 | ✔ |
| pr13-reblocking | 4 | ✔ |
| pr13-concurrency | 2 | ✔ |
| pr13-determinism (unit) | 8 | ✔ |
| pr6-ownership-boundary (unit) | 3 | ✔ |
| pr12-reassessment | 6 | ✔ |
| pr11-targeted-reblocking | 4 | ✔ |
| pr6-graph-hole-persistence | 19 | ✔ |
| **Total** | **57** | **57/57** |

## 15. Blocker & residue remediation

- **DEGRADED blocker (prior session):** traced to invalid `type:'INVESTIGATION'`
  observations in the fixture causing a read-back `ObservationSchema.parse` failure →
  `OBSERVATION_RESOLUTION_FAILED`. Resolved by using a legal observation type in the
  fixture (§4). Production is unaffected — the limitation vocabulary is the system
  operating correctly.
- **PR11 suite residue:** the shared Neon DB still contained two
  `entityMentionCandidate` rows with PR11's FIXED global identity keys
  (`pr11:candidate:0/1`) from an earlier session, tripping a unique constraint.
  Removed exactly those two test-only rows; PR11 re-verified 4/4. Not a code
  regression and out of PR13 merge scope.

## 16. Honest limitations (documented, pre-existing, frozen)

1. **AI/LLM layers (PR7–PR10) are not wired into this production chain** — the
   certified pipeline is the deterministic PR1–PR6 + PR11/PR12 stack. The AI runtime,
   next-best-evidence, and judge audits remain separate concerns with their own
   certifications.
2. **PR2 semantic retrieval is DISABLED in production region builds** (frozen policy);
   regions are deterministic expansion regions. The cert asserts SATURATED/round-based
   behavior as built.
3. **No producer yet creates the FIRST region/hole for a fresh case** — the initial
   state is REBUILD-ONLY (`REASSESSMENT_REQUESTED`), per PR12 §5. Certification covers
   region construction + persistence + incremental recompute, not an unattended
   first-persist trigger.
4. **Full platform sweep exceeds a single session timeout** (>40 min for the entire
   `packages/platform` vitest matrix, all offline-unit + real-Postgres E2E suites).
   The scoped regression matrix in §14 (the PR13-touched surface) is fully green; the
   broader sweep is on the standing CI path.
5. **Lifecycle statuses are intelligence-assessment states**, not human workflow (Lead
   owns consequential state) — `RESOLVED`/`REJECTED` here are the frozen Phase 5A
   mirrors, per contract §0 scope boundary.

## 17. Test inventory & counts

- 7 PR13-authored E2E files (all real Postgres) + 1 offline determinism file =
  **17 E2E tests + 8 pure determinism tests**; the regression matrix additionally
  re-verified pr6-ownership-boundary (3), pr6-graph-hole-persistence (19),
  pr12-reassessment (6), pr11-targeted-reblocking (4).
- Regression matrix: **57/57 across 10 files**.
- Total PR13-authored assertions (incl. probes): rejects-matchers (`toMatchObject`
  code-level) + exact-value and identity assertions across all suites — see each
  suite file.

## 18. Status

```
CERTIFIED WITH DOCUMENTED LIMITATIONS
```

The Phase 5A deterministic graph-hole chain (region → detection → qualification →
persistence → incremental reassessment → supersession → lifecycle), as implemented in
production, conforms to its frozen contracts and policies on every assertion in §7–§12.
Limitations listed in §16 are intentional, frozen boundaries of the Phase 5A program,
not certification failures. PR13 introduced NO production change (Gate A) and NO
fake-green test (Gate B).

## 19. Future work (outside PR13 scope)

- 5B/5C workflow: evidence-arrival event → lead/workflow reaction (PR12 backend loop
  is in, full 5B/5C surface outstanding — see phase-tracker).
- First-region/first-hole producer for fresh cases (PR12 §5 rebuild-only rule).
- Re-enable PR2 semantic retrieval inside production region builds, then re-certify
  region determinism + SATURATED budget behavior under the semantic path.
- Inventory "attended" production trigger wiring (queue consumers) for
  NEW_OBSERVATION / NEW_EVIDENCE / RELATION_ACCEPTED into `ReassessmentRunner`.