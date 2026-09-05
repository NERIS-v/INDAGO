// ============================================================================
// PR-4 — Operational Action Model (pure) + Graph readability filter
//
// These tests exercise the provider-agnostic decision layer directly — no UI,
// no providers, no fixtures. They pin the ONLY inputs the rail may branch on:
// the PR-3 capability seam + the static implementation registry.
// ============================================================================

import { describe, it, expect } from "vitest";
import type { GraphEdge } from "@indago/contracts";
import {
  getOperationalActionState,
  getOperationalRailStates,
  OPERATIONAL_ACTION_GROUPS,
  OPERATIONAL_ACTION_META,
  OPERATIONAL_REASONS,
  EMPTY_CAPABILITIES,
  type OperationalAction,
} from "@/lib/context/operational-actions";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import {
  DEFAULT_GRAPH_FILTER,
  MIN_SUPPORT_STEP,
  MIN_SUPPORT_MAX,
  graphFilterIsActive,
  applyGraphFilter,
  type GraphFilterState,
} from "@/lib/graph/graph-filter";

const WORKSPACE = { mode: "demo" as const };
const CONTEXT: InvestigativeContext = { kind: "gap", id: "g-1", source: "graph" };

const edge = (id: string, support: number, status = "ACTIVE") =>
  ({
    id,
    sourceNodeId: `${id}-s`,
    targetNodeId: `${id}-t`,
    support,
    status,
  }) as GraphEdge;

const edges: GraphEdge[] = [
  edge("e-high", 0.78),
  edge("e-mid", 0.4),
  edge("e-low", 0.2),
  edge("e-disp", 0.72, "CONTRADICTED"),
];

const enabledCapabilities = {
  canFocus: true,
  canExpand: true,
  canTraceEvidence: true,
  canReview: true,
  canResolve: true,
  canChallenge: true,
};

describe("PR-4 — action model (pure)", () => {
  it("declares every one of the 15 rail commands exactly once across three groups", () => {
    const seen = new Set<OperationalAction>();
    for (const group of OPERATIONAL_ACTION_GROUPS) {
      for (const action of group.actions) {
        expect(seen.has(action)).toBe(false);
        seen.add(action);
        expect(OPERATIONAL_ACTION_META[action].label).toBeTruthy();
        expect(OPERATIONAL_ACTION_META[action].hint).toBeTruthy();
      }
    }
    expect(seen.size).toBe(15);
  });

  it("gives every command a static, context-invariant kind", () => {
    const kinds: Record<OperationalAction, string> = {
      search: "immediate",
      focus: "immediate",
      expand: "immediate",
      filter: "surface-toggle",
      layers: "surface-toggle",
      layout: "immediate",
      discover: "surface-toggle",
      "find-connections": "immediate",
      "detect-gaps": "surface-toggle",
      "trace-evidence": "surface-toggle",
      "cross-case": "surface-toggle",
      "add-evidence": "modal",
      review: "mutation",
      resolve: "mutation",
      challenge: "mutation",
    };
    for (const [action, kind] of Object.entries(kinds) as [OperationalAction, string][]) {
      expect(
        getOperationalActionState(action, CONTEXT, enabledCapabilities, WORKSPACE).kind,
      ).toBe(kind);
    }
  });

  it("keeps no-context projections honest: 8 disabled stubs, 7 real commands", () => {
    const states = getOperationalRailStates(null, EMPTY_CAPABILITIES, WORKSPACE);

    const implementedNow: OperationalAction[] = [
      "focus",
      "layers",
      "discover",
      "detect-gaps",
      "cross-case",
      "add-evidence",
      "filter",
    ];
    const immediatelyUsable: OperationalAction[] = [
      "layers",
      "discover",
      "detect-gaps",
      "cross-case",
      "add-evidence",
      "filter",
    ];
    const honestStubs: OperationalAction[] = [
      "search",
      "expand",
      "layout",
      "find-connections",
      "trace-evidence",
      "review",
      "resolve",
      "challenge",
    ];

    for (const action of implementedNow) {
      expect(states[action].implemented, action).toBe(true);
      expect(states[action].visible, action).toBe(true);
    }
    for (const action of immediatelyUsable) {
      expect(states[action].enabled, action).toBe(true);
    }
    // Focus is implemented but requires a selection — no-context it is disabled
    // with the honest "select something" reason, never faked into being usable.
    expect(states.focus.enabled).toBe(false);
    expect(states.focus.reason).toBe(OPERATIONAL_REASONS.FOCUS_NEEDS_ENTITY);
    for (const action of honestStubs) {
      expect(states[action].implemented, action).toBe(false);
      expect(states[action].enabled, action).toBe(false);
      expect(states[action].reason, action).toBeTruthy();
    }
  });

  it("does not fake unimplemented commands even for fully-capable selections", () => {
    const states = getOperationalRailStates(CONTEXT, enabledCapabilities, WORKSPACE);
    for (const action of [
      "search",
      "expand",
      "layout",
      "find-connections",
      "trace-evidence",
      "review",
      "resolve",
      "challenge",
    ] as OperationalAction[]) {
      expect(states[action].implemented, action).toBe(false);
      expect(states[action].enabled, action).toBe(false);
    }
  });

  it("maps capability truth onto real commands without leaking implementation gates", () => {
    const base = getOperationalActionState;
    const st = (a: OperationalAction, cap: typeof enabledCapabilities, ctx = CONTEXT) =>
      base(a, ctx, cap, WORKSPACE);

    expect(st("focus", EMPTY_CAPABILITIES, null).enabled).toBe(false);
    expect(st("focus", EMPTY_CAPABILITIES, null).reason).toBe(
      OPERATIONAL_REASONS.FOCUS_NEEDS_ENTITY,
    );
    expect(st("focus", enabledCapabilities, null).enabled).toBe(true);
    expect(st("focus", enabledCapabilities, null).reason).toBeUndefined();

    // A selection with no deterministic graph target (e.g. a gap) cannot focus.
    expect(st("focus", { ...EMPTY_CAPABILITIES }, CONTEXT).reason).toBe(
      OPERATIONAL_REASONS.NO_GRAPH_TARGET,
    );
  });

  it("keeps filter, layers, discover, gaps, cross-case and add-evidence context-free", () => {
    const states = getOperationalRailStates(null, EMPTY_CAPABILITIES, WORKSPACE);
    const withSeam = getOperationalRailStates(CONTEXT, enabledCapabilities, WORKSPACE);
    for (const action of [
      "filter",
      "layers",
      "discover",
      "detect-gaps",
      "cross-case",
      "add-evidence",
    ] as OperationalAction[]) {
      expect(states[action].enabled).toBe(withSeam[action].enabled);
      expect(states[action].enabled).toBe(true);
    }
  });

  it("re-exports EMPTY_CAPABILITIES so surfaces can build a no-context baseline", () => {
    expect(EMPTY_CAPABILITIES).toEqual({
      canFocus: false,
      canExpand: false,
      canTraceEvidence: false,
      canReview: false,
      canResolve: false,
      canChallenge: false,
    });
  });
});

describe("PR-4 — graph readability filter (pure)", () => {
  it("ships a sane default (nothing hidden)", () => {
    expect(DEFAULT_GRAPH_FILTER).toEqual({ minSupport: 0, hideContradicted: false });
    expect(graphFilterIsActive(DEFAULT_GRAPH_FILTER)).toBe(false);
    expect(graphFilterIsActive(null)).toBe(false);
  });

  it("returns the input edge array unchanged when the filter is empty", () => {
    expect(applyGraphFilter(edges, null)).toBe(edges);
    expect(applyGraphFilter(edges, DEFAULT_GRAPH_FILTER)).toBe(edges);
  });

  it("hides relations below the support threshold", () => {
    const filter: GraphFilterState = { minSupport: 0.5, hideContradicted: false };
    expect(graphFilterIsActive(filter)).toBe(true);
    const out = applyGraphFilter(edges, filter);
    expect(out.map((e) => e.id).sort()).toEqual(["e-disp", "e-high"]);
  });

  it("hides CONTRADICTED relations when asked", () => {
    const filter: GraphFilterState = { minSupport: 0, hideContradicted: true };
    const out = applyGraphFilter(edges, filter);
    expect(out.map((e) => e.id).sort()).toEqual(["e-high", "e-low", "e-mid"]);
  });

  it("combines both dimensions", () => {
    const filter: GraphFilterState = { minSupport: 0.6, hideContradicted: true };
    const out = applyGraphFilter(edges, filter);
    expect(out.map((e) => e.id)).toEqual(["e-high"]);
  });

  it("exposes sane relation-range constants", () => {
    expect(MIN_SUPPORT_STEP).toBe(0.05);
    expect(MIN_SUPPORT_MAX).toBe(0.6);
  });
});