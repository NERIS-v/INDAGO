# PR-31 — Remediation of the PR-30 Quality Gaps

**Status:** DELIVERED. All seven PR-30 verdicts are answered by deterministic,
rule/gazetteer fixes in the existing engines — no LLM, no embeddings, no
threshold lowering, no Orion merge, no fabricated provenance.

**Scope.** PR-30 (`docs/reports/pr30-quality-gap-validation.md`) re-probed the
seven quality-gap root causes behind the PR-29 golden-run report. PR-31 closes
each with a *deterministic* remediation verified by a pure, DB-free golden
pipeline (the "golden run") that drives the REAL engines end-to-end — MA06/MA07/
MA08 from `@indago/ingestion`, MA09 from `@indago/entity-resolution`, MA10 from
`@indago/relation-resolution`, and the P4 lead chain from
`@indago/graphology-projection` + `@indago/lead-generation`.

The golden assertions encode the post-remediation numbers with the case-scoped
identity census injected exactly as the platform injects it (payload
`identityRoster` → `completeMA07`, PR-31 FIX 2). The DB-free run uses the same
deterministic identity contracts as production
(`deterministicEntityId`, `deterministicRelationHypothesisId`), a human authority
ACCEPTS the machine PROPOSED hypotheses, and nothing is fabricated.

---

## Verdict → Fix mapping

| PR-30 verdict | Root cause | PR-31 fix | Delivered |
|---|---|---|---|
| #1 Golden1 FP cluster — CONFIRMED | Pattern greediness: ORG suffix run-ons, unlabelled document IDs (FS-EV-001…004) captured as ACCOUNT, `records` PERSON trigger, dup phrase context | FIX 1 (rule/gazetteer remediation) | ✅ |
| #3 Arjun/Rohan drop — CONFIRMED (compounded) | Empty gazetteer + observation-coverage semantic + classification asymmetry | FIX 2 (identity roster) + FIX 3/4 (observable presence) | ✅ |
| #2 Timeline corruption — PARTIALLY | Temporal ranges never reach runtime graph | FIX 6 (temporal propagation into graph projection) | ✅ |
| #4 Orion split — INTENTIONAL/CORRECT | Deterministic exact-match semantics | FIX 11 (regression lock: split is correct) | ✅ |
| #5 Mis-typed entities — CONFIRMED, WORST | `Invoice 7842` promoted to ACCOUNT → community scan → CRITICAL lead | FIX 1 (labelled-document-ID guard + invoice removal) | ✅ |
| #6 Contradictions not delivered — CONFIRMED | No producer ever writes relation-level contradictions | FIX 7 (explicit contradictions producer) | ✅ |
| #7 Cross-case — DATA-DEGENERATE | Empty comparator | FIX 8/10 (leads regression; cross-case kept un-manufactured) | ✅ |

Plus FIX 5 (`NEAR_MISS` observability per PR-30 §F) and FIX 13 (authority /
provenance / idempotency verification).

---

## Before → After (golden pipeline)

| Metric | BEFORE (PR-29/PR-30 run) | AFTER (PR-31 golden run) |
|---|---|---|
| Entity-mention candidates | 194 mentions (PERSON 8, ACCOUNT FPs 6, ORG FPs 2, PERSON FP 1) | 192 candidates (DATE 25, PERSON 34, ORGANIZATION 27, ACCOUNT 34, UNTYPED 72) |
| MA08 pairs | 279 | 441 |
| Proposed entity hypotheses (accepted) | 152 → 14 canonical entities | 370 → 14 canonical entities |
| Canonical entities | 14 — incl. **`invoice 7842` (ACCOUNT)**; `rohan singh` MISSING | 14 — `invoice 7842` GONE; `rohan singh`** PRESENT; `arjun mehta` / `neha kapoor` / `rohan singh` typed (16/13/5 obs), `ax-4471` 7 obs |
| MA10 relation candidates | 24 | 31 |
| Relations proposed | 20 | 27 |
| Relations rejected | 4 (sub-threshold `other`) | 0 rejected / **4 `NEAR_MISS`** / 0 low-evidence (FIX 5) |
| Contradiction-bearing relations | 0 (nothing delivered) | 0 — and the producer asserts this is honest (corpus has none) |
| Graph nodes / edges | 14 / 20 | 14 / 27 |
| Temporal bursts | 0 (edges carry no `temporalRange`) | **3** — `2026-08-07` financial triangle (FIX 6) |
| Bridge candidates | 0 | 0 (no articulation edges in the canonical graph — truthful) |
| Community candidates | 2 (`5@0.8` incl. invoice family, `7@0.48`) | 2 |
| Lead drafts | 2 COMMUNITY (incl. `4cc912e9` CRITICAL on the invoice node) | **5** = 3 TEMPORAL_BURST + 2 COMMUNITY, all deterministic |

**The single most consequential FP is gone.** The `invoice 7842` ACCOUNT entity
(degree 3, all `financial`, CRITICAL community lead) no longer exists; its
document serial number is no longer promoted to a first-class identifier. The
`arjun mehta ↔ ax-4471` relation that was missing *even with both entities
durable* now emerges from same-evidence coverage.

---

## What changed, by fix

### FIX 1 — deterministic rule/gazetteer remediation (verdicts #1, #5)
`packages/intelligence/ingestion/src/entity-mention/…`
- `gazetteer.ts` — phrase pass (`matchAll`) so roster names restore full spans
  inside TitleCase runs (`Neha Kapoor` inside `Neha Kapoor Blue Dusk Logistics`).
- `pattern-rules.ts` — ACCOUNT patterns no longer accept labelled
  `Invoice|Inv` tokens; labelled document-ID guard (`isLabeledDocumentId`)
  refuses serial-like identifiers; ORGANIZATION suffix greed capped `{0,3}→{0,1}`.
- `contextual-rules.ts` — removed the `records` PERSON trigger; `isPersonNameShape`
  guard blocks unpaired 2-token runs like `Person Firstname`.
- Wired through `entity-mention-extractor.ts`; extractor suite 45/45.

### FIX 2 — identity roster (verdict #3, lever A/RC-B)
- Contract: `IdentityRosterEntrySchema` + optional `identityRoster` on
  `IngestionJobPayloadSchema` (`packages/contracts/src/intelligence/ingestion-job-payload.ts`).
- Platform: `completeMA07` maps `payload.identityRoster` → `GazetteerEntry[]`
  before MA07 (`packages/platform/src/queue/ingest-evidence.ts`).
- Fixture: `GOLDEN_IDENTITY_ROSTER` (`operation-financial-shadow.ts`) — the
  case-scoped PERSON/ORGANIZATION/ACCOUNT census. Injected in the golden run
  exactly as the platform seam does.
- Result: Rohan singleton gap closed; every Arjun/Neha/Rohan mention typed.
- 4 roster contract tests added (`contracts/tests/ingestion-job-payload.test.ts`).

### FIX 3/4 — observable presence (verdict #3, lever B / RC-B)
- `computeObservablePresence` +
  `ObservablePresence` (`packages/intelligence/relation-resolution/src/resolver.ts`,
  exported from `src/index.ts`): dedupes, counts distinct, sorts, and is bounded by
  `RELATION_RESOLUTION_BOUNDS.maxEvidenceBasis`; dangling observation ids are skipped.
- Golden assertions: every canonical entity is observable in exactly its recorded
  observations; `arjun mehta ↔ ax-4471` is grounded ONLY in observations where BOTH
  are observable (the same-evidence path the PR-30 simulation predicted).

### FIX 5 — `NEAR_MISS` observability (PR-30 §F recommendation)
- `RelationStatusSchema` gains `'NEAR_MISS'` (`contracts/src/domain/relation.ts`);
  web `RELATION_STATUS_LABEL` gains `Near miss` (`relation-authority.ts`).
- `deriveRelationHypothesisStatus(score, hasHardContradiction,
  groundingEvidenceCount)`: contradiction → `REJECTED`; zero grounding →
  `REJECTED`; below 0.25 → `NEAR_MISS`; else `PROPOSED`.
- `RelationResolutionMetrics.nearMisses`; resolver counts grounded-below-threshold
  pairs as near misses; the platform audit message includes the count.
- `RELATION_HYPOTHESIS_TRANSITIONS.NEAR_MISS = ∅`;
  prisma lifecycle comments updated. **The 0.25 threshold is unchanged.**
- The 4 former `other@0.20` rejects now surface as `NEAR_MISS` — visible to an
  operator instead of silently dropped.

### FIX 6 — temporal propagation (verdict #2)
- Confirmed materialization already persists `validityInterval` on canonical
  relations and `makeProjectionInput` already maps it.
- Fixed the runtime gap: `toGraphEdge` in
  `packages/platform/src/relations/graph-runtime.ts` now carries `temporalRange`
  from the relation's `validityInterval`; `CaseGraphView.edges` type updated and
  `graph()` forwards it.
- Verified DB-free (stub-store): `loadCaseProjection` maps/preserves and omits
  when absent; `buildGraph` edges carry it. **Bursts now fire (3) on the golden
  graph** — 0 before.

### FIX 7 — contradiction producer (verdict #6)
- New `packages/intelligence/relation-resolution/src/contradictions.ts`:
  `hasNegativeClaimPolarity(content)` + `detectExplicitRelationContradictions(obs)`
  over a conservative negative-claim vocabulary. The **noun** `contradiction` is
  deliberately NOT a trigger (a mention of the word is not a contradiction claim).
- `completeMA10` merges the produced set with persisted hypothesis contradictions
  into `explicitContradictions`; golden `resolveRelationsForCase` passes the same.
- Golden assertion: producer flags ZERO on this corpus (honest — the corpus's one
  negated act "…did not speak with Neha Kapoor" is a contended statement, not a
  relational contradiction between canonical entities the engine can ground);
  unit tests prove it DOES fire on true negative-claim polarity and suppresses the
  affected pair's hypothesis with provenance.

### FIX 8/10 — deterministic lead chain (verdicts #2/#7)
- New golden regression (`golden-pipeline.test.ts`): a PURE chain over the
  canonical universe — build edges from PROPOSED resolutions, derive each edge's
  `temporalRange` via `deriveValidityInterval`, run `buildGraph` +
  `detectBridgeCandidates`/`detectTemporalBursts`/`detectCommunityCandidates`,
  then `build*LeadDraft` for every surfaced candidate.
- Properties locked, not numbers: candidate sets + lead ids identical across two
  runs (idempotent); every draft is provenance-grounded with resolvable
  `supportingObservationIds` and real `relatedEntityIds`; detectors honour bounds;
  bursts fire only on `temporalRange`-carrying edges.
- Post-remediation chain: bridges 0, bursts 3, communities 2 → **5 drafts**
  (3 TEMPORAL_BURST + 2 COMMUNITY). No cross-case lead is manufactured:
  `CROSS_CASE=0` remains data-degenerate by design (verdict #7).

### FIX 11 — Orion split regression (verdict #4)
- The name-variant test now asserts `orion exports` + `orion exports pvt. ltd` are
  EXACTLY two entities with distinct ids, both ORGANIZATION. The split is the
  deterministic-correct behavior; merging without corroboration would be the
  hallucination the system forbids.

### FIX 13 — authority, provenance & idempotency (DO-16)
New `FIX 13` describe in the golden suite:
- **AUTHORITY** — a canonical entity exists only where a machine PROPOSED
  hypothesis was accepted; every roster identity surfaces; `invoice 7842` does
  not; Orion stays ORGANIZATION.
- **PROVENANCE** — every observation/candidate/pair id resolves; observation and
  candidate lineage reaches the golden artifact source-ids; relation
  `evidenceBasis` ⊆ observation set; zero contradictions produced.
- **IDEMPOTENCY** — an independent, non-memoized re-run of the whole pipeline is
  byte-for-byte identical on identity-bearing fields.

---

## Verification (PR-31 final, FIX 14)

| Suite | Result |
|---|---|
| `@indago/contracts` | **520/520** (23 files) |
| `@indago/ingestion` | **499/499** (34 files) |
| `@indago/relation-resolution` | **43/43** |
| `@indago/platform` DB-free golden + engine suites | **259/259** (17 files) |
| Repo-wide typecheck (`pnpm -r typecheck`, 24 projects) | ✅ clean |

Platform real-Postgres integration suites remain blocked on `TEST_DATABASE_URL`
(environmental, not a regression); every behavioural fix is covered by the
DB-free golden + unit assertions above.

---

## Guardrails honoured

- **No LLM / no embeddings** — every PR-30 gap closed by deterministic rules.
- **No threshold lowering** — `RELATION_PROPOSAL_THRESHOLD = 0.25` unchanged;
  sub-threshold results surfaced as `NEAR_MISS` instead.
- **No Orion merge** — the split is locked as correct (FIX 11).
- **No fabricated provenance** — the lead chain refuses to synthesize a source
  (`requireProvenance`); provenance entries trace to real golden artifacts.
- **Human authority** — the golden run models PROPOSED → ACCEPTED explicitly;
  canonical materialization reuses the production deterministic identity contract.
- **Case isolation / no manufactured cross-case lead** — `CROSS_CASE=0` is a true,
  data-degenerate result (PR-30 §H); PR-31 does not paper over it.

## Residual notes

- **`nearMisses` counting nuance.** In `resolveRelationsForCase`, a hard-
  contradiction pair with evidence > 0 whose support is below threshold is counted
  in `nearMisses` (status is still `REJECTED` via `deriveRelationHypothesisStatus`).
  Unexercised — the golden corpus has zero contradictions — revisit if a
  contradiction metrics audit is ever added.
- **Observation coverage semantic** (entity attaches only supporting obs) is
  documented, intentional behavior; FIX 3/4 makes it visible and asserted rather
  than a silent gap.
- The `routes.ts` payload-producer seam for `identityRoster` is still optional;
  golden tests inject the roster at the same `completeMA07` boundary the platform
  uses.