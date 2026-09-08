# P1: Real-Case Demo — PASS 1 Implementation Report

## Status: COMPLETE

---

## 1. Objective

PASS 1 of 4 of the INDAGO real-case demo: replace the standalone OFS (Operation
Financial Shadow) demo with two **deterministic, source-verified real working
cases** served through the existing demo provider stack:

- **Case A** — `case:connecticut-jai-alai` — Connecticut / World Jai Alai (WJA)
  licensing & regulatory probe (1975–1976), centered on WJA-connected personnel
  Callahan and Rico.
- **Case B** — `case:tulsa-wheeler` — homicide of Roger Wheeler Sr. at Southern
  Hills Country Club, Tulsa, Oklahoma (May 27, 1981).

The rules of the work, inherited from `INDAGO_REAL_CASE_EXTRACTION_SPEC.md` and
`INDAGO_REAL_CASE_SOURCE_VERIFICATION.md`: **no invented facts**, every
observation carries provenance, hard-fenced material (breakthrough / later
historical / phase-2 evidence / counter-evidence) is present but **inaccessible
to initial compute**, and no "guilty/proven" statuses exist anywhere in the
initial fixture sets.

---

## 2. What Was Delivered

### 2.1 Real-case fixture module (`packages/web/src/lib/providers/real-case/`)

| File | Purpose |
| --- | --- |
| `registry.ts` | Case/investigation UUID namespaces (`NS_CASE_A/B/SHARED/BREAKTHROUGH/COUNTER/DEMO`), slugs, `REAL_CASE_SLUGS`. |
| `times.ts` | Re-exports the demo deterministic time builders (`obs`, `evt`, `createdNow`, `TIME_ANCHOR`) so real and demo fixtures share construction. |
| `lookup.ts` | Single source of every deterministic real-case ID (`id(NS, key)` = FNV-1a over `NS:key`), plus `REAL_CASE_IDS`. |
| `shared.ts` | Four bridge entities used identically in both workspaces (Callahan, Rico, WJA, FBI Boston) with the UNION of both cases' observation/evidence refs. |
| `case-a.ts` | Full Case A fixture set + `caseAGraphHoles`, `caseAForeignOverlays`, `caseAForeignEntityDb`. |
| `case-b.ts` | Full Case B fixture set + `caseBGraphHoles`, `caseBForeignOverlays`, `caseBForeignEntityDb`. |
| `fenced.ts` | Four hard-fence packages: `breakthrough-phase-1`, `later-historical`, `phase-2-evidence`, `counter-evidence`. |
| `discovery.ts` | Pure `deriveRealCaseDiscoveryCandidates` (BFS cut-edge detection, degree ranking, structural tie-break). |
| `index.ts` | Assembly: `REAL_CASE_FIXTURES`, `getRealCaseFixtureSet`, graph-holes/overlays/entity-db/entity-links/discovery maps, fenced + registry re-exports. |
| `validate.ts` | `validateRealCaseBoundaries()` — 12 deterministic assertions (below). |

**Case A content** — 6 sources, 5 artifacts, 5 evidence, 8 observations,
6 entities, 7 relations, 6 graph nodes, 7 graph edges, 1 hypothesis, 2 gaps,
2 holes, 2 leads, 2 evidence requests, 2 review tasks, one full entity-
resolution suite (`EMC_A_JACK`/`EMC_A_JOHN` → `INITIAL_MATCH`), 1 robustness,
1 cross-case match, timeline, Tulsa foreign overlay.

**Case B content** — 6 observations, 3 sources, 3 artifacts, 3 evidence,
6 entities, 4 relations, 6 graph nodes (**FBI Boston isolated** — 0 edges),
4 graph edges, 1 DRAFT hypothesis (insider schedule knowledge), 3 gaps, 2 holes,
2 leads, 3 evidence requests, 2 review tasks, 1 robustness, 1 cross-case match,
timeline, CT foreign overlay. No entity-resolution suite; no Martorano material;
no guilty/proven statuses.

### 2.2 Provider seams

- `demo/state.ts` — `DemoWorkspaceState` gains `readonly fixtures: DemoFixtureSet`;
  `createDemoWorkspaceState(workspaceId, fixtureSet?)` and
  `resetDemoWorkspaceState` read `state.fixtures`.
- `demo/demo-fixtures/index.ts` — `DemoFixtureSet` extended with 7 **optional**
  real-case fields: `graphHoles`, `setupEvents`, `namedSequences`,
  `foreignCaseOverlays`, `foreignEntityDb`, `entityLinkByCandidate`,
  `graphRealtimeCatalog`. The OFS `demoFixtures` set leaves them unset.
- `demo/providers.ts` — `createWorkspaceDemoProviders(identity, config,
  fixtureSet?)`. `DemoGraphProvider` serves graph version/robustness/
  cross-case/discovery/holes/overlay-catalog from `state.fixtures`;
  `DemoEntityProvider.get` falls back through `state.fixtures.foreignEntityDb`;
  `DemoCrossCaseProvider.listForeignOverlays` and
  `DemoIntelligenceProvider.buildCandidate` read their maps from fixtures.
- `demo/realtime.ts` — realtime stream reads `events` / `namedSequences` /
  `setupEvents` from `state.fixtures`. Real cases ship **empty streams** (no
  choreographed OFS playback); demo falls back to `operationFinancialShadowEvents`
  / `uploadDemoSequence` / `getSetupEvents()`.
- `config.ts` — `resolveDataModeForWorkspace` treats `REAL_CASE_IDS` as
  demo-served in demo/auto modes; original error invariants preserved
  (`DEMO_CASE_ID must be set when DATA_MODE=demo`, non-demo case throws).
- `factory.ts` — `createWorkspaceProviders` / `createAutoWorkspaceProviders` /
  `createIntakeProviders` inject `getRealCaseFixtureSet(caseId)` into the demo
  bundle; `createCaseListProviders` demo mode serves BOTH real cases via
  `CaseListCaseProvider` (2-card grid, no OFS), with dashboard enrichment
  projected from the first real case's workspace state.

### 2.3 Boundary validation (`validateRealCaseBoundaries`, 12 assertions)

1. No OFS demo-ID collision.
2. Every observation has a provenance entry.
3. No observation references a fenced record ID.
4. Every initial-graph edge is backed by a relation hypothesis.
5. Shared entities carry identical observation sets across both cases.
6. No `entityType` / `aliases` fields on any entity (strict schema).
7. Case B graph: FBI Boston is isolated (0 edges).
8. No Martorano material in initial fixture sets.
9. No Bulger / Flemmi / Connolly entities in initial fixture sets.
10. No "guilty/proven" statuses on hypotheses or entities.
11. Fenced package IDs match `lookup.ts` exports.
12. Every graph node references a valid entity.

Runs at import time in development (logs `BOUNDARY VIOLATIONS` if any) and is
exported for the test suite.

---

## 3. Source-verified facts encoded verbatim

All content below is grounded in **HR 108-414, Vol. 1, §III.B.6 pp. 96–98** and
the verification doc; nothing invented.

| Encoded fact | Where |
| --- | --- |
| CT SOCTF Jan-1976 federal records request (McGuigan) met with silence | `OBS_A1`, `SRC_JAN76_A` |
| Surveillance of Callahan's Boston trip ("Clark's Turn of the Century Cafe"/motel) | `OBS_A2`, `SRC_SURV_BOSTON_A` |
| Callahan's WJA employment ended before the 1976-05-03 hearing | `OBS_A3` |
| Rico + WJA entertained FBI SAs Tom Dowd / Jerry Forrester in the Bahamas, WJA-paid | `OBS_A6`, `SRC_BAHAMAS_A` |
| Exhibit 719 exact title "WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)" — labeled "WJA corporate expense/purchase record" (NOT "internal-security/personnel ledger") | `fenced.ts` breakthrough phase-1 |
| Rico S1 handwritten note is a physical document, not public | `fenced.ts` breakthrough phase-1 |
| Bulger = **jury conviction** 8/12/2013 (not a guilty plea) | `fenced.ts` later-historical |
| Martorano plea/cooperation Sept 1999 (not 2002) | `fenced.ts` later-historical |
| Wheeler Sr. shot dead 5/27/1981 at Southern Hills CC; WJA owner + Telex chairman | `case-b` |
| July-1981 tip re Winter Hill / WJA to Tulsa + CT investigators; FBI stonewalled | `case-b` `OBS_B*` |
| Tulsa PD file contents not public → dropped from scope | case-b source selection |

---

## 4. Verification

- `npm run typecheck` — **clean** (zero errors).
- `npm test` — **98 files / 1071 tests pass**, including the new
  `tests/real-case-boundaries.test.ts` (runs all 12 assertions + fixture-set /
  empty-stream / fenced checks).
- `npm run build` — **succeeds**; all routes compile.

---

## 5. Hard-fence quarters (present but inaccessible in PASS 1)

- `breakthrough-phase-1` — Exhibit 719, Martorano hearsay chain, Rico S1 note.
- `later-historical` — Halloran/Donahue, Callahan body, Connolly 2002/2008, Rico
  2003, Bulger 2013.
- `phase-2-evidence` — WJA audit, Tulsa file, Connolly trial.
- `counter-evidence` — CNTR_C1–C4.

None of these IDs appear in any initial observation/evidence/artifact fixture
(assertion 3/8/11), and they are not resolvable by any PASS 1 provider.

---

## 6. Deferred to Passes 2–4

- Phase-1 intelligence surfacing (Exhibit 719 dawning, Martorano hearsay chain).
- Evidential workflows over real evidence (ER resolution, hypothesis
  confirmation/reversal on real case data).
- Later-historical validation UI (Connolly 2002/2008, Bulger 2013).
- Realtime choreography for real cases (empty streams today by design).
- Cross-case matrix consumption of the Case A ↔ Case B overlays.

---

## 7. Files Changed / Created

Created: `providers/real-case/{registry,times,lookup,shared,case-a,case-b,fenced,discovery,index,validate}.ts`,
`tests/real-case-boundaries.test.ts`, this report.

Modified: `providers/demo/{state,providers,realtime}.ts`,
`providers/demo/demo-fixtures/index.ts`, `providers/{config,factory}.ts`,
`providers/real-case/{lookup,index}.ts` (REAL_CASE_IDS + re-exports).