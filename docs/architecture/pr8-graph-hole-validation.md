# PR8 — Deterministic Graph-Hole AI Claim Validator (Phase 5A)

**Phase 5A-PR8** · `packages/intelligence/graph-hole-validation` (`@indago/graph-hole-validation`)

Authoritative design/status note for PR8: the **pure, deterministic
post-LLM validator** that verifies a PR7 `GraphHoleAnalysisResult` is grounded
in exactly the bounded context it was given. It records the implemented surface
and — explicitly — the boundaries that are intentionally NOT covered today.

> **PR8 status:** PR8 is complete for its current shape: a closed-world
> pure validator (no clock, no random, no network, no database, no mutation)
> that runs over the same authoritative context PR7 consumed, and a 112-test
> verification suite (98 core + 9 architecture + 5 security). All package
> typecheck/build/tests green. The boundaries below are explicit
> `DEPENDENCY`/`DEFERRED` choices, not defects.

---

## Implementation surface (summary)

- **Closed-world input.** `validateGraphHoleAnalysis(result, context,
  serializedContext)` takes exactly three inputs: the PR7 stamped result, the
  PR7 bounded context object, and the canonical serialized context string.
  Nothing is fetched, looked up, or derived from outside these inputs.
- **Pure + deterministic.** Same inputs ⇒ byte-equivalent findings. No `Date`,
  no `Math.random`, no `fetch`, no imports of runtime/provider, no assignment
  to any input field. No `await` anywhere in the validator.
- **Digest verification.** `contextSha256` (stamped on the result by PR7 before
  the LLM call) is recomputed from the exact `serializedContext` string and
  compared — tampering with the digest or the context canvas is detected.
- **Context binding.** The serialized context must be the canonical
  serialization of the supplied context (the profile with
  `counts.serializedContextChars` zeroed), closing the "equivalent but
  non-canonical canvas" gap.
- **15 checked categories, 11 finding codes.** The baseline context emits zero
  findings; a category is *checked* on every call, and each of the 11 codes has
  at least one reachable emission path exercised by tests.
- **Severity split.** `ERROR` findings set `valid=false`; `WARNING` findings
  are retainable (`valid` stays true) but surfaced for human review. `valid`
  is purely `errorCount === 0`.
- **No repair, no mutation.** The validator never rewrites, removes, or
  substitutes any ID, claim, or field. It flags; it does not fix.
- **Epistemic backstop.** Beyond PR7's prompt enforcement, PR8 defends key
  enums and bounded phrase-category rules (no asserted criminality / guilt /
  intent / concealment / conspiracy at `ERROR` severity; no absolute
  "no evidence exists" claims for incomplete contexts at `ERROR` severity).
- **Verification:** 112 tests across 3 suites (core 98, architecture 9,
  security 5); package typecheck + build green.

---

## 1. What PR8 is and is not

PR7 produces a **structured, schema-valid** analysis from a bounded context.
Schema validity does not guarantee *claim* validity: the model could invent an
observation ID, misstate a temporal bound, cite a provenance slot that does not
exist, or over-claim completeness. PR8 closes that gap with a deterministic,
0-LLM, closed-world validator.

PR8 is NOT:

- **Not an LLM judge / grader.** No second model call, no `generateStructured`,
  no autonomy. Rephrasing, re-scoring, or re-interpreting the analysis is
  explicitly outside scope (`DEPENDENCY`: a future qualitative re-review layer).
- **Not a repair layer.** Findings tell the caller *what* is wrong, deterministically;
  the caller decides whether to (a) discard, (b) re-run analysis, or (c) accept
  warnings with the implicit lowered-evidence-quality trade-off.
- **Not a schema validator.** PR7's strict zod schema already rejects
  malformed/invalid payloads at the boundary. PR8 validates *semantic*
  grounding over a given (already-schema-valid) context. (A few enum defenses
  are duplicated deliberately as a backstop — see §6.)
- **Not a repository.** No persistence, no store, no database writes.

Pipeline placement:

```
PR4  RawGraphHoleCandidate (deterministic detection)
  ↓
PR5  QualifiedGraphHoleCandidate (scored + ranked, deterministic)
  ↓
PR7  GraphHoleAnalysisResult (LLM output + feature-stamped identity + contextSha256)
  ↓
PR8  ValidatedGraphHoleAnalysis (deterministic claim validation)  ← this PR
  ↓
     human/intelligence consumer (accepts warnings, rejects errors)
```

---

## 2. Determinism contract

`validateGraphHoleAnalysis` is a pure function over
`(result, context, serializedContext)`:

- **No clock/entropy:** no `Date.now`, `new Date()`, `Math.random`, counters,
  or request IDs are read or generated.
- **No I/O:** no `console`, no `process.*`, no filesystem, no network, no
  database. Enforced by architecture tests (see §8).
- **No `await`:** synchronous end-to-end. Barrels in a single pass; findings
  are deduplicated then sorted by `path → code → referenceId → message`
  (`localeCompare`), yielding a stable findings order independent of validator
  execution order.
- **No mutation:** inputs are `readonly` by type; the validator performs no
  assignment to `result.*` or `context.*`. Enforced by architecture tests and
  a no-mutation test that asserts the result object is unchanged after
  validation.

---

## 3. Closed-world input & authority boundary

### Inputs

| Input | Ownership | Purpose |
|---|---|---|
| `result: GraphHoleAnalysisResult` | PR7 output (LLM claims + feature-stamped identity) | The claims to verify. |
| `context` | PR7 bounded context object | The authoritative set of allowed references (ids, dates, digests, flags). |
| `serializedContext: string` | PR7 canonical user message | Enables digest recomputation against exactly what the model saw. |

The validator accepts *structural* views of the PR7 context types (and reads
`contextSha256` from the result) rather than importing PR7's zod builders —
keeping the validator I/O-free and independent of schema-parse machinery.

### Authority ordering

- PR8 reads from the **context**, never from the analysis, for what is true.
- PR7 identity fields (`candidateId`, `caseId`, `graphVersionId`, `regionId`,
  `schemaVersion`, `analysisPolicyVersion`) must equal the context's stamped
  identity. The model cannot change them — a mismatch means a
  packaging/identity break.

---

## 4. Digest verification & context binding

PR7 computes `contextSha256 = sha256Hex(serializedContext)` **before** the LLM
call and stamps it on the result. PR8 recomputes the same hash over the exact
`serializedContext` string passed to `validateGraphHoleAnalysis` and compares:

- mismatch ⇒ `CONTEXT_DIGEST_MISMATCH` `ERROR` at path
  `result.contextSha256` (referenceId = the result's digest). `valid=false`.
- If the serialized string is tamped with (e.g. whitespace, key rename) the
  digest can no longer match the stamped value, so the validator flags it —
  the digest binds the analysis to the exact model-facing canvas.

In addition, PR8 re-derives the canonical serialization of the supplied
`context` (the profile with `counts.serializedContextChars` zeroed, matching
PR7's serialization contract via the shared `canonicalStringify`) and requires
byte-equality with `serializedContext`:

- mismatch ⇒ `CONTEXT_BINDING_MISMATCH` `ERROR` at path
  `result.serializedContext`. `valid=false`.
- This closes the gap where a context object could be mutated (or swapped for
  an equivalent-but-non-canonical representation) while still hashing to the
  same digest — the binding check asserts the exact canvas is canonical.

The recomputation uses Node's `crypto.createHash('sha256')` only, mirroring
PR7's `sha256.ts` so the two digests are byte-identical for the same string.

---

## 5. Validation categories & finding codes

`VALIDATION_FINDING_CODE` (frozen enum, 11 codes) and their severities:

| Code | Category checked | Severity |
|---|---|---|
| `INVALID_ANALYSIS_REFERENCE` | reference existence (obs/hypothesis/group ids in analysis vs context) | ERROR |
| `IDENTITY_MISMATCH` | candidate/region/graph/case identity + authority/version stamps | ERROR |
| `CONTEXT_DIGEST_MISMATCH` | digest over the serialized context | ERROR |
| `CONTEXT_BINDING_MISMATCH` | canonical serialization of the supplied context equals `serializedContext` | ERROR |
| `TEMPORAL_CONTRADICTION` | candidate-temporal-scope vs contextual evidence + analysis validity window; scope containment of cited observations | ERROR (acknowledged conflict via `TEMPORAL_CONFLICT` warning is WARNING) |
| `GRAPH_INCONSISTENCY` | structural basis / region status / node/edge refs / relationship internals | ERROR (some WARNING, see §6) |
| `EVIDENCE_CLASSIFICATION_MISMATCH` | reasoning steps' OBSERVED_FACT/HYPOTHESIS/STRUCTURAL_SIGNAL/INFERENCE conformance (incl. ungrounded STRUCTURAL_SIGNAL steps) | WARNING |
| `PROVENANCE_MISMATCH` | every cited observation's source has a provenance record; provenance ids exist; per-reference paths for missing-source warnings | ERROR (missing-source record is WARNING) |
| `FORBIDDEN_EPISTEMIC_CLAIM` | criminality/guilt/intent/concealment/conspiracy + confidence inflation (negation-guarded) | ERROR |
| `COMPLETENESS_OVERCLAIM` | absolute "no evidence" claims when context completeness flags are set (exempt when assessment acknowledges `INSUFFICIENT_CONTEXT`) | ERROR |
| `CONTRADICTION_IGNORED` | a relevant context contradiction (one whose obs/hyp is analysis-referenced) not preserved in the analysis (supporting vs contradicting split) | WARNING |

`CHECKED_CATEGORIES = 15` is reported in the summary. The 15 categories are
spread across the modules in §7 (reference existence, node references, edge
references, identity, digest, context binding, authority/version, temporal,
evidence classification, provenance, relationship, contradiction preservation,
structural signal, epistemic safety, and completeness) and always reported as a
constant, so the caller can reason about coverage without inspecting module
internals.

---

## 6. Distinctive design decisions

### Structural enums defended as a backstop

PR7's schema already constrains `candidateAssessment`,
`missingRelationship.assessment`, `structuralBasis`, `regionStatus`,
`missingRelationship.direction`, `uncertainty.rating`, `warnings[].code`, and
`alternativeExplanations[].uncertainty` (range 0–1) to open enums / ranges.
Because these are *open* by design so the contract can evolve, PR8 additionally
defends the current authoritative sets (`HYPOTHESIS_REFERENCED_NODE`,
`SATURATED`, `CONSISTENT_WITH_GAP`, `SOURCE_TO_TARGET`, `HIGH`, …) and the 0–1
range. Unknown enum values or out-of-range uncertainty ⇒ `GRAPH_INCONSISTENCY`
`ERROR` (enums) / `FORBIDDEN_EPISTEMIC_CLAIM` `ERROR` (rating, warning codes,
range). This is the deliberate duplication noted in §1 — a backstop against
schema drift, not a replacement.

### Epistemic backstop, not keyword blacklist

`FORBIDDEN_EPISTEMIC_CLAIM` is structural, not a text-substring filter:
- Structured fields: `candidateAssessment` / relationship `assessment` may not
  assert criminality, guilt, intent, concealment, or conspiracy; confidence
  `rating` must be from the schema's LOW/MEDIUM/HIGH/CRITICAL set and warning
  `code`s from the schema's 7-code set; alternative-explanation `uncertainty`
  must lie in [0, 1].
- Bounded phrase rules over the statement-level fields the schema leaves free
  (e.g. making findings about an *individual's* guilt/culpability). This is a
  bounded safety net for the versioned system prompt; it does not attempt
  general sentiment/intent analysis.
- **Severity:** match ⇒ `ERROR` (previously WARNING). Negative-scope triggers
  are suppressed by a bounded negation guard (`NEGATION_CONTEXT_TOKENS`,
  40-char lookback) so that "no evidence of intent", "did not deliberately",
  and "must not conclude guilt" do not produce false positives.

### Completeness-aware overclaiming

PR7 stamps context completeness flags (`semanticRetrievalTruncated`,
`regionLimited`, `observationContextLimited`, `hypothesisContextLimited`,
`hypothesisGroupingTruncated`, `temporalContextLimited`,
`contextBudgetLimited`). When any is set, an analysis asserting an absolute
exhaustive conclusion ("no evidence exists anywhere", "the domain is fully
covered") is flagged `COMPLETENESS_OVERCLAIM` `ERROR` (previously WARNING) —
the model cannot know what the truncated/incomplete context did not supply.
The finding is suppressed when the analysis itself acknowledges the limit via
a `candidateAssessment` of `INSUFFICIENT_CONTEXT`.

### Contradiction preservation (relevance-aware)

The context exposes explicit contradictions. Only contradictions whose
`observationId` / `hypothesisId` / `contradictsHypothesisId` are actually
referenced by the analysis must be preserved: a contradiction is "addressed"
when its observation appears in the analysis's contradicting split, either side
of a hyp-vs-hyp conflict is referenced by a `CONTRADICTION`-kind reasoning
step, the assessment is `CONTRADICTED`, or a `CONTRADICTIONS_PRESENT` warning
is emitted. Unrelated contradictions are not flagged — PR8 does not *resolve*
contradictions (PR7 design); it ensures relevant ones are surfaced, not
silently dropped.

### Temporal scope containment

`validateTemporalConsistency` applies three deterministic rules (no NLP):
1. If `candidateTemporalScope` and `temporalContext` are both non-null and
   disjoint, the analysis must emit a `TEMPORAL_CONFLICT` warning or a
   `TEMPORAL_CONTRADICTION` warning is issued.
2. Every analysis-cited observation with a determinate interval strictly
   disjoint from `candidateTemporalScope` is flagged `TEMPORAL_CONTRADICTION`
   `ERROR` at the exact citation path.
3. Same against `temporalContext` (region window) ⇒ `ERROR`.

Citation paths are collected per-reference across top-level lists,
`missingRelationship`, and `reasoning` steps.

### Relationship substitution detection

`validateRelationshipConsistency` detects substitution risk:
- A direct relationship support via an `ENTITY_HYPOTHESIS` atomic (even though
  the candidate schema reaches for a `RELATION_HYPOTHESIS`) ⇒ `WARNING`.
- A supporting hypothesis whose predicate differs from the expected
  relationship type ⇒ `WARNING` ("possible substitution").
- Unknown `missingRelationship.direction` values (not one of `UNKNOWN` /
  `SOURCE_TO_TARGET` / `TARGET_TO_SOURCE` / `BIDIRECTIONAL`) ⇒ `ERROR`.
- Entity↔graph-node mapping is not available in the context, so resolving
  whether an entity-level substitution actually implies a missing edge is
  deferred (see §9).

### Ungrounded structural signals

A `STRUCTURAL_SIGNAL` reasoning step that references no observation and no
hypothesis is flagged `EVIDENCE_CLASSIFICATION_MISMATCH` `WARNING` — structural
signals must be grounded in the supplied graph.

---

## 7. Module layout

```
src/validate-analysis.ts            compose entry (dedupe + sort + summary)
src/types.ts                        finding codes, severities, result types,
                                    FORBIDDEN_EPISTEMIC_PATTERNS
src/sha256.ts                       sha256Hex (mirror of PR7, used for §4)
src/validate-references.ts          reference existence + node/edge refs
src/validate-identity.ts            identity, digest, authority/version
src/validate-temporal.ts            temporal consistency
src/validate-evidence-classification.ts
src/validate-provenance.ts
src/validate-relationship.ts
src/validate-contradiction.ts
src/validate-structural-signal.ts
src/validate-epistemic-safety.ts
src/validate-completeness.ts
src/index.ts                        public API only
```

Each module exports one pure function returning `ValidationFinding[]`; a module
never mutates its inputs and never reads shared mutable state. The public API
is `validateGraphHoleAnalysis` + `VALIDATION_FINDING_CODE` + the result types.

### Versioning note

`0.1.0` (initial) — the findings shape and code enum are frozen for review;
all evolution happens behind explicit enum additions with the summary's
`checkedCategories` constant updated by the maintainer (see §9).

---

## 8. Verification

### Test suites (`pnpm run test`): 3 files / 112 tests

- **Core** (`tests/validate-analysis.test.ts`, 98 tests): baseline zero-findings,
  reference existence, identity/authority, digest recompute/tamper, context
  binding (incl. canonical pass + mutated-context fail), temporal window +
  scope containment (scope-exceeded obs, window-exceeded obs, forward-compat
  simultaneous-non-overlap), evidence classification (incl. ungrounded
  STRUCTURAL_SIGNAL), provenance (missing-source record ⇒ WARNING with
  per-reference path), relationship substitution (ENTITY_HYPOTHESIS direct
  support + predicate mismatch + direction enum defense), contradiction
  relevance preservation (incl. hyp-vs-hyp `contradictsHypothesisId`
  addressing), structural basis/region status/node+edge refs, epistemic safety
  (ERROR + negation guard + rating/warning-code enum + uncertainty range),
  completeness overclaim (ERROR + INSUFFICIENT_CONTEXT exemption), result
  contract, category coverage, determinism (byte-equivalent on identical
  input), and no-mutation of inputs.
- **Architecture** (`tests/architecture.test.ts`, 9): no `console.*`, no
  `fetch(`, no dynamic `import(`, no `JSON.parse`, no clock/entropy, no input
  assignment, no persistence surface (Prisma / SQL DML / `save|persist`), no
  runtime/provider identifiers, minimal public API, frozen 11-code map.
- **Security** (`tests/security.test.ts`, 5): no mechanisms for remote calls /
  secrets / credential reading / shell execution in `src`; compiled JS output
  free of `createAiRuntime`, `$ref`, `process.env`, `console.`, `fetch(`.

### Package verification

- `pnpm run typecheck` (tsc `--noEmit`) — green.
- `pnpm run build` (tsc emit to `dist/`) — green.
- No runtime/provider dependency: `src` imports only Node's `crypto` + local
  modules; package.json has no `zod`, no `ai-agent-runtime`, no HTTP client.

---

## 9. Boundaries & explicit non-goals

- **DEPENDENCY — no LLM judge.** PR8 does not re-grade or re-score the
  analysis. A qualitative re-review layer is future work and must not reuse
  PR8's finding codes as its rubric.
- **DEFERRED — auto-repair / auto-rejection.** PR8 flags; the consumer
  decides. Persisting a validation verdict or wiring it into an
  automated rejection/threshold policy is not in this PR.
- **DEFERRED — optional manifests.** A per-finding "rule id + provenance"
  manifest is possible later; today `referenceId`/`path`/`code` are the lookup
  keys and the message is human-readable.
- **FORWARD-COMPATIBILITY — enum evolution.** New structural
  basis / region-status / assessment values must be added to PR8's defended
  sets in lockstep with the contracts. Unknown values fail closed (ERROR) so a
  stale validator never silently accepts an unvetted enum.
- **DEFERRED — temporal ordering / overlap NLP.** The forward-compat temporal
  cases ("non-overlap incorrectly represented as overlap", "explicit event
  ordering contradiction", "later evidence used as earlier evidence") require
  prose parsing or structured ordering that the analysis schema does not carry
  today; scope containment (single-observation vs window) is covered
  deterministically, inter-observation simultaneity is not.
- **DEFERRED — entity↔node substitution resolution.** Substitution *risk* is
  flagged when a relationship is directly supported by an `ENTITY_HYPOTHESIS`
  or a predicate-mismatched hypothesis, but the context exposes no
  entity↔graph-node mapping, so resolving whether a true missing edge exists is
  left to consumers / a future mapping layer.

---

## 10. Canonical example

```ts
import { validateGraphHoleAnalysis } from '@indago/graph-hole-validation';

const result = analyzeGraphHole({ context, serializedContext, ... }); // PR7
const verdict = validateGraphHoleAnalysis(result, context, serializedContext);

verdict.valid          // true ⇒ no ERROR findings
verdict.findings       // sorted, deduped; each has code, severity, path, refId, message
verdict.summary        // { errorCount, warningCount, checkedCategories: 15 }
```