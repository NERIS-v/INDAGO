// ============================================================================
// PR2 · Cinematic Home — Opening · Organic constellation · Pure contract
//
// Locks the deterministic generation pipeline without a browser: seeded PRNG,
// topology cuts within the quality-tier budget ranges, unique ids, finite
// layout coordinates, a formation-order draw-slot schedule, sparse labels, the
// shared pose view and reduced motion staying static (fully formed, calm).
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  generateOpeningGraph,
  openingGraphStats,
  openingMasterEdgeCountWithin,
  selectOpeningLabels,
  createOpeningPoseView,
} from "@/components/home/cinematic/opening/opening.graph";
import { mulberry32 } from "@/components/home/cinematic/opening/opening.layout";
import {
  OPENING_CLASS_ALPHA,
  OPENING_EDGE_OPACITY,
  OPENING_LABEL_POOL,
  OPENING_SEED,
  OPENING_TIER_BUDGETS,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  openingEdgeAlpha,
  openingLabelAlpha,
  openingNodeAlpha,
} from "@/components/home/cinematic/opening/opening.progress";
import type { CinematicQualityTier } from "@/components/home/cinematic/cinematic.types";

const TIERS: readonly CinematicQualityTier[] = [
  "high",
  "medium",
  "mobile",
  "reduced-motion",
];

function bundleFor(tier: CinematicQualityTier) {
  return generateOpeningGraph(tier);
}

describe("PR2 §A the seeded PRNG is deterministic", () => {
  it("the same seed produces the same sequence forever", () => {
    const a = mulberry32(OPENING_SEED);
    const b = mulberry32(OPENING_SEED);
    for (let i = 0; i < 1000; i += 1) expect(a()).toBe(b());
  });

  it("a different seed produces a different sequence", () => {
    const a = mulberry32(OPENING_SEED);
    const b = mulberry32(OPENING_SEED + 1);
    let differs = false;
    for (let i = 0; i < 64; i += 1) {
      if (a() !== b()) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("PRNG output stays inside [0, 1)", () => {
    const rng = mulberry32(OPENING_SEED);
    for (let i = 0; i < 10000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("PR2 §B the master topology is deterministic and well-formed", () => {
  it("generation is repeatable: identical node and edge sequences", () => {
    for (const tier of TIERS) {
      const a = bundleFor(tier);
      const b = bundleFor(tier);
      expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
      expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id));
      expect(a.nodes.map((n) => n.class)).toEqual(b.nodes.map((n) => n.class));
      expect(a.bounds).toEqual(b.bounds);
    }
  });

  it("node and edge ids are unique and each node carries a stable identity", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      expect(new Set(bundle.nodes.map((n) => n.id)).size).toBe(bundle.nodes.length);
      expect(new Set(bundle.edges.map((e) => e.id)).size).toBe(bundle.edges.length);
      bundle.nodes.forEach((node, index) => {
        expect(node.index).toBe(index);
        expect(node.id).toMatch(/^o\d{3}$/);
        expect(node.decomposeStart).toBeGreaterThanOrEqual(0);
        expect(node.decomposeStart).toBeLessThanOrEqual(1);
        expect(node.releaseStart).toBeGreaterThanOrEqual(0);
        expect(node.releaseStart).toBeLessThanOrEqual(1);
        expect(node.size).toBeGreaterThan(0);
        expect(node.driftAmplitude).toBeGreaterThan(0);
        expect(node.accent === 0 || node.accent === 1).toBe(true);
      });
    }
  });

  it("every edge endpoint resolves to an included node with valid indices", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      const ids = new Set(bundle.nodes.map((n) => n.id));
      for (const edge of bundle.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
        expect(edge.sourceIndex).toBeGreaterThanOrEqual(0);
        expect(edge.sourceIndex).toBeLessThan(bundle.nodes.length);
        expect(edge.source).toBe(bundle.nodes[edge.sourceIndex]!.id);
        expect(edge.target).toBe(bundle.nodes[edge.targetIndex]!.id);
      }
    }
  });

  it("the master set forms a node superset of every tier subset", () => {
    const masterIds = new Set(bundleFor("high").nodes.map((n) => n.id));
    for (const tier of TIERS) {
      for (const node of bundleFor(tier).nodes) {
        expect(masterIds.has(node.id)).toBe(true);
      }
    }
  });
});

describe("PR2 §C node/edge counts respect the quality-tier budgets", () => {
  it("node counts hit the tier midpoint exactly; edges stay inside their windows", () => {
    for (const tier of TIERS) {
      const budget = OPENING_TIER_BUDGETS[tier]!;
      const bundle = bundleFor(tier);
      expect(bundle.nodes.length).toBe(budget.nodesMid);
      expect(bundle.edges.length).toBeGreaterThanOrEqual(budget.edgesMin);
      expect(bundle.edges.length).toBeLessThanOrEqual(budget.edgesMax);
      expect(bundle.edges.length).toBeGreaterThanOrEqual(1);
      expect(bundle.edges.length).toBeLessThan(bundle.nodes.length);
    }
  });

  it("the bundles run at the surviving-master ceiling (a connected WEB, not dust)", () => {
    // Every tier's edge mid sits at or above its surviving master-edge count,
    // so the nodeCount−1 tie-break yields the FULL weave: spines + chords land
    // in the early slots (cycles survive the slice) and no tier is cut back to
    // the old disjoint-pair forest.
    for (const tier of TIERS) {
      const budget = OPENING_TIER_BUDGETS[tier]!;
      const bundle = bundleFor(tier);
      const surviving = openingMasterEdgeCountWithin(bundle.nodes.length);
      expect(budget.edgesMid).toBeGreaterThanOrEqual(surviving);
      expect(bundle.edges.length).toBe(bundle.nodes.length - 1);
    }
  });

  it("smaller tiers are intentional subsets of larger ones (by id)", () => {
    const ids = (tier: CinematicQualityTier) =>
      new Set(bundleFor(tier).nodes.map((n) => n.id));
    const high = ids("high");
    const medium = ids("medium");
    const mobile = ids("mobile");
    const reduced = ids("reduced-motion");
    for (const id of medium) expect(high.has(id)).toBe(true);
    for (const id of mobile) expect(medium.has(id)).toBe(true);
    for (const id of reduced) expect(mobile.has(id)).toBe(true);
  });

  it("every tier keeps its seed and the seed equals the master", () => {
    for (const tier of TIERS) {
      expect(bundleFor(tier).seed).toBe(OPENING_SEED);
      expect(bundleFor(tier).tier).toBe(tier);
    }
  });
});

describe("PR2 §D layout coordinates are finite and normalized", () => {
  it("all positions and sizes are finite inside the ±1 layout space", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      for (const node of bundle.nodes) {
        expect(Number.isFinite(node.nx)).toBe(true);
        expect(Number.isFinite(node.ny)).toBe(true);
        expect(Math.abs(node.nx)).toBeLessThanOrEqual(1);
        expect(Math.abs(node.ny)).toBeLessThanOrEqual(1);
      }
      const b = bundle.bounds;
      for (const v of [b.left, b.right, b.top, b.bottom]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(b.right).toBeGreaterThan(b.left);
      expect(b.top).toBeGreaterThan(b.bottom);
    }
  });

  it("duplicate generation yields identical coordinates", () => {
    for (const tier of TIERS) {
      const a = bundleFor(tier);
      const b = bundleFor(tier);
      for (let i = 0; i < a.nodes.length; i += 1) {
        expect(a.nodes[i]!.nx).toBe(b.nodes[i]!.nx);
        expect(a.nodes[i]!.ny).toBe(b.nodes[i]!.ny);
        expect(a.nodes[i]!.size).toBe(b.nodes[i]!.size);
      }
    }
  });

  it("keeps a non-degenerate organic spread (constellation, not a point)", () => {
    const bundle = bundleFor("high");
    expect(bundle.bounds.right - bundle.bounds.left).toBeGreaterThan(0.05);
    expect(bundle.bounds.top - bundle.bounds.bottom).toBeGreaterThan(0.05);
    const xs = new Set(bundle.nodes.map((n) => n.nx.toFixed(4)));
    const ys = new Set(bundle.nodes.map((n) => n.ny.toFixed(4)));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it("is MASS-centred: the cloud's mean lands on the origin for every tier", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      const n = bundle.nodes.length;
      const mx = bundle.nodes.reduce((s, node) => s + node.nx, 0) / n;
      const my = bundle.nodes.reduce((s, node) => s + node.ny, 0) / n;
      // Extent-centring is NOT enough: the spring/repulsion relaxer can strand
      // ~80% of a tier in one quadrant of an otherwise symmetric box, so the
      // graph reads bottom-right. The layout shifts the MASS onto the origin.
      expect(Math.abs(mx)).toBeLessThan(0.01);
      expect(Math.abs(my)).toBeLessThan(0.01);
    }
  });
});

describe("PR2 §E edges weave in late, growing out of the settled nodes", () => {
  it("every edge forms inside the graph-connect window [0.76, 0.94]", () => {
    for (const tier of TIERS) {
      for (const edge of bundleFor(tier).edges) {
        expect(edge.formationStart).toBeGreaterThanOrEqual(0.76);
        expect(edge.formationStart).toBeLessThanOrEqual(0.94);
        // An edge must never begin before the release has separated the nodes.
        expect(edge.formationStart).toBeGreaterThanOrEqual(0.76);
      }
    }
  });

  it("draw slots are a unique permutation in formation-start order", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      const slots = bundle.edges.map((edge) => edge.slot);
      expect(new Set(slots).size).toBe(bundle.edges.length);
      for (let s = 0; s < bundle.edges.length; s += 1) {
        expect(slots).toContain(s);
      }
      const byStart = [...bundle.edges].sort(
        (a, b) => a.formationStart - b.formationStart || a.slot - b.slot,
      );
      for (let s = 0; s < byStart.length; s += 1) {
        expect(byStart[s]!.slot).toBe(s);
      }
    }
  });
});

describe("PR2 §F labels are sparse fiction anchors on the core knot", () => {
  it("label rows respect the tier budget, never exceed the pool, and grow in order", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      const budget = OPENING_TIER_BUDGETS[tier]!;
      const rows = selectOpeningLabels(bundle);
      expect(rows.length).toBe(budget.labelsMax);
      expect(rows.length).toBeLessThan(bundle.nodes.length);
      for (let k = 0; k < rows.length; k += 1) {
        const row = rows[k]!;
        expect(row.text).toBe(OPENING_LABEL_POOL[k]);
        expect(row.index).toBeLessThan(bundle.nodes.length);
        if (k > 0) expect(row.index).toBeGreaterThan(rows[k - 1]!.index);
      }
    }
  });

  it("the shared pose view preallocates rows for the label picks", () => {
    for (const tier of TIERS) {
      const bundle = bundleFor(tier);
      const pose = createOpeningPoseView(bundle);
      expect(pose.labelCapacity).toBe(OPENING_TIER_BUDGETS[tier]!.labelsMax);
      expect(pose.labelCount).toBe(selectOpeningLabels(bundle).length);
      expect(pose.enabled).toBe(pose.labelCount > 0);
      expect(pose.rows).toHaveLength(pose.labelCount);
      for (const row of pose.rows) {
        expect(row.worldX).toBe(0);
        expect(row.worldY).toBe(0);
        expect(row.alpha).toBe(0);
        expect(row.dirty).toBe(true);
        expect(bundle.nodes[row.nodeIndex]!.id.length).toBeGreaterThan(0);
      }
    }
  });

  it("stats start neutral and mirror the bundle", () => {
    const stats = openingGraphStats(bundleFor("high"));
    expect(stats.tier).toBe("high");
    expect(stats.nodeCount).toBe(156);
    expect(stats.edgeCount).toBeGreaterThan(0);
    expect(stats.visibleNodeCount).toBe(0);
    expect(stats.sampleCount).toBe(0);
  });
});

describe("PR2 §G reduced motion stays static and fully formed", () => {
  it("reduced motion pins every alpha to its formed value", () => {
    const bundle = bundleFor("reduced-motion");
    for (const node of bundle.nodes) {
      expect(openingNodeAlpha(0, 0, OPENING_CLASS_ALPHA[node.class], true)).toBe(
        OPENING_CLASS_ALPHA[node.class],
      );
    }
    for (const edge of bundle.edges) {
      expect(openingEdgeAlpha(edge.formationStart, 0, true)).toBe(
        0.7 * OPENING_EDGE_OPACITY,
      );
    }
    for (let k = 0; k < selectOpeningLabels(bundle).length; k += 1) {
      expect(openingLabelAlpha(k, 0, true)).toBe(0.6);
    }
  });

  it("reduced motion keeps time-independent calm (node alpha never drops)", () => {
    for (const p of [0, 0.3, 0.6, 1]) {
      for (const node of bundleFor("reduced-motion").nodes) {
        expect(
          openingNodeAlpha(p, p, OPENING_CLASS_ALPHA[node.class], true),
        ).toBe(OPENING_CLASS_ALPHA[node.class]);
      }
    }
  });
});