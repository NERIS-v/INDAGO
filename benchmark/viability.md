<!-- INTERNAL PILOT EVALUATION · SYNTHETIC / DE-IDENTIFIED CORPUS · PROTOTYPE BENCHMARK -->
<!-- generated 2026-01-01T00:00:00.000Z; light-mode=false; deterministic seeded corpus; not a production/field/independent claim -->

<!-- INTERNAL PILOT EVALUATION · SYNTHETIC / DE-IDENTIFIED CORPUS · PROTOTYPE BENCHMARK · This evaluation does not invoke, represent, or endorse any external institution, reviewer, publication, certification, or real-world validation. -->

# INDAGO Prototype — Internal Viability Assessment (12 Sections)

**Status: INTERNAL PROTOTYPE PILOT EVALUATION on a SYNTHETIC / DE-IDENTIFIED
CORPUS. Not a production validation, not an independent audit, not a
calibrated-quantity claim.**

## 1. Executive summary
This pilot runs the real INDAGO deterministic engines (ingestion → entity
resolution → relation resolution → graph → hole detection → gap classification →
competing explanations → evidence-request generation → PR18 selection) on a
seeded, synthetic, de-identified corpus modelling a fraud-network dossier.
The table in `condition-summary.md` reports per-condition indicators.

## 2. Evaluation corpus & ground truth
- 45 case/condition packages; 24 planted holes total.
- Ground truth planted tables: identities (canonical + aliases + strong ids),
  edges (witnessed/withheld), contradictions, holes (type, endpoints,
  decisive evidence types, held-out records).
- Corpus generator: `corpus.ts`, RNG is seeded per (case, condition) —
  byte-reproducible. HELDOUT records are excluded by design (SYS-01).

## 3. Scope & boundaries
Covered: acquisition/materialization, entity resolution, relation resolution,
contradiction handling, graph construction, hole detection, gap classification,
competing explanations, evidence-request generation, PR18 selection.
NOT covered: real acquisition, OCR quality, multi-case interference,
human-in-the-loop review, deployment, security reviews.

## 4. Conditions
- CLEAN (easy): minor alias noise, no deletions/withholding.
- NOISY_MISSING: 40% alias rate, 12% duplicates, 18% deletions, 22% withheld
  edges, temporal shifts.
- ADVERSARIAL: 50% alias rate, 16% duplicates, 22% deletions, shared id collision.

## 5. Metrics methodology
Nine metric families (`metrics.ts`): materialization, entity resolution
(alias-level recall@1/precision), relation resolution (pair+type match
precision/recall), contradiction recall (proxy), graph construction, hole
detection & ranking (ERR@K, strict/lenient, candidate precision, FPR proxy),
gap-classification coverage, competing-explanation breadth, evidence-step
retention + signal alignment. Every ratio is a raw quotient; denominators are
reported alongside.

## 6. Results overview
| Condition     | Hit rate | Strict hit | ERR@3 | Robustness |
| ------------- | -------- | ---------- | ----- | ---------- |
| CLEAN         | 37.5%    | 37.5%      | 16.7% | 100.0%     |
| NOISY_MISSING | 25.0%    | 25.0%      | 10.0% | 100.0%     |
| ADVERSARIAL   | 12.5%    | 12.5%      | 6.7%  | 100.0%     |

## 7. Hole detection & ranking
- ERR@K (K=3) = mean reciprocal rank of the first candidate hitting each
  planted hole (0 when none). A hole whose endpoints never co-appear is only
  detectable structurally (MISSING_PATH via a shared neighbour), which is an
  acknowledged, realistic limitation of the planted-fixture design.
- Detector type distribution per planted type: see `holes.json` verdicts.

## 8. Robustness analysis
Robustness = strictHoles / lenientHoles for each condition. Strict gate requires
every hitting candidate's nodes to be attributable to planted-hole owners
(fragmented + merged entities are tolerated), i.e. the signal survives the
tolerance gates without relying on unexplained noise.

## 9. Failure analysis
Count of typed hard failures recorded by the harness (per-stage, never aborting):

| Condition | Hard failures |
| --- | --- |
| CLEAN | 0 |
| NOISY_MISSING | 0 |
| ADVERSARIAL | 0 |


## 9c. GAP corpus detector retarget (honest-fixture decision)
The four GAP corpus cases (GAP-01..04) were originally planted one-per-detector
(MISSING_EDGE / MISSING_PATH / TEMPORAL_GAP / COMMUNITY_BOUNDARY). Measured on
this prototype engine with the frozen 0.70/0.70 qualify gates:

- GAP-01 MISSING_EDGE (J1↔J2): qualifies honestly on CLEAN (structural ~0.74).
- GAP-02 MISSING_PATH (K1…K3) and GAP-04 COMMUNITY_BOUNDARY (M3↔M5) sat at
  structural 0.64–0.68 — a structural ceiling, not a corpus artifact:
  - MISSING_PATH always emits 3-node candidates and requires ABSENT ≤4-hop
    alternate paths, so extra (needed) connectivity suppresses the candidate;
    its connectivity never rises above ~0.5, capping structural below 0.70.
  - COMMUNITY_BOUNDARY uses basis CROSS_COMMUNITY_HYPOTHESIS_CONTEXT
    (0.65 pattern ceiling) and needs the pair DISCONNECTED across real
    communities, again capping connectivity ~0.5.
  Both detectors nonetheless parse their difficulty honestly: they raised
  correlated candidates that the frozen gates correctly rejected.
- Per the pilot maintainer's decision, GAP-02 and GAP-04 were RETARGETED to
  MISSING_EDGE on the SAME repeatedly co-mentioned, never-documented pairs
  (K2↔K3, M3↔M5). The planted gap is unchanged; the pair's own exact detector
  now clears the gates honestly (0.71–0.77), aided by genuine cross-community
  support in the two-clique GAP-04 fixture. GAP-03 TEMPORAL_GAP remains a
  documented honest-0 (single-version corpus has no true temporal gap).
  The MISSING_PATH / COMMUNITY_BOUNDARY ceiling measurement remains recorded
  in `holes.json` `qualificationFailureReasons` for the GAP rows.

## 10. Limitations & caveats
- Synthetic corpus: real-world acquisition noise is far harsher; results are
  indicative of prototype behaviour only.
- FPR proxy uses detector `pairEvaluations` as a true-negative stand-in.
- Entity metrics are alias-level (synthetic-reference-grade), not
  reference-level on real documents.
- Hole hit = node-set membership; a genuine but unplanted structural surprise
  counts as a false positive in candidate precision by design.

## 11. Reproducibility & determinism
- Single command: `npm run bench:pilot` (full) or `INDAGO_BENCH_LIGHT=1 npm run bench:pilot`.
- Seeded PRNGs; `nowIso` fixed at `2026-01-01T00:00:00.000Z`; no wall clock in scores;
  `manifest.json` hashes every artifact. Re-running yields byte-identical
  artifacts (timing diagnostics excluded from hashes).

## 12. Recommendations & next steps
- Tier 1: widen planted-hole fidelity (co-mention paths + shared-neighbour
  fixtures) to separate MISSING_EDGE vs MISSING_PATH semantics.
- Tier 2: add real multi-document acquisition fixture with OCR/corrected text.
- Tier 3: calibration study mapping these pilot ratios onto prototype
  thresholds before any production claim.
