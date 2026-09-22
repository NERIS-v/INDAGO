// ============================================================================
// PR — INDAGO Cinematic Home Opening · Network resolve model
//
// Pure + deterministic (no DOM, no three): the resolve crossfade helpers in
// opening.zoom.ts and the persona/ring/view builder in opening.network.ts. The
// morph can never drift into NaN, bounce behind its window, or wobble between
// rebuilds — the persona and ring of a node are functions of its id alone.
// ============================================================================

import { describe, expect, it } from "vitest";
import { CINEMATIC_CALIBRATION_DEFAULTS } from "@/components/home/cinematic/cinematic.calibration";
import { generateOpeningGraph } from "@/components/home/cinematic/opening/opening.graph";
import {
  OPENING_NETWORK_DEPTH_CAP,
  OPENING_NETWORK_MAX_HOLES,
  OPENING_NETWORK_MAX_LABELS,
  OPENING_NETWORK_RING_CONTRADICTED,
  OPENING_NETWORK_RING_GAP,
  OPENING_GRAPH_RESOLVE_WINDOW,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  openingNetworkPersona,
  openingNetworkRing,
  createOpeningNetworkView,
  createOpeningNetworkHoles,
} from "@/components/home/cinematic/opening/opening.network";
import {
  openingGraphResolveAt,
  openingNetworkDepthCapAt,
  openingNetworkEdgeDepthAlpha,
  openingNetworkResolvedDepth,
  openingNodeDepth,
  openingGraphZoomFrame,
} from "@/components/home/cinematic/opening/opening.zoom";

const CAL = CINEMATIC_CALIBRATION_DEFAULTS;
const RS = OPENING_GRAPH_RESOLVE_WINDOW.start;
const RE = OPENING_GRAPH_RESOLVE_WINDOW.end;

describe("network resolve — the crossfade", () => {
  it("is 0 before its window and 1 after it (never leaks outside the dive)", () => {
    expect(openingGraphResolveAt(RS - 0.02, CAL)).toBe(0);
    expect(openingGraphResolveAt(RE + 0.003, CAL)).toBe(1);
    expect(openingGraphResolveAt(RS, CAL)).toBeCloseTo(0, 4);
    // The resolve rides the TAIL of the dive: window sits inside the zoom.
    expect(RS).toBeGreaterThanOrEqual(CAL.graphZoomStart);
    expect(RE).toBeLessThanOrEqual(CAL.graphZoomEnd + 1e-6);
    // Reduced motion forces the FINAL frame (the scene calls the helper at
    // p = 1), which must land fully resolved — never a partial crossfade.
    expect(openingGraphResolveAt(1, CAL)).toBe(1);
  });

  it("is monotone and bounceless across the window", () => {
    let prev = -1;
    for (let i = 0; i <= 50; i += 1) {
      const p = RS + (RE - RS) * (i / 50);
      const r = openingGraphResolveAt(p, CAL);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("reweights the crossfade with networkResolveEase, still bounceless", () => {
    const boosted = { ...CAL, networkResolveEase: 2.5 };
    const mid = (RS + RE) / 2;
    // ease 1 = the plain window smoothstep (0.5 at the midpoint).
    expect(openingGraphResolveAt(mid, CAL)).toBeCloseTo(0.5, 4);
    // ease > 1 holds the convert back → mid < 0.5, but windows stay exact.
    expect(openingGraphResolveAt(mid, boosted)).toBeLessThan(0.5);
    expect(openingGraphResolveAt(RS, boosted)).toBe(0);
    expect(openingGraphResolveAt(RE, boosted)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 40; i += 1) {
      const p = RS + (RE - RS) * (i / 40);
      const r = openingGraphResolveAt(p, boosted);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("mirrors the dive frame's resolve readout", () => {
    const p = (RS + RE) / 2;
    expect(openingGraphZoomFrame(p, CAL).resolve).toBeCloseTo(
      openingGraphResolveAt(p, CAL),
      6,
    );
  });

  it("is NaN-proof with shipping fallbacks when calibration is missing", () => {
    for (const p of [-1, 0, RS, (RS + RE) / 2, RE, 1.5]) {
      expect(Number.isFinite(openingGraphResolveAt(p))).toBe(true);
    }
  });
});

describe("network resolve — the depth cap", () => {
  it("starts shallow and widens toward the shipped cap", () => {
    expect(openingNetworkDepthCapAt(0, CAL)).toBeGreaterThan(0);
    expect(openingNetworkDepthCapAt(1, CAL)).toBeCloseTo(
      OPENING_NETWORK_DEPTH_CAP,
      6,
    );
  });

  it("is monotone and clamped in resolve", () => {
    let prev = openingNetworkDepthCapAt(0, CAL);
    for (let r = 0.05; r <= 1.05; r += 0.05) {
      const c = openingNetworkDepthCapAt(r, CAL);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = c;
    }
    expect(openingNetworkDepthCapAt(2, CAL)).toBe(OPENING_NETWORK_DEPTH_CAP);
  });
});

describe("network resolve — the membership gate + edge depth", () => {
  it("resolves the front layer first, gating softly across the feather", () => {
    const cap = openingNetworkDepthCapAt(1, CAL);
    expect(openingNetworkResolvedDepth(0, cap)).toBe(1);
    expect(openingNetworkResolvedDepth(1, cap)).toBe(0);
    // Monotone decrease as a node sits deeper than the cap.
    let prev = openingNetworkResolvedDepth(0, cap);
    for (let d = 0.05; d <= 1; d += 0.05) {
      const g = openingNetworkResolvedDepth(d, cap);
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      prev = g;
    }
  });

  it("restyles edges by midpoint depth: near crisp, far receding", () => {
    expect(openingNetworkEdgeDepthAlpha(0, 1)).toBe(1);
    expect(openingNetworkEdgeDepthAlpha(0.5, 1)).toBeCloseTo(1 - 0.5 * 0.75, 6);
    expect(openingNetworkEdgeDepthAlpha(1, 1)).toBeCloseTo(1 - 0.75, 6);
    // Before the resolve starts every edge keeps its full presence.
    expect(openingNetworkEdgeDepthAlpha(1, 0)).toBe(1);
  });
});

describe("network resolve — determinism of persona + rings", () => {
  it("picks a stable icon persona per node id (identical across tiers)", () => {
    const high = generateOpeningGraph("high");
    const mobile = generateOpeningGraph("mobile");
    const subset = mobile.nodes.length;
    for (let i = 0; i < subset; i += 1) {
      const a = openingNetworkPersona(high.nodes[i]!);
      const b = openingNetworkPersona(mobile.nodes[i]!);
      expect(a).toEqual(b);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every accent a bridge ring; the rest lands in seeded bands", () => {
    const bundle = generateOpeningGraph("high");
    const counts: Record<string, number> = {
      bridge: 0,
      contradicted: 0,
      gap: 0,
      none: 0,
    };
    let bridges = 0;
    let accents = 0;
    for (const node of bundle.nodes) {
      if (node.accent === 1) accents += 1;
      const ring = openingNetworkRing(node);
      counts[ring] += 1;
      if (ring === "bridge") bridges += 1;
    }
    // Identical across rebuilds.
    const alt = generateOpeningGraph("high");
    expect(openingNetworkRing(alt.nodes[3]!)).toBe(
      openingNetworkRing(bundle.nodes[3]!),
    );
    expect(bridges).toBe(accents); // every accent reads as a bridge candidate.
    // Seeded shares land near their configured constants (loose tolerance —
    // FNV-1a over real ids is deterministic but not exactly calibrated).
    const share = (k: string) => counts[k] / bundle.nodes.length;
    expect(share("contradicted")).toBeGreaterThan(
      OPENING_NETWORK_RING_CONTRADICTED * 0.5,
    );
    expect(share("contradicted")).toBeLessThan(
      OPENING_NETWORK_RING_CONTRADICTED * 2,
    );
    expect(share("gap")).toBeGreaterThan(OPENING_NETWORK_RING_GAP * 0.5);
    expect(share("gap")).toBeLessThan(OPENING_NETWORK_RING_GAP * 2);
    expect(share("none") + share("contradicted") + share("gap") + share("bridge")).toBeCloseTo(1, 6);
  });
});

describe("network resolve — the view buffer", () => {
  const bundle = generateOpeningGraph("high");

  it("only admits nodes inside the depth cap (plus the feather slack)", () => {
    const view = createOpeningNetworkView(bundle);
    expect(view.enabled).toBe(true);
    // The rows are built from CANDIDATE nodes, so the deepest admitted row
    // sits inside cap+feather at detail-level precision.
    for (const row of view.rows) {
      const node = bundle.nodes[row.nodeIndex]!;
      const depth = openingNodeDepth(node.id, node.nx, node.ny);
      expect(depth).toBeLessThanOrEqual(OPENING_NETWORK_DEPTH_CAP + 1e-6 + 0.08);
    }
  });

  it("is sorted front-first by node depth", () => {
    const view = createOpeningNetworkView(bundle);
    let prev = -1;
    for (const row of view.rows) {
      const node = bundle.nodes[row.nodeIndex]!;
      const depth = openingNodeDepth(node.id, node.nx, node.ny);
      expect(depth).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = depth;
    }
  });

  it("caps the visible mini labels at the shipped constant", () => {
    const view = createOpeningNetworkView(bundle);
    const labelled = view.rows.filter((r) => r.showLabel);
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.length).toBeLessThanOrEqual(OPENING_NETWORK_MAX_LABELS);
  });

  it("is deterministic across identical builds", () => {
    const a = createOpeningNetworkView(bundle);
    const b = createOpeningNetworkView(generateOpeningGraph("high"));
    expect(a.rows).toEqual(b.rows);
  });

  it("starts fully invisible (alpha 0, positions at origin) and dirty", () => {
    const view = createOpeningNetworkView(bundle);
    for (const row of view.rows) {
      expect(row.alpha).toBe(0);
      expect(row.worldX).toBe(0);
      expect(row.worldY).toBe(0);
      expect(row.dirty).toBe(true);
    }
    for (const link of view.edges) {
      expect(link.alpha).toBe(0);
      expect(link.dirty).toBe(true);
    }
  });
});

describe("network resolve — the icon-to-icon link edges", () => {
  const bundle = generateOpeningGraph("high");
  const view = createOpeningNetworkView(bundle);
  const candidateIndexes = new Set(view.rows.map((r) => r.nodeIndex));

  it("only links endpoints that are BOTH icon candidates (no dangling edges)", () => {
    expect(view.edges.length).toBeGreaterThan(0);
    for (const link of view.edges) {
      expect(candidateIndexes.has(link.aIndex)).toBe(true);
      expect(candidateIndexes.has(link.bIndex)).toBe(true);
    }
  });

  it("is a real subset of the bundle topology (not invented lines)", () => {
    const real = new Set(
      bundle.edges.map((e) =>
        e.sourceIndex < e.targetIndex
          ? `${e.sourceIndex}|${e.targetIndex}`
          : `${e.targetIndex}|${e.sourceIndex}`,
      ),
    );
    for (const link of view.edges) {
      const key =
        link.aIndex < link.bIndex
          ? `${link.aIndex}|${link.bIndex}`
          : `${link.bIndex}|${link.aIndex}`;
      expect(real.has(key)).toBe(true);
    }
  });
});

describe("network resolve — reads as a connected WEB, not floating pairs", () => {
  it("icon links hold a real average degree and close triangles", () => {
    for (const tier of ["high", "medium", "mobile"] as const) {
      const bundle = generateOpeningGraph(tier);
      const view = createOpeningNetworkView(bundle);
      const links = view.edges;
      const degree = new Map<number, number>();
      for (const link of links) {
        degree.set(link.aIndex, (degree.get(link.aIndex) ?? 0) + 1);
        degree.set(link.bIndex, (degree.get(link.bIndex) ?? 0) + 1);
      }
      const avg =
        [...degree.values()].reduce((s, d) => s + d, 0) /
        Math.max(1, degree.size);
      expect(avg).toBeGreaterThan(1.8);

      const linkSet = new Set<string>();
      for (const link of links) {
        linkSet.add(
          link.aIndex < link.bIndex
            ? `${link.aIndex}|${link.bIndex}`
            : `${link.bIndex}|${link.aIndex}`,
        );
      }
      let triangleCount = 0;
      for (const link of links) {
        for (const node of bundle.nodes) {
          const na = `${Math.min(link.aIndex, node.index)}|${Math.max(link.aIndex, node.index)}`;
          const nb = `${Math.min(link.bIndex, node.index)}|${Math.max(link.bIndex, node.index)}`;
          if (linkSet.has(na) && linkSet.has(nb)) triangleCount += 1;
        }
      }
      // Shared neighbours on top of the spines → real cycles in the sparse
      // icon graph (fewer resolved nodes ⇒ fewer cliques; some is enough).
      expect(triangleCount / 3).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("network resolve — graph holes", () => {
  const bundle = generateOpeningGraph("high");

  it("builds only over candidate pairs that have NO direct edge (true gaps)", () => {
    const view = createOpeningNetworkView(bundle);
    const holes = createOpeningNetworkHoles(bundle, view.rows);
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.length).toBeLessThanOrEqual(OPENING_NETWORK_MAX_HOLES);
    const candidateIndexes = new Set(view.rows.map((r) => r.nodeIndex));
    const realEdges = new Set(
      bundle.edges.map((e) =>
        e.sourceIndex < e.targetIndex
          ? `${e.sourceIndex}|${e.targetIndex}`
          : `${e.targetIndex}|${e.sourceIndex}`,
      ),
    );
    const seen = new Set<string>();
    for (const hole of holes) {
      expect(candidateIndexes.has(hole.aIndex)).toBe(true);
      expect(candidateIndexes.has(hole.bIndex)).toBe(true);
      const key =
        hole.aIndex < hole.bIndex
          ? `${hole.aIndex}|${hole.bIndex}`
          : `${hole.bIndex}|${hole.aIndex}`;
      expect(realEdges.has(key)).toBe(false); // a hole is a MISSING link.
      expect(seen.has(key)).toBe(false); // never a duplicate pair.
      seen.add(key);
      expect(hole.midWorldX).toBe(0);
      expect(hole.midWorldY).toBe(0);
      expect(hole.alpha).toBe(0);
    }
  });

  it("is deterministic across identical builds", () => {
    const a = createOpeningNetworkHoles(bundle, createOpeningNetworkView(bundle).rows);
    const b = createOpeningNetworkHoles(
      generateOpeningGraph("high"),
      createOpeningNetworkView(generateOpeningGraph("high")).rows,
    );
    expect(a).toEqual(b);
  });
});