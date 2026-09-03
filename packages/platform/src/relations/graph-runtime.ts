// ============================================================================
// M-A10 Graph Runtime Service (Graphology projection, HTTP-facing)
//
// PostgreSQL stays the AUTHORITATIVE source. This service DERIVES an in-process
// Graphology graph from canonical domain records for ONE case and exposes
// bounded, read-only analytics to the HTTP API:
//
//   nodes = canonical Entities (case-scoped)
//   edges = ACTIVE canonical Relations (case-scoped); REVERSED/PROPOSED are NOT
//           graph edges by default
//
// Case isolation: every read passes a single caseId (resolved server-side from
// the persisted investigation run) and is bounded (projection + analytics caps
// enforced by @indago/graphology-projection). The graph is rebuilt on demand
// from durable records — correctness never depends on a surviving instance.
// ============================================================================

import {
  buildGraph,
  traverseBounded,
  degreeCentrality,
  detectCommunities,
  type BuiltGraph,
  type GraphProjectionInput,
} from "@indago/graphology-projection";
import {
  entityStore,
  type CanonicalEntity,
  type EntityStore,
} from "../persistence/entity-store.js";
import {
  relationStore,
  type DurableRelation,
  type RelationStore,
} from "../persistence/relation-store.js";

interface GraphScopeInput {
  readonly investigationId: string;
  readonly caseId: string;
}

function toGraphNode(entity: CanonicalEntity) {
  return {
    id: entity.id,
    entityType: entity.entityType ?? null,
    canonicalName: entity.canonicalName,
  };
}

function toGraphEdge(relation: DurableRelation) {
  return {
    id: relation.id,
    relationType: relation.relationType,
    source: relation.sourceEntityId,
    target: relation.targetEntityId,
    provenance: relation.provenance,
    directed: relation.directed,
  };
}

/**
 * Build the projection input for one case from authoritative records. Only
 * ACTIVE canonical relations become edges; REVERSED relations are excluded so
 * the graph models only living relations. Edges reference only entities that
 * exist in this case (buildGraph skips dangling references defensively).
 *
 * Stores may be injected for testing (test-DB-backed instances); default to the
 * platform singletons (app DB) at runtime.
 */
export async function loadCaseProjection(
  scope: GraphScopeInput,
  stores: {
    entities?: EntityStore;
    relations?: RelationStore;
  } = {},
): Promise<GraphProjectionInput> {
  const entitySource = stores.entities ?? entityStore;
  const relationSource = stores.relations ?? relationStore;
  const [entities, relations] = await Promise.all([
    entitySource.listByCase(scope.caseId, { investigationId: scope.investigationId }),
    relationSource.listActiveByCase(scope.caseId, {
      investigationId: scope.investigationId,
    }),
  ]);

  return {
    caseId: scope.caseId,
    nodes: entities.map(toGraphNode),
    edges: relations.map(toGraphEdge),
  };
}

export interface CaseGraphView extends BuiltGraph {
  readonly investigationId: string;
  readonly caseId: string;
  /** Bounded list of canonical relations that became graph edges. */
  readonly edges: ReadonlyArray<{
    id: string;
    relationType: string;
    source: string;
    target: string;
    directed: boolean;
  }>;
}

export interface GraphAnalyticsService {
  /** The derived graph snapshot for one case (bounded). */
  graph(scope: GraphScopeInput): Promise<CaseGraphView>;
  /** Bounded N-hop traversal from a canonical entity. */
  traversal(
    scope: GraphScopeInput,
    startEntityId: string,
    hops?: number,
    maxPaths?: number,
  ): Promise<ReturnType<typeof traverseBounded>>;
  /** Degree centrality rank for one case. */
  centrality(
    scope: GraphScopeInput,
    maxResults?: number,
  ): Promise<ReturnType<typeof degreeCentrality>>;
  /** Deterministic Louvain community groups for one case. */
  communities(scope: GraphScopeInput): Promise<ReturnType<typeof detectCommunities>>;
}

export interface GraphRuntimeStores {
  readonly entities: EntityStore;
  readonly relations: RelationStore;
}

export class GraphRuntime implements GraphAnalyticsService {
  private stores: GraphRuntimeStores;

  constructor(stores?: Partial<GraphRuntimeStores>) {
    this.stores = {
      entities: stores?.entities ?? entityStore,
      relations: stores?.relations ?? relationStore,
    };
  }

  private async projection(scope: GraphScopeInput): Promise<BuiltGraph> {
    const input = await loadCaseProjection(scope, this.stores);
    return buildGraph(input);
  }

  async graph(scope: GraphScopeInput): Promise<CaseGraphView> {
    const input = await loadCaseProjection(scope, this.stores);
    const built = buildGraph(input);
    return {
      ...built,
      investigationId: scope.investigationId,
      caseId: scope.caseId,
      edges: input.edges.map((e) => ({
        id: e.id,
        relationType: e.relationType,
        source: e.source,
        target: e.target,
        directed: e.directed ?? false,
      })),
    };
  }

  async traversal(
    scope: GraphScopeInput,
    startEntityId: string,
    hops?: number,
    maxPaths?: number,
  ): Promise<ReturnType<typeof traverseBounded>> {
    const built = await this.projection(scope);
    return traverseBounded(built.graph, startEntityId, { hops, maxPaths });
  }

  async centrality(
    scope: GraphScopeInput,
    maxResults?: number,
  ): Promise<ReturnType<typeof degreeCentrality>> {
    const built = await this.projection(scope);
    return degreeCentrality(built.graph, maxResults);
  }

  async communities(
    scope: GraphScopeInput,
  ): Promise<ReturnType<typeof detectCommunities>> {
    const built = await this.projection(scope);
    return detectCommunities(built.graph);
  }
}

export const graphRuntime: GraphAnalyticsService = new GraphRuntime();