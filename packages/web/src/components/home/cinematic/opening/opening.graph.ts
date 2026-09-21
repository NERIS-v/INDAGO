// ============================================================================
// PR — INDAGO Cinematic Home Opening · Graph generation
//
// One persistent constellation per tier. A deterministic master pool of
// OPENING_MASTER_NODE_COUNT nodes (a whole core knot + bands that read as a
// graph, never a fragment) is defined in reading order; each tier is an exact
// prefix of that master, so every tier is a strict subset of the larger ones
// and a node carries the SAME identity everywhere it appears. Edges are a
// seeded cascade (chains + connectors + core knot + webbing), sliced to each
// tier's budget, and every field that could flicker (decomposeStart,
// releaseStart, phase, drift, accent, formationStart) is derived from a
// per-index PRNG so it is identical across tiers.
//
// Browser-free, allocation-light, and unit-testable: budgets, determinism,
// prefix-subset and the label picks are all frozen by the suites.
// ============================================================================

import type { CinematicQualityTier } from "../cinematic.types";
import {
  OPENING_CLASS_SIZE,
  OPENING_LABEL_POOL,
  OPENING_LAYOUT_FIT_MARGIN,
  OPENING_MASTER_NODE_COUNT,
  OPENING_NODE_SIZE_JITTER,
  OPENING_SEED,
  OPENING_TIER_BUDGETS,
} from "./opening.constants";
import {
  layoutOpeningGraph,
  mulberry32,
  type OpeningEdgePair,
} from "./opening.layout";
import type {
  OpeningEdgeDefinition,
  OpeningGraphBundle,
  OpeningGraphStats,
  OpeningNodeClass,
  OpeningNodeDefinition,
  OpeningPoseView,
} from "./opening.types";

const TYPOGRAPHIC_HASH: Readonly<Record<CinematicQualityTier, number>> = {
  high: OPENING_SEED ^ 0x11111111,
  medium: OPENING_SEED ^ 0x22222222,
  mobile: OPENING_SEED ^ 0x33333333,
  "reduced-motion": OPENING_SEED ^ 0x44444444,
};

/** Per-index PRNG so a node's motion identity is tier-independent. */
function fieldRandom(index: number): () => number {
  return mulberry32(OPENING_SEED ^ Math.imul(index + 1, 0x9e3779b1));
}

/** Per-edge PRNG keyed off the edge's MASTER index (stable across tiers). */
function edgeRandom(index: number): () => number {
  return mulberry32(OPENING_SEED ^ Math.imul(index + 1, 0x9e3779b1 ^ 0x41d4));
}

interface MasterBand {
  readonly start: number;
  readonly end: number;
  readonly cls: OpeningNodeClass;
}

/**
 * Cluster bands over the master index space. The core knot owns the head of
 * every tier (so a "reduced" 52-node build still shows a WHOLE structure,
 * never a fragment), and the precursors chain outward.
 */
const MASTER_BANDS: readonly MasterBand[] = [
  { start: 0, end: 44, cls: "core" },
  { start: 44, end: 78, cls: "secondary" },
  { start: 78, end: 96, cls: "bridge" },
  { start: 96, end: 134, cls: "secondary" },
  { start: 134, end: 150, cls: "peripheral" },
  { start: 150, end: 180, cls: "peripheral" },
];

function buildMasterNodes(): OpeningNodeDefinition[] {
  const nodes: OpeningNodeDefinition[] = [];
  for (let i = 0; i < OPENING_MASTER_NODE_COUNT; i += 1) {
    let cls: OpeningNodeClass = "peripheral";
    for (const band of MASTER_BANDS) {
      if (i >= band.start && i < band.end) {
        cls = band.cls;
        break;
      }
    }
    const rng = fieldRandom(i);
    nodes.push({
      id: `o${String(i).padStart(3, "0")}`,
      class: cls,
      index: i,
      nx: 0,
      ny: 0,
      size:
        OPENING_CLASS_SIZE[cls] *
        (1 + (rng() * 2 - 1) * OPENING_NODE_SIZE_JITTER),
      // Staggers brace the new overlapping windows: every node stays put until
      // its own anchor inside the disintegration (0.40–0.68) then the release
      // (0.63–0.84). Kept WIDE so the crossfades have room to wave through.
      decomposeStart: 0.25 + rng() * 0.7,
      releaseStart: 0.15 + rng() * 0.75,
      phase: rng() * Math.PI * 2,
      driftAmplitude: 0.012 + rng() * 0.035,
      accent: rng() < 0.05 ? 1 : 0,
    });
  }
  return nodes;
}

function addPair(
  pairs: [number, number][],
  seen: Set<string>,
  s: number,
  t: number,
): void {
  if (s === t) return;
  const key = s < t ? `${s}|${t}` : `${t}|${s}`;
  if (seen.has(key)) return;
  seen.add(key);
  pairs.push([s, t]);
}

function buildMasterEdges(): { s: number; t: number }[] {
  const pairs: [number, number][] = [];
  const seen = new Set<string>();

  // Contiguous SPINE chains per band with a CHORD interleaved every third
  // link. `pair(j, j+2)` plus the spine's `j–j+1` and `j+1–j+2` closes a
  // triangle, so ANY tier prefix contains genuine cycles — the resolved graph
  // must read as a woven network with shared neighbours, never as a forest of
  // disjoint paths (the old matching read as floating pairs). Interleaving
  // (instead of chains-then-chords) matters: the aggressive nodeCount−1
  // ceiling trims the tail, so the cycles have to arrive inside the early
  // slots or the tiers would slice away all of them.
  for (const band of MASTER_BANDS) {
    for (let j = band.start; j < band.end - 1; j += 1) {
      addPair(pairs, seen, j, j + 1);
      if ((j - band.start) % 3 === 2 && j + 2 < band.end) {
        addPair(pairs, seen, j, j + 2);
      }
    }
  }

  // Band-to-band SEAMS at every boundary keep the whole graph ONE component
  // from the core knot out to the periphery.
  for (let b = 0; b < MASTER_BANDS.length - 1; b += 1) {
    const seam = MASTER_BANDS[b]!;
    if (seam.end < OPENING_MASTER_NODE_COUNT) {
      addPair(pairs, seen, seam.end - 1, seam.end);
    }
  }

  // Cross-band connectors — the cascade that reads as ONE fiction graph.
  for (const [s, t] of [
    [39, 40],
    [40, 45],
    [35, 70],
    [69, 70],
    [38, 84],
    [83, 84],
    [69, 86],
    [113, 114],
    [70, 72],
    [76, 90],
    [113, 128],
    [74, 88],
  ] as const) {
    addPair(pairs, seen, s, t);
  }

  // Core knot ring + a few internal seams.
  for (const [s, t] of [
    [0, 10],
    [5, 30],
    [0, 39],
    [20, 38],
    [12, 26],
  ] as const) {
    addPair(pairs, seen, s, t);
  }

  // Secondary / peripheral local webbing.
  for (let j = 40; j < 66; j += 4) addPair(pairs, seen, j, j + 4);
  for (let j = 84; j < 109; j += 5) addPair(pairs, seen, j, j + 5);
  for (let j = 114; j < 124; j += 4) addPair(pairs, seen, j, j + 4);
  for (let j = 128; j < 136; j += 4) addPair(pairs, seen, j, j + 4);

  return pairs.map(([s, t]) => ({ s, t }));
}

interface MasterEdge extends OpeningEdgePair {
  readonly masterIndex: number;
}

const MASTER_NODES: readonly OpeningNodeDefinition[] = (() => {
  const built = buildMasterNodes();
  return built;
})();

const MASTER_EDGES: readonly MasterEdge[] = (() => {
  const pairs = buildMasterEdges();
  return pairs.map(({ s, t }, i) => ({ s, t, masterIndex: i }));
})();

/** Number of master edges whose endpoints both survive the given node prefix
 *  (the natural ceiling for a tier's budget, before tie-break arithmetic). */
export function openingMasterEdgeCountWithin(nodeLimit: number): number {
  let count = 0;
  for (const edge of MASTER_EDGES) {
    if (edge.s < nodeLimit && edge.t < nodeLimit) count += 1;
  }
  return count;
}

/**
 * Deterministic per-tier bundle: bytes are a function only of the tier. The
 * node set is a prefix of the master, the edge set is every master edge whose
 * endpoints both survive the slice (also a construction-order prefix), capped
 * at the tier's edge budget. Draw slots follow formationStart order so the
 * network weaves itself in deterministic (yet organic-looking) order.
 */
export function generateOpeningGraph(
  tier: CinematicQualityTier,
): OpeningGraphBundle {
  const budget = OPENING_TIER_BUDGETS[tier];
  const nodeCount = Math.max(1, Math.min(budget.nodesMid, MASTER_NODES.length));

  const nodes = MASTER_NODES.slice(0, nodeCount).map((node, index) => ({
    ...node,
    index,
  }));

  const surviving = MASTER_EDGES.filter(
    (edge) => edge.s < nodeCount && edge.t < nodeCount,
  );
  const edgeCount = Math.min(
    Math.max(1, budget.edgesMid),
    surviving.length,
    Math.max(0, nodeCount - 1),
  );
  const chosen = surviving.slice(0, edgeCount);

  const withStarts = chosen.map((edge, i) => {
    // Deliberately LATE window: the network must not appear while the letters
    // are still dissolving. Lines weave in only inside the graph-connect
    // window (0.76–0.94), after the released nodes have substantially
    // separated — the graph is seen to GROW OUT of the settled nodes, never
    // a tangle over a blur.
    const start = 0.76 + edgeRandom(edge.masterIndex)() * 0.18;
    return { ...edge, i, start };
  });
  const ordered = [...withStarts].sort(
    (a, b) => a.start - b.start || a.i - b.i,
  );
  const slotOf = new Map<number, number>();
  ordered.forEach((edge, slot) => slotOf.set(edge.i, slot));

  const edges: OpeningEdgeDefinition[] = withStarts.map((edge) => ({
    id: `e${edge.masterIndex}`,
    source: nodes[edge.s]!.id,
    target: nodes[edge.t]!.id,
    sourceIndex: edge.s,
    targetIndex: edge.t,
    slot: slotOf.get(edge.i)!,
    formationStart: edge.start,
  }));

  const layout = layoutOpeningGraph(
    nodeCount,
    chosen,
    nodes.map((node) => node.size),
    TYPOGRAPHIC_HASH[tier],
    OPENING_LAYOUT_FIT_MARGIN,
  );

  const positioned = nodes.map((node, i) => ({
    ...node,
    nx: layout.x[i]!,
    ny: layout.y[i]!,
  }));

  return {
    tier,
    seed: OPENING_SEED,
    nodes: positioned,
    edges,
    bounds: layout.bounds,
  };
}

/** Fresh mutable stats view for one bundle (visibleNodeCount starts at 0). */
export function openingGraphStats(bundle: OpeningGraphBundle): OpeningGraphStats {
  return {
    tier: bundle.tier,
    seed: bundle.seed,
    nodeCount: bundle.nodes.length,
    edgeCount: bundle.edges.length,
    visibleNodeCount: 0,
    sampleCount: 0,
  };
}

/**
 * The fiction label anchors: grow deterministically from the core knot so the
 * ending can point at real on-screen structure. Never tied to the DOM.
 */
export function selectOpeningLabels(
  bundle: OpeningGraphBundle,
): readonly { readonly index: number; readonly text: string }[] {
  const budget = OPENING_TIER_BUDGETS[bundle.tier];
  const coreCount = Math.min(40, bundle.nodes.length);
  const rows: { index: number; text: string }[] = [];
  for (let k = 0; k < budget.labelsMax && k < OPENING_LABEL_POOL.length; k += 1) {
    const index = Math.min(
      coreCount - 1,
      Math.floor((coreCount * (k + 1)) / (budget.labelsMax + 1)),
    );
    rows.push({ index, text: OPENING_LABEL_POOL[k]! });
  }
  return rows;
}

/** Preallocated pose view: one mutable row per label pick, wiped on rebuild. */
export function createOpeningPoseView(bundle: OpeningGraphBundle): OpeningPoseView {
  const labels = selectOpeningLabels(bundle);
  return {
    rows: labels.map(({ index, text }) => ({
      nodeIndex: index,
      text,
      worldX: 0,
      worldY: 0,
      alpha: 0,
      dirty: true,
    })),
    labelCapacity: OPENING_TIER_BUDGETS[bundle.tier].labelsMax,
    labelCount: labels.length,
    enabled: labels.length > 0,
  };
}