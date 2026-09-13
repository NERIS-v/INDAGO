# PR3 — Existing Hypotheses + Atomic/Grouped Context: Status, Gaps & Deferred Boundaries

**Phase 5A-PR3** · `packages/intelligence/hypothesis-context` (`@indago/hypothesis-context`)

This is the authoritative design/status note for PR3. It records the implementation
surface and — explicitly and honestly — the boundaries that are intentionally NOT
covered today.

> **PR3 status:** PR3 is complete for its current authoritative hypothesis sources.
> The listed items are explicit dependency/extension boundaries and do not require
> reopening PR3.

None of the items below is a bug, a blocker, or incomplete implementation. Each is
labelled `DEPENDENCY`, `DEFERRED`, or `FORWARD-COMPATIBILITY` and remains true while the
boundary it names is unchanged.

---

## Implementation surface (summary)

- **Pure, read-only, derived representation.** PR3 consumes the existing
  authoritative `RelationHypothesis` and `EntityHypothesis` sources and derives an
  atomic / grouped context. It does NOT create a second hypothesis lifecycle, store,
  status, or approval flow. Source hypotheses remain authoritative.
- **No fabrication.** Missing/unknown fields are represented as `null` / `unknown`,
  never guessed, and no EntityId, candidate, observation id, score, temporal scope,
  or provenance is ever invented.
- **Overlap = shared canonical entity only.** An overlap edge exists between two
  atomic hypotheses iff they share at least one canonical entity reference
  (`referencedCanonicalEntityIds`). No semantic, string, embedding, or relation-type
  similarity is used, and directionality does not prevent grouping.
- **Contradictions preserved.** Supporting/contradicting observation sets,
  contradictory-hypothesis ids, provenance, temporal scope, and graph-version context
  survive source → atomic → overlap → grouped. PR3 does NOT resolve contradictions.
- **Determinism.** Byte-stable atomic ordering, components, groups, ids, and
  serialization under the frozen split ordering
  (`EVIDENCE_SUPPORT_DESC → STRUCTURAL_RELEVANCE_DESC → derivedId ASC`);
  content-addressed `sha256(groupId)` / `sha256(componentId)`.
- **Verification:** PR3 suite 20 tests green; contracts 275; entity-resolution 32;
  relation-resolution 37; graph-hole-region 105; package typecheck + recursive build
  (9/9, web excluded) green.

---

## 1. Candidate↔Candidate canonical bridge

**Label: `DEPENDENCY`** — a deferred dependency on the **M-A09 / M-A09.5
canonical-entity decision boundary**, NOT a PR3 defect.

The current v1 `EntityHypothesis` Candidate↔Candidate flow (`candidatePairId` +
`supportingCandidateIds`, no `entityId` / `resolvedEntityId`) does not carry a
canonical `EntityId`, so its hypotheses cannot participate in canonical-node overlap
grouping:

```text
Candidate↔Candidate hypothesis
→ no canonical EntityId
→ no PR3 overlap edge
→ remains isolated until canonical Entity materialization
```

PR3 must NOT invent a bridge, and candidate IDs are never treated as canonical nodes.
Once the M-A09/M-A09.5 boundary materializes a canonical `EntityId` on an
`EntityHypothesis` (the future Entity↔Entity flow: `entityId` / `candidateEntities`),
that hypothesis participates in overlap grouping through
`referencedCanonicalEntityIds` exactly like every other canonical-node-carrying
source — no PR3 change required.

## 2. Generic Hypothesis / future lead adapters

**Label: `DEFERRED`** — intentionally deferred; PR3 does not fabricate semantics.

PR3 currently supports only the authoritative `RelationHypothesis` and
`EntityHypothesis`. The generic `Hypothesis` (working hypotheses) and future Phase 4
lead/hypothesis sources are NOT adapted because their authoritative
subject/predicate/object semantics are not currently defined.

The PR3 adapter layer is intentionally extensible: `src/atomic.ts` exposes one
deterministic normalizer per source kind (`fromRelation`, `fromEntity`) over a typed
source union, and the overlap / WCC / bounded-split machinery operates only on the
derived `AtomicRelationshipHypothesis`. Future adapters can normalize additional
sources once those contracts are authoritative — without touching grouping, bounds,
or determinism.

## 3. MAX_GROUP_NODES

**Label: `FORWARD-COMPATIBILITY`** — forward-compatible protection, not missing
functionality.

```text
MAX_ATOMIC_HYPOTHESES_PER_GROUP = 25
MAX_GROUP_NODES = 50
```

Both bounds are implemented, imported from `GRAPH_HOLE_POLICY_V1` in
`@indago/contracts` (single source of truth, no re-discovery). With the current
`RelationHypothesis` shape (maximum two canonical endpoints per atomic), the 50-node
bound is generally unreachable before the 25-hypothesis bound.

However, the node cap is intentionally retained for future / multi-reference
hypothesis sources and is already enforced and unit-tested (multi-reference
`candidateEntities` inputs exercise the `GROUP_NODES_CAP` path; see
`tests/hypothesis-context.test.ts`).