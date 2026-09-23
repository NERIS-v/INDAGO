"use client";

import { useMemo, useRef, useState, useEffect, type MutableRefObject } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphNode, GraphEdge } from "@indago/contracts";

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** d3 drag pinning: when set, the node is pinned at this position. */
  fx?: number | null;
  fy?: number | null;
  communityId: number;
  isBridge: boolean;
  /** True only on the render where this node first appeared. Consumers use
   *  this to play a "materialize" / burst-arrival treatment instead of the
   *  full-graph entrance animation replaying on every update. */
  isNewArrival: boolean;
}

export interface LayoutEdge extends GraphEdge {
  isBridge: boolean;
  isNewArrival: boolean;
}

export interface CommunityRegion {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

/** A live simulation node: intersection (not union) of LayoutNode with d3's
 *  datum so optional fx/fy resolve against d3's required numeric types. */
type SimNode = LayoutNode & SimulationNodeDatum;

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  source: SimNode;
  target: SimNode;
}

export interface GraphViewport {
  width: number;
  height: number;
}

export interface GraphSimulationControls {
  hoveredNodeId: string | null;
  focusedNodeId: string | null;
  reducedMotion: boolean;
}

/** True simulation "is it still?" signal, derived from the same physics state
 *  as `active`/`settled` — NOT an arbitrary timer. `moving` means the sim is
 *  actively re-ticking (initial layout, drag, wake, data repositioning);
 *  `settled` means it reached genuine rest (alpha low AND no node velocity).
 *  F-PR17: the analytical focus aura consumes this to hide during motion and
 *  commit at the node's CURRENT settled position. */
export type GraphMotionState = "moving" | "settled";

/**
 * Imperative controls the canvas uses to interact with the live simulation.
 * The hook owns all physics state; the canvas only calls into this API (and
 * never branches on DataMode / provider internals).
 */
export interface GraphSimAPI {
  /** True while the simulation is actively re-ticking (settling or dragging). */
  isActive(): boolean;
  /** Register a per-tick callback for imperative DOM position sync. */
  onTick(cb: () => void): void;
  /** Hover / focus influence the local force field (see focusBias force). */
  setHover(id: string | null): void;
  setFocus(id: string | null): void;
  /** Begin a pinned drag: wake the simulation, hold the node in place. */
  beginDrag(id: string): void;
  /** Update the pinned node's world-space position while dragging. */
  moveNode(id: string, x: number, y: number): void;
  /** Release the pin; the simulation settles softly. */
  endDrag(id: string): void;
}

export interface LayoutBox {
  layoutNodes: LayoutNode[];
  layoutEdges: LayoutEdge[];
  communities: CommunityRegion[];
}

interface LayoutResult {
  layoutRef: MutableRefObject<LayoutBox>;
  apiRef: MutableRefObject<GraphSimAPI>;
  settled: boolean;
  /** F-PR17: reaction-grade graph stillness. False while physics re-tick,
   *  true once the simulation reaches genuine rest (see GraphMotionState). */
  motionState: GraphMotionState;
}

// Boundary clamp margin. Kept small so nodes can spring freely across most of
// the canvas; we only pull a node back when it genuinely leaves the safe area.
const NODE_MARGIN_X = 26;
const NODE_MARGIN_Y = 20;

// ─── Physics lifecycle ───────────────────────────────────────────────────────
//
// The graph is QUIET at rest. It only wakes on meaningful interaction or data
// change. There is no continuous drift, no random breathing, no perpetual motion.
//
//   IDLE  →  (hover / drag / new data)  →  WAKE  →  SETTLE  →  IDLE
//
// Alpha model:
//   - Initial layout: alpha = 1, decays via alphaDecay.
//   - Hover wake: alphaTarget raised briefly, then dropped to 0.
//   - Drag: alphaTarget raised for network response.
//   - Release: alphaTarget dropped to 0, sim decays and stops.
//   - At rest: simulation timer is stopped (d3 emits `end`).
const DRAG_ALPHA = 0.17;
const HOVER_ALPHA = 0.07;

// Velocity / alpha thresholds for detecting idle state.
const IDLE_ALPHA_MIN = 0.001;
const IDLE_VELOCITY_MAX = 0.15;

// The boundary clamp only applies to ENERGETIC simulations. A near-frozen
// rebuild (resize-only carry-over) must never snap nodes into a shrunken
// canvas in a single frame — that hard clamp is the visible "abrupt cut"
// during a mid-move viewport change. Low-energy sims ride through at their
// live positions and reflow on the next full-content build.
const CLAMP_MIN_ALPHA = 0.05;

// Interaction-state damping. The graph is more responsive (less damped) while
// the user is dragging so nearby nodes yield and stretch as real springs, and
// returns to normal damping so it settles to a calm rest afterward.
const BASE_VELOCITY_DECAY = 0.42;
const DRAG_VELOCITY_DECAY = 0.22;

// Safety velocity cap during drag to prevent graph explosion on fast throws.
// High enough that a normal fast drag feels live, low enough to avoid a blast.
const DRAG_VELOCITY_CAP = 12;

// ─── Pure coordinate transforms (screen <-> world) ───────────────────────────
// The SVG content group applies: translate(pan) translate(cx,cy) scale(zoom)
// translate(-cx,-cy). screenToWorld is the exact inverse, so a node dragged at
// any zoom/pan stays glued to the cursor. All pure; no DOM access.

/** Convert a pointer position in SVG-local pixels into graph/world units. */
export function screenToWorld(
  sx: number,
  sy: number,
  pan: { x: number; y: number },
  zoom: number,
  cx: number,
  cy: number
): { x: number; y: number } {
  if (zoom === 0) return { x: cx, y: cy };
  return {
    x: cx + (sx - pan.x - cx) / zoom,
    y: cy + (sy - pan.y - cy) / zoom,
  };
}

/** Inverse of screenToWorld. */
export function worldToScreen(
  x: number,
  y: number,
  pan: { x: number; y: number },
  zoom: number,
  cx: number,
  cy: number
): { x: number; y: number } {
  return {
    x: pan.x + cx + zoom * (x - cx),
    y: pan.y + cy + zoom * (y - cy),
  };
}

// ─── Structural analysis (components + Tarjan bridges) ───────────────────────
// Memoized on data only so it never re-runs every physics tick.
// Pure graph semantics — NOT physics.

/** Computes exact bridge edges (cut edges) via Tarjan's low-link DFS in O(V+E). */
export function findBridgeEdges(
  nodeIds: string[],
  adjacency: Map<string, { neighbor: string; edgeId: string }[]>
): Set<string> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const visited = new Set<string>();
  const bridgeEdgeIds = new Set<string>();
  let timer = 0;

  function dfs(u: string, parentEdgeId: string | null) {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer += 1;

    for (const { neighbor: v, edgeId } of adjacency.get(u) ?? []) {
      if (edgeId === parentEdgeId) continue;
      if (!visited.has(v)) {
        dfs(v, edgeId);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) {
          bridgeEdgeIds.add(edgeId);
        }
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id, null);
  }

  return bridgeEdgeIds;
}

/** Non-linear node radius based on structural importance. Shared by the layout
 *  (collision radius) and the canvas renderer. */
export function nodeVisualRadius(importance: number | undefined): number {
  const clamped = Math.max(0, Math.min(1, importance ?? 0.5));
  return 5 + Math.pow(clamped, 1.3) * 13;
}

function analyzeCommunityAndBridges(nodes: GraphNode[], edges: GraphEdge[]) {
  const structuralEdges = edges.filter((e) => e.status === "ACTIVE");

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n.id, new Set()));
  structuralEdges.forEach((e) => {
    adjacency.get(e.sourceNodeId)?.add(e.targetNodeId);
    adjacency.get(e.targetNodeId)?.add(e.sourceNodeId);
  });

  const communityOf = new Map<string, number>();
  let communityCount = 0;
  nodes.forEach((n) => {
    if (communityOf.has(n.id)) return;
    const queue = [n.id];
    communityOf.set(n.id, communityCount);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const neighbor of adjacency.get(cur) ?? []) {
        if (!communityOf.has(neighbor)) {
          communityOf.set(neighbor, communityCount);
          queue.push(neighbor);
        }
      }
    }
    communityCount += 1;
  });

  const dfsAdjacency = new Map<string, { neighbor: string; edgeId: string }[]>();
  nodes.forEach((n) => dfsAdjacency.set(n.id, []));
  structuralEdges.forEach((e) => {
    dfsAdjacency.get(e.sourceNodeId)?.push({ neighbor: e.targetNodeId, edgeId: e.id });
    dfsAdjacency.get(e.targetNodeId)?.push({ neighbor: e.sourceNodeId, edgeId: e.id });
  });
  const bridgeEdgeIds = findBridgeEdges(
    nodes.map((n) => n.id),
    dfsAdjacency
  );
  const bridgeNodeIds = new Set<string>();
  structuralEdges.forEach((e) => {
    if (bridgeEdgeIds.has(e.id)) {
      bridgeNodeIds.add(e.sourceNodeId);
      bridgeNodeIds.add(e.targetNodeId);
    }
  });

  return { adjacency, communityOf, communityCount, bridgeNodeIds };
}

/** Recompute community fog regions from live positions (geometry only). */
function computeCommunityRegions(
  nodeArray: SimNode[],
  communityCount: number
): CommunityRegion[] {
  const grouped = new Map<number, SimNode[]>();
  for (const n of nodeArray) {
    const arr = grouped.get(n.communityId) ?? [];
    arr.push(n);
    grouped.set(n.communityId, arr);
  }
  const result: CommunityRegion[] = [];
  for (let id = 0; id < communityCount; id++) {
    const members = grouped.get(id);
    if (!members || members.length < 2) continue;
    const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
    const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
    const r = Math.max(...members.map((n) => Math.hypot(n.x - cx, n.y - cy))) + 46;
    result.push({ id, cx, cy, r });
  }
  return result;
}

/**
 * Persistent d3-force physics graph — physical, tactile, calm.
 *
 * Architecture boundary (kept from F-PR2/F-PR4): this hook receives canonical
 * GraphProvider data and only owns MOTION. It never defines intelligence
 * semantics — community detection, Tarjan bridges, positions cache and
 * isNewArrival are computed for presentation and live-update stability, not by
 * d3. D3 owns physics + dragging lifecycle only.
 *
 * Lifecycle:
 *   - QUIET at rest. No continuous drift, no random breathing.
 *   - Wakes on hover / drag / new data → responds locally → settles → stops.
 *   - Deterministic: no Math.random() anywhere; first layout uses a fixed
 *     ring seed and subsequent builds reuse the position cache.
 *   - Reduced motion: sim is stopped and drag moves nodes one-shot, so
 *     `prefers-reduced-motion` users see static layout, not continuous flow.
 */
export function useGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  controls: GraphSimulationControls = {
    hoveredNodeId: null,
    focusedNodeId: null,
    reducedMotion: false,
  }
): LayoutResult {
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map());
  const seenNodeIds = useRef<Set<string>>(new Set());
  const seenEdgeIds = useRef<Set<string>>(new Set());
  // PR-3 UX fix ("double-shot"): the LAST LIVE node positions observed by the
  // running simulation, kept in a component-level ref that SURVIVES effect
  // rebuilds. The previous carry-over read simRef.current, which the prior
  // effect's cleanup nulls BEFORE the next build runs — so every rebuild fell
  // back to the stale positionCache (foreign islands still at their off-canvas
  // spawn snapshot) and visibly teleported + re-flew the whole island again.
  const livePositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  // PR-3 UX fix: the live physics energy (simulation alpha) survives rebuilds
  // the same way; a resize-triggered rebuild must resume gently, never blast
  // the graph back to full alpha (that replay is the visible "double shot").
  const lastAlphaRef = useRef(0);
  // PR-3 UX fix: distinguish a no-op rebuild (same content AND viewport → skip
  // entirely) from a resize-only rebuild (same nodes/edges, new viewport →
  // resume gently without flipping `settled`).
  const lastContentKeyRef = useRef<string | null>(null);
  const lastViewportKeyRef = useRef<string | null>(null);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  // Canvas registers its imperative DOM-sync callback here; the hook calls it
  // from the single d3 lifecycle handlers owned by the build effect.
  const tickCbRef = useRef<() => void>(() => undefined);

  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const settledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F-PR17 motion state: flips only on genuine physics state transitions so it
  // never re-renders spinners; the canvas's focus aura keys off these edges.
  const [motionState, setMotionState] = useState<GraphMotionState>("moving");
  const motionStateRef = useRef<GraphMotionState>("moving");

  function syncMotion(next: GraphMotionState) {
    if (motionStateRef.current === next) return;
    motionStateRef.current = next;
    setMotionState(next);
  }

  const simRef = useRef<{
    simulation: ReturnType<typeof forceSimulation<SimNode>>;
    nodesById: Map<string, SimNode>;
    nodeArray: SimNode[];
    links: SimLink[];
    layoutEdges: LayoutEdge[];
    communityCount: number;
    active: boolean;
    dragging: boolean;
  } | null>(null);

  const layoutRef = useRef<LayoutBox>({
    layoutNodes: [],
    layoutEdges: [],
    communities: [],
  });

  const apiRef = useRef<GraphSimAPI>({
    isActive: () => simRef.current?.active ?? false,
    onTick: (cb: () => void) => {
      tickCbRef.current = cb;
    },
    setHover: () => undefined,
    setFocus: () => undefined,
    beginDrag: () => undefined,
    moveNode: () => undefined,
    endDrag: () => undefined,
  });

  // Structural analysis — memoized on data only, never per physics tick.
  const structure = useMemo(() => {
    if (!nodes.length) {
      return {
        layoutEdges: [] as LayoutEdge[],
        adjacency: new Map<string, Set<string>>(),
        communityOf: new Map<string, number>(),
        communityCount: 0,
        bridgeNodeIds: new Set<string>(),
      };
    }
    const { adjacency, communityOf, communityCount, bridgeNodeIds } = analyzeCommunityAndBridges(nodes, edges);
    const prevEdgeIds = seenEdgeIds.current;
    const isFirstLayout = seenNodeIds.current.size === 0;
    const layoutEdges: LayoutEdge[] = edges
      .filter((e) => e.status !== "ARCHIVED")
      .map((e) => ({
        ...e,
        isBridge: bridgeNodeIds.has(e.sourceNodeId) || bridgeNodeIds.has(e.targetNodeId),
        isNewArrival: !isFirstLayout && !prevEdgeIds.has(e.id),
      }));
    seenEdgeIds.current = new Set(edges.map((e) => e.id));
    return { layoutEdges, adjacency, communityOf, communityCount, bridgeNodeIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // (Re)build the persistent simulation when the data shape or viewport changes.
  useEffect(() => {
    if (!nodes.length || width === 0 || height === 0) {
      simRef.current = null;
      layoutRef.current = { layoutNodes: [], layoutEdges: [], communities: [] };
      settledRef.current = false;
      setSettled(false);
      return;
    }

    const sortedNodeKey = nodes.map((n) => n.id).sort().join(",");
    const sortedEdgeKey = edges.map((e) => e.id).sort().join(",");
    const contentKey = `${sortedNodeKey}|${sortedEdgeKey}`;
    const viewportKey = `${width}x${height}`;
    const sameContent = lastContentKeyRef.current !== null && lastContentKeyRef.current === contentKey;
    const sameEverything = sameContent && lastViewportKeyRef.current === viewportKey;
    // Only skip when there is a LIVE simulation to preserve. If a transient
    // empty frame (or an early return) previously nulled simRef, a same-content
    // rebuild MUST still run to revive the graph — otherwise interaction
    // (drag/hover/focus) stays dead forever while nodes keep rendering.
    if (sameEverything && simRef.current) {
      // Keep the live simulation untouched — no teardown, no settled flip, no
      // position teleport. A no-op rebuild would otherwise restart the physics
      // and replay the foreign island's entrance.
      return;
    }
    // A RESIZE-ONLY rebuild (same nodes/edges, new viewport) must not replay
    // anything: it carries every node forward from its live position and resumes
    // the simulation at its current energy instead of a full alpha(1) restart,
    // so the graph stays perfectly still across the resize.
    const isResizeOnly = sameContent;
    lastContentKeyRef.current = contentKey;
    lastViewportKeyRef.current = viewportKey;

    const isFirstLayout = seenNodeIds.current.size === 0;
    const cache = positionCache.current;
    // Live positions observed by the (possibly just-torn-down) simulation.
    // livePositionsRef is a stable component ref, so it is valid even on
    // rebuilds where simRef was already nulled by the previous cleanup.
    const prevPositions = livePositionsRef.current;
    const { adjacency, communityOf, communityCount, bridgeNodeIds } = structure;

    // Seeding: reuse the current live position for existing nodes (so live
    // growth never collapses or jumps the graph); genuinely new nodes spawn
    // near an already-placed neighbor and are flagged isNewArrival.
    // Deterministic otherwise.
    const nodeArray: SimNode[] = nodes.map((n, i) => {
      const cId = communityOf.get(n.id) ?? 0;
      const live = prevPositions?.get(n.id);
      const cached = cache.get(n.id);
      const isNewArrival = !isFirstLayout && !seenNodeIds.current.has(n.id);

      let x: number;
      let y: number;
      let spawnVx = 0;
      let spawnVy = 0;
      if (live) {
        x = live.x;
        y = live.y;
      } else if (cached) {
        x = cached.x;
        y = cached.y;
      } else {
        const neighborIds = [...(adjacency.get(n.id) ?? [])];
        const placedNeighbor = neighborIds
          .map((id) => prevPositions?.get(id) ?? cache.get(id))
          .find((p): p is { x: number; y: number } => Boolean(p));
        if (isFirstLayout) {
          const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI;
          const radius = Math.min(width, height) * 0.35;
          x = width / 2 + radius * Math.cos(angle);
          y = height / 2 + radius * Math.sin(angle);
        } else {
          // Obsidian-style entrance: the node begins just OUTSIDE the canvas,
          // along the ray from the viewport center through where it will land
          // (its nearest placed neighbor, else the canvas center), and is given
          // a strong inward velocity so it flies in and spring-connects fast.
          const anchorX = placedNeighbor ? placedNeighbor.x : width / 2;
          const anchorY = placedNeighbor ? placedNeighbor.y : height / 2;
          let dirX = anchorX - width / 2;
          let dirY = anchorY - height / 2;
          const rayLen = Math.hypot(dirX, dirY);
          if (rayLen < 1) {
            const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI + Math.PI / 3;
            dirX = Math.cos(angle);
            dirY = Math.sin(angle);
          } else {
            dirX /= rayLen;
            dirY /= rayLen;
          }
          const exitX = Math.abs(dirX) > 1e-6 ? width / 2 / Math.abs(dirX) : Infinity;
          const exitY = Math.abs(dirY) > 1e-6 ? height / 2 / Math.abs(dirY) : Infinity;
          const exitDist = Math.min(exitX, exitY);
          x = width / 2 + dirX * (exitDist + 44);
          y = height / 2 + dirY * (exitDist + 44);
          const ax = anchorX - x;
          const ay = anchorY - y;
          const al = Math.hypot(ax, ay) || 1;
          spawnVx = (ax / al) * 9;
          spawnVy = (ay / al) * 9;
        }
      }

      return {
        ...n,
        x,
        y,
        vx: spawnVx,
        vy: spawnVy,
        communityId: cId,
        isBridge: bridgeNodeIds.has(n.id),
        isNewArrival,
      } as SimNode;
    });

    const nodesById = new Map<string, SimNode>();
    nodeArray.forEach((n) => nodesById.set(n.id, n));

    const links: SimLink[] = structure.layoutEdges
      .map((e) => {
        const source = nodesById.get(e.sourceNodeId);
        const target = nodesById.get(e.targetNodeId);
        if (!source || !target) return null;
        return { ...e, id: e.id, source, target } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    const simulation = forceSimulation<SimNode>(nodeArray)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          // Bounded preferred distance gives each relationship physical room to
          // stretch. High-importance structures rest tighter (~96px); normal and
          // low-importance relationships rest looser (up to ~204px). This is
          // presentation geometry only — importance is never a "truth" force.
          //   high imp: ~96px   normal (~0.5): ~150px   low: ~204px
          .distance((d) => {
            const importance = Math.min(1, (d.source.structuralImportance + d.target.structuralImportance) / 2);
            return 96 + (1 - importance) * 108;
          })
          // Stronger elastic link response (spring pull-back toward equilibrium).
          .strength(0.5)
      )
      // Moderate repulsion — enough to keep nodes apart, not enough to fight
      // the springs and feel rigid.
      .force("charge", forceManyBody<SimNode>().strength(-150))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => nodeVisualRadius(d.structuralImportance) + (d.isBridge ? 6 : 5))
      )
      .force("x", forceX<SimNode>(width / 2).strength(0.018))
      .force("y", forceY<SimNode>(height / 2).strength(0.018))
      .velocityDecay(BASE_VELOCITY_DECAY)
      .alphaDecay(0.03)
      .alpha(1);

    // Bounded hover/focus local force — subtle, localized, never rearranges the
    // graph globally. Only direct neighbors are attracted; nearby unrelated nodes
    // are gently repelled. The effect scales with alpha so it fades as the
    // simulation settles.
    simulation.force("focusBias", (alpha: number) => {
      const c = controlsRef.current;
      if (c.reducedMotion) return;
      const activeId = c.hoveredNodeId ?? c.focusedNodeId;
      if (!activeId) return;
      const anchor = nodesById.get(activeId);
      if (!anchor || !nodeArray.length) return;

      // Scale the effect with alpha so it fades as the simulation settles.
      const k = Math.min(1, alpha * 4);

      // Build neighbor set for O(1) lookup (only direct links).
      const neighborIds = new Set<string>();
      for (const l of links) {
        if (l.source.id === activeId) neighborIds.add(l.target.id);
        else if (l.target.id === activeId) neighborIds.add(l.source.id);
      }

      for (const n of nodeArray) {
        if (n.id === activeId) continue;
        const dx = n.x - anchor.x;
        const dy = n.y - anchor.y;
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        if (neighborIds.has(n.id)) {
          // Direct neighbors: gentle pull toward equilibrium distance.
          if (dist > 120) {
            const pull = Math.min(0.25, (dist - 120) * 0.003) * k;
            n.vx -= dirX * pull;
            n.vy -= dirY * pull;
          }
        } else if (dist < 180) {
          // Unrelated nodes within 180px: gentle push away.
          const repel = Math.max(0, (180 - dist) * 0.004) * k;
          n.vx += dirX * repel;
          n.vy += dirY * repel;
        }
        // Nodes beyond 180px: completely unaffected.
      }
    });

    // Stop the simulation immediately — it starts idle. It will be woken
    // by hover, drag, or data change through the API.
    simulation.stop();

    const syncToLayoutRef = () => {
      if (!simRef.current) return;
      layoutRef.current.layoutNodes = simRef.current.nodeArray;
      layoutRef.current.layoutEdges = simRef.current.layoutEdges;
      layoutRef.current.communities = computeCommunityRegions(
        simRef.current.nodeArray,
        simRef.current.communityCount
      );
      livePositionsRef.current = new Map(
        simRef.current.nodeArray.map((n) => [n.id, { x: n.x, y: n.y }])
      );
    };

    simRef.current = {
      simulation,
      nodesById,
      nodeArray,
      links,
      layoutEdges: structure.layoutEdges,
      communityCount,
      // The simulation is considered "active" whenever it is running physics —
      // true right after build (we call `restart()` to run the initial layout),
      // false under reduced-motion. It flips back to false when the sim settles
      // to idle (markIdle) or is stopped in cleanup.
      active: !controlsRef.current.reducedMotion,
      dragging: false,
    };
    syncToLayoutRef();

    // ─── Idle detection ──────────────────────────────────────────────────
    // The simulation is idle when alpha is sufficiently low AND no node has
    // meaningful velocity. This is the true "graph is still" signal.
    function isIdle(): boolean {
      if (!simRef.current) return true;
      const sim = simRef.current.simulation;
      if (sim.alpha() > IDLE_ALPHA_MIN) return false;
      let maxV = 0;
      for (const n of simRef.current.nodeArray) {
        const v = Math.hypot(n.vx ?? 0, n.vy ?? 0);
        if (v > maxV) maxV = v;
      }
      return maxV < IDLE_VELOCITY_MAX;
    }

    function markIdle() {
      if (!simRef.current) return;
      simRef.current.active = false;
      simRef.current.dragging = false;
      // F-PR17: the simulation reached genuine rest -> consume the settle edge.
      syncMotion("settled");
      // Persist final positions.
      const nextCache = new Map<string, { x: number; y: number }>();
      simRef.current.nodeArray.forEach((n) => nextCache.set(n.id, { x: n.x, y: n.y }));
      positionCache.current = nextCache;
      livePositionsRef.current = nextCache;
      lastAlphaRef.current = 0;
      seenNodeIds.current = new Set(simRef.current.nodeArray.map((n) => n.id));
      if (!settledRef.current) {
        settledRef.current = true;
        setSettled(true);
      }
      tickCbRef.current();
    }

    // Single d3 lifecycle handlers — immutable tick/end wiring for this sim.
    simulation.on("tick", () => {
      if (!simRef.current) return;
      simRef.current.active = true;
      // F-PR17: any live re-tick counts as motion until the sim stops for real.
      syncMotion("moving");
      const { nodeArray: arr, simulation: sim } = simRef.current;
      // Persist the live energy so a resize-only rebuild can resume the
      // simulation where it left off instead of blasting it back to alpha(1).
      lastAlphaRef.current = sim.alpha();

      // During drag, lower damping so the network responds / yields like real
      // springs, and cap excessive velocity to prevent an explosion.
      if (simRef.current.dragging) {
        sim.velocityDecay(DRAG_VELOCITY_DECAY);
        for (const n of arr) {
          if (n.fx != null) continue;
          const v = Math.hypot(n.vx ?? 0, n.vy ?? 0);
          if (v > DRAG_VELOCITY_CAP) {
            const scale = DRAG_VELOCITY_CAP / v;
            n.vx = (n.vx ?? 0) * scale;
            n.vy = (n.vy ?? 0) * scale;
          }
        }
      } else {
        sim.velocityDecay(BASE_VELOCITY_DECAY);
      }

      // Soft boundary: only pull a node back when it genuinely leaves the safe
      // canvas region. Do not anchor nodes to an interior margin — springs must
      // be able to stretch and move naturally near the edges.
      //
      // The clamp is gated on simulation energy: a near-frozen resize rebuild
      // must not snap nodes back once the canvas shrank (that one-frame jump is
      // the visible "abrupt cut" mid-reveal). It holds live positions instead
      // and reflows on the next full-content build.
      if (sim.alpha() > CLAMP_MIN_ALPHA) {
        for (const n of arr) {
          n.x = Math.max(NODE_MARGIN_X - 40, Math.min(width - NODE_MARGIN_X + 40, n.x));
          n.y = Math.max(NODE_MARGIN_Y - 40, Math.min(height - NODE_MARGIN_Y + 40, n.y));
        }
      }
      syncToLayoutRef();
      tickCbRef.current();

      // Precise idle detection: alpha sufficiently low AND no node moving.
      // Velocity-aware so a fast release that left residual energy keeps
      // ticking (soft rebound) until it is genuinely still — and only then
      // the simulation stops/timer ends.
      if (simRef.current && !simRef.current.dragging && isIdle()) {
        sim.stop();
        markIdle();
      }
    });

    simulation.on("end", () => {
      markIdle();
    });

    // Persist caching/seen sets synchronously so a subsequent build (a newly
    // arrived node, or a fresh viewport) can restore existing positions and
    // flag new arrivals even when the simulation stops via the idle timer.
    positionCache.current = new Map(
      simRef.current.nodeArray.map((n) => [n.id, { x: n.x, y: n.y }])
    );
    livePositionsRef.current = new Map(
      simRef.current.nodeArray.map((n) => [n.id, { x: n.x, y: n.y }])
    );
    seenNodeIds.current = new Set(simRef.current.nodeArray.map((n) => n.id));

    // Start the initial layout — the simulation runs, decays, and stops.
    // When it stops, `end` fires and marks the graph as idle. The app-level
    // `settled` flag additionally latches on a short timer so entrance visuals
    // (auto-fit, bloom) fire promptly after the initial layout converges rather
    // than waiting for full idle decay. `settled` is a latch: once true it
    // stays true; it represents "graph is in a restful, stable state".
    //
    // PR-3 UX fix: a RESIZE-ONLY rebuild (same nodes/edges, new viewport)
    // must not flip `settled` or re-arm the latch, and it resumes at the
    // previous simulation energy instead of restarting at alpha(1). A fresh
    // alpha(1) blast re-simulates the whole graph and replays the settlement
    // motion — that mid-camera-move re-settle is the visible "double shot" in
    // the cross-case reveal.
    if (!isResizeOnly) {
      setSettled(false);
      settledRef.current = false;
      if (settledTimer.current) clearTimeout(settledTimer.current);
      settledTimer.current = setTimeout(() => {
        settledRef.current = true;
        setSettled(true);
      }, 500);
    }
    // A RESIZE-ONLY rebuild must not visibly re-settle: every node is carried
    // forward from its live position (no respawn), so the only thing left to do
    // is re-attach forces to the new viewport — run at a near-frozen energy so
    // the graph sits perfectly still through any mid-move camera transition.
    // Content changes still get the full alpha(1) run (fly-in + re-settle).
    const resumeEnergy = isResizeOnly ? Math.min(lastAlphaRef.current, 0.02) : 1;
    simulation.alpha(resumeEnergy).restart();

    return () => {
      if (settledTimer.current) {
        clearTimeout(settledTimer.current);
        settledTimer.current = null;
      }
      lastAlphaRef.current = simulation.alpha();
      simulation.on("tick", null);
      simulation.on("end", null);
      simulation.stop();
      simRef.current = null;
    };
    // width/height intentionally captured for viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, width, height]);

  // ─── Imperative controls ───────────────────────────────────────────────
  // Setters mutate the running lifecycle and never read provider data or
  // encode domain meaning.

  apiRef.current.setHover = (id: string | null) => {
    controlsRef.current.hoveredNodeId = id;
    const sim = simRef.current;
    if (!sim || controlsRef.current.reducedMotion || sim.dragging) return;
    if (id) {
      // Wake briefly for local hover response. alphaTarget controls how
      // much energy the sim receives; dropping it to 0 lets it settle
      // back naturally.
      sim.simulation.alpha(Math.max(sim.simulation.alpha(), HOVER_ALPHA));
      sim.simulation.alphaTarget(HOVER_ALPHA);
      sim.active = true;
      // restart() is idempotent in d3-timer (safe on a running timer).
      sim.simulation.restart();
    } else {
      // Clear hover: let the sim decay to idle.
      sim.simulation.alphaTarget(0);
    }
  };

  apiRef.current.setFocus = (id: string | null) => {
    controlsRef.current.focusedNodeId = id;
    const sim = simRef.current;
    if (!sim || controlsRef.current.reducedMotion || sim.dragging) return;
    if (id) {
      // F-PR17: focus is ONE analytical flex — a short wake that DECAYS to
      // genuine rest, so the settled edge fires and the focus aura can commit
      // at the node's current position. A persistent alphaTarget (hover-style
      // breathing) would keep the sim humming at 0.07 forever and the aura
      // would never commit.
      if (sim.simulation.alpha() < HOVER_ALPHA) {
        sim.simulation.alpha(HOVER_ALPHA);
      }
      sim.simulation.alphaTarget(0);
      sim.active = true;
      // restart() is idempotent in d3-timer (safe on a running timer).
      sim.simulation.restart();
    } else {
      // Clear focus: let the sim decay to idle.
      sim.simulation.alphaTarget(0);
    }
  };

  apiRef.current.beginDrag = (id: string) => {
    const sim = simRef.current;
    if (!sim) return;
    const node = sim.nodesById.get(id);
    if (!node) return;
    node.fx = node.x;
    node.fy = node.y;
    sim.active = true;
    sim.dragging = true;
    if (controlsRef.current.reducedMotion) {
      sim.simulation.alpha(0);
    } else {
      // Wake the simulation for a visible network response during drag.
      sim.simulation.alpha(Math.max(sim.simulation.alpha(), DRAG_ALPHA));
      sim.simulation.alphaTarget(DRAG_ALPHA);
      sim.simulation.restart();
    }
  };

  apiRef.current.moveNode = (id: string, x: number, y: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const node = sim.nodesById.get(id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
    if (controlsRef.current.reducedMotion) {
      sim.simulation.tick();
    }
    // During normal drag, the pinned position drives the simulation;
    // link/charge/collision forces react naturally. No manual alpha bump
    // is needed — the existing DRAG_ALPHA target keeps the network alive.
  };

  apiRef.current.endDrag = (id: string) => {
    const sim = simRef.current;
    if (!sim) return;
    const node = sim.nodesById.get(id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    sim.dragging = false;
    if (controlsRef.current.reducedMotion) {
      sim.simulation.alphaTarget(0).alpha(0);
      sim.active = false;
    } else {
      // Release: drop the alpha target to 0. The simulation decays from
      // its current alpha, the released node's velocity causes a brief
      // elastic rebound, then the graph settles to rest. The node retains
      // physical velocity from d3-force (fx/fy pinning preserves velocity
      // state), giving a natural "letting go" feel.
      sim.simulation.alphaTarget(0);
    }
  };

  return { layoutRef, apiRef, settled, motionState };
}
