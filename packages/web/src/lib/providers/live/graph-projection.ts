// ============================================================================
// LIVE — Graph projection DTOs → canonical graph contracts
//
// The platform graph routes serialize the M-A13 ProjectedGraph (ProjectedGraphNode
// / ProjectedGraphEdge — canonical entities + ACTIVE canonical relations) plus
// GraphVersion metadata. The frontend graph UI consumes the richer canonical
// GraphNode / GraphEdge contracts. This module projects the projection shapes
// into those contracts:
//
//   - fields the endpoint exposes        → mapped verbatim (node id = canonical
//     EntityId; label = canonicalName; edge relationType / directed /
//     temporalRange; status ACTIVE because the derived graph is built from
//     ACTIVE canonical relations only);
//   - fields it does not expose          → deterministic NEUTRAL defaults,
//     explicitly marked PROJECTION below. They must never be read back as
//     factual metadata.
//
// The projection is validated against GraphNodeSchema / GraphEdgeSchema /
// GraphVersionSchema so callers always receive schema-valid canonical shapes —
// or a thrown error, never a fabricated record.
//
// `versionId` is the id of the LATEST recorded graph version the current
// projection reflects (resolved by the provider). When no version exists, the
// provider throws typed UNSUPPORTED before projecting (never fabricates a
// version identity).
// ============================================================================

import {
  GraphVersionSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  type GraphVersion,
  type GraphNode,
  type GraphEdge,
  type ProjectedGraphNode,
  type ProjectedGraphEdge,
} from "@indago/contracts";
import type { GraphVersionListItemDTO } from "@/lib/api/types";

export interface GraphProjectionContext {
  /** Canonical investigation id the provider was resolved for. */
  readonly investigationId: string;
  /** Latest recorded graph version this projection reflects. */
  readonly versionId: string;
}

export function projectGraphVersionFromListItem(
  dto: GraphVersionListItemDTO,
  investigationId: string,
): GraphVersion {
  return GraphVersionSchema.parse({
    id: dto.id,
    investigationId,
    versionNumber: dto.versionNumber,
    status: dto.status,
    projectionStatus: dto.projectionStatus,
    parentGraphVersionId: dto.parentGraphVersionId ?? undefined,
    checkpointId: dto.checkpointId ?? undefined,
    nodeCount: dto.nodeCount,
    edgeCount: dto.edgeCount,
    createdAt: { value: dto.createdAt, precision: "exact" },
    updatedAt: { value: dto.updatedAt, precision: "exact" },
  });
}

// PROJECTION: a neutral timestamp for fields the projected graph does not
// expose. ObservedTimeSchema only permits precision "exact", so the sentinel
// is marked exact-by-format — the value is the deterministic epoch and must
// NEVER be read back as factual metadata. Subscribers that need a real
// materialization time should use the owning GraphVersion's createdAt instead.
const PROJECTED_NEUTRAL_TIME = {
  value: "1970-01-01T00:00:00.000Z",
  precision: "exact",
} as const;

/**
 * Project a ProjectedGraphNode (a canonical entity) into the canonical GraphNode.
 * Every projected node IS an entity node — the derived graph is entity+relation
 * based — so type "ENTITY" and entityId = node id are truthful. The structural
 * signal / observation / source counts are not exposed by the projection and
 * take neutral PROJECTION defaults.
 */
export function projectGraphNode(
  node: ProjectedGraphNode,
  ctx: GraphProjectionContext,
): GraphNode {
  return GraphNodeSchema.parse({
    id: node.id,
    investigationId: ctx.investigationId,
    versionId: ctx.versionId,
    type: "ENTITY",
    entityId: node.id,
    label: node.canonicalName,
    // PROJECTION — the projection endpoint does not expose these.
    structuralImportance: 0,
    observationCount: 0,
    sourceCount: 0,
    temporalRange: node.temporalRange ?? undefined,
    createdAt: PROJECTED_NEUTRAL_TIME,
    updatedAt: PROJECTED_NEUTRAL_TIME,
  });
}

/**
 * Project a ProjectedGraphEdge (an ACTIVE canonical relation) into the canonical
 * GraphEdge. status "ACTIVE" is truthful (the derived graph is built from ACTIVE
 * canonical relations only); support / structural signal / counts are neutral
 * PROJECTION defaults.
 */
export function projectGraphEdge(
  edge: ProjectedGraphEdge,
  ctx: GraphProjectionContext,
): GraphEdge {
  return GraphEdgeSchema.parse({
    id: edge.id,
    investigationId: ctx.investigationId,
    versionId: ctx.versionId,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    relationType: edge.relationType,
    directed: edge.directed,
    temporalRange: edge.temporalRange ?? undefined,
    status: "ACTIVE",
    // PROJECTION — the projection endpoint does not expose these.
    support: 0,
    structuralImportance: 0,
    observationCount: 0,
    sourceCount: 0,
    createdAt: PROJECTED_NEUTRAL_TIME,
    updatedAt: PROJECTED_NEUTRAL_TIME,
  });
}