// ============================================================================
// PR — INDAGO Cinematic Home Opening · Network resolve buffer
//
// At the END of the graph-zoom dive the soft constellation crossfades into the
// DEMO network's node design: circular ringed bodies with entity icons, crisp
// near edges, deterministic attention rings (contradicted / gap / bridge) and
// a bounded set of entity names. The scene writes one mutable OpeningNetworkRow
// per resolved node (the SAME normalized-anchor scheme the pose rows use), and
// the DOM NetworkResolution layer re-reads it every frame.
//
// Everything here is pure + deterministic: the icon persona and attention ring
// are functions of the node id alone (stable across tiers, since every tier is
// a prefix of the same master), so the morph never flickers on rebuild.
// Browser-free — no DOM, no three.
// ============================================================================

import {
  OPENING_NETWORK_DEPTH_CAP,
  OPENING_NETWORK_DEPTH_FEATHER,
  OPENING_NETWORK_LABEL_POOL,
  OPENING_NETWORK_MAX_HOLES,
  OPENING_NETWORK_MAX_LABELS,
  OPENING_NETWORK_RING_CONTRADICTED,
  OPENING_NETWORK_RING_GAP,
} from "./opening.constants";
import type {
  OpeningGraphBundle,
  OpeningNetworkEdgeRow,
  OpeningNetworkHole,
  OpeningNetworkRing,
  OpeningNetworkRow,
  OpeningNetworkView,
  OpeningNodeDefinition,
} from "./opening.types";
import { openingNodeDepth } from "./opening.zoom";
import { selectOpeningLabels } from "./opening.graph";

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** FNV-1a over the id with a Murmur3 finalizer fold — the same style
 *  openingNodeDepth uses, so persona + ring are rock-stable per node id. The
 *  finalizer is REQUIRED here: raw FNV-1a over short ASCII ids like "o017" is
 *  not decorrelated enough, the roll stays inside ~[0.18, 0.82] and the seeded
 *  ring bands (4.5% / 11%) would never fire. */
function hashLabel(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Deterministic synthetic entity persona for one node: the label drives BOTH
 *  the shared icon resolver and any mini text, chosen from the node class's
 *  fiction pool. Identical across tiers because the id is identical. */
export function openingNetworkPersona(node: OpeningNodeDefinition): {
  readonly label: string;
} {
  const pool = OPENING_NETWORK_LABEL_POOL[node.class];
  const label = pool[hashLabel(node.id) % pool.length]!;
  return { label };
}

/** Deterministic attention ring for a resolved node: accents read as bridge
 *  candidates (the demo's rose bridge ring), the remainder get a seeded
 *  contradiction/gap share and the rest stay clean. */
export function openingNetworkRing(node: OpeningNodeDefinition): OpeningNetworkRing {
  if (node.accent === 1) return "bridge";
  const roll = hashLabel(node.id) / 0xffffffff;
  if (roll < OPENING_NETWORK_RING_CONTRADICTED) return "contradicted";
  if (roll < OPENING_NETWORK_RING_CONTRADICTED + OPENING_NETWORK_RING_GAP) {
    return "gap";
  }
  return "none";
}

/** Candidate rows: every node that can resolve at full strength (its depth sits
 *  inside the cap + feather), sorted FRONT-FIRST so the morph resolves near
 *  nodes before the periphery. `showLabel` marks a bounded, readable subset
 *  (never peripheral, never the pool labels EvidenceLabels already owns). */
export function createOpeningNetworkView(
  bundle: OpeningGraphBundle,
): OpeningNetworkView {
  const cap = OPENING_NETWORK_DEPTH_CAP;
  const slack = cap + OPENING_NETWORK_DEPTH_FEATHER;
  const poseIndexes = new Set(selectOpeningLabels(bundle).map((r) => r.index));
  const rows: OpeningNetworkRow[] = [];

  for (const node of bundle.nodes) {
    const depth = openingNodeDepth(node.id, node.nx, node.ny);
    if (depth > slack) continue;
    rows.push({
      nodeIndex: node.index,
      label: openingNetworkPersona(node).label,
      ring: openingNetworkRing(node),
      showLabel:
        node.class !== "peripheral" &&
        depth <= cap * 0.85 &&
        !poseIndexes.has(node.index),
      worldX: 0,
      worldY: 0,
      radiusPx: 0,
      alpha: 0,
      dirty: true,
    });
  }

  const ordered = rows
    .sort((a, b) => {
      const da = openingNodeDepth(
        bundle.nodes[a.nodeIndex]!.id,
        bundle.nodes[a.nodeIndex]!.nx,
        bundle.nodes[a.nodeIndex]!.ny,
      );
      const db = openingNodeDepth(
        bundle.nodes[b.nodeIndex]!.id,
        bundle.nodes[b.nodeIndex]!.nx,
        bundle.nodes[b.nodeIndex]!.ny,
      );
      return da - db;
    })
    .map((row, order) =>
      order < OPENING_NETWORK_MAX_LABELS ? row : { ...row, showLabel: false },
    );

  // Edges: only the icon-to-icon links — every rendered edge has BOTH
  // endpoints inside the resolve candidates, so the crisp graph really
  // CONNECTS the visible nodes (never dangles into the blur).
  const candidateIndexes = new Set(ordered.map((row) => row.nodeIndex));
  const edges: OpeningNetworkEdgeRow[] = [];
  for (const edge of bundle.edges) {
    if (
      candidateIndexes.has(edge.sourceIndex) &&
      candidateIndexes.has(edge.targetIndex)
    ) {
      edges.push({
        aIndex: edge.sourceIndex,
        bIndex: edge.targetIndex,
        alpha: 0,
        dirty: true,
      });
    }
  }

  return { rows: ordered, edges, holes: [], enabled: ordered.length > 0 };
}

/** Deterministic GRAPH HOLES (the demo's amber dashed gaps): up to
 *  OPENING_NETWORK_MAX_HOLES candidate node PAIRS that share NO direct edge —
 *  each one literally a hole in the topology, not a stylistic flourish. The
 *  walk is stable across tiers (candidate ids are a subset of the master), so
 *  the gaps never reshuffle between rebuilds. */
export function createOpeningNetworkHoles(
  bundle: OpeningGraphBundle,
  rows: readonly OpeningNetworkRow[],
): OpeningNetworkHole[] {
  const edgeSet = new Set<string>();
  for (const edge of bundle.edges) {
    edgeSet.add(pairKey(edge.sourceIndex, edge.targetIndex));
  }
  const n = rows.length;
  if (n < 4) return [];
  const step = 3 + (hashLabel(rows[0]?.label ?? "graph") % 3); // 3…5 apart
  const holes: OpeningNetworkHole[] = [];
  for (let j = 0; j < n && holes.length < OPENING_NETWORK_MAX_HOLES; j += 1) {
    const a = rows[j]!;
    const b = rows[(j + step) % n]!;
    if (a.nodeIndex === b.nodeIndex) continue;
    if (edgeSet.has(pairKey(a.nodeIndex, b.nodeIndex))) continue;
    holes.push({
      aIndex: a.nodeIndex,
      bIndex: b.nodeIndex,
      midWorldX: 0,
      midWorldY: 0,
      alpha: 0,
      dirty: true,
    });
  }
  return holes;
}