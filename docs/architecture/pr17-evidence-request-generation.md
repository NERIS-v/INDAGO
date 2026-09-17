# PR17 — Candidate Evidence Request Generation (Phase 5A)

> **Status: PARTIAL 🟡 — policy FROZEN V1 + pure deterministic runtime; real-Postgres execution DEFERRED (ENVIRONMENTAL).**
> Frozen 2026-09-17 on `feat/m-a13-graph-hole-region` by `[Mayur]`.
>
> **One-line claim:** PR17 generates a **bounded, deterministic, grounded set of candidate evidence requests**
> (the `candidateRequests` seam that the frozen PR10 `selectNextBestEvidence` consumes) over a qualified
> GraphHole, its REAL PR14 classification, its REAL PR15 competing explanations, and its REAL PR16 ER-split
> analysis. It only ever PROPOSES requests — it never acquires, never authorizes, never persists, never
> executes an evidence lifecycle, never calls an LLM, never does hidden retrieval, never resolves an entity,
> never over-claims utility.
>
> **PR17 does NOT own:** ranking by utility (`[PR18]` owns evidence-utility score/rank), evidence independence
> (`[PR19]`), Resolution Rate@K (`[PR20]`), acquisition, authorization, persistence, lifecycle transitions
> (`APPROVED`/`ACQUIRED`/`COMPLETED`/…) — **all frozen out of PR17 scope.**

---

## 1. Mission

Transform:

```text id="02wyb2"
GraphHole
   ↓
GapClassification (REAL PR14 — re-run equality bound)
   ↓
CompetingExplanationSet (REAL PR15 — re-run equality bound)
   ↓
ErSplitExplainedGraphHole (REAL PR16 — re-run equality bound)
   ↓
[BOUNDED CANDIDATE CONTEXT]
```

into:

```text id="1eq7l5"
BoundedCandidateEvidenceRequestSet
```

where each candidate request is **grounded** (binds to the real explanations it would discriminate between),
**deterministic** (content-addressed canonical identity; byte-stable), **bounded** (per-gap / per-pair / per-run
caps frozen below), and **non-utility** (PR17 proposes; PR18 ranks; PR19 adjudicates independence).

The seam PR10 froze is *input.gaps[].candidateRequests* consumed by `selectNextBestEvidence`. PR17 is the
generator that fills that seam with candidates it would be reasonable to consider. PR17 does NOT decide which
candidate is best.

---

## 2. Authority boundaries (frozen)

| Authority | Owner | PR17 behavior |
|---|---|---|
| Evidence lifecycle (request → acquire → ingest) | later lifecycle PR | PR17 only emits a PROPOSED candidate |
| Utility score + ranking of candidates | **PR18** | PR17 never assigns a `utility` score or `rank`; emits `canonicalRequestKey` + discrimination identity only |
| Evidence independence / non-redundancy | **PR19** | PR17 dedupes identical candidates, never fabricates independence |
| Resolution Rate@K certification | **PR20** | PR17 knows nothing about Resolution@K |
| Entity lifecycle / hypothesis lifecycle | M-A09 (authority) | PR17 never resolves entities, never mutates hypotheses |
| Targeted reblocking | later handoff PR | PR17 never reblocks |
| Persistence | platform | PR17 is runtime-only; no store, no model, no migration |
| LLM | N/A | PR17 is a pure, deterministic code runtime |

---

## 3. Bounds (frozen V1)

Mirrored from / compatible with the PR10 selection bounds, but owned by PR17's own generation policy so that
both can be tuned independently. PR10 consumes candidates; PR17 produces them — the two must agree on the
bounded candidate universe, and PR17's caps must NEVER exceed what PR10's selection can actually consider.

```text id="t7ge7s"
PR17 (generation)                       PR10 (selection, frozen)
─────────────────────────────────────────────────────────────
MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP = 10
                                        MAX_EVIDENCE_REQUESTS_PER_GAP = 5  (PR10 emit cap)
MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR = 5
MAX_GENERATED_TOTAL_CANDIDATE_REQUESTS_PER_RUN = 50
                                        MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP = 25 (PR10 consider cap)
MAX_GENERATED_HYPOTHESIS_PAIRS_PER_QUERY = 500  (mirror PR16 MAX_CANDIDATE_PAIRS_PER_QUERY)
MAX_GENERATED_ENTITY_HYPOTHESES_PER_QUERY = 500 (mirror PR16 bound)
```

Rationale for parity:

- PR17 may generate **at most** 10 candidates per gap; PR10 may then consider **at most** 25 candidate
  requests per gap. **The generator is deliberately the stricter of the two** (10 < 25) — the generator must
  never widen the selection's bound, or it would silently exceed the frozen PR10 ceiling. Never invert this.
- Across a bounded run (max 10 gaps per selection run on the PR10 side), 10 per gap × at most 50 total per
  generation run keeps the candidate universe comfortably inside PR10's own run-level caps.
- These are **policy ceilings**, not quality targets. Hitting a ceiling is always surfaced as `truncated`,
  never a silent drop (§12).

The three **canonical bounds constants** live in `packages/contracts/src/intelligence/evidence-request-generation-policy.ts`
and are re-exported for the runtime:

```text id="0ld3pb"
MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP
MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR
MAX_GENERATED_TOTAL_CANDIDATE_REQUESTS_PER_RUN
```

---

## 4. Identity / deduplication (content-addressed)

Every generated candidate has a **canonical content-addressed identity**, reusing the exact
`canonicalizeDeterministic` + `sha256Hex` convention frozen in PR10/PR15/PR16. The identity tuple is:

```text id="blr0q9"
canonicalRequestKey = sha256Hex(
  canonicalizeDeterministic({
    gapId,
    evidenceType,                  // frozen PR10 EvidenceTypeSchema vocabulary (EvidenceTypeSchema)
    discriminatesAmongIds,         // the REAL explanation ids this request would discriminate between
    hypothesisIds,                 // canonical hypothesis ids this request would inform (deduped)
  }),
)
```

This is **the same content-addressed key** that PR10's `NextBestEvidenceCandidateSchema.canonicalRequestKey`
uses today — so a candidate emitted by PR17 slots **directly** into `input.gaps[].candidateRequests` without
any re-keying, and identical requests from different paths collapse to the same key. Dedup is exact and
content-based, never text-similarity.

---

## 5. Grounding (PR17 is bound to the REAL chain — CONTEXT_MISMATCH otherwise)

Following the PR15/PR16 precedent, PR17 does **not** trust opaque downstream ids. Every candidate generation
run:

1. **re-runs the REAL PR14 classifier** (`classifyGap`) on the supplied context and requires equality on
   hole id + contextSha256 + type + status + reason codes — else `CONTEXT_MISMATCH`;
2. **re-runs the REAL PR15 generator** (`generateCompetingExplanations`) and requires equality on the
   competing-explanation set («competing µ id» + families) — else `CONTEXT_MISMATCH`;
3. **re-runs the REAL PR16 generator** (`generateErSplitExplanations`) and requires equality on the
   ER-split set (explanation ids + status) — else `CONTEXT_MISMATCH`.

Only then does PR17 consider an explanation a real, grounded candidate basis. If any re-run disagrees,
PR17 fails closed with a **typed** `CONTEXT_MISMATCH` — never silent, never fabricating.

---

## 6. Discrimination mapping (never over-claimed)

A candidate request must state `discriminatesAmongIds` = the REAL canonical ids of the explanations it would
help tell apart. PR17 derives this from the REAL PR15/PR16 output it is bound to (§5):

- if the ER-split signal exists (PR16 emitted `ER_SPLIT_SUPPORTED` rows), a candidate may discriminate
  between the **entity-split explanation** and the PR15 competing alternatives it genuinely competes with;
- if the competing set is non-empty, a candidate may discriminate between the specifically-listed competing
  explanation ids it can distinguish;
- a candidate NEVER claims to discriminate among ids it didn't actually bind (no fabricated ids, no
  "discriminates everything" claims).

A `discriminatesAmongIds` of **length ≥ 2** is not required — a single-explanation request that would add
supporting signal is allowed (discrimination may be "say more about the leading explanation"), but the ids
must always be REAL.

---

## 7. Evidence types (reuse the frozen vocabulary)

PR17 does NOT invent a parallel evidence taxonomy. It uses the frozen `EvidenceTypeSchema` from PR10
(`DOCUMENT` / `RECORD` / `TESTIMONY` / `PHYSICAL` / `DIGITAL` / `FINANCIAL` / `COMMUNICATION` / `OTHER`) and
`EvidenceRequestSchema` fields for anything request-shaped. Do not create a competing `EvidenceRequest`
definition.

---

## 8. Temporal / provenance grounding

`computedAt` is a **required, caller-supplied, validated ISO-8601 UTC value** — PR17 never reads the wall
clock)Skip, same as PR10 (§10 freeze). Every candidate carries the case-scoped temporal/provenance context
from the PR1/PR3/PR5 chain it inherits («case scope» + «graph version» + «observation scope»). PR17 never
claims evidence was acquired; it only proposes that a request **could** discriminate.

---

## 9. Determinism

- Input ordering never matters: hypothesis ids and discriminatesAmongIds are canonicalized (deduped + sorted)
  before identity/emission.
- The emitted candidate list is **byte-stable** for identical input, and bounded by the §3 caps.
- NO wall clock, NO randomness, NO LLM, NO hidden retrieval anywhere in the runtime.

---

## 10. Failure model (typed only)

PR17 failures are all typed (per the PR14–PR16 contract convention):

```text id="b1xuga"
INVALID_INPUT                         — malformed input (e.g. bad ids / non-ISO computedAt)
UNSUPPORTED_POLICY                    — unsupported policy version (never silently downgraded)
CONTEXT_MISMATCH                      — PR14/PR15/PR16 re-run equality failed (§5)
GENERATION_BOUND_EXCEEDED             — the candidate universe exceeds a §3 cap (never silent truncation)
INSUFFICIENT_CONTEXT                  — genuine absence of grounded explanation signal (VALID result: empty set)
```

`INSUFFICIENT_CONTEXT` ⇒ a valid empty candidate set (a result, not an error) — mirroring PR15/PR16's
`INSUFFICIENT_CONTEXT` semantics. Contradictions in the explanation set are preserved; a candidate is never
used to "prove concealment" (§11).

---

## 11. Epistemic safety

- A request that would merely "find more evidence about A1" is **not** a PR17 candidate unless it can be
  grounded as discriminating an explicit unresolved question among real explanations.
- PR17 NEVER generates a request whose only purpose is to confirm concealment or to assert concealment —
  it may only ask for evidence that would discriminate between a concealment-consistent explanation and an
  innocent one (§31 of PR15 vocabulary).
- No request asserts criminality or guilt; every candidate is neutral and actionable.

---

## 12. Truncation is explicit

If a §3 bound is hit, the result must carry `truncated: true` and the emitted set must be the deterministic
prefix of the bounded candidate universe (per PR17's own stable ordering), never a random subset. A bound hit
is a surfaced fact, never a silent drop.

---

## 13. Runtime ownership

The runtime lives in `packages/intelligence/evidence-request-generation` (`@indago/entity-split-analysis` is
PR16's runtime — this package name is `@indago/evidence-request-generation` by the Phase 5A convention where
each intelligence concern owns its own pure package).

Consumed output lets `@indago/next-best-evidence` (PR10) do its actual job — selecting from a candidate set
that finally EXISTS in the certified chain.

---

## 14. Integration chain (certified)

```text id="bhr3da"
PR14 gap-classification ─┐
PR15 competing-explanations ─┤→ REAL re-run equality (§5) → Pr16 er-split
PR16 entity-split-analysis ────┴─────────────┐
                                            ↓
                       PR17 generateEvidenceRequests (this PR)
                                            ↓
                       input.gaps[].candidateRequests  ← PR10 selectNextBestEvidence (frozen seam)
```

---

## 15. Tests

- **Unit / adversarial:** 10 unit + 2 adversarial suites planned:
  1. determinism (byte-identical re-runs, shuffled input order),
  2. bounds (per-gap, per-pair, per-run ceilings + truncation surfacing),
  3. grounding (PR14/PR15/PR16 re-run equality ⇒ CONTEXT_MISMATCH on any divergence),
  4. discrimination mapping (never over-claims; ids always real),
  5. deduplication (same request from two paths ⇒ one canonical),
  6. typed failures (all five codes),
  7. evidence vocabulary (only frozen EvidenceType codes),
  8. temporal/provenance (required computedAt, no wall clock, case scope),
  9. epistemic safety (never asserts concealment / guilt),
  10. deterministic empty set on INSUFFICIENT_CONTEXT.
- **Contract tests** extend the frozen PR10 surface: PR17 candidate request must be assignable to
  `NextBestEvidenceCandidateSchema` (round-trip into PR10's input seam).
- **Integration:** PR14→PR15→PR16→PR17 end-to-end over a certified GraphHole (unit-level); real-Postgres
  integration suite **DEFERRED — ENVIRONMENTAL** (Neon DB unreachable, affects PR13/PR14/PR15/PR16 suites
  identically).

---

## 16. Out of scope (frozen)

PR17 does NOT implement: evidence lifecycle / persistence / migration, HTTP endpoint, evidence acquisition,
authorization, LLM, hypothesis/entity lifecycle authority, targeted reblocking, evidence independence (PR19),
Resolution Rate@K (PR20), or utility ranking (PR18). Any of these must go to their owning milestone.
