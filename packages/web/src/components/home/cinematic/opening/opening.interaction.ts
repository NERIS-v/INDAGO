// ============================================================================
// PR — INDAGO Cinematic Home Opening · Interaction
//
// Pointer support WITHOUT drag: hovering a node lifts it gently, tapping (at
// the end of the scrub) pins a focus with both a stronger lift and a soft
// emphasis pulled across its neighbours. All hit-testing is pure + frozen by
// tests; the runtime blobs are mutated by the scene's compute owner, never by
// React. Reduced motion builds NO interaction (null).
// ============================================================================

import type {
  OpeningEdgeDefinition,
  OpeningGraphBundle,
  OpeningInteraction,
  OpeningInteractionLayout,
} from "./opening.types";

export const OPENING_HIT_RADIUS = 0.5;
export const OPENING_COARSE_HIT_MULT = 2.2;
export const OPENING_HOVER_RADIUS = 0.72;
export const OPENING_HOVER_EMISSION = 0.28;
export const OPENING_HOVER_SCALE = 1.22;
export const OPENING_FOCUS_EMISSION = 0.55;
export const OPENING_FOCUS_SCALE = 1.5;
export const OPENING_NEIGHBOUR_EMISSION = 0.12;
export const OPENING_FOCUS_EDGE_MULT = 1.6;
export const OPENING_HOVER_EDGE_MULT = 1.35;
export const OPENING_INTERACTION_HALF_LIFE = 0.12;

/** Build the immutable adjacency for one bundle. */
export function buildOpeningInteractionLayout(
  bundle: OpeningGraphBundle,
): OpeningInteractionLayout {
  const nodeIndexById = new Map<string, number>();
  bundle.nodes.forEach((node, index) => nodeIndexById.set(node.id, index));

  const neighborsByNodeId = new Map<string, string[]>();
  for (const node of bundle.nodes) {
    neighborsByNodeId.set(node.id, []);
  }
  for (const edge of bundle.edges) {
    neighborsByNodeId.get(edge.source)?.push(edge.target);
    neighborsByNodeId.get(edge.target)?.push(edge.source);
  }

  return { nodeIndexById, neighborsByNodeId, edgeCount: bundle.edges.length };
}

/** Fresh mutable interaction runtime (buffers prewarmed with their neutral). */
export function createOpeningInteraction(
  bundle: OpeningGraphBundle,
  coarse: boolean,
): OpeningInteraction {
  const layout = buildOpeningInteractionLayout(bundle);
  const nodeEmission = new Float32Array(bundle.nodes.length);
  const nodeScale = new Float32Array(bundle.nodes.length).fill(1);
  const edgeMult = new Float32Array(bundle.edges.length).fill(1);
  return {
    layout,
    coarse,
    active: true,
    focusedId: null,
    hoveredId: null,
    cursor: { x: 0, y: 0, inside: false },
    focusStrength: 0,
    hoverStrength: 0,
    focusRevision: 0,
    nodeEmission,
    nodeScale,
    edgeMult,
  };
}

/** Nearest of `xs/ys` within `radius` of (x, y); -1 when none. */
export function findNearestPoint(
  x: number,
  y: number,
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  radius: number,
): number {
  const radiusSq = radius * radius;
  let best = -1;
  let bestSq = radiusSq;
  for (let i = 0; i < count; i += 1) {
    const dx = x - xs[i]!;
    const dy = y - ys[i]!;
    const dSq = dx * dx + dy * dy;
    if (dSq <= bestSq) {
      bestSq = dSq;
      best = i;
    }
  }
  return best;
}

interface OpeningNodeEmphasis {
  readonly emission: number;
  readonly scale: number;
}

/** Per-node emission/scale from the current focus/hover state (pure). */
export function openingNodeEmphasis(
  focused: boolean,
  hovered: boolean,
  focusedNeighbour: boolean,
): OpeningNodeEmphasis {
  if (focused) return { emission: OPENING_FOCUS_EMISSION, scale: OPENING_FOCUS_SCALE };
  if (hovered) return { emission: OPENING_HOVER_EMISSION, scale: OPENING_HOVER_SCALE };
  if (focusedNeighbour) {
    return { emission: OPENING_NEIGHBOUR_EMISSION, scale: 1 };
  }
  return { emission: 0, scale: 1 };
}

/** Edge multiplier when either endpoint is focused or hovered (pure). */
export function openingEdgeMultiplier(
  a: string,
  b: string,
  focusedId: string | null,
  hoveredId: string | null,
): number {
  const focused = focusedId !== null && (a === focusedId || b === focusedId);
  if (focused) return OPENING_FOCUS_EDGE_MULT;
  if (hoveredId !== null && (a === hoveredId || b === hoveredId)) {
    return OPENING_HOVER_EDGE_MULT;
  }
  return 1;
}

/** Exponential approach toward `target` from `current` (dt in seconds). */
export function approach(
  current: number,
  target: number,
  dt: number,
  halfLife: number = OPENING_INTERACTION_HALF_LIFE,
): number {
  if (halfLife <= 0) return target;
  return current + (target - current) * (1 - Math.pow(0.5, dt / halfLife));
}

/** Cross-check: every edge's endpoints exist in the bundle's adjacency. */
export function assertOpeningInteractionConsistent(
  bundle: OpeningGraphBundle,
  layout: OpeningInteractionLayout,
): boolean {
  if (layout.edgeCount !== bundle.edges.length) return false;
  for (const edge of bundle.edges) {
    if (!layout.nodeIndexById.has(edge.source)) return false;
    if (!layout.nodeIndexById.has(edge.target)) return false;
    if (!layout.neighborsByNodeId.get(edge.source)?.includes(edge.target)) return false;
    if (!layout.neighborsByNodeId.get(edge.target)?.includes(edge.source)) return false;
  }
  return true;
}

/** Edge lookups the scene needs per frame (no object churn). */
export function edgeEndpointIndices(
  edges: readonly OpeningEdgeDefinition[],
): { readonly source: Uint16Array; readonly target: Uint16Array } {
  const source = new Uint16Array(edges.length);
  const target = new Uint16Array(edges.length);
  edges.forEach((edge, i) => {
    source[i] = edge.sourceIndex;
    target[i] = edge.targetIndex;
  });
  return { source, target };
}