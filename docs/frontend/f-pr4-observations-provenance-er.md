# F-PR4 Observations, Provenance, Entity Resolution

> Status: implemented (Pass 3 — investigation intelligence interface). Frontend-only. Backend packages, contracts, and intelligence are read-only for this PR.

## Goal

Deliver the **Observations + Provenance + Entity-Resolution + Discovery** investigation experience that answers: *can a judge follow Evidence → Observation → Provenance → Entity → Ambiguity → Discovery without a scaffold?* The demo path is fully navigable from the feed, through the grounded contradiction, into the reversible entity-resolution workflow, and out to structural Discovery candidates — with the live platform shadowed by typed `UNSUPPORTED` stubs. No backend changes; every capability enters behind the F-PR2 provider boundary.

## Provider Surface Added

New provider capabilities on `WorkspaceProviders` (see `packages/web/src/lib/providers/types.ts`):

- `GraphProvider.getOverlayCatalog(): Promise<GraphRealtimeCatalog>` — the per-graph realtime sensor catalog, identified by `catalogKey(clusterNodeId, clusterEntityId)`. The catalog seam end-point is owned by the provider, never by the presentation layer: `graph-panel.tsx` no longer imports the demo sequence directly.
- `relations: RelationProvider` — `listByInvestigation(investigationId, page)`, `get(relationId)` over relation hypotheses.
- `intelligence: IntelligenceProvider` — the full F-PR4 interface:
  - `listContradictions(investigationId, page)` → `Paginated<ObservationContradiction>`
  - `listCandidates(investigationId, page)` → `Paginated<IntelligenceCandidateView>`
  - `getCandidate(investigationId, resolutionId)`
  - `keepUnresolved(investigationId, resolutionId)` / `accept(...)` / `reverse(...)`
  - `listDiscovery(investigationId, page)` → `Paginated<DiscoveryCandidate>`
  - `getSource(sourceId)` / `getArtifact(artifactId)` for provenance hops

### Demo implementation (`lib/providers/demo/providers.ts`)

- `DemoRelationProvider` lists/gets relation hypotheses from session state.
- `DemoIntelligenceProvider` computes contradiction/candidate/discovery answers against immutable fixtures and persists deliberate decisions into per-workspace session state (`entityHypothesisById`, `candidateResolutionById`, `erAuditById`). Every decision is deterministic and reversible; nothing ever mutates canonical entities or the graph.
- `DemoGraphProvider.getOverlayCatalog()` returns the demo's realtime catalog (`upload-demo-sequence.ts`), indexed by `catalogKey`.

### Live implementation (`lib/providers/live/providers.ts`)

- `UnsupportedRelationProvider`, `UnsupportedIntelligenceProvider`, and a catalog-capable graph provider all return typed `UNSUPPORTED` `ProviderError`s (`getOverlayCatalog()` returns `{}`). There is **no silent live→demo fallback** and no `if (mode === "demo")` in any presentation component.

## Canonical Fixtures (locked, deterministic)

- `OBS_9` — a canonical **RELATIONAL** observation (registry cross-check, `EVID_REGISTRY_2` / `SRC_REGISTRY`, mentions `V. Aldridge` + `8 Rue des Capucines`) that **DIRECT_REFUTATION**-contradicts `OBS_8` (shared-address line, Paris) via `CONTRADICTION_1`, grounded in two evidence items.
- Entity resolution pair `EMC_NOMINEE ↔ EMC_VICTOR_RESIDENCE` (key `PAIR_RES_1`, `HYP_RES_1`): NAME `INITIAL_MATCH`, ADDRESS `DIFFERENT`, TYPE `COMPATIBLE`, UUID `BOTH_ABSENT`; score 0.51; comparison listed as `COMPARED_AND_UNRESOLVED`; `ENTITY_LINK_BY_CANDIDATE` links only the Victor-residence candidate to `ENT_VICTOR`, leaving the nominee unlinked — that asymmetry **is** the demo's ambiguity.
- Discovery is **derived, never mocked**: `deriveDiscoveryCandidates()` ranks graph entities by degree → structuralImportance → label and returns the top 3 — `Intermediary Account 0093` (central wiring point), `Victor Aldridge` (bridge — GE_1 is a genuine cut edge), `Aldridge Holdings S.A.` (incident to the CONTRADICTED GE_5). Reasons are factual strings computed from graph data, not "relevance" claims.

## UI

### Observations feed (`observations-list.tsx`, `observation-item.tsx`)

- Feed items are selectable buttons; any observation involved in a contradiction carries a badge (`1 contradiction`, `DIRECT_REFUTATION`) resolved through `contradictionsById`.
- The observations page (`app/investigations/[id]/observations/page.tsx`) is Suspense-wrapped, supports deep links (`?entity=`) with a filter badge + entity-specific empty state, and drives the Entity Resolution queue from `intelligence.listCandidates`.

### Detail + provenance (`intelligence-detail-panel.tsx`, `provenance-trail.tsx`)

- Selecting an observation opens the detail panel: fact summary, source, contradiction context, and a navigable trail Observation → Evidence → Source → Artifact → Entity → Relation. `ObservationContradictionKindBadge` renders the contradiction kind.
- Observation resolution honors the open contract: `ObservationProvider` has no `get()`, so the detail panel resolves the observation via `listByInvestigation` + find; `evidence.get()` returns `EvidenceListItem` (has `sourceRef`/`artifactIds`, no `sourceId`), so the source is resolved from `evidence.sourceRef` with fallback `observation.sourceId`.

### Entity Resolution (`entity-resolution-panel.tsx`)

- Deliberate, reversible actions: **Keep Unresolved** (stay `COMPARED_AND_UNRESOLVED`), **Accept Match**, **Reverse** (back to a reversible `COMPARED_AND_UNRESOLVED` state; the hypothesis is never deleted and the audit trail is preserved).
- Honesty notes are surfaced inline: the score is a ranking signal, not a probability; accepting never merges entities or rewires the graph; absent ≠ different.
- The ER queue on the observations page is driven purely by `intelligence.listCandidates`.

### Discovery Mode (`discovery-panel.tsx`)

- A Graph Panel toggle opens the right-edge overlay listing the deterministic top-3 candidates with structural reasons, contradicted-edge and bridge notes. `GraphCanvas.focusNode(id)` (imperative handle) pinpoints a candidate in the topology on demand.
- Deep link: `?focus=<nodeId>` on the graph page (Suspense-wrapped, caseId preserved) focuses the node once topology loads — one `initialFocusNodeId` application guarded against re-trigger.
- Entity drawer links to the observations feed filtered by that entity (`&entity=`), preserving `caseId`.

### Boundary compliance

- No demo/live literals in presentation; `graph-panel.tsx` consumes the catalog via `workspace.graph.getOverlayCatalog()`; graph/observations live imports come from `lib/providers/types`.
- `use-graph-layout.ts` diagnostics removed (no `console.log`).
- `demo-fixtures/validate.ts` extended to parse candidates, candidatePairs, resolutions, and entityHypotheses against canonical contracts.

## Judge Journey (no scaffold required)

The F-PR4 acceptance question — *can a judge follow Evidence → Observation → Provenance → Entity → Ambiguity → Discovery without a scaffold?* — is answered end-to-end in the demo:

1. **Evidence** — the judge opens the case's evidence surface and sees the registry cross-check item (`EVID_REGISTRY_2` from `SRC_REGISTRY`).
2. **Observation** — the cross-check produced canonical observation `OBS_9` (registry CC-882, Lyon), which the Observations feed renders with a `1 contradiction` / `DIRECT_REFUTATION` badge. Opening it shows the fact summary and its source.
3. **Provenance** — the detail panel's trail walks Observation → Evidence → Source → Artifact → Entity → Relation, resolving source from `evidence.sourceRef` (fallback `observation.sourceId`) per the open contract.
4. **Contradiction** — following the badge lands on `CONTRADICTION_1`: `OBS_9` directly refutes `OBS_8` (shared-address line, Paris). The contradiction is visualized and grounded in its two evidence items — it is **never auto-resolved**.
5. **Entity / Ambiguity** — the ER queue surfaces `HYP_RES_1` (`EMC_NOMINEE ↔ EMC_VICTOR_RESIDENCE`): NAME `INITIAL_MATCH`, ADDRESS `DIFFERENT`, UUID `BOTH_ABSENT`, score 0.51. The nominee stays unlinked (`ENTITY_LINK_BY_CANDIDATE`) — that asymmetry is the ambiguity a judge is expected to weigh, grounded in the same contradiction. Deliberate, reversible actions only: keep-unresolved / accept / reverse, with the audit trail preserved.
6. **Discovery** — the Graph panel's Discovery toggle opens the structural overlay: `Intermediary Account 0093` (central wiring point), `Victor Aldridge` (bridge — GE_1 cut edge), `Aldridge Holdings S.A.` (incident to contradicted GE_5). Focus a candidate → it snaps into the topology; the entity drawer links back into the filtered observations feed.

Every hop crosses providers through the bundle (`workspace.graph`, `workspace.relations`, `workspace.intelligence`); no component hardcodes demo/live, and nothing here depends on building a scaffold.

## Reversal, Honesty, and Reversibility Guarantees (tested)

- A decision is one of `UNRESOLVED/ACCEPTED/REVERSED`; comparison status is `COMPARED_AND_UNRESOLVED` or `RESOLVED_MATCH`.
- `reverse()` on a never-resolved hypothesis throws (nothing to reverse); accepted matches return cleanly to the unresolved state with history kept.
- The demo graph, canonical entities, and the /graph UI are untouched by ER actions — ambiguity is visualized through the unlinked nominee, never auto-resolved.

## Verification

- `pnpm --filter @indago/web exec tsc --noEmit` — clean.
- `pnpm --filter @indago/web test` — 319 passing (295 pre-existing + 24 new F-PR4 groups in `tests/f-pr4.test.ts`: fixture coherence, contradiction pairing, Discovery determinism/ranking, ER lifecycle incl. reversal-keeps-history, relation/discovery providers, catalog boundary demo↔live, live `UNSUPPORTED` stubs).
- `pnpm --filter @indago/web build` — production build succeeds; all routes generate.

## Not Done Here (documented non-goals)

- Live relation-entity/intelligence endpoints (platform has none yet) — typed `UNSUPPORTED` with an explicit message instead.
- Auto-resolution of contradictions, entity merging on accept, and relevance-based discovery ranking — intentionally out of scope for the F-PR4 truth-and-ambiguity story.