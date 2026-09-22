// ============================================================================
// PR-6 — Living Investigative Graph Visual Language
//
// Pure PRESENTATION-level derivation of investigative visual state. This module
// owns NO rendering, NO physics, NO analytics engine, and NO provider imports.
// It converts an already-loaded graph (nodes/edges/holes), the current temporal
// window, the active PR-4 filter, cross-case overlay members, and an optional
// focus scope into a deterministic per-node / per-edge visual language.
//
// DESIGN RULES (PR-6 spec):
//   - State is ORTHOGONAL, never one mutually-exclusive enum: a node can be
//     important + supported + selected at the same time without destroying
//     semantics. Each dimension is derived from EXISTING domain fields only.
//   - "unsupported data" ≠ "weak evidence" ≠ "contradicted". They are distinct
//     postures (unknown / unresolved / contradicted).
//   - No fabricated AI scores or new analytics. Attention emerges only from real
//     signals that already exist in the graph data (CONTRADICTED edges, edges
//     whose support is below the documented threshold, graph holes, unresolved
//     observation nodes, foreign-case members).
//   - The attention hierarchy is 0 baseline → 1 signal → 2 attention region
//     → 3 focus (selection/focus). Convergence requires >= MIN_CONVERGENT_SIGNAL_TYPES
//     distinct signal types within the signal-connected neighborhood.
//   - Filtered-out edges never contaminate attention: signals are computed over
//     the VISIBLE edge set (applyGraphFilter), the same set the canvas renders.
//
// The heavy derivation runs ONCE per meaningful domain/context change (memoized
// in the panel). The canvas only hydrates interaction (hover/focus/selection)
// per render — this module never runs on the physics tick.
// ============================================================================

import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import { applyGraphFilter } from "./graph-filter";
import type { GraphFilterState } from "./graph-filter";
import { findBridgeEdges } from "@/components/graph/use-graph-layout";

/** Canonical weak-support band threshold. Shared with the intelligence Signals
 *  tab (it re-exports this constant as WEAK_SUPPORT_THRESHOLD for consumers). */
export const WEAK_SUPPORT_BAND_THRESHOLD = 0.3;

/** "Grounded" = the relation is backed by at least one observation derived from
 *  at least one independent source (the GraphEdge contract's own semantics). */
export function edgeIsGrounded(edge: GraphEdge): boolean {
  return edge.observationCount > 0 && edge.sourceCount > 0;
}

// ─── Orthogonal visual dimensions ───────────────────────────────────────────

export type EvidencePosture = "supported" | "contradicted" | "unresolved" | "unknown";
export type TemporalState = "in-range" | "out-of-range" | "uncertain";
export type CaseScope = "local" | "foreign";
export type StructuralRole = "bridge" | "core" | "standard" | "leaf";
export type EdgeSupportBand = "strong" | "moderate" | "weak";
export type AttentionLevel = 0 | 1 | 2 | 3;
export type HypothesisRelevance = "supporting" | "contradicting";

export type AttentionSignalType =
  | "contradiction"
  | "weak-support"
  | "graph-hole"
  | "unresolved"
  | "cross-case";

export interface GraphNodeVisualState {
  readonly selected: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly structuralRole: StructuralRole;
  readonly evidencePosture: EvidencePosture;
  readonly temporal: TemporalState;
  readonly caseScope: CaseScope;
  readonly hypothesisRelevance: HypothesisRelevance | null;
  readonly evidenceInScope: boolean;
  readonly gapAffected: boolean;
  readonly attentionLevel: AttentionLevel;
}

export interface GraphEdgeVisualState {
  readonly supportBand: EdgeSupportBand;
  readonly posture: EvidencePosture;
  readonly grounded: boolean;
  readonly caseScope: CaseScope;
  readonly temporal: TemporalState;
  readonly hypothesisRelevance: HypothesisRelevance | null;
  readonly evidenceInScope: boolean;
  readonly gapAffected: boolean;
  readonly incidentToSelection: boolean;
  readonly selected: boolean;
  readonly attentionLevel: AttentionLevel;
}

export interface GraphAttentionRegion {
  /** Stable deterministic membership id (sorted member node ids joined). */
  readonly id: string;
  readonly memberNodeIds: string[];
  readonly signalTypes: AttentionSignalType[];
}

/** Focus scope a selected investigative object contributes to the graph.
 *  Derived from provider data OUTSIDE this module; only carried here. */
export interface GraphFocusSeed {
  readonly kind: "hypothesis" | "evidence" | "gap";
  /** Entities in the focused scope (entity ids → graph nodes via entityId). */
  readonly entityIds: string[];
  /** Graph node ids directly affected (gaps resolved through graph holes). */
  readonly nodeIds: string[];
}

export interface GraphVisualContext {
  readonly nodes: ReadonlyMap<string, GraphNodeVisualState>;
  readonly edges: ReadonlyMap<string, GraphEdgeVisualState>;
  readonly regions: GraphAttentionRegion[];
  readonly focus: GraphFocusSeed | null;
}

// ─── Small deterministic derivations (leaf functions, unit-testable) ─────────

export function deriveSupportBand(support: number): EdgeSupportBand {
  if (support >= 0.6) return "strong";
  if (support >= WEAK_SUPPORT_BAND_THRESHOLD) return "moderate";
  return "weak";
}

export function deriveEvidencePostureForEdge(edge: GraphEdge): EvidencePosture {
  if (edge.status === "CONTRADICTED") return "contradicted";
  if (edge.status === "ARCHIVED") return "unknown";
  return edgeIsGrounded(edge) ? "supported" : "unresolved";
}

/** A node's posture comes from its visibly rendered incident relations. */
export function deriveEvidencePostureForNode(
  incidentEdges: readonly GraphEdge[],
  isForeign: boolean,
): EvidencePosture {
  if (isForeign) return "unknown";
  if (incidentEdges.some((e) => e.status === "CONTRADICTED")) return "contradicted";
  if (incidentEdges.some((e) => e.status === "ACTIVE" && edgeIsGrounded(e))) return "supported";
  if (incidentEdges.some((e) => e.status === "ACTIVE")) return "unresolved";
  return "unknown";
}

/** Activity corridor of one NODE's observations: the [min,max] epoch span of
 *  its dated observations. Entities with no dated observation yield `null`
 *  (conservative: a missing timestamp is not evidence of absence). Keyed by
 *  entityId — the panel derives it once from the observation provider. */
export interface NodeActivityBounds {
  readonly min: number;
  readonly max: number;
}

export function nodeInTimeRange(
  node: GraphNode,
  range: [number, number] | null,
  activityBounds?: NodeActivityBounds | null,
): TemporalState {
  if (!range) return "in-range";
  if (activityBounds) {
    // In-range iff >=1 dated observation falls inside the window.
    if (activityBounds.max < range[0] || activityBounds.min > range[1]) {
      return "out-of-range";
    }
    return "in-range";
  }
  if (!node.createdAt?.value) return "uncertain";
  const t = new Date(node.createdAt.value).getTime();
  return t >= range[0] && t <= range[1] ? "in-range" : "out-of-range";
}

export function edgeTemporalState(
  sourceTemporal: TemporalState,
  targetTemporal: TemporalState,
): TemporalState {
  if (sourceTemporal === "out-of-range" || targetTemporal === "out-of-range") return "out-of-range";
  if (sourceTemporal === "uncertain" || targetTemporal === "uncertain") return "uncertain";
  return "in-range";
}

export function deriveStructuralRole(args: {
  isBridge: boolean;
  importance: number;
  degree: number;
}): StructuralRole {
  if (args.isBridge) return "bridge";
  if (args.degree >= 3 && args.importance >= 0.7) return "core";
  if (args.degree <= 1) return "leaf";
  return "standard";
}

// ─── Per-object leaf derivation (with interaction) ───────────────────────────

export interface NodeVisualStateInput {
  readonly node: GraphNode;
  readonly incidentEdges: readonly GraphEdge[];
  readonly selectedNodeId: string | null;
  readonly focusedNodeId: string | null;
  readonly hoveredNodeId: string | null;
  readonly activeTimeRange: [number, number] | null;
  readonly activityBounds?: NodeActivityBounds | null;
  readonly isForeign: boolean;
  readonly isBridge: boolean;
  readonly degree: number;
  readonly hypothesisRelevance: HypothesisRelevance | null;
  readonly evidenceInScope: boolean;
  readonly gapAffected: boolean;
  readonly signals: ReadonlySet<AttentionSignalType>;
  readonly inAttentionRegion: boolean;
}

export function deriveNodeVisualState(input: NodeVisualStateInput): GraphNodeVisualState {
  const selected = input.selectedNodeId === input.node.id;
  const focused = input.focusedNodeId === input.node.id;
  const hovered = input.hoveredNodeId === input.node.id;
  const temporal = nodeInTimeRange(input.node, input.activeTimeRange, input.activityBounds);

  let attentionLevel: AttentionLevel = 0;
  if (selected || focused) attentionLevel = 3;
  else if (input.inAttentionRegion) attentionLevel = 2;
  else if (input.signals.size > 0) attentionLevel = 1;

  return {
    selected,
    focused,
    hovered,
    structuralRole: deriveStructuralRole({
      isBridge: input.isBridge,
      importance: input.node.structuralImportance ?? 0.5,
      degree: input.degree,
    }),
    evidencePosture: deriveEvidencePostureForNode(input.incidentEdges, input.isForeign),
    temporal,
    caseScope: input.isForeign ? "foreign" : "local",
    hypothesisRelevance: input.hypothesisRelevance,
    evidenceInScope: input.evidenceInScope,
    gapAffected: input.gapAffected,
    attentionLevel,
  };
}

export interface EdgeVisualStateInput {
  readonly edge: GraphEdge;
  readonly sourceNode: GraphNode;
  readonly targetNode: GraphNode;
  readonly selectedNodeId: string | null;
  /** Direct edge selection — a picked relationship highlights the edge itself,
   *  independent of its incident nodes. */
  readonly selectedEdgeId: string | null;
  readonly focusedNodeId: string | null;
  readonly hoveredNodeId: string | null;
  readonly activeTimeRange: [number, number] | null;
  readonly sourceActivityBounds?: NodeActivityBounds | null;
  readonly targetActivityBounds?: NodeActivityBounds | null;
  readonly isForeign: boolean;
  readonly hypothesisRelevance: HypothesisRelevance | null;
  readonly evidenceInScope: boolean;
  readonly gapAffected: boolean;
  readonly inAttentionRegion: boolean;
}

export function deriveEdgeVisualState(input: EdgeVisualStateInput): GraphEdgeVisualState {
  const sourceTemporal = nodeInTimeRange(
    input.sourceNode,
    input.activeTimeRange,
    input.sourceActivityBounds,
  );
  const targetTemporal = nodeInTimeRange(
    input.targetNode,
    input.activeTimeRange,
    input.targetActivityBounds,
  );
  const incidentToSelection =
    input.selectedNodeId === input.edge.sourceNodeId ||
    input.selectedNodeId === input.edge.targetNodeId ||
    input.focusedNodeId === input.edge.sourceNodeId ||
    input.focusedNodeId === input.edge.targetNodeId ||
    input.hoveredNodeId === input.edge.sourceNodeId ||
    input.hoveredNodeId === input.edge.targetNodeId;
  const selected =
    input.selectedEdgeId === input.edge.id;

  let attentionLevel: AttentionLevel = 0;
  if (selected || incidentToSelection) attentionLevel = 3;
  else if (input.inAttentionRegion) attentionLevel = 2;
  else if (input.edge.status === "CONTRADICTED" || deriveSupportBand(input.edge.support) === "weak")
    attentionLevel = 1;

  return {
    supportBand: deriveSupportBand(input.edge.support),
    posture: deriveEvidencePostureForEdge(input.edge),
    grounded: edgeIsGrounded(input.edge),
    caseScope: input.isForeign ? "foreign" : "local",
    temporal: edgeTemporalState(sourceTemporal, targetTemporal),
    hypothesisRelevance: input.hypothesisRelevance,
    evidenceInScope: input.evidenceInScope,
    gapAffected: input.gapAffected,
    incidentToSelection,
    selected,
    attentionLevel,
  };
}

// ─── Attention / signal convergence ──────────────────────────────────────────

export interface AttentionInput {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly holes: GraphHole[];
  readonly filter?: GraphFilterState | null;
  readonly foreignNodeIds?: ReadonlySet<string>;
  /** PR-10: optional PRE-COMPUTED signals (the full context derivation computes
   *  them once and reuses them for regions instead of deriving twice). Absent →
   *  derived here (leaf-function behavior unchanged). */
  readonly signals?: Map<string, Set<AttentionSignalType>>;
}

/** Distinct investigative signals attached to every node, from visible edges,
 *  holes, unresolved nodes and foreign membership. Pure + deterministic. */
export function deriveNodeSignals(
  input: AttentionInput,
): Map<string, Set<AttentionSignalType>> {
  const visibleEdges = applyGraphFilter(input.edges, input.filter);
  const signals = new Map<string, Set<AttentionSignalType>>(
    input.nodes.map((n) => [n.id, new Set<AttentionSignalType>()]),
  );

  const push = (nodeId: string, type: AttentionSignalType) => {
    const set = signals.get(nodeId);
    if (set) set.add(type);
  };

  for (const e of visibleEdges) {
    if (e.status === "CONTRADICTED") {
      push(e.sourceNodeId, "contradiction");
      push(e.targetNodeId, "contradiction");
    }
    if (deriveSupportBand(e.support) === "weak") {
      push(e.sourceNodeId, "weak-support");
      push(e.targetNodeId, "weak-support");
    }
  }

  for (const hole of input.holes) {
    for (const nodeId of hole.nodeIds) push(nodeId, "graph-hole");
  }

  for (const n of input.nodes) {
    const unresolved =
      n.type === "OBSERVATION" &&
      n.observationCount === 0 &&
      n.sourceCount === 0;
    if (unresolved) push(n.id, "unresolved");
    if (input.foreignNodeIds?.has(n.id)) push(n.id, "cross-case");
  }

  return signals;
}

export const ATTENTION_CONVERGENCE_MIN_SIGNAL_TYPES = 2;
export const ATTENTION_CONVERGENCE_HOPS = 2;

/**
 * Deterministic attention regions — where >= MIN_CONVERGENT_SIGNAL_TYPES distinct
 * signal types share a signal-connected neighborhood.
 *
 * Rule (documented, tested):
 *   1. Signals are computed over the VISIBLE edge set only (filtered-out edges
 *      never contaminate attention).
 *   2. Signal nodes are connected through VISIBLE edges that join two signal
 *      nodes; non-signal nodes do not carry a region.
 *   3. Every maximal signal-connected component whose UNION of distinct signal
 *      types has size >= 2 becomes an attention region.
 *   4. A node with a single signal type and no convergence stays at "signal"
 *      level — it is NOT an attention region.
 *   5. Region identity is the sorted member id list (stable + deterministic).
 */
export function deriveAttentionRegions(
  input: AttentionInput,
): GraphAttentionRegion[] {
  const signals = input.signals ?? deriveNodeSignals(input);
  const visibleEdges = applyGraphFilter(input.edges, input.filter);

  const signalNodeIds = new Set<string>();
  for (const [id, set] of signals) if (set.size > 0) signalNodeIds.add(id);

  if (signalNodeIds.size === 0) return [];

  // Adjacency over visible edges restricted to signal nodes.
  const adjacency = new Map<string, Set<string>>();
  for (const id of signalNodeIds) adjacency.set(id, new Set());
  for (const e of visibleEdges) {
    if (!signalNodeIds.has(e.sourceNodeId) || !signalNodeIds.has(e.targetNodeId)) continue;
    adjacency.get(e.sourceNodeId)?.add(e.targetNodeId);
    adjacency.get(e.targetNodeId)?.add(e.sourceNodeId);
  }

  // Longest-path hop expansion for the "within N graph hops" rule. A signal
  // node may still join a region if it is within ATTENTION_CONVERGENCE_HOPS
  // visible hops of the component's core — but never across non-signal nodes.
  const visited = new Set<string>();
  const regions: GraphAttentionRegion[] = [];
  const nodeIds = [...signalNodeIds];

  for (const start of nodeIds) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue: Array<{ id: string; hops: number }> = [{ id: start, hops: 0 }];
    visited.add(start);
    while (queue.length) {
      const { id, hops } = queue.shift()!;
      component.push(id);
      if (hops >= ATTENTION_CONVERGENCE_HOPS) continue;
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, hops: hops + 1 });
        }
      }
    }

    const union = new Set<AttentionSignalType>();
    for (const id of component) {
      for (const type of signals.get(id) ?? []) union.add(type);
    }
    if (union.size >= ATTENTION_CONVERGENCE_MIN_SIGNAL_TYPES) {
      regions.push({
        id: [...component].sort().join(","),
        memberNodeIds: component,
        signalTypes: [...union].sort() as AttentionSignalType[],
      });
    }
  }

  return regions.sort((a, b) => a.id.localeCompare(b.id));
}

// ─── Full presentation context ───────────────────────────────────────────────

export interface GraphVisualContextInput {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly holes: GraphHole[];
  readonly activeTimeRange: [number, number] | null;
  readonly filter?: GraphFilterState | null;
  readonly selectedNodeId?: string | null;
  /** Direct edge selection id (the picked relationship). Optional — absent
   *  means no edge is directly selected. */
  readonly selectedEdgeId?: string | null;
  readonly foreignNodeIds?: ReadonlySet<string>;
  readonly foreignEdgeIds?: ReadonlySet<string>;
  readonly focusSeed?: GraphFocusSeed | null;
  /** PR-8/P4: entity activity corridors (per entityId) used as the TEMPORAL
   *  source for nodes that carry dated observations. Absent → nodes fall back
   *  to createdAt (leaf-function behavior unchanged). */
  readonly activityBounds?: ReadonlyMap<string, NodeActivityBounds>;
}

/**
 * Compute the complete presentation model for a graph snapshot. Memoize this on
 * the panel side; it must not run on the physics tick. Interaction dimensions
 * (selected/focused/hovered) default to "none" here — the canvas hydrates them
 * from its own interaction state per render.
 */
export function deriveGraphVisualContext(
  input: GraphVisualContextInput,
): GraphVisualContext {
  const visibleEdges = applyGraphFilter(input.edges, input.filter);
  const foreignNodeIds = input.foreignNodeIds ?? new Set<string>();
  const foreignEdgeIds = input.foreignEdgeIds ?? new Set<string>();

  // PR-10: index nodes once (the per-edge `.find` was O(V·E) per derivation).
  const nodeById = new Map<string, GraphNode>(input.nodes.map((n) => [n.id, n]));

  // Structural bridges over the visible ACTIVE topology (reuses the existing
  // Tarjan derivation from the layout engine — no new analytics).
  const structuralEdges = visibleEdges.filter((e) => e.status === "ACTIVE");
  const dfsAdjacency = new Map<string, { neighbor: string; edgeId: string }[]>();
  input.nodes.forEach((n) => dfsAdjacency.set(n.id, []));
  structuralEdges.forEach((e) => {
    dfsAdjacency.get(e.sourceNodeId)?.push({ neighbor: e.targetNodeId, edgeId: e.id });
    dfsAdjacency.get(e.targetNodeId)?.push({ neighbor: e.sourceNodeId, edgeId: e.id });
  });
  const bridgeEdgeIds = findBridgeEdges(input.nodes.map((n) => n.id), dfsAdjacency);
  const bridgeNodeIds = new Set<string>();
  for (const e of structuralEdges) {
    if (bridgeEdgeIds.has(e.id)) {
      bridgeNodeIds.add(e.sourceNodeId);
      bridgeNodeIds.add(e.targetNodeId);
    }
  }

  // Degree from visible edges (single O(E) pass).
  const degree = new Map<string, number>(input.nodes.map((n) => [n.id, 0]));
  const incidentByNode = new Map<string, GraphEdge[]>(input.nodes.map((n) => [n.id, []]));
  for (const e of visibleEdges) {
    degree.set(e.sourceNodeId, (degree.get(e.sourceNodeId) ?? 0) + 1);
    degree.set(e.targetNodeId, (degree.get(e.targetNodeId) ?? 0) + 1);
    incidentByNode.get(e.sourceNodeId)?.push(e);
    incidentByNode.get(e.targetNodeId)?.push(e);
  }

  // Focus-set membership.
  const focusEntityIds = new Set(input.focusSeed?.entityIds ?? []);
  const focusNodeIds = new Set(input.focusSeed?.nodeIds ?? []);
  const entityIdByNode = new Map<string, string>();
  for (const n of input.nodes) if (n.entityId) entityIdByNode.set(n.id, n.entityId);

  const relevantNodes = (node: GraphNode): boolean =>
    focusEntityIds.size > 0
      ? Boolean(node.entityId && focusEntityIds.has(node.entityId))
      : focusNodeIds.has(node.id) ||
        Boolean(node.entityId && focusEntityIds.has(node.entityId));

  // Contradiction is node-scoped and computed in one O(E) pass — a node is
  // "contradicting" when any visible INCIDENT edge is CONTRADICTED while the
  // focus is a hypothesis (the disputed relationship sits inside the scope).
  const contradictedByNode = new Map<string, boolean>();
  for (const e of visibleEdges) {
    if (e.status !== "CONTRADICTED") continue;
    contradictedByNode.set(e.sourceNodeId, true);
    contradictedByNode.set(e.targetNodeId, true);
  }

  const relevanceForNode = (node: GraphNode): HypothesisRelevance | null => {
    if (input.focusSeed?.kind !== "hypothesis" || !relevantNodes(node)) return null;
    return contradictedByNode.get(node.id) ? "contradicting" : "supporting";
  };

  // PR-10: grounded-evidence incident membership computed in ONE O(E) pass.
  // The previous implementation ran an O(E) `edges.some` per node → O(V·E) per
  // derivation on every evidence focus.
  const groundedIncidentByNode = new Map<string, boolean>();
  if (input.focusSeed?.kind === "evidence") {
    for (const e of input.edges) {
      if (e.status === "CONTRADICTED" || e.status === "ARCHIVED" || !edgeIsGrounded(e)) continue;
      groundedIncidentByNode.set(e.sourceNodeId, true);
      groundedIncidentByNode.set(e.targetNodeId, true);
    }
  }
  const evidenceInScopeForNode = (node: GraphNode): boolean =>
    groundedIncidentByNode.get(node.id) ?? false;

  const gapAffectedForNode = (node: GraphNode): boolean => {
    if (input.focusSeed?.kind !== "gap") return false;
    return (
      focusNodeIds.has(node.id) ||
      Boolean(node.entityId && focusEntityIds.has(node.entityId))
    );
  };

  // Signals + regions.
  // PR-10: derive signals ONCE and share them with the region derivation
  // (was computed twice per full context).
  const signals = deriveNodeSignals({
    nodes: input.nodes,
    edges: input.edges,
    holes: input.holes,
    filter: input.filter,
    foreignNodeIds,
  });
  const regions = deriveAttentionRegions({
    nodes: input.nodes,
    edges: input.edges,
    holes: input.holes,
    filter: input.filter,
    foreignNodeIds,
    signals,
  });
  const regionOf = new Map<string, GraphAttentionRegion>();
  for (const region of regions) {
    for (const member of region.memberNodeIds) regionOf.set(member, region);
  }

  const nodesMap = new Map<string, GraphNodeVisualState>();
  for (const node of input.nodes) {
    const nodeSignals = signals.get(node.id) ?? new Set<AttentionSignalType>();
    const region = regionOf.get(node.id);
    nodesMap.set(
      node.id,
      deriveNodeVisualState({
        node,
        incidentEdges: incidentByNode.get(node.id) ?? [],
        selectedNodeId: input.selectedNodeId ?? null,
        focusedNodeId: null,
        hoveredNodeId: null,
        activeTimeRange: input.activeTimeRange,
        activityBounds: node.entityId
          ? input.activityBounds?.get(node.entityId) ?? null
          : null,
        isForeign: foreignNodeIds.has(node.id),
        isBridge: bridgeNodeIds.has(node.id),
        degree: degree.get(node.id) ?? 0,
        hypothesisRelevance: relevanceForNode(node),
        evidenceInScope: evidenceInScopeForNode(node),
        gapAffected: gapAffectedForNode(node),
        signals: nodeSignals,
        inAttentionRegion: Boolean(region),
      }),
    );
  }

  const edgesMap = new Map<string, GraphEdgeVisualState>();
  for (const edge of input.edges) {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) continue;
    const relevance =
      input.focusSeed?.kind === "hypothesis"
        ? relevanceForEdge(edge, sourceNode, targetNode, relevantNodes)
        : null;
    edgesMap.set(
      edge.id,
      deriveEdgeVisualState({
        edge,
        sourceNode,
        targetNode,
        selectedNodeId: input.selectedNodeId ?? null,
        selectedEdgeId: input.selectedEdgeId ?? null,
        focusedNodeId: null,
        hoveredNodeId: null,
        activeTimeRange: input.activeTimeRange,
        sourceActivityBounds: sourceNode.entityId
          ? input.activityBounds?.get(sourceNode.entityId) ?? null
          : null,
        targetActivityBounds: targetNode.entityId
          ? input.activityBounds?.get(targetNode.entityId) ?? null
          : null,
        isForeign: foreignEdgeIds.has(edge.id),
        hypothesisRelevance: relevance,
        evidenceInScope: input.focusSeed?.kind === "evidence" && edgeIsGrounded(edge),
        gapAffected:
          input.focusSeed?.kind === "gap" &&
          (focusNodeIds.has(edge.sourceNodeId) ||
            focusNodeIds.has(edge.targetNodeId) ||
            (entityIdByNode.get(edge.sourceNodeId)
              ? focusEntityIds.has(entityIdByNode.get(edge.sourceNodeId)!)
              : false) ||
            (entityIdByNode.get(edge.targetNodeId)
              ? focusEntityIds.has(entityIdByNode.get(edge.targetNodeId)!)
              : false)),
        inAttentionRegion:
          Boolean(regionOf.get(edge.sourceNodeId) && regionOf.get(edge.sourceNodeId) === regionOf.get(edge.targetNodeId)),
      }),
    );
  }

  return { nodes: nodesMap, edges: edgesMap, regions, focus: input.focusSeed ?? null };
}

function relevanceForEdge(
  edge: GraphEdge,
  sourceNode: GraphNode,
  targetNode: GraphNode,
  relevantNodes: (node: GraphNode) => boolean,
): HypothesisRelevance | null {
  const sourceRelevant = relevantNodes(sourceNode);
  const targetRelevant = relevantNodes(targetNode);
  if (!sourceRelevant && !targetRelevant) return null;
  return edge.status === "CONTRADICTED" ? "contradicting" : "supporting";
}

/** Default state for a node not covered by the visual context (safe fallback). */
export const DEFAULT_NODE_VISUAL_STATE: GraphNodeVisualState = {
  selected: false,
  focused: false,
  hovered: false,
  structuralRole: "standard",
  evidencePosture: "unknown",
  temporal: "in-range",
  caseScope: "local",
  hypothesisRelevance: null,
  evidenceInScope: false,
  gapAffected: false,
  attentionLevel: 0,
};

export const DEFAULT_EDGE_VISUAL_STATE: GraphEdgeVisualState = {
  supportBand: "moderate",
  posture: "unknown",
  grounded: false,
  caseScope: "local",
  temporal: "in-range",
  hypothesisRelevance: null,
  evidenceInScope: false,
  gapAffected: false,
  incidentToSelection: false,
  selected: false,
  attentionLevel: 0,
};