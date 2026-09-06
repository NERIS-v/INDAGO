# PR-8 — Relation Authority & Deep-Dive Bridges

**Status:** DELIVERED. The reserved `challenge` operational command and the reserved contextual-panel **footer slot** are now a real **relation-authority workflow** driven entirely through the provider relation seam — Accept / Reject / Reverse with a durable audit trail and an honest graph-projection reconcile — surfaced by TWO entries from ONE model (`relation-authority.ts`): the **operational rail** (Challenge command, relation contexts) and the **contextual panel footer** (authority panel + **deep-dive bridges** with real, `?caseId=`-preserving links and no dead ends). Live mode stays typed-unsupported, never faked. Full web suite **73 files / 787 tests — 780 passed, 7 failed**; all 7 failures are in the **parallel** flow/capabilities workstream (`capabilities.test.ts` ×5, `pr5-representation.test.tsx` ×2) with **zero** PR-8 files among them. The PR-8 suite itself is **7 files / 66 tests / 66 passed** standalone and inside the full suite. Root `pnpm typecheck` and `next build` remain blocked only by parallel untracked WIP (`src/lib/network/flow/flow-model.ts`); every PR-8 file reports clean in the emitted diagnostics.

---

## A. Scope & Goal

PR-8 closes two seams previously reserved-but-empty into one coherent, honest workflow:

- **Relation Authority** — a selected relation hypothesis can be deliberately decided by an analyst: `ACCEPT` (endorse), `REJECT` (dismiss), `REVERSE` (repeal a prior decision), following the DURABLE lifecycle documented by `@indago/contracts` `RelationStatusSchema` (`PROPOSED → ACCEPTED/REJECTED`, `ACCEPTED | REJECTED → REVERSED`). Every decision executes through the provider seam — no frontend `setStatus` — mutates the relation store, **reconciles the canonical graph projection** (`graphEdgeById`), and writes to an **authority audit** (`relationAuthorityAuditById`).
- **Deep-Dive Bridges** — a resolved relation/entity context surfaces REAL links into the workspace surfaces (Network with `?focus=`, Observations with `?entity=`, Evidence/Hypotheses/Leads/Gaps/Timeline/Review/Robustness/Ledger/Cross-Case). Every href goes through the central URL helpers so `?caseId=` is always preserved and no `href="#"`/dead route is ever produced. A bridge whose underlying data slice is not exposed in this mode renders an honest greyed note instead of faking a destination.
- **Two entries, one model** — the rail `Challenge` command (flipped from reserved to implemented for relation contexts in demo) reveals the relation context; the panel footer hosts the authority surface. Both derive from `relation-authority.ts`; per-action legality is decided by the model + provider, never by scattered `kind === ...` checks.

## B. Frozen Contract (untouched by this deliverable)

- Provider seams are **additive only**: `RelationProvider` gained three optional members — `accept?(investigationId, relationHypothesisId)`, `reject?(investigationId, id, reason?)`, `reverse?(investigationId, id, reason?)` — each `Promise<RelationHypothesis>`. Absent methods mean an honest authority-unavailable surface; every existing method and signature is unchanged.
- Demo/live provider bundles, `getDataModeConfig`, `ProviderError` codes (`VALIDATION` / `NOT_FOUND` / `UNSUPPORTED`), `WorkspaceProvider`, capability table: untouched semantics.
- The graph engine, five-zone geometry, D3 physics, temporal version pipeline (PR-7), investigative-intelligence, pulse/matrix/flow WIP, `nav.ts`/`page.tsx`/`capabilities.ts`/`timeline-panel.tsx` (parallel WIP): untouched. `graph-control-center.tsx`/`graph-panel.tsx`/`operational-rail.tsx` received only the additive PR-8 wiring approved by the user (footer slot value, optional `graphReloadRequest` prop, optional `onChallenge` rail prop).
- `RelationHypothesis`/`GraphEdge`/`Observation`/`Hypothesis` contracts in `@indago/contracts` — read as-is; relation status values are `PROPOSED | ACCEPTED | REJECTED | REVERSED`, edge status `ACTIVE | CONTRADICTED | ARCHIVED`.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/context/relation-authority.ts` | **Pure, provider-agnostic authority model.** `RelationAuthorityAction "accept"\|"reject"\|"reverse"`, `RELATION_AUTHORITY_LEGAL_FROM` (exact lifecycle table), `relationAuthorityAllows`, `relationAuthorityExpectedStatus` (used for stale-conflict detection), `relationAuthorityAvailable(mode)` (live → honest typed-unsupported gate), `relationAuthorityTarget` (illegal transitions throw without a provider round-trip), stable labels/hints (`RELATION_AUTHORITY_ACTION_LABEL`, `RELATION_STATUS_LABEL`). |
| `packages/web/src/lib/context/deep-dive-links.ts` | **Pure link composition.** `DeepDiveLink {id,label,hint,href,available,note?}`, `DeepDiveSource {investigationId,caseId}`, `relationDeepDiveLinks(source, resolved)` (11 links; Network `?focus=`→ source entity, Observations `?entity=`, others page-level) and `entityDeepDiveLinks(source, resolved)` (11 links gated per slice). Availability comes from RESOLVED CONTEXT DATA (null slice → `available:false` + honest note), never fabrication. |
| `packages/web/src/components/graph/control-center/relation-authority-panel.tsx` | `RelationAuthorityPanel {relation, gate, onMutate(action, reason?)}` — Accept executes immediately; Reject/Reverse are inline two-step confirms with an optional reason; busy/terminal/stale/error/unsupported states; `data-authority-state`, `data-testid="relation-authority-*"` hooks; ProviderError surfaced verbatim; stale-conflict note via `relationAuthorityExpectedStatus`. |
| `packages/web/src/components/graph/control-center/deep-dive-bridges.tsx` | `DeepDiveBridges {links}` — available bridges render as REAL anchors (`data-link-available="true"`), unavailable bridges as greyed non-anchor rows carrying the note, empty state otherwise. |
| `packages/web/src/components/graph/control-center/contextual-panel-footer.tsx` | `ContextualPanelFooter {context, onReselect, onReloadRequest}` — the footer-slot composer: relation → authority panel + relation bridges; entity → entity bridges; relation on a live seam → honest typed-unsupported note; else nothing (pre-PR-8 reservation preserved). After a successful mutation it re-selects the SAME relation (`source:"authority"`, fresh object identity → details effect re-resolves so every consumer shows the authoritative status) and bumps `onReloadRequest` (graph refetch reconciles). |
| `packages/web/tests/pr8-relation-authority.provider.test.ts` | **18 tests** (demo + live seam) — seeded standing (REL_1..4 ACCEPTED, REL_5/6 PROPOSED), accept PROPOSED→ACCEPTED + audit + `updatedAt` bump, accept keeps a CONTRADICTED edge contradicted (PR-6 grounding), reject PROPOSED→REJECTED + edge ARCHIVED + reason audit, reverse ACCEPTED→REVERSED (≠deleted) + edge ARCHIVED, reverse REJECTED→REVERSED, multi-decision session integrity, illegal transitions (`VALIDATION`): accept-ACCEPTED / reject-ACCEPTED / reverse-PROPOSED / reverse-REVERSED, `NOT_FOUND` (unknown id + foreign investigation), unknown mutations never touch the graph, live `UNSUPPORTED` for accept/reject/reverse with the seam method named. |
| `packages/web/tests/pr8-relation-authority.model.test.ts` | **10 pure tests** — legality table, `relationAuthorityAllows` full status×action matrix, expected-status mapping, labels/hints, demo/live gate, target construction (trimmed reason, blank omitted, illegal throw), REVERSED-as-terminal-not-deletion. |
| `packages/web/tests/pr8-operational-challenge.test.tsx` | **8 tests** — `getOperationalActionState("challenge")` matrix (relation+demo enabled+implemented kind mutation; relation+live `NO_RELATION_AUTHORITY_LIVE`; entity/null/other `NO_CHALLENGE`; entity capability stays false — no fake enable) + `OperationalRail` render: Challenge enabled for relation+demo and dispatches `onChallenge`, disabled for entity/live with the honest title reason. |
| `packages/web/tests/pr8-relation-authority-panel.test.tsx` | **12 component tests** — unsupported gate note; PROPOSED → Accept+Reject (no Reverse); Accept immediate; Reject two-step confirm + reason passthrough; blank reason → `undefined`; busy disables actions; ACCEPTED → only Reverse (two-step); REJECTED → Reverse offered, **no** terminal note; REVERSED → terminal note + no actions; ProviderError surfaced verbatim; stale-conflict note when result ≠ expected status; validation error prevents false success. |
| `packages/web/tests/pr8-relation-authority-footer.test.tsx` | **5 tests** (demo fast env `TIMING_SCALE_ENV=0.001`) — footer composes authority + bridges for REL_5; Accept re-selects same relation + bumps `onReloadRequest` + details re-resolve to Accepted; entity context → bridges only; `context={null}` → nothing; live seam → honest unavailable note. |
| `packages/web/tests/pr8-deep-dive-links.test.ts` | **8 pure tests** — every relation/entity link is a real `/investigations/{id}/…?caseId=` href, no `#`, network `?focus=`/observations `?entity=` params, null-slice gating with honest notes, page-level always-valid, stable labels/hints. |
| `packages/web/tests/pr8-deep-dive-bridges.test.tsx` | **5 tests** — available bridges render as anchors carrying the href, unavailable as non-anchor greyed rows with the note, empty state, mix without dropping rows. |

## D. Files Changed

- `packages/web/src/lib/providers/types.ts` — `RelationProvider` gained optional `accept?` / `reject?` / `reverse?`. Additive only.
- `packages/web/src/lib/providers/demo/state.ts` — `relationAuthorityAuditById: Map<string, {action, reason?, by, at}>` added to `DemoWorkspaceState`, seeded empty in `createDemoWorkspaceState` and cleared in `resetDemoWorkspaceState`.
- `packages/web/src/lib/providers/demo/providers.ts` — `DemoRelationProvider` enforces the lifecycle (`assertInvestigation`, `requireRelation`, `applyAuthority`; illegal transitions → `ProviderError.validation`; unknown/foreign → `notFound`), reconciles `graphEdgeById` (ACCEPTED keeps the edge ACTIVE — an existing CONTRADICTED edge stays CONTRADICTED so PR-6 GROUNDED state stays valid; REJECTED/REVERSED → ARCHIVED), writes the audit, and returns the mutated relation. `getAudit(id)` (PR-8 test seam) added on the relation provider.
- `packages/web/src/lib/providers/live/providers.ts` — relation authority methods throw typed `UNSUPPORTED` naming `relations.accept/reject/reverse`, never fabricating behavior.
- `packages/web/src/lib/context/investigative-context.ts` — `ContextSource` union + `CONTEXT_SOURCES` gained `"authority"` (additive; `"rail"` already existed).
- `packages/web/src/lib/context/operational-actions.ts` — the reserved `challenge` command flipped to implemented for **relation contexts in demo mode**; `NO_CHALLENGE` for other kinds, new honest `NO_RELATION_AUTHORITY_LIVE` reason; parameter renamed `_workspace` → `workspace`. Purely additive to the PR-4 matrix.
- `packages/web/src/components/graph/control-center/operational-rail.tsx` — optional `onChallenge?` prop + `dispatchAction` case (mirrors `onFocus`). No decision logic added to the rail.
- `packages/web/src/components/graph/graph-panel.tsx` — optional `graphReloadRequest?: { nonce: number }` prop joined into the fetch-effect deps (`[workspace, graphReloadRequest?.nonce]`) so a post-mutation reload reconciles the canonical projection.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — (user-approved additive wiring) `footerSlot={<ContextualPanelFooter …>}` on the graph-context panel, `graphReloadRequest` state + `requestGraphReload` passed to `GraphPanel`, rail `onChallenge` → `revealContext({kind:"relation", id: context.id, source:"rail"})`.

## E. Files Removed

None. Old reserved/stub behavior was replaced in place (the rail `challenge` stub and the empty footer slot); grep-verified no pre-PR-8 branches remain.

## F. Files Intentionally Untouched (scope discipline)

- Graph engine, five-zone geometry, physics, temporal filtering, PR-7 versions/time/activity: untouched (PR-7 suite stays green).
- `src/lib/network/matrix/`, `pulse/`, `flow/`, `representation-switcher.tsx`, `page.tsx`, `capabilities.ts`, `nav.ts`, `investigative-intelligence.tsx`, `timeline-panel.tsx`, `pr1-*`, `pr5-*`, `pr6-*`, `pr7-matrix-shell.test.tsx` (parallel workstreams) — never opened for PR-8.
- All provider interfaces outside `packages/web/**`, contracts, platform, intelligence: untouched.

## G. The honest-data thread

- The authority lifecycle is **mirror-faithful to the platform**: `routes.ts` accept/reject/reverse semantics and `RelationStatusSchema` in contracts define the transition table the model and the demo provider both enforce (defense in depth — the panel disables from the model, the provider rejects illegal transitions, the platform owns the durable state).
- `REVERSED` is lifecycle reversal, **not deletion**: the hypothesis object and its audit history persist; only the standing changes.
- The stale-conflict path is explicit: `relationAuthorityExpectedStatus` is compared against the provider's returned relation; any divergence surfaces "Relation changed since it was loaded" instead of a silent false success.
- Deep-dive links are composed only from resolved context data; a null provider slice (`linkedObservations`, `activeLeads`, `foreignOverlays`, …) yields `available:false` + an honest note, never a fabricated destination.
- Live mode is **typed-unsupported**: the rail shows `NO_RELATION_AUTHORITY_LIVE` and the footer shows the gate's honest reason; nothing fakes an authority surface.

## H. Capability & lifecycle honesty

- `relationAuthorityAllows` exactly mirrors `RELATION_AUTHORITY_LEGAL_FROM` (asserted across the full status matrix).
- The panel's terminal state is **derived from legality** (`legal.length === 0`): a REJECTED relation still offers Reverse (repeal of a prior decision) and shows no misleading terminal note; only REVERSED is the true lifecycle terminal.
- `data-capability` (rail) reflects the PR-3 conceptual eligibility (entity `canChallenge=false`, relation `canChallenge=true`) independent of whether the command is implemented — unchanged pre-PR-8 contract.

## I. Accessibility

- Rail Challenge and panel action buttons are real `<button>`s with explicit `aria-label`s (`Accept/Reject/Confirm reject/… relation <id>`) and disabled semantics during busy.
- The inline reason input is a labeled field (`aria-label="Optional reason for this authority decision"`).
- Success / stale / error / terminal / unsupported states are visible text (not color-only), sharing the surface-print treatment used across the shell.
- Deep-dive bridges are a real grid of anchors with labels + hints; unavailable rows are non-interactive with the note in `title` and body, so they are never announced as navigable dead ends.

## J. Test-context facts locked by the suite

- Fixture standing: REL_1..4 `ACCEPTED`, REL_5/6 `PROPOSED`; edges GE_1→REL_1, GE_2→REL_3, GE_3→REL_4, GE_4→REL_2 (ACTIVE), GE_5→REL_5 (`CONTRADICTED`), GE_6→REL_6 (ACTIVE). ACCEPT keeps GE_5 CONTRADICTED (PR-6 grounding); REJECT/REVERSE ARCHIVE the edge.
- The audit record (`getAudit`) carries `{action, reason?, by:"analyst", at}`; reject/reverse reason passthrough is asserted end-to-end.
- `66 pr8-*` tests pass standalone **and** inside the full suite; the full suite also re-runs PR-2/3/4/5/6/7 with no new PR-8 interference.

## K. Source guards

- `relation-authority.ts`, `deep-dive-links.ts`, `operational-actions.ts` (challenge case) are pure — zero imports from demo/live/fixtures/React; panels reach data only through `useWorkspace()` / resolved context / the provider seam.
- No mutation path writes state directly: the panel calls `onMutate` → the footer calls the optional provider method → the provider mutates its store and reconciles the graph.

## L. De-scoped (explicitly NOT in this part)

- Reject/Reverse *reason enforcement* beyond recording (the platform may later enforce required reasons); the optional reason is passed through and audited.
- Authority for entity/hypothesis/anomaly contexts (capability table still reserves `canChallenge` for relation-driven workflow only); the rail continues to disable Challenge for them with an honest reason.
- Matrix/pulse/flow representations (parallel workstreams), historical-view authority gating (PR-7 temporal note below), `/as-of`-style changes, anything outside `packages/web/**`.

## M. Risks & residual

- Root `pnpm typecheck` currently fails **only** in the parallel untracked `src/lib/network/flow/flow-model.ts` (6 diagnostics — active WIP) and the full test suite has **7 failures, all parallel**: `capabilities.test.ts` ×5 (`network.flow` availability: tests expect `demo`/`not-ready` where the parallel seam now reports flow demo) and `pr5-representation.test.tsx` ×2 (`Graph operations` rail missing in a flow zone). Emitted diagnostics contain **zero PR-8 files**.
- `pr7-matrix-shell.test.tsx` "rail auth flow" test flaked once in the filtered `pr2…pr8` regression run but **passed in the full suite** — attributed to the parallel matrix workstream (the test only exercises matrix-layout code paths, which PR-8 additions never enter); not a PR-8 regression.
- The panel's busy/disabled semantics protect double-submits; provider-side legality is the authoritative backstop.
- Historical temporal views (PR-7) are not yet mutually exclusive with the authority footer — a follow-up should gate the footer honestly when the workspace is in historical mode (never mutate current data from a historical view).

## N. Verification

```
packages/web pr8      pnpm --filter @indago/web exec vitest run pr8 → 7 files, 66 tests, 66 passed
full web suite        pnpm --filter @indago/web exec vitest run   → 73 files, 787 tests,
                      780 passed / 7 failed (all parallel: capabilities ×5, pr5-representation ×2)
Regression            pr2 pr3 pr4 pr5 pr6 pr7 pr8 filtered run → 330 tests, 329 passed
                      (1× pr7-matrix-shell rail-auth flake; passed in the full suite)
typecheck             pnpm --filter @indago/web exec tsc --noEmit → EXIT=1, every diagnostic in the
                      parallel untracked src/lib/network/flow/flow-model.ts; PR-8 files type-clean
build (web)           blocked only by the parallel flow-model.ts diagnostics; PR-8 code compiles clean
```

PR-0–7 across the codebase remain green with the parallel-stream attribution documented above. The reserved rail command and footer slot are now a real, honest relation-authority workflow — dual-entry from a single model, provider-enforced lifecycle with audit, graph-projection reconcile, stale-conflict detection, live typed-unsupported surfaces, and real deep-dive links with no dead ends.

---

PR-9 can now begin.