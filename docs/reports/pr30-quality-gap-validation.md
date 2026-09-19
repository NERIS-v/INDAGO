# PR-30 — Forensic Validation of the Golden-Pipeline Quality Gaps

**Scope.** Read-only re-probe of the 7 quality-gap root causes identified in the PR-29 golden-run report (single completed `InvestigationRun`). Every claim was re-verified against the live database and against instrumented production code paths — not against the original logs.

**Method.** One tsx harness running the actual production packages with this investigation's persisted data:

- `@indago/ingestion` → `extractEntityMentions` (both with the production gazetteer — empty — and with a hypothetical injected gazetteer),
- `@indago/graphology-projection` → `buildGraph` / `detectTemporalBursts` / `detectBridgeCandidates` / `detectCommunityCandidates` (cold graph, and again with `validityInterval` injected on edges),
- `@indago/relation-resolution` → `resolveRelationsForCase` with persisted entities/explicit contradictions.

All probes were autonomous harnesses; the production pipeline .env was only read for the DATABASE_URL.

---

## Verdict summary

| PR-29 item | Gap | Verdict | Primary root cause |
|---|---|---|---|
| #1 | Golden1 false-positive cluster | CONFIRMED | Pattern greediness, see *Rule-interaction audit* |
| #2 | Timeline corruption | PARTIALLY CONFIRMED | Wiring bug (temporal ranges never reach runtime) + gap #2 (missing edges) |
| #3 | Arjun / Rohan drop | CONFIRMED (compounded) | Empty gazetteer + observation-coverage semantic + classification asymmetry |
| #4 | Orion name split | INTENTIONAL / CORRECT | Deterministic exact-match; do not merge without corroboration |
| #5 | Mis-typed entities | CONFIRMED, WORST | `ACCOUNT` RFC-Document-ID capture (`Invoice 7842`, `FS-EV-001…004`) |
| #6 | Contradictions not delivered | CONFIRMED | No producer ever writes relation-level contradictions in runtime |
| #7 | Cross-case leakage | DATA-DEGENERATE | No real comparator data; matcher itself is fine |

---

## A. Rohan — drop is REAL; root is an EMPTY gazetteer, not the mechanism

**Extraction.** 5 mentions persisted, exact spans re-produced deterministically:

| hash | obs | span | text | type | method |
|---|---|---|---|---|---|
| `5c270b92…` | `857aa20a` | [33,44] | `Rohan Singh` | NULL | HEURISTIC_FALLBACK |
| `fe462e18…` | `35e5a090` | [26,37] | `Rohan Singh` | NULL | HEURISTIC_FALLBACK |
| `fd99300e…` | `c5239779` | [101,112] | `Rohan Singh` | NULL | HEURISTIC_FALLBACK |
| `764e7597…` | `84743bc6` | [17,34] | `Neha Kapoor Rohan` | NULL | HEURISTIC_FALLBACK |
| `d9f1dfb2…` | `f8503c42` | [2,13] | `Rohan Singh` | PERSON | CONTEXTUAL_RULE |

**Repro.** Running `extractEntityMentions` with the production (empty) gazetteer reproduces the persisted rows byte-for-byte (same tokens, same per-draft method). Running the **same** extractor with a hypothetical gazetteer `{ "Rohan Singh": PERSON, "Neha Kapoor Rohan": PERSON }` returns all 5 as `GAZETTEER_MATCH/PERSON`.

**Conclusion.** The gazetteer path in MA07 is fully functional and would fix Rohan completely — but the runtime injects **zero gazetteer rows**, so it can never fire. No census passed to the extractor; the pipeline refuses to hardcode names, so case-key identities are never typed. Nothing contaminates the fallback path; it simply never receives the data it was designed to consume.

**Why 1/5 fires contextually.** The single `CONTEXTUAL_RULE` mention is the only occurrence whose trigger window contains a verb:

- `f8503c42`: after-window = `" coordinates Northstar Warehou…"` → `coordinates ∈ PERSON_AFTER_TRIGGERS` → fired.
- `857aa20a` (before: `Neha Kapoor → `, after: `: “BDL has confirmed…`), `35e5a090` (before: `Neha Kapoor, and `, after: ` . The stated topic…`), `c5239779` (before: `communications with Arjun and`, after: EOL), `84743bc6` (after: `Singh 7m 32s…`) — no trigger in either window.

**Pipeline effect.** 3 exact-canonical pairs among the untyped `rohan singh`s → **0 hypotheses → 0 entities**. Rohan disappears from the graph entirely. (The `Neha Kapoor Rohan` draft and `Rohan #5` pair with no canonical twin; the 4-token multi-name runon matches no rule.)

---

## B. Arjun — drop confirmed; TWO compounding levers, and fixing only one regresses

**Extraction.** 12 mentions of `arjun mehta`: 3 typed `PERSON` via `CONTEXTUAL_RULE` (obs `db996305` FACTUAL, `65bd438f` OTHER, `27192943` OTHER), **9 untyped `HEURISTIC_FALLBACK`**.

**Co-occurrence dead-end (the pipeline drop):**

- Dual literals `Arjun Mehta` + `AX-4471` in the same observation: **6 confirmed** — `4b216d1f` (RELATIONAL), `7c33cba3`, `9e205f12` (FACTUAL), `eefb0295`, `7027be75` (FINANCIAL), `c5239779` (COMMUNICATION).
- `AX-4471` ACCOUNT entity carries `observationIds` = 7 (`673cc2d9`, `9e205f12`, `4b216d1f`, `eefb0295`, `7c33cba3`, `7027be75`, `c5239779`).
- Arjun PERSON entity carries `observationIds` = 3 (`db996305`, `65bd438f`, `27192943`).
- **Entity-observation overlap: 0.** Not a single observation contains both an accepted Arjun mention and the AX-4471 mention, so no candidate pair is ever built and **no relation can exist** — regardless of relation-engine score.

**Why the entity only carries 3 obs.** `Entity.observationIds` = union of the accepted hypothesis's `supportingObservationIds` plus its supporting candidates' observations (entity-materialization.ts:234-240, capped at 500). This is a documented **intentional** semantic (only observations that *supported resolution* are attached) — verified in source. It is not a single bug, but it becomes a *limitation* in combination with the classification gap below.

**The classification asymmetry (why RC-A alone regresses).** Looking at `deriveCanonicalEntityProfile` (entity-materialization.ts:74-102): when candidates are untyped, the fallback branch returns `{ canonicalName, entityType: undefined }` → identityKey `(case, 'arjun mehta', <untyped>)`. If we naively "accept untyped names" (RC-A), the 9 untyped mentions materialize a **second, separate untyped `arjun mehta` entity** (9 obs), leaving the PERSON entity at 3 obs — **two Arjun graph nodes**, while `AX-4471` still never sees a typed counterpart in its shared obs. RC-A alone does not fix the drop and actively creates a split-identity regression.

**Path that DOES work.** Re-typing `arjun mehta` (and `rohan singh`) as `PERSON` at MA07 (gazetteer injection, se.fix A/RC-B) makes the 9 untyped mentions PERSON, so their pairs merge into the existing PERSON entity through `NAME_BEARING_TYPES` preference, the observation union grows to the 6 dual obs, and an `arjun ↔ AX-4471` candidate pair is finally built. Simulating the resulting co-occurrence set over the 6 dual obs yields a mixed `association`/`financial` signal with repeated-co-occurrence, source-diversity and temporal-proximity bonuses → **support ≥ 0.6 → clearly PROPOSED** (well above 0.25). The drop is fully curable without touching the relation engine.

---

## C. Orion split — INTENTIONAL and correct

- `orion exports` (entity `a5da7116`, 2 obs) and `orion exports pvt. ltd` (entity `3b61e84f`, 2 obs) are distinct canonical values.
- Cross-value pairing does **not** happen: `cross-value orion pair exists = false`; exact-canonical pairs only (1 per value).
- Keeping the split is the deterministic-correct behavior: merging "orion exports" and "orion exports pvt. ltd" without corroboration is exactly the hallucination the deterministic system forbids. **Recommendation: do not merge.** (Both already link to `ORX-102` and `AX-4471`, so the graph connects them transitively.)

---

## D. `Invoice 7842` typed as ACCOUNT — CONFIRMED, the worst FP chain

**Typing error made concrete:**

- Mention `a6e55d6a` at `eefb0295[75,87]` = `Invoice 7842` → `PATTERN_MATCH/ACCOUNT`.
- Mention `78197a49` at `fb0d5ccc[0,12]` = `Invoice 7842` → `PATTERN_MATCH/ACCOUNT`.
- 1 exact-canonical pair → 1 accepted hypothesis → **entity `1ac7ea69` (ACCOUNT, `invoice 7842`)** with obs `[fb0d5ccc, eefb0295]`.

**Material consequence:**

- Degree **3**, all ACTIVE `financial` edges: → `AX-4471` (`b9630b56`), → `ORX-102` (`8bb1705b`), → `Orion Exports` (`a5da7116`).
- The contaminated node sits in **community-1 (5 members @ cohesion 0.8)** and the COMMUNITY detector emits a **CRITICAL lead (`4cc912e9`)** whose `relatedEntityIds` includes the invoice entity, supporting obs `[4b216d1f, eefb0295]`.

So the originally #1 "Golden1 cluster" is not a hallucination layer — it is a **document serial number being promoted to a first-class ACCOUNT identifier**, which then drives the graph, the community scan, and the most severe lead in the run. This is the single most consequential false positive in the golden case.

---

## E. Contradiction non-delivery — CONFIRMED, structurally

- `relationHypothesis.contradictions`: **0 rows** with content.
- `lead.contradictingObservationIds`: **0 rows**.
- The task's contradiction observation (`4182684e`, "…statement that he did not speak with Neha Kapoor… conflicts with the 09:51…") contains **no cue words** the contract's contradiction patterns require (`contradict*`, `denies`, `denied`, `refutes|refuted`, `lies|lied`, `dispute*`, `inconsistent*`) other than — absent — and its mentions are all untyped (`Arjun Mehta[NULL]`, `Neha Kapoor[NULL]`, dates). Nothing fires.

**Producer audit (exhaustive).** Across the repo the only writer of `relationHypothesis.contradictions` / `explicitContradictions` is the MA10 consumer loop, which carries reactively across from candidate-observation attachments — and there is nothing upstream that attaches them. The annotated contradiction set in the case data (shipment-vs-warehouse reconciliation ones + this act contradiction) never reaches runtime:

- Entity-level contradiction exists only in the unit level where `compareStrongIdentifier` returns `DIFFERENT` (entity pairs with exact typed identifiers) — none of this run's resolution candidates have strong identifiers.
- The AI-judge graph-hole is evaluation-only (PR8/9), not wired into the freshness runtime path.
- Act-typing never happens on `NULL` mentions (`arity`/`nullable-agent` gates), so the freshness punter sees nothing ACTIVE/COMMITTED at all.

**Conclusion.** Contradiction is genuinely non-delivered; it is not a delay or a display bug. There is currently **no deterministic runtime rule that intentionally detects contradictions**.

---

## F. Relation engine — reproduced bit-for-bit; the 4 sub-threshold pairs are explainable

Re-running `resolveRelationsForCase` over persisted active entities + all observations:

- `candidates=24`, `proposed=20`, `rejected=4` — **identical** to the persisted output (20 ACTIVE relations in DB).
- 4 rejected, each `type=other`, `support=0.20`, single-evidence:
  - `21e52d28 ↔ 3f7b77d6` (evidence obs `610c5c71`)
  - `21e52d28 ↔ b9630b56` (evidence `673cc2d9`)
  - `2888072f ↔ e33c693d` (evidence `3d692794`)
  - `5d03ab9d ↔ e5862d4a` (evidence `27192943`) — Arjun ↔ Meridian

`0.20` **is** the model's floor for a single generic co-occurrence with no typed cue (`coOccurrence 0.20`, no `typeSignal`). The two *intended* relations in the rejected set (e.g. the Meridian–Arjun contact shot) fall here because their only supporting observation is `type=OTHER` and the text carries no ownership/authorization cue. **The 0.25 threshold is behaving as designed.** Recommendation: do **not** lower the threshold; expose a `BELOW_THRESHOLD`/`NEAR_MISS` status for observability and add context-aware scoring (cue-verb / ownership patterns) so intended relations clear the bar rather than the bar moving down.

---

## G. Graph / temporal wiring — CONFIRMED (cold graphs are flat; the 3-burst reproduction is reproducible)

Live (persisted graph, no temporal attribution):

- `nodes=14, edges=20`
- **detected bursts: 0, detected bridges: 0** — the query-path format gives nothing.
- community candidates: `2` → `5@0.8` (contains the Invoice-7842 node family) and `7@0.48`.

Injecting `validityInterval` onto the 7 edges that carry one (attributable to a single eventTime), then running the same detectors:

- **3 bursts**, all `2026-08-07`, each `eventCount=3` — arising on `Invoice 7842`, `ORX-102`, `Orion Exports`, the one day where the financial triangle is fully formed.

This proves the entire class of temporal salient points is **currently invisible** because the graph is built without temporal attribution. The 08-12 asserted burst is *expected but unsupported*, for **two** reasons the probe exposed:

1. The edges from which it would be computed (Arjun↔Neha on 08-12, etc.) **don't exist** — see gaps B/D — so no entity has 3+ dated edges on 08-12 to form a burst shape at all.
2. The detector measures **edge density in time buckets**; it has no transfer-amount / accumulation semantics. The "08-12 advance movement" is a *semantic* burst that this detector does not ask the model for.

Wiring fix verified: `buildTemporalBurstLeadDraft` (lead-drafts.ts) accepts a candidate + provenance and yields a real lead at runtime; the only missing link is that `validityInterval` is never written by graph-version-service and never accepted by relation-resolution. (A separate static fallback that attributes every edge to the observation eventTime — the natural golden-case migration — is off by default; only `=*=Interpolated=*=`-style tags exist today, plus the "0.5 ACCOUNT" coincidence in entity-materialization.ts:101.)

---

## H. Cross-case — DATA-DEGENERATE, not a matcher bug

- Comparator (`9e4ca30f…`): 2 ACTIVE entities, both garbage `PHONE` rows.
- Identity key overlap with the fresh case: **0** (fresh case keys are `ax-4471/ACCOUNT`, `orion exports/ORGANIZATION`, …).

`CROSS_CASE=0` is a true result of an empty comparator. The hash-identity matcher itself could not be meaningfully exercised. **Recommendation:** generate real comparator fixtures (a second case body with overlapping identities) and re-run before judging the feature; until then, #7 is un-judgable.

---

## NEW — Rule-interaction audit, MA07 extractor (explains #1, and contributes to #3/#5)

| Shape | Interaction | Effect |
|---|---|---|
| Organization-cluster name | PATTERN ORG greedily accepts up to **4** tokens before the suffix (`Arjun Mehta Blue Dusk Logistics`) | The person name is **swallowed inside** an ORG span; the PERSON draft is dropped by span dedupe → contributes to the 9 untyped `Arjun` mentions |
| `Evidence ID: FS-EV-001…-004` | CAPITALIZED/ACCOUNT pattern captures document identifiers (2-6 CAPS + `-` + digits) as ACCOUNT | 4 FP ACCOUNT entities-grade mentions |
| `Invoice 7842` | ACCOUNT pattern's explicit `Invoice` alternative | 2 FP ACCOUNT mentions → the CRITICAL lead chain (in D) |
| `Sector 18` (obs `3be45fa9`) | CONTEXTUAL `records` PERSON_AFTER_TRIGGER fires on the 24-char before-window | Location token mistyped PERSON |

**Fix surface (extractor-only, no model change needed):**

1. **ORG greed cap:** restrict pre-suffix token tail to 1-2 tokens and stop scanning when a token already looks like a person span (CAPS token followed by CAPS — i.e., let the two detectors cooperate through span priority instead of first-pattern-wins).
2. **ACCOUNT identifier guard:** negative lookahead for `Evidence ID`, `Invoice <digits>`, `FS-EV`, random-doc shape; prefer a `DOCUMENT`/`OTHER` type or drop `Invoice 7842` rather than ACCOUNT.
3. **PERSON trigger hardening:** require the after/before trigger plus a capitalized pronoun-free argument (prevents `Sector`), and never fire inside an ORG-typed span.
4. Add a regression fixture parsing all four shapes with golden expectations.

---

## Refined remediation plan (ordered)

| # | Fix | Targets | Risk / notes |
|---|---|---|---|
| P0.1 | Extractor interaction guards (ORG cap, ACCOUNT identifier guard, PERSON trigger hardening) | #1, #5, +Arjun | Zero model change; kills the CRITICAL invoice lead directly |
| P0.2 | Injectable per-case gazetteer (case-identity census → MA07) | #3 (Rohan fully, Arjun's typing) | Proven working in repro; deterministic, no ML |
| P1.1 | Entity `observationIds` — add "observable presence" semantic (canonical match across case obs) or relax union; decide & document | #3 (Arjun), graph degree fidelity | Changes golden-case counts → gate behind config; keep 500 cap documented |
| P1.2 | Temporal wiring: graph-version writes real `validityInterval` from observation eventTime window; relation-resolution accepts optional `validityInterval`; add 08-12 fixture | #2 | Detector+lead path already verified |
| P2.1 | Deterministic contradiction detection (structured equivalence diff at unit level, seeded by the annotated set) | #6 | New producer; punter gating stays |
| P2.2 | Real cross-case comparator fixtures; re-run #7 | #7 | Data, not code |
| P3 | Investigate the FS-EV **underfill** (observed chunk-boundary truncation) and report a second underfill root | #3 | Secondary |

---

## Recommended report posture

- **#1** and **#5** are the same root: extractor pattern greediness/dimensionality (document identifiers + organization-cluster swallowing). They fix together.
- **#3** is not one bug: gazetteer absence (A) + observation-union semantic (B) + ORG-span swallowing of person names (rule audit). Order the fixes so type is corrected before resolution.
- **#2** is a real wiring bug plus missing edges plus a semantics mismatch; all three must be addressed or the 08-12 burst expectations stay unmet.
- **#6** and **#7** are not display bugs; #6 has no producer and #7 has no data.