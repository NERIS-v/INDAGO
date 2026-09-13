# PR5 — Deterministic Graph-Hole Qualification, Scoring & Ranking: Design & Boundaries

**Phase 5A-PR5** · `packages/intelligence/graph-hole-qualification`
(`@indago/graph-hole-qualification`)

This is the authoritative design note for PR5. It records the implementation
surface and — explicitly and honestly — the boundaries that are intentionally
NOT covered by PR5.

> **PR5 status:** complete. 104 unit tests green (incl. the V1.1 formula
> calibration suite `tests/formula-calibration.test.ts`); 45 contract schema
> tests green (18 qualification + 27 policy); package typecheck + recursive
> build green.

PR5 is **pure, deterministic, and read-only.** It never mutates the graph,
creates entities/relations, persists anything, invokes an LLM or Ollama,
or uses embeddings, semantic similarity, or vector search.

---

## PR5 purpose

PR5 converts PR4 `RawGraphHoleCandidate[]` into `QualifiedGraphHoleCandidate[]`:
each candidate is independently evaluated against frozen hard gates, scored by
deterministic formulas, assigned a byte-stable ranking key, and placed into
a partition of qualified vs. rejected candidates. Every input candidate appears
in exactly one output record; no candidate disappears.

---

## Gate mapping

PR5 implements the frozen hard gates from `GRAPH_HOLE_POLICY_V1.qualification`
(`requiresAllHardGates: true`). Each gate maps to exactly one closed, deterministic
failure reason:

| Policy gate | Failure reason |
|---|---|
| `GRAPH_VERSION_EXISTS` / `CASE_ISOLATION_VALID` | `MISSING_AUTHORITY` |
| `PROJECTION_NOT_TRUNCATED` | `REGION_TRUNCATED` |
| `REGION_SATURATED` | `REGION_NOT_SATURATED` |
| `MINIMUM_INDEPENDENT_SUPPORT_UNITS` | `INSUFFICIENT_SUPPORT` |
| `MINIMUM_STRUCTURAL_SCORE` | `LOW_STRUCTURAL_SCORE` |
| `MINIMUM_SIGNIFICANCE` | `LOW_SIGNIFICANCE` |
| `CANDIDATE_NOT_RESOLVED` | `ALREADY_RESOLVED` |
| `CANDIDATE_NOT_DUPLICATE` | `DUPLICATE` |
| `TEMPORAL_CONTEXT_VALID` | `TEMPORAL_INCONSISTENCY` |
| `COMPUTATION_BOUNDS_SATISFIED` | satisfied by construction (PR5 bounded) |

Multiple reasons may be reported per candidate. Reasons are always sorted by
the enum definition order so the output array is byte-stable.

---

## Scoring formulas (frozen V1.1 · `GRAPH_HOLE_SCORING_POLICY_VERSION = "v2"`)

All scores are **heuristic deterministic scores, NOT probabilities.** No score
should ever be interpreted as "70% confidence" or "probability the relationship
existed."

> **Calibration disclaimer:** these are V1 deterministic engineering heuristics.
> Benchmark calibration is required before making empirical claims about
> precision, recall, calibration, or investigator utility.

The V1.0 → V1.1 revision (`scoring` policy version `v1` → `v2`) rebuilt the
evidence-dependent components so that **more evidence can never inflate a score
past its natural ceiling** (weighted geometric mean, saturation, bounded pattern
strength). Qualification gates are unchanged.

### Structural score (renormalized when components are absent)

Components:
- `patternStrength` = `basisStrength × (0.60 + 0.40 × evidenceRatio)`, where
  `evidenceRatio = supporting / (supporting + contradicting)` and **defaults to
  0.5** when there are no observations. Consequence: `patternStrength ≤
  basisStrength` always, so adding perfect evidence reproduces the basis but
  never exceeds it.
- `connectivitySupport` = mean region-scope neighbour densities of candidate nodes
- `contextualSupport` = 0.6×mean(hypothesis evidenceSupport) + 0.4×mean(observation strengths)
- `temporalSupport` = 0.5×scope/region overlap + 0.5×observation fit, or null (no scope)
- `communitySupport` = 0.9 cross / 0.3 same / 0.4 partial community, or null (no communities)

When `temporalSupport` or `communitySupport` is absent (genuinely not applicable),
the applicable weights are **renormalized** to sum to 1.0 over the present
components only. An absent component is NOT treated as zero; a present component
of 0.0 means genuinely zero evidence.

```
structuralScore = Σ(weight_i × value_i) / Σ(applicable weights)
```

### Evidence support score (V1.1 weighted geometric mean)

```
supportBreadth          = min(U, 4) / 4                 (U = independent support units)
supportConsistency      = S / (S + C), or 0.5 when 0    (S = supporting, C = contradicting)
provenanceCompleteness  = P / N, or 0 when N = 0        (P = traceable supporting,
                                                         N = supporting count;
                                                         P = S − missingObservationIds)

evidenceSupportScore = exp( 0.50·ln(max(supportBreadth, ε))
                          + 0.30·ln(max(supportConsistency, ε))
                          + 0.20·ln(max(provenanceCompleteness, ε)) )
                        ε = GEOMETRIC_MEAN_EPSILON = 0.000001
```

The evidence support score is a **weighted geometric mean, never an arithmetic
sum**, so it cannot be inflated by piling on evidence: two flawless units cap at
`sqrt(0.5) ≈ 0.707107 < 1`, and `supportBreadth` saturates at four units.
`provenanceCompleteness` is fail-closed: a supporting observation missing from
the observation set truncates provenance rather than inventing a slot.

### Expected information value (V1.1 bounded, NOT a calibrated model)

```
uncertaintyPotential  = 1 − |2×balance − 1|    (balance = S/(S+C), or 0.5 when 0)
hypothesisCoverage    = min(H, 3) / 3          (H = distinct supporting atomics)
evidenceDiversity     = min(U, 4) / 4          (U = independent support units)

expectedInformationValue = 0.50×uncertaintyPotential
                           + 0.30×hypothesisCoverage
                           + 0.20×evidenceDiversity
```

`expectedInformationValue` estimates the opportunity for useful resolution or
discrimination among competing explanations — a heuristic, **not** a probability
and **not** a calibrated information-theoretic quantity. It is never called
"true information gain." The contradiction count itself is never rewarded:
contradictions affect the score only through the balance term, and
`uncertaintyPotential` peaks at a balanced 1:1 ratio, collapsing to 0 for
one-sided evidence.

### Significance

```
significance = 0.60×structuralScore + 0.25×evidenceSupportScore
               + 0.15×expectedInformationValue
```

### Numeric determinism

Every emitted score = `normalizeScore()` = `round6(clamp01(x))` = round to 6
decimal places after clamping to [0,1]. All averaging inputs are **sorted before
reduction** so floating-point summation is order-independent. All weighted sums
iterate the frozen component definition order. The new V1.1 constants and weights
are frozen in `GRAPH_HOLE_POLICY_V1.scoring` and the `GraphHoleScoringPolicySchema`.

---

## Support-unit semantics

Two observations count as independent IFF their resolved support-unit keys differ.
Keys resolve by V1 priority: `sourceContextId` > `artifactId` > `contentHash` >
`sourceId` (`resolveSupportUnitKey` from `graph-hole-policy.ts`).

**Fail-closed:** a supporting observation that is NOT present in the supplied
observation set cannot resolve a support unit; the candidate receives
`MISSING_AUTHORITY` instead of inventing a provenance slot.

Observation IDs, hypothesis IDs, detector count, and multiple mentions from the
same source are never counted as separate units.

---

## ALREADY_RESOLVED rule

A candidate is resolved when an authoritative **non-observed** edge in the
supplied region scope connects any two of the candidate's `nodeIds`:

- `expectedRelationshipType` is null → ANY direct connecting edge resolves
- `expectedRelationshipType` is set → only a matching `relationType` edge resolves
- `status === 'ARCHIVED'` edges do not resolve

---

## Deduplication rule

Candidates are sorted by `(candidateId, input index)` into a deterministic
processing order. The first occurrence of each `candidateId` is processed normally;
later occurrences receive `DUPLICATE`. This makes the output independent of input
array order.

---

## Ranking

Qualified candidates are ranked by:
1. significance DESC
2. structuralScore DESC
3. evidenceSupportScore DESC
4. expectedInformationValue DESC
5. candidateId ASC (final tie-break)

Ranking keys embed `(1 − roundedScore).toFixed(6)` tokens so ascending string
sort equals the frozen descending-score ranking order. A single string sort
suffices — no floating-point comparator is used.

---

## Temporal gate (conservative)

- No temporal scope anywhere → PASS (nothing temporal to be inconsistent with)
- Future supporting observation or atomic hypothesis → FAIL (future evidence
  cannot qualify a historical candidate)
- Candidate scope vs region context must overlap when both claimed
- Supporting observations without an interval are neutral (never fail)

---

## Contradictions

Contradictions are never a disqualification reason and never a score reward on
their own. They lower `evidenceSupportScore` (via `supportConsistency`) and shift
`uncertaintyPotential` inside `expectedInformationValue` (peaked at a balanced
1:1 ratio). The qualification gates do not reference contradiction counts.

---

## Scoring policy version (v2)

The PR5 contracts version the scoring revision independently from the region and
detection policies (repo convention: one version constant per subsystem).
`GRAPH_HOLE_SCORING_POLICY_VERSION = "v2"` and
`GraphHoleScoringPolicyVersion` are declared in `graph-hole-policy.ts`;
`GRAPH_HOLE_POLICY_VERSION`, `DETECTION_POLICY_VERSION`,
`SEMANTIC_RETRIEVAL_POLICY_VERSION`, and `EMBEDDING_POLICY_VERSION` stay `"v1"`
because identity inputs and detection outputs are unchanged by this revision.
Every `QualifiedGraphHoleCandidate` and `GraphHoleQualificationResult` carries
`scoringPolicyVersion: "v2"`.

---

## Struct bound

- `patternStrength`: `basisStrength × (0.60 + 0.40 × evidenceRatio)` with
  `evidenceRatio ∈ [0,1]` (0.5 default) ⇒ always ≤ `basisStrength`, always
  ≤ its basis's ceiling
- `supportBreadth`: `min(U,4)/4` — saturates at 1.0 for U ≥ 4
- `supportConsistency`: `S/(S+C) ∈ (0,1]`, 0.5 with no observations
- `provenanceCompleteness`: `P/N ∈ [0,1]`, 0 when no supporting observations
- `uncertaintyPotential`: `1 − |2×balance − 1| ∈ [0,1]`, max at balance 0.5
- `hypothesisCoverage`: `min(H,3)/3`; `evidenceDiversity`: `min(U,4)/4`
- geometric-mean guard: `evidenceSupportScore ∈ (0,1)`, defects to ε for a
  zero component instead of collapsing to 0 exactly

---

## Architecture boundaries (PR5 scope)

| Layer | Boundary |
|---|---|
| PR4 (raw candidates) | PR5 reads `RawGraphHoleCandidate[]` and the `rawCandidate` field of every output preserves this intact |
| PR6 (persistence) | PR5 produces a pure `GraphHoleQualificationResult`; PR6 owns persisting it |
| PR7 (AI reasoning) | PR5 scores + ranks; PR7 owns any further qualitative analysis |
| Hypothesis context (PR3) | PR5 reads `HypothesisContext.atomic` for `evidenceSupport` and `temporalScope` of supporting atomics |
| Graph-hole region (PR1/2) | PR5 reads region scope, status, truncated flag, temporal context |

PR5 never scans the whole case, calls semantic retrieval, or recursively
expands regions. It is bounded by the exact inputs the caller supplies.

---

## Verification commands

```bash
# PR5 package (104 tests)
pnpm --filter @indago/graph-hole-qualification test

# PR5 typecheck
pnpm --filter @indago/graph-hole-qualification typecheck

# PR5 contracts (45 schema tests: 18 qualification + 27 policy)
pnpm --filter @indago/contracts exec vitest run tests/graph-hole-qualification.test.ts tests/graph-hole-policy.test.ts

# PR4 package (no regressions)
pnpm --filter @indago/graph-hole-detection test

# PR3 hypothesis-context (no regressions)
pnpm --filter @indago/hypothesis-context test

# Graph-hole region (no regressions)
pnpm --filter @indago/graph-hole-region test

# Contracts suite (full)
pnpm --filter @indago/contracts test

# Recursive typecheck
pnpm -r typecheck

# Recursive build
pnpm --recursive --filter "!web" run build
```

---

## Remaining gaps / forward references

All items below are **DEPENDENCY** or **FORWARD-COMPATIBILITY** — none are
bugs or blockers in PR5.

1. **Persistence (PR6):** PR5 output is in-memory only. PR6 owns DB
   representation, versioning, and retrieval of qualified candidates.
2. **AI reasoning (PR7):** PR5 produces heuristic scores only. PR7 owns any
   qualitative analysis, narrative generation, or confidence discussion; PR7
   must never treat PR5 scores as calibrated probabilities.
3. **Community source:** community support requires a caller-supplied community
   map from the M-A10/M-A13 `detectCommunities` pass. When absent,
   communitySupport is null and renormalized away.
4. **Evidence support formula precision:** the original `min(1, count/5)` linear
   formula was intentionally coarse and overly liberal. PR5's V1.1 revision
   replaced it with a weighted geometric mean (policy version bumped to `v2`);
   the gate thresholds and `MIN_SIGNIFICANCE` still require an investigator
   review before the calibrated precision/recall trade-off can be claimed.
5. **Second hypothesis lifecycle:** explicitly excluded from PR5 scope.
   Future PRs may introduce hypothesis updating; PR5 contracts are
   forward-compatible via the frozen `QualifiedGraphHoleCandidateSchema`.
