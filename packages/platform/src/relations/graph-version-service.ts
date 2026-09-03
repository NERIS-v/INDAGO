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
import { GraphVersionStore } from "../persistence/graph-version-store.js";
import { graphVersionStore } from "../persistence/graph-version-store.js";
import { EntityStore } from "../persistence/entity-store.js";
import { entityStore } from "../persistence/entity-store.js";
import { RelationStore, type DurableRelation } from "../persistence/relation-store.js";
import { relationStore } from "../persistence/relation-store.js";

export const GRAPH_CHANGE_ACCEPTED = "RELATION_ACCEPTED";
export const GRAPH_CHANGE_REVERSED = "RELATION_REVERSED";

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

/**
 * Decode the version-creating canonical change from a GraphVersion row.
 * Prefers the structured `metadata.change`; falls back to the `reason` string
 * (`RELATION_ACCEPTED:<relationId>` / `RELATION_REVERSED:<relationId>`).
 */
function decodeChange(version: {
  reason: string | null;
  metadata: unknown;
}): { change: string; relationId: string } | null {
  const meta = version.metadata as { change?: unknown; relationId?: unknown } | null;
  if (
    meta &&
    typeof meta === "object" &&
    (meta.change === GRAPH_CHANGE_ACCEPTED || meta.change === GRAPH_CHANGE_REVERSED) &&
    typeof meta.relationId === "string"
  ) {
    return { change: meta.change, relationId: meta.relationId };
  }
  if (typeof version.reason === "string") {
    const idx = version.reason.indexOf(":");
    if (idx > 0) {
      const change = version.reason.slice(0, idx);
      const relationId = version.reason.slice(idx + 1);
      if (
        (change === GRAPH_CHANGE_ACCEPTED || change === GRAPH_CHANGE_REVERSED) &&
        relationId.length > 0
      ) {
        return { change, relationId };
      }
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
    const change = decodeChange(version);
    if (!change) continue;
    if (change.change === GRAPH_CHANGE_ACCEPTED) {
      state.set(change.relationId, { accepted: true, reversedAtVersion: null });
    } else if (change.change === GRAPH_CHANGE_REVERSED) {
      const existing = state.get(change.relationId) ?? {
        accepted: false,
        reversedAtVersion: null,
      };
      state.set(change.relationId, {
        accepted: existing.accepted,
        reversedAtVersion: version.versionNumber,
      });
    }
  }
  return state;
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
   */
  async projectCurrentGraph(scope: {
    investigationId: string;
    caseId: string;
  }): Promise<BuiltGraph> {
    const { caseId, investigationId } = scope;
    const [entities, relations, activeVersions] = await Promise.all([
      this.stores.entities.listByCase(caseId, { investigationId }),
      this.stores.relations.listActiveByCase(caseId, { investigationId }),
      this.stores.graphVersions.latestActiveByCase(caseId, { investigationId }),
    ]);

    const input = makeProjectionInput(caseId, entities, relations);
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

    const entities = await this.stores.entities.listByCase(caseId, { investigationId });
    const input = makeProjectionInput(caseId, entities, includedRelations);
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
