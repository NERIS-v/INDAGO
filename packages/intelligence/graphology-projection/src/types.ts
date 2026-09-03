// ============================================================================
// M-A10 Graph Projection — shared types
//
// The projection boundary consumes PLAIN domain shapes (canonical entities +
// accepted canonical relations), NOT Prisma rows and NOT Graphology. Domain
// contracts MUST NOT depend on Graphology or any concrete graph backend; the
// projection module translates authoritative domain records into an in-process
// Graphology graph (see §82 — GraphAdapter seam).
//
// AUTHORITATIVE SOURCE: PostgreSQL. Graphology is a DERIVED, rebuildable
// projection. If the in-memory graph is invalidated, it is rebuilt from these
// records — correctness never depends on a surviving instance (§31, §35, §41).
// ============================================================================

/**
 * A canonical node in the domain projection. Node identity is the canonical
 * EntityId; node type maps to the existing canonical EntityType.
 */
export interface GraphNode {
  readonly id: string; // canonical EntityId — NEVER a mention/pair id
  readonly entityType: string | null;
  readonly canonicalName: string;
}

/**
 * A canonical graph edge in the domain projection. Only an ACCEPTED canonical
 * Relation becomes an edge; PROPOSED RelationHypotheses are NOT canonical
 * edges by default (§32).
 */
export interface GraphEdge {
  readonly id: string; // canonical RelationId
  readonly relationType: string;
  readonly source: string; // canonical EntityId
  readonly target: string; // canonical EntityId
  readonly sourceLabel?: string;
  readonly targetLabel?: string;
  readonly provenance: unknown;
  readonly directed?: boolean;
}

/**
 * Authoritative input for a project: the canonical entities and ACCEPTED
 * canonical relations for ONE case.
 *
 * Case-scoped: the caller supplies exactly one case's records. A graph for the
 * case MUST NEVER include another case's entities/relations (§42, §43).
 */
export interface GraphProjectionInput {
  readonly caseId: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
