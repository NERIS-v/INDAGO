// ============================================================================
// M-A12-PR2 Graph Projection Service (internal)
//
// INTERNAL ONLY — no public HTTP endpoints (PR3 owns those).
//
// Architecture (locked, § core architectural rule):
//
//   AUTHORITATIVE POSTGRES STATE
//           ↓
//   VERSION/TEMPORAL STATE SELECTOR
//           ↓
//   NORMALIZED GRAPH INPUT (GraphProjectionInput)
//           ↓
//   @indago/graphology-projection buildGraph
//           ↓
//   DERIVED Graphology graph (disposable)
//
// Graphology is a DERIVED, disposable projection. It is NEVER treated as
// authoritative and NEVER used to "undo" the current graph into a historical
// one. Historical reconstruction replays persisted GraphVersion transitions
// (dimension A — revision order) from PostgreSQL; domain validity (dimension B)
// is carried verbatim as `temporalRange` on edges/nodes. The two dimensions
// are NEVER conflated — a version created on Mar 10 for an event valid on
// Jan 10 keeps Jan 10 as its temporalRange while its inclusion in a given
// version is decided by the revision chain.
//
// Current graph (projectCurrentGraph):
//   ACTIVE canonical entities + ACTIVE canonical relations (+ temporalRange
//   when the authoritative relation carries a validityInterval). Identical
//   selection to the existing GraphRuntime.loadCaseProjection so HTTP behavior
//   is unchanged.
//
// Historical graph (projectGraphVersion):
//   Replays the case's GraphVersion chain up to the target version, tracking
//   each accepted / reversed canonical relation. An edge is included in
//   version N iff its RELATION_ACCEPTED version ≤ N and (if reversed) its
//   RELATION_REVERSED version > N (i.e. not yet reversed by N). This preserves
//   lifecycle history (ACTIVE / REJECTED / REVERSED) without erasing rows and
//   without turning a reversal into "never existed". REJECTED hypotheses never
//   become canonical edges (they have no canonical Relation row at all).
// ============================================================================

import { buildGraph, type BuiltGraph, type Graph } from "@indago/graphology-projection";
import { containsTime } from "../temporal/interval-validation.js";
import { GraphVersionStore } from "../persistence/graph-version-store.js";
import { graphVersionStore } from "../persistence/graph-version-store.js";
import { EntityStore } from "../persistence/entity-store.js";
import { entityStore } from "../persistence/entity-store.js";
import { RelationStore, type DurableRelation, parseTemporalAssertions } from "../persistence/relation-store.js";
import { relationStore } from "../persistence/relation-store.js";

export const GRAPH_CHANGE_ACCEPTED = "RELATION_ACCEPTED";
export const GRAPH_CHANGE_REVERSED = "RELATION_REVERSED";
export const GRAPH_CHANGE_AMENDED = "RELATION_AMENDED";
export const GRAPH_CHANGE_ENTITY_CREATED = "ENTITY_CREATED";
export const GRAPH_CHANGE_ENTITY_ARCHIVED = "ENTITY_ARCHIVED";

/**
 * Typed structured representation of a graph-affecting canonical change.
 *
 * New write paths MUST persist these via `toGraphRevisionMetadata` (the
 * `metadata.change` + required identifier layout) — never opaquely via a
 * reason string. Existing historical versions may still carry legacy
 * `reason` strings; `decodeChange` supports that legacy decoding ONLY where
 * necessary and new code prefers the structured metadata.
 *
 * Replay semantics (locked):
 *   - known graph event missing its required identifier → GraphRevisionCorruptError
 *   - unknown / unrelated change → silently skipped (safe)
 *   - known but structurally invalid event → GraphRevisionCorruptError
 */
export type GraphRevisionEvent =
  | { readonly type: typeof GRAPH_CHANGE_ACCEPTED; readonly relationId: string }
  | { readonly type: typeof GRAPH_CHANGE_REVERSED; readonly relationId: string }
  | { readonly type: typeof GRAPH_CHANGE_AMENDED; readonly relationId: string }
  | { readonly type: typeof GRAPH_CHANGE_ENTITY_CREATED; readonly entityId: string }
  | { readonly type: typeof GRAPH_CHANGE_ENTITY_ARCHIVED; readonly entityId: string };

/**
 * Structured metadata writer for NEW graph revisions (M-A12 WSHARDEN/C).
 * Produces the `{ change, relationId?, entityId? }` layout stored on
 * GraphVersion.metadata. The reason string remains the human/audit companion —
 * never the machine-readable source of truth for new writes.
 */
export function toGraphRevisionMetadata(event: GraphRevisionEvent): {
  readonly change: string;
  readonly relationId?: string;
  readonly entityId?: string;
} {
  switch (event.type) {
    case GRAPH_CHANGE_ACCEPTED:
    case GRAPH_CHANGE_REVERSED:
    case GRAPH_CHANGE_AMENDED:
      return { change: event.type, relationId: event.relationId };
    case GRAPH_CHANGE_ENTITY_CREATED:
    case GRAPH_CHANGE_ENTITY_ARCHIVED:
      return { change: event.type, entityId: event.entityId };
    default: {
      // Exhaustiveness guard (cannot happen with the union above).
      const never: never = event;
      throw new GraphRevisionCorruptError(0, `unsupported graph revision event ${String(never)}`);
    }
  }
}

export interface GraphVersionServiceStores {
  readonly graphVersions: GraphVersionStore;
  readonly entities: EntityStore;
  readonly relations: RelationStore;
}

interface RelationLifecycleState {
  readonly accepted: boolean;
  /** Version number at which it was reversed (or null). */
  readonly reversedAtVersion: number | null;
}

/** Entity membership lifecycle derived from persisted entity graph revisions. */
export interface EntityLifecycleState {
  /** Version at which the canonical entity entered the graph. */
  readonly createdAtVersion: number;
  /** Version at which the entity left the graph (archived), or null. */
  readonly archivedAtVersion: number | null;
}

/**
 * Raised when a persisted GraphVersion's recorded canonical change is a KNOWN
 * graph change but is structurally corrupt (e.g. RELATION_ACCEPTED with a
 * missing/empty relationId). A corrupt revision chain is a genuine invariant
 * violation — it must surface loudly, never be silently skipped into a
 * wrong-shaped graph. Unknown / non-graph change types remain skippable.
 */
export class GraphRevisionCorruptError extends Error {
  constructor(
    public readonly versionNumber: number,
    public readonly detail: string,
  ) {
    super(`GraphRevision corrupt at version ${versionNumber}: ${detail}`);
    this.name = "GraphRevisionCorruptError";
  }
}

type ChangeIdentifier = { readonly event: GraphRevisionEvent } | null;

/**
 * Decode a version's recorded canonical change.
 *
 * PREFERS the structured `metadata.change`; falls back to the legacy `reason`
 * string (`TYPE:id`) ONLY for backward compatibility with revisions written
 * before structured metadata existed.
 *
 * Known graph changes with a missing/empty identifier throw
 * `GraphRevisionCorruptError`. Unknown / non-graph change types return null
 * (silently skipped). A malformed structured event (e.g. a JSON value that is
 * neither an object nor null) is treated as unknown and skipped.
 */
export function decodeChange(version: {
  versionNumber: number;
  reason: string | null;
  metadata: unknown;
}): ChangeIdentifier {
  const meta =
    version.metadata !== null &&
    typeof version.metadata === "object" &&
    !Array.isArray(version.metadata)
      ? (version.metadata as { change?: unknown; relationId?: unknown; entityId?: unknown })
      : null;

  if (meta && typeof meta.change === "string") {
    const change = meta.change as string;
    if (
      change === GRAPH_CHANGE_ACCEPTED ||
      change === GRAPH_CHANGE_REVERSED ||
      change === GRAPH_CHANGE_AMENDED
    ) {
      if (typeof meta.relationId !== "string" || meta.relationId.length === 0) {
        throw new GraphRevisionCorruptError(
          version.versionNumber,
          `structured change "${change}" is missing a non-empty relationId`,
        );
      }
      return {
        event:
          change === GRAPH_CHANGE_ACCEPTED
            ? { type: GRAPH_CHANGE_ACCEPTED, relationId: meta.relationId }
            : change === GRAPH_CHANGE_REVERSED
              ? { type: GRAPH_CHANGE_REVERSED, relationId: meta.relationId }
              : { type: GRAPH_CHANGE_AMENDED, relationId: meta.relationId },
      };
    }
    if (change === GRAPH_CHANGE_ENTITY_CREATED || change === GRAPH_CHANGE_ENTITY_ARCHIVED) {
      if (typeof meta.entityId !== "string" || meta.entityId.length === 0) {
        throw new GraphRevisionCorruptError(
          version.versionNumber,
          `structured change "${change}" is missing a non-empty entityId`,
        );
      }
      return {
        event:
          change === GRAPH_CHANGE_ENTITY_CREATED
            ? { type: GRAPH_CHANGE_ENTITY_CREATED, entityId: meta.entityId }
            : { type: GRAPH_CHANGE_ENTITY_ARCHIVED, entityId: meta.entityId },
      };
    }
    // Unknown / non-graph structured change — silently skippable.
    return null;
  }

  if (typeof version.reason === "string") {
    const idx = version.reason.indexOf(":");
    if (idx > 0) {
      const prefix = version.reason.slice(0, idx);
      const value = version.reason.slice(idx + 1);
      if (
        prefix === GRAPH_CHANGE_ACCEPTED ||
        prefix === GRAPH_CHANGE_REVERSED ||
        prefix === GRAPH_CHANGE_AMENDED
      ) {
        if (value.length === 0) {
          throw new GraphRevisionCorruptError(
            version.versionNumber,
            `reason "${prefix}:…" carries an empty relationId`,
          );
        }
        return {
          event:
            prefix === GRAPH_CHANGE_ACCEPTED
              ? { type: GRAPH_CHANGE_ACCEPTED, relationId: value }
              : prefix === GRAPH_CHANGE_REVERSED
                ? { type: GRAPH_CHANGE_REVERSED, relationId: value }
                : { type: GRAPH_CHANGE_AMENDED, relationId: value },
        };
      }
      if (prefix === GRAPH_CHANGE_ENTITY_CREATED || prefix === GRAPH_CHANGE_ENTITY_ARCHIVED) {
        if (value.length === 0) {
          throw new GraphRevisionCorruptError(
            version.versionNumber,
            `reason "${prefix}:…" carries an empty entityId`,
          );
        }
        return {
          event:
            prefix === GRAPH_CHANGE_ENTITY_CREATED
              ? { type: GRAPH_CHANGE_ENTITY_CREATED, entityId: value }
              : { type: GRAPH_CHANGE_ENTITY_ARCHIVED, entityId: value },
        };
      }
      // Unknown / non-graph reason prefix — silently skippable.
    }
  }
  return null;
}

/**
 * Replay the persisted GraphVersion chain up to (and including) `upToVersion`,
 * deriving the lifecycle state (acceptedAt / reversedAtVersion) of every
 * canonical relation the chain touched. Deterministic — input order is the
 * versionNumber ordering from the store, never insertion/random order.
 */
export function replayLifecycle(
  versions: ReadonlyArray<{
    readonly versionNumber: number;
    readonly reason: string | null;
    readonly metadata: unknown;
  }>,
  upToVersion: number,
): Map<string, RelationLifecycleState> {
  const state = new Map<string, RelationLifecycleState>();
  for (const version of versions) {
    if (version.versionNumber > upToVersion) break;
    const decoded = decodeChange(version);
    if (!decoded) continue;
    const { event } = decoded;
    if (event.type === GRAPH_CHANGE_ACCEPTED) {
      state.set(event.relationId, { accepted: true, reversedAtVersion: null });
    } else if (event.type === GRAPH_CHANGE_REVERSED) {
      const existing = state.get(event.relationId) ?? {
        accepted: false,
        reversedAtVersion: null,
      };
      state.set(event.relationId, {
        accepted: existing.accepted,
        reversedAtVersion: version.versionNumber,
      });
    }
  }
  return state;
}

/**
 * Replay the persisted entity graph revisions up to (and including)
 * `upToVersion`, deriving each canonical entity's membership window
 * (createdAtVersion / archivedAtVersion). An ENTITY_CREATED then
 * ENTITY_ARCHIVED on the same entity yields a closed window; a later
 * ENTITY_CREATED re-opens it (re-materialization is legal).
 */
export function replayEntityLifecycle(
  versions: ReadonlyArray<{
    readonly versionNumber: number;
    readonly reason: string | null;
    readonly metadata: unknown;
  }>,
  upToVersion: number,
): Map<string, EntityLifecycleState> {
  const state = new Map<string, EntityLifecycleState>();
  for (const version of versions) {
    if (version.versionNumber > upToVersion) break;
    const decoded = decodeChange(version);
    if (!decoded) continue;
    const { event } = decoded;
    if (event.type === GRAPH_CHANGE_ENTITY_CREATED) {
      state.set(event.entityId, {
        createdAtVersion: version.versionNumber,
        archivedAtVersion: null,
      });
    } else if (event.type === GRAPH_CHANGE_ENTITY_ARCHIVED) {
      const existing = state.get(event.entityId) ?? {
        createdAtVersion: version.versionNumber,
        archivedAtVersion: null,
      };
      state.set(event.entityId, {
        createdAtVersion: existing.createdAtVersion,
        archivedAtVersion: version.versionNumber,
      });
    }
  }
  return state;
}

/**
 * Select the graph-present entity universe at a given version:
 *
 *   - EMPTY lifecycle map (a chain with no entity revisions — legacy cases
 *     whose entities predate entity versioning) → the full authoritative
 *     universe is kept (backward-compatible reconstruction).
 *   - NON-EMPTY lifecycle map (entity versioning in effect) → only entities
 *     created ≤ version and not archived ≤ version are present. An entity
 *     with no lifecycle entry in a versioned chain is treated as NOT present
 *     (fail-closed — membership is never guessed).
 */
export function selectEntitiesAtVersion(
  entities: ReadonlyArray<{
    readonly id: string;
    readonly entityType: string | null;
    readonly canonicalName: string;
  }>,
  lifecycle: ReadonlyMap<string, EntityLifecycleState>,
  upToVersion: number,
): ReadonlyArray<{ id: string; entityType: string | null; canonicalName: string }> {
  if (lifecycle.size === 0) return entities;
  return entities.filter((e) => {
    const entry = lifecycle.get(e.id);
    if (!entry) return false;
    if (entry.createdAtVersion > upToVersion) return false;
    if (entry.archivedAtVersion !== null && entry.archivedAtVersion <= upToVersion) return false;
    return true;
  });
}

export class GraphProjectionService {
  private stores: GraphVersionServiceStores;

  constructor(stores?: Partial<GraphVersionServiceStores>) {
    this.stores = {
      graphVersions: stores?.graphVersions ?? graphVersionStore,
      entities: stores?.entities ?? entityStore,
      relations: stores?.relations ?? relationStore,
    };
  }

  /**
   * Project the CURRENT canonical graph for a case: ACTIVE entities + ACTIVE
   * canonical relations (+ temporalRange from authoritative validityInterval).
   * Selection matches the existing GraphRuntime.loadCaseProjection so existing
   * HTTP behavior is untouched. Marks the case's latest ACTIVE version's
   * projectionStatus to COMPLETE (idempotent) once materialized.
   *
   * When the case's revision chain contains entity revisions (entity
   * versioning in effect), entities created later than the latest ACTIVE
   * version — or archived at it — are excluded (member-of-graph filter); a
   * chain with no entity revisions falls back to the full non-ARCHIVED
   * universe (legacy reconstruction).
   */
  async projectCurrentGraph(scope: {
    investigationId: string;
    caseId: string;
  }): Promise<BuiltGraph> {
    const { caseId, investigationId } = scope;
    const [entities, relations, activeVersions, versionChain] = await Promise.all([
      this.stores.entities.listByCase(caseId, { investigationId }),
      this.stores.relations.listActiveByCase(caseId, { investigationId }),
      this.stores.graphVersions.latestActiveByCase(caseId, { investigationId }),
      this.stores.graphVersions.listByCase(caseId, { investigationId }),
    ]);

    const entityLifecycle = replayEntityLifecycle(
      versionChain ?? [],
      activeVersions?.versionNumber ?? Number.MAX_SAFE_INTEGER,
    );
    const presentEntities = selectEntitiesAtVersion(
      entities,
      entityLifecycle,
      activeVersions?.versionNumber ?? Number.MAX_SAFE_INTEGER,
    );

    const input = makeProjectionInput(caseId, presentEntities, relations);
    const built = buildGraph(input);

    if (activeVersions) {
      await this.stores.graphVersions.setProjectionStatus(
        activeVersions.id,
        { caseId },
        "COMPLETE",
        { nodeCount: built.nodeCount, edgeCount: built.edgeCount },
      );
    }

    return built;
  }

  /**
   * Project the ACTIVE canonical relations whose persisted validityInterval
   * CONTAINS the given domain instant `at` (dimension B — domain validity in
   * time, NOT revision order; the two are never conflated). Relations with no
   * usable interval are excluded, never guessed (containsTime → false). The
   * authoritative ACTIVE canonical entity universe + a version COMPLETE mark
   * mirror projectCurrentGraph.
   */
  async projectGraphValidAt(
    scope: {
      investigationId: string;
      caseId: string;
    },
    at: string,
  ): Promise<BuiltGraph> {
    const { caseId, investigationId } = scope;
    const [entities, relations, activeVersions, versionChain] = await Promise.all([
      this.stores.entities.listByCase(caseId, { investigationId }),
      this.stores.relations.listActiveByCase(caseId, { investigationId }),
      this.stores.graphVersions.latestActiveByCase(caseId, { investigationId }),
      this.stores.graphVersions.listByCase(caseId, { investigationId }),
    ]);

    const entityLifecycle = replayEntityLifecycle(
      versionChain ?? [],
      activeVersions?.versionNumber ?? Number.MAX_SAFE_INTEGER,
    );
    const presentEntities = selectEntitiesAtVersion(
      entities,
      entityLifecycle,
      activeVersions?.versionNumber ?? Number.MAX_SAFE_INTEGER,
    );

    const containing = relations.filter((r) => containsTime(r.validityInterval, at));
    const input = makeProjectionInput(caseId, presentEntities, containing);
    const built = buildGraph(input);

    if (activeVersions) {
      await this.stores.graphVersions.setProjectionStatus(
        activeVersions.id,
        { caseId },
        "COMPLETE",
        { nodeCount: built.nodeCount, edgeCount: built.edgeCount },
      );
    }

    return built;
  }

  /**
   * Project the HISTORICAL graph for a case at a target GraphVersion.
   *
   * Selection (dimension A — revision order): replays the persisted GraphVersion
   * chain for the case up to (and including) the target version, deriving
   * accepted / not-yet-reversed canonical relations. Every included edge is
   * loaded from the authoritative Relation store and carries its persisted
   * validityInterval as `temporalRange` + its persisted provenance (dimension B
   * — domain validity, never fabricated). Entity nodes are the canonical
   * non-ARCHIVED universe for the case (consistent, deterministic).
   *
   * Does NOT read or reuse current Graphology state. Marks the projected
   * version COMPLETE (idempotent) on success; throws on an unresolvable target
   * so the caller can mark ERROR if desired.
   */
  async projectGraphVersion(
    caseId: string,
    target: { versionNumber: number } | { graphVersionId: string },
  ): Promise<BuiltGraph> {
    const version =
      "versionNumber" in target
        ? await this.stores.graphVersions.findByVersionNumber(
            caseId,
            target.versionNumber,
          )
        : await this.stores.graphVersions.findById(target.graphVersionId, { caseId });
    if (!version) {
      throw new Error(
        `GraphVersion not found for case ${caseId} at ${
          "versionNumber" in target ? `versionNumber=${target.versionNumber}` : `id=${target.graphVersionId}`
        }`,
      );
    }

    const investigationId = version.investigationId ?? "";
    // All versions of the case in ascending order (the reconstruction seam).
    const allVersions = await this.stores.graphVersions.listByCase(caseId, {
      investigationId: investigationId || undefined,
    });
    const lifecycle = replayLifecycle(allVersions, version.versionNumber);

    // Resolve the relations that are canonically ACTIVE at this version.
    const allRelations = await this.stores.relations.listByCase(caseId, {
      investigationId,
    });
    const relationById = new Map(allRelations.map((r) => [r.id, r]));
    const includedRelations: DurableRelation[] = [];
    for (const [relationId, state] of lifecycle) {
      if (!state.accepted) continue; // reversed before accepted → never active edge
      if (state.reversedAtVersion !== null && state.reversedAtVersion <= version.versionNumber) {
        continue; // reversed at or before this version → not an active edge here
      }
      const rel = relationById.get(relationId);
      if (rel) includedRelations.push(rel);
    }

    // Entity membership at this version: only entities created ≤ target and NOT
    // archived ≤ target are present (M-A12 entity versioning). Chains without
    // entity revisions fall back to the full universe (legacy reconstruction).
    const allEntities = await this.stores.entities.listByCase(caseId, { investigationId });
    const entityLifecycle = replayEntityLifecycle(allVersions, version.versionNumber);
    const presentEntities = selectEntitiesAtVersion(
      allEntities,
      entityLifecycle,
      version.versionNumber,
    );

    // Dimension-B temporal range AS OF this version: when the relation carries
    // persisted amendment assertions, the interval applicable at version N is
    // the latest assertion whose revisionAtVersionNumber ≤ N (never the future
    // correction leaked into the past). Also surface the amendment family on
    // the edge so a version-aware consumer can see ORIGINAL → AMENDMENT links.
    const atVersion = (rel: DurableRelation): DurableRelation => {
      const assertions = parseTemporalAssertions(rel.temporalAssertions)
        .filter((a) => a.revisionAtVersionNumber <= version.versionNumber);
      const latest = assertions[assertions.length - 1];
      if (!latest) return rel; // no assertion known yet at this version → pre-amendment interval
      if (latest.validityInterval === rel.validityInterval) return rel;
      return { ...rel, validityInterval: latest.validityInterval };
    };

    const input = makeProjectionInput(caseId, presentEntities, includedRelations.map(atVersion));
    const built = buildGraph(input);

    await this.stores.graphVersions.setProjectionStatus(
      version.id,
      { caseId },
      "COMPLETE",
      { nodeCount: built.nodeCount, edgeCount: built.edgeCount },
    );

    return built;
  }
}

/**
 * Build the normalized GraphProjectionInput from authoritative entities and the
 * selected canonical relations, mapping each relation's persisted
 * validityInterval to `temporalRange` and carrying its provenance verbatim.
 */
export function makeProjectionInput(
  caseId: string,
  entities: ReadonlyArray<{
    id: string;
    entityType: string | null;
    canonicalName: string;
  }>,
  relations: ReadonlyArray<{
    id: string;
    relationType: string;
    sourceEntityId: string;
    targetEntityId: string;
    directed: boolean;
    provenance: unknown;
    validityInterval: unknown;
  }>,
): {
  caseId: string;
  nodes: Array<{
    id: string;
    entityType: string | null;
    canonicalName: string;
    temporalRange?: unknown;
  }>;
  edges: Array<{
    id: string;
    relationType: string;
    source: string;
    target: string;
    directed: boolean;
    provenance: unknown;
    temporalRange?: unknown;
  }>;
} {
  return {
    caseId,
    nodes: entities.map((e) => ({ ...e })),
    edges: relations.map((r) => ({
      id: r.id,
      relationType: r.relationType,
      source: r.sourceEntityId,
      target: r.targetEntityId,
      directed: r.directed,
      provenance: r.provenance,
      ...(r.validityInterval !== null && r.validityInterval !== undefined
        ? { temporalRange: r.validityInterval }
        : {}),
    })),
  };
}

export const graphProjectionService = new GraphProjectionService();

/**
 * A normalized, order-independent view of a projected graph snapshot. This is
 * the DETERMINISTIC-REPLAY comparison shape: it reads a Graphology graph back
 * into plain sorted structures so two independently built graphs (after the
 * first Graphology instance is discarded) can be compared for equality WITHOUT
 * relying on Graphology object identity or insertion order.
 */
export interface NormalizedGraphSnapshot {
  readonly caseId: string;
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly entityType: string | null;
    readonly canonicalName: string;
    readonly temporalRange?: unknown;
  }>;
  readonly edges: ReadonlyArray<{
    readonly id: string;
    readonly relationType: string;
    readonly source: string;
    readonly target: string;
    readonly directed: boolean;
    readonly temporalRange?: unknown;
    readonly provenance: unknown;
  }>;
}

/**
 * Read a built Graphology graph back into a deterministic normalized snapshot.
 * Endpoint pairs are sorted lexically for ordering independence; node and edge
 * lists are sorted by id. `temporalRange` / `provenance` are carried through
 * verbatim where present (never fabricated, never dropped).
 */
export function normalizeBuiltGraph(graph: Graph, caseId: string): NormalizedGraphSnapshot {
  const nodes = graph
    .nodes()
    .map((id) => {
      const attrs = graph.getNodeAttributes(id) as {
        entityType?: string | null;
        canonicalName?: string;
        temporalRange?: unknown;
      };
      return {
        id,
        entityType: attrs.entityType ?? null,
        canonicalName: attrs.canonicalName ?? "",
        ...(attrs.temporalRange !== undefined ? { temporalRange: attrs.temporalRange } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = graph
    .edges()
    .map((key) => {
      const attrs = graph.getEdgeAttributes(key) as {
        relationType?: string;
        provenance?: unknown;
        temporalRange?: unknown;
      };
      const [rawA, rawB] = graph.extremities(key);
      const directed = graph.isDirected(key);
      // Order-independent endpoints: lexical for undirected, direction kept for
      // directed edges.
      const [source, target] =
        directed || rawA <= rawB ? [rawA, rawB] : [rawB, rawA];
      return {
        id: key,
        relationType: attrs.relationType ?? "",
        source,
        target,
        directed,
        ...(attrs.temporalRange !== undefined ? { temporalRange: attrs.temporalRange } : {}),
        provenance: attrs.provenance,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return { caseId, nodes, edges };
}
