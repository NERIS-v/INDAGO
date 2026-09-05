// ============================================================================
// PR-3 — Unified Investigative Context Bridge
//
// Verifies the canonical selection contract from the pure library up to the
// full shell: selection happening in the graph is bridged to the contextual
// panel, the intelligence Overview, and the operational rail's capability
// mapping — with distinct empty/loading/resolved/unsupported/not-found/error
// states, a generation-token race guard, and a focus seam to the graph.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { ContextualPanel } from "@/components/graph/control-center/contextual-panel";
import { GraphPanel } from "@/components/graph/graph-panel";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_VICTOR,
  ENT_MARIA,
  GN_VICTOR,
  GAP_1,
  EVID_ACCOUNT_1,
  OBS_1,
  LEAD_1,
  REL_1,
  HYP_1,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  contextKey,
  sameContextIdentity,
  contextKindLabel,
  contextDisplayLabel,
  getContextualCapabilities,
  EMPTY_CAPABILITIES,
  type InvestigativeContext,
} from "@/lib/context/investigative-context";
import {
  resolveContext,
  isResolved,
  resolutionStatus,
} from "@/lib/context/context-resolver";
import { useContextResolution } from "@/lib/context/use-context-resolution";
import { useInvestigativeContext } from "@/lib/context/use-investigative-context";

// ---------------------------------------------------------------------------
// Clickable GraphCanvas seam — the real canvas is a d3/ResizeObserver leaf in
// jsdom, so we substitute a lightweight version that still speaks the PR-3
// graph → bridge intents: node clicks flow through onNodeClick and the focus
// control is captured so the shell can drive focusNode deterministically.
// ---------------------------------------------------------------------------
const graphMocks = vi.hoisted(() => ({
  focusCalls: [] as string[],
  fitCalls: null as null | number,
}));

vi.mock("@/components/graph/graph-canvas", () => ({
  GraphCanvas: (props: any) => {
    if (props.controlsRef) {
      props.controlsRef.current = {
        zoomIn: () => undefined,
        zoomOut: () => undefined,
        fit: () => {
          if (graphMocks.fitCalls !== null) {
            graphMocks.fitCalls += 1;
          }
        },
        focusNode: (id: string) => {
          graphMocks.focusCalls.push(id);
        },
        focusPair: (aId: string, bId: string) => {
          graphMocks.focusCalls.push(aId, bId);
        },
      };
    }
    return (
      <div data-testid="graph-canvas">
        <button
          type="button"
          data-testid="canvas-background"
          onClick={() => props.onCanvasBackgroundPointerDown?.()}
        >
          empty canvas area
        </button>
        {(props.nodes ?? []).map((n: any) => (
          <button
            key={n.id}
            type="button"
            data-node-id={n.id}
            data-entity-id={n.entityId ?? ""}
            data-selected={props.selectedNodeId === n.id ? "true" : "false"}
            onClick={() => props.onNodeClick?.(n.id)}
          >
            {n.label ?? n.entityId ?? n.id}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const { href, children, ...rest } = props;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr3:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function makeProviders() {
  return createWorkspaceDemoProviders(identity(), config);
}

function renderControlCenter() {
  const providers = makeProviders();
  const utils = render(
    <WorkspaceProvider providers={providers}>
      <GraphControlCenter activeTimeRange={null} onTimeRangeChange={() => undefined} />
    </WorkspaceProvider>,
  );
  return { ...utils, providers };
}

function contextRegion() {
  return document.querySelector<HTMLElement>("[data-context-region]");
}

function regionState() {
  return contextRegion()?.getAttribute("data-context-state") ?? null;
}

function regionKind() {
  return contextRegion()?.getAttribute("data-context-kind") ?? "";
}

function resolvedTitle() {
  return document.querySelector<HTMLElement>("[data-context-resolved-title]")?.textContent ?? "";
}

async function selectEntityNode(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
}

async function waitResolved(title: string, kind: string) {
  await waitFor(() => {
    expect(regionState()).toBe("resolved");
    expect(regionKind()).toBe(kind);
    expect(resolvedTitle()).toBe(title);
  });
}

function railSlot(slot: string) {
  const el = document.querySelector<HTMLButtonElement>(`[data-slot="${slot}"]`);
  expect(el).not.toBeNull();
  return el as HTMLButtonElement;
}

function temporalTabs() {
  return screen.getByRole("tablist", { name: "Temporal context tabs" });
}

function intelTabs() {
  return screen.getByRole("tablist", { name: "Investigative intelligence tabs" });
}

beforeEach(() => {
  graphMocks.focusCalls.length = 0;
  graphMocks.fitCalls = 0;
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// 1. Pure contract + capability mapping
// ============================================================================

describe("PR-3 — context contract (pure)", () => {
  it("builds a stable identity from kind + id", () => {
    const ctx: InvestigativeContext = { kind: "entity", id: ENT_VICTOR, source: "graph" };
    expect(contextKey(ctx)).toBe(`entity:${ENT_VICTOR}`);
    expect(contextKey({ kind: "cross-case", id: "cobalt", source: "rail" })).toBe("cross-case:cobalt");
  });

  it("compares identities by kind + id, never by source", () => {
    const a: InvestigativeContext = { kind: "entity", id: ENT_VICTOR, source: "graph" };
    const b: InvestigativeContext = { kind: "entity", id: ENT_VICTOR, source: "deep-link" };
    const c: InvestigativeContext = { kind: "gap", id: GAP_1, source: "graph" };
    expect(sameContextIdentity(a, b)).toBe(true);
    expect(sameContextIdentity(a, c)).toBe(false);
    expect(sameContextIdentity(null, null)).toBe(true);
    expect(sameContextIdentity(a, null)).toBe(false);
    expect(sameContextIdentity(undefined, undefined)).toBe(true);
  });

  it("labels every kind without a provider import", () => {
    expect(contextKindLabel("entity")).toBe("Entity");
    expect(contextKindLabel("relation")).toBe("Relation");
    expect(contextKindLabel("evidence")).toBe("Evidence");
    expect(contextKindLabel("observation")).toBe("Observation");
    expect(contextKindLabel("lead")).toBe("Lead");
    expect(contextKindLabel("hypothesis")).toBe("Hypothesis");
    expect(contextKindLabel("gap")).toBe("Gap");
    expect(contextKindLabel("anomaly")).toBe("Anomaly");
    expect(contextKindLabel("cross-case")).toBe("Cross-case");
    expect(contextDisplayLabel({ kind: "entity", id: ENT_VICTOR, source: "graph" }, "Victor Aldridge")).toBe(
      "Entity — Victor Aldridge",
    );
    expect(contextDisplayLabel({ kind: "gap", id: GAP_1, source: "graph" }, null)).toBe(`Gap — ${GAP_1}`);
  });

  it("shows a fully-disabled capability set when nothing is selected", () => {
    expect(getContextualCapabilities(null, { mode: "demo" })).toEqual(EMPTY_CAPABILITIES);
  });

  it("maps an entity to every actionable capability except challenge", () => {
    const caps = getContextualCapabilities({ kind: "entity", id: ENT_VICTOR, source: "graph" }, { mode: "demo" });
    expect(caps).toEqual({
      canFocus: true,
      canExpand: true,
      canTraceEvidence: true,
      canReview: true,
      canResolve: true,
      canChallenge: false,
    });
  });

  it("maps non-entity kinds with no deterministic focus target", () => {
    const demo = { mode: "demo" } as const;

    const relation = getContextualCapabilities({ kind: "relation", id: REL_1, source: "graph" }, demo);
    expect(relation.canFocus).toBe(false);
    expect(relation.canChallenge).toBe(true);
    expect(relation.canResolve).toBe(false);
    expect(relation.canExpand).toBe(true);

    const hypothesis = getContextualCapabilities({ kind: "hypothesis", id: HYP_1, source: "graph" }, demo);
    expect(hypothesis.canResolve).toBe(true);
    expect(hypothesis.canChallenge).toBe(true);
    expect(hypothesis.canFocus).toBe(false);

    const gap = getContextualCapabilities({ kind: "gap", id: GAP_1, source: "graph" }, demo);
    expect(gap.canResolve).toBe(true);
    expect(gap.canFocus).toBe(false);

    const anomaly = getContextualCapabilities({ kind: "anomaly", id: "anom-1", source: "external" }, demo);
    expect(anomaly.canReview).toBe(true);
    expect(anomaly.canResolve).toBe(true);
    expect(anomaly.canChallenge).toBe(true);
    expect(anomaly.canFocus).toBe(false);
  });

  it("gates cross-case review to demo mode only", () => {
    const crossCase: InvestigativeContext = { kind: "cross-case", id: "cobalt", source: "rail" };
    const demo = getContextualCapabilities(crossCase, { mode: "demo" });
    const live = getContextualCapabilities(crossCase, { mode: "live" });
    expect(demo.canReview).toBe(true);
    expect(live.canReview).toBe(false);
    expect(demo.canExpand).toBe(true);
    expect(demo.canChallenge).toBe(false);
  });
});

// ============================================================================
// 2. Resolver over the demo providers
// ============================================================================

describe("PR-3 — context resolver over demo providers", () => {
  it("resolves an entity to current provider data", async () => {
    const providers = makeProviders();
    const res = await resolveContext(providers, { kind: "entity", id: ENT_VICTOR, source: "external" });
    expect(isResolved(res)).toBe(true);
    if (isResolved(res)) {
      expect(res.display.title).toBe("Victor Aldridge");
      expect(res.display.subtitle).toMatch(/Entity ·/);
      expect(res.display.rows.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("resolves an evidence item", async () => {
    const providers = makeProviders();
    const res = await resolveContext(providers, { kind: "evidence", id: EVID_ACCOUNT_1, source: "timeline" });
    expect(isResolved(res)).toBe(true);
    if (isResolved(res)) {
      expect(res.display.title).toBe("Account 0092 — Transaction Ledger");
      expect(res.display.subtitle).toMatch(/Evidence · FINANCIAL/);
    }
  });

  it("resolves an observation through listByInvestigation + find (no get-by-id seam)", async () => {
    const providers = makeProviders();
    const res = await resolveContext(providers, { kind: "observation", id: OBS_1, source: "timeline" });
    expect(isResolved(res)).toBe(true);
    if (isResolved(res)) {
      expect(res.display.title).toBe(`Observation ${OBS_1.slice(0, 8)}`);
      expect(res.display.subtitle).toMatch(/Observation ·/);
    }
  });

  it("resolves a lead, a gap, and a relation", async () => {
    const providers = makeProviders();
    const lead = await resolveContext(providers, { kind: "lead", id: LEAD_1, source: "external" });
    expect(resolutionStatus(lead)).toBe("resolved");
    if (isResolved(lead)) expect(lead.display.subtitle).toMatch(/Lead ·/);

    const gap = await resolveContext(providers, { kind: "gap", id: GAP_1, source: "graph" });
    expect(resolutionStatus(gap)).toBe("resolved");
    if (isResolved(gap)) expect(gap.display.subtitle).toMatch(/Gap ·/);

    const relation = await resolveContext(providers, { kind: "relation", id: REL_1, source: "graph" });
    expect(resolutionStatus(relation)).toBe("resolved");
    if (isResolved(relation)) expect(relation.display.subtitle).toMatch(/Relation ·/);
  });

  it("resolves a hypothesis through the robustness engine seam", async () => {
    const providers = makeProviders();
    const res = await resolveContext(providers, { kind: "hypothesis", id: HYP_1, source: "external" });
    expect(isResolved(res)).toBe(true);
    if (isResolved(res)) {
      const robustness = res.display.rows.find((r) => r.label === "Robustness");
      expect(robustness?.value).toBe("78/100");
    }
  });

  it("maps a missing object to not-found, distinct from error", async () => {
    const providers = makeProviders();
    const entity = await resolveContext(providers, { kind: "entity", id: "missing-entity", source: "external" });
    expect(resolutionStatus(entity)).toBe("not-found");
    const hypothesis = await resolveContext(providers, { kind: "hypothesis", id: "hyp-nonexistent", source: "external" });
    expect(resolutionStatus(hypothesis)).toBe("not-found");
  });

  it("maps an unresolvable kind to a first-class unsupported state", async () => {
    const providers = makeProviders();
    const res = await resolveContext(providers, { kind: "anomaly", id: "anom-1", source: "external" });
    expect(resolutionStatus(res)).toBe("unsupported");
    if (res.status === "unsupported") {
      expect(res.reason).toBeTruthy();
    }
  });

  it("resolves a cross-case overlay by ref and maps a foreign ref to not-found", async () => {
    const providers = makeProviders();
    const known = await resolveContext(providers, { kind: "cross-case", id: "cobalt", source: "rail" });
    expect(isResolved(known)).toBe(true);
    if (isResolved(known)) expect(known.display.title).toBe("Operation Cobalt");

    const unknown = await resolveContext(providers, { kind: "cross-case", id: "no-such-overlay", source: "rail" });
    expect(resolutionStatus(unknown)).toBe("not-found");
  });
});

// ============================================================================
// 3. Controller + generation-token race guard
// ============================================================================

describe("PR-3 — context controller and resolution race", () => {
  it("select/focus/reveal/clear drive the single selection slot", () => {
    const { result } = renderHook(() => useInvestigativeContext());
    const victor: InvestigativeContext = { kind: "entity", id: ENT_VICTOR, source: "graph" };
    const gap: InvestigativeContext = { kind: "gap", id: GAP_1, source: "timeline" };

    act(() => result.current.select(victor));
    expect(result.current.context).toEqual(victor);
    expect(result.current.contextIdentity).toBe(`entity:${ENT_VICTOR}`);

    act(() => result.current.reveal(gap));
    expect(result.current.context).toEqual(gap);
    expect(result.current.contextIdentity).toBe(`gap:${GAP_1}`);

    act(() => result.current.focus(victor));
    expect(result.current.context).toEqual(victor);

    act(() => result.current.clear());
    expect(result.current.context).toBeNull();
    expect(result.current.contextIdentity).toBe("");
  });

  it("starts with loading = false and a null resolution when nothing is selected", () => {
    const providers = makeProviders();
    const { result } = renderHook(() => useContextResolution(null), {
      wrapper: ({ children }) => <WorkspaceProvider providers={providers}>{children}</WorkspaceProvider>,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.resolution).toBeNull();
    expect(result.current.context).toBeNull();
  });

  it("a slow stale resolution never overwrites a newer selection (generation token)", async () => {
    const base = makeProviders();
    const slow = {
      ...base,
      entities: {
        ...base.entities,
        get: async (id: string) => {
          if (id === ENT_VICTOR) {
            await new Promise((r) => setTimeout(r, 40));
          }
          return base.entities.get(id);
        },
      },
    };

    const { result, rerender } = renderHook(
      (props: { context: InvestigativeContext | null }) => useContextResolution(props.context),
      {
        initialProps: { context: null as InvestigativeContext | null },
        wrapper: ({ children }) => <WorkspaceProvider providers={slow}>{children}</WorkspaceProvider>,
      },
    );

    act(() => rerender({ context: { kind: "entity", id: ENT_VICTOR, source: "graph" } }));
    expect(result.current.loading).toBe(true);

    // Switch to Maria BEFORE the slow Victor resolution lands (t + 5ms < t + 40ms).
    await new Promise((r) => setTimeout(r, 5));
    act(() => rerender({ context: { kind: "entity", id: ENT_MARIA, source: "graph" } }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(isResolved(result.current.resolution)).toBe(true);
      if (isResolved(result.current.resolution)) {
        expect(result.current.resolution?.id).toBe(ENT_MARIA);
      }
    });

    // Enough time for Victor's slow resolution to have landed if it were not
    // guarded — it must NOT have overwritten Maria.
    await new Promise((r) => setTimeout(r, 60));
    expect(isResolved(result.current.resolution)).toBe(true);
    if (isResolved(result.current.resolution)) {
      expect(result.current.resolution.id).toBe(ENT_MARIA);
    }
  });
});

// ============================================================================
// 4. ContextualPanel render-state contract (isolated)
// ============================================================================

describe("PR-3 — contextual panel render-state contract", () => {
  it("renders loading then resolved for a real entity", async () => {
    const base = makeProviders();
    const slow = {
      ...base,
      entities: {
        ...base.entities,
        get: async (id: string) => {
          if (id === ENT_VICTOR) {
            await new Promise((r) => setTimeout(r, 40));
          }
          return base.entities.get(id);
        },
      },
    };
    render(
      <WorkspaceProvider providers={slow}>
        <ContextualPanel open onToggle={() => undefined} context={{ kind: "entity", id: ENT_VICTOR, source: "graph" }} />
      </WorkspaceProvider>,
    );

    expect(regionState()).toBe("loading");
    await waitFor(() => {
      expect(regionState()).toBe("resolved");
      expect(resolvedTitle()).toBe("Victor Aldridge");
    });
  });

  it("renders unsupported distinct from empty (anomaly has no adapter)", async () => {
    render(
      <WorkspaceProvider providers={makeProviders()}>
        <ContextualPanel open onToggle={() => undefined} context={{ kind: "anomaly", id: "anom-1", source: "external" }} />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(regionState()).toBe("unsupported"));
    expect(screen.getByText("Context unavailable")).toBeInTheDocument();
    expect(screen.getByText(/The selection is preserved/i)).toBeInTheDocument();
  });

  it("renders not-found distinct from unsupported", async () => {
    render(
      <WorkspaceProvider providers={makeProviders()}>
        <ContextualPanel open onToggle={() => undefined} context={{ kind: "entity", id: "vanished", source: "external" }} />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(regionState()).toBe("not-found"));
    expect(screen.getByText("Object unavailable")).toBeInTheDocument();
    expect(screen.getByText(/no longer exists/i)).toBeInTheDocument();
  });
});

// ============================================================================
// 5. Graph → context bridge end-to-end through the shell
// ============================================================================

describe("PR-3 — graph → context bridge (end-to-end)", () => {
  it("defaults to the empty state and a disabled Focus command", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    expect(regionState()).toBe("empty");
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
    // The investigative intelligence panel is connected (PR-5): the Overview
    // surfaces the real investigation summary without a reserved placeholder.
    expect(await screen.findByText("Investigation overview")).toBeInTheDocument();
    expect(screen.getByText("Counts · No rankings")).toBeInTheDocument();

    const focus = railSlot("focus");
    expect(focus).toBeDisabled();
    expect(focus.getAttribute("data-capability")).toBe("false");
    expect(focus.getAttribute("title")).toContain("Select an entity");
  });

  it("selecting an entity node resolves the panel, the intelligence Overview, and enables Focus", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    expect(document.querySelector("[data-context-panel-kind]")?.textContent).toBe("Entity");
    // The intelligence Overview resolves in parallel with the region: the
    // grounded entity surface renders kind entity, an entity overview heading,
    // a stat grid, and narrative clauses sourced from the provider stack.
    await waitFor(() => {
      const overview = document.querySelector("[data-intelligence-overview]");
      expect(overview?.getAttribute("data-intelligence-overview-kind")).toBe("entity");
    });
    expect(screen.getByText("Entity overview")).toBeInTheDocument();
    expect(document.querySelector("[data-context-stat-grid]")).not.toBeNull();
    expect(document.querySelector("[data-context-clauses]")).not.toBeNull();
    void screen.getByText(/observations and \d+ relations trace this entity/i);

    const focus = railSlot("focus");
    expect(focus).not.toBeDisabled();
    expect(focus.getAttribute("data-capability")).toBe("true");
    expect(focus.getAttribute("title")).toContain("Center selection on graph");
  });

  it("keeps the resolved selection alive across rail collapse and tab churn", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    // Tab churn (temporal Time ↔ Versions, intelligence Overview ↔ Hypotheses).
    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Versions" }));
    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Time" }));
    fireEvent.click(within(intelTabs()).getByRole("tab", { name: "Hypotheses" }));
    expect(regionState()).toBe("resolved");
    expect(resolvedTitle()).toBe("Victor Aldridge");

    // Left rail collapse + reopen (selection lives in the shell, not the rail).
    fireEvent.click(screen.getByRole("button", { name: "Collapse left operational rail" }));
    expect(regionState()).toBe("resolved");
    fireEvent.click(screen.getByRole("button", { name: "Open left operational rail" }));
    expect(regionState()).toBe("resolved");
    expect(resolvedTitle()).toBe("Victor Aldridge");
  });

  it("keeps the resolved selection across right contextual panel collapse + reopen", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    fireEvent.click(screen.getByRole("button", { name: "Collapse right contextual panel" }));
    expect(screen.queryByRole("complementary", { name: "Contextual panel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open right contextual panel" }));
    await waitResolved("Victor Aldridge", "entity");
  });

  it("re-clicking a node while the panel is collapsed reopens it with the selection", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    fireEvent.click(screen.getByRole("button", { name: "Collapse right contextual panel" }));
    expect(screen.queryByRole("complementary", { name: "Contextual panel" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Victor Aldridge" }));
    await screen.findByRole("complementary", { name: "Contextual panel" });
    await waitResolved("Victor Aldridge", "entity");
  });

  it("re-clicking the selected node while the panel is open deselects it and clears the highlight", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");
    expect(screen.getByRole("button", { name: "Victor Aldridge" }).getAttribute("data-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Victor Aldridge" }));
    await waitFor(() => {
      expect(regionState()).toBe("empty");
      expect(regionKind()).toBe("");
    });
    expect(screen.getByRole("button", { name: "Victor Aldridge" }).getAttribute("data-selected")).toBe("false");
    expect(railSlot("focus")).toBeDisabled();
  });

  it("clicking empty canvas clears the selection and the graph highlight", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    fireEvent.click(screen.getByTestId("canvas-background"));
    await waitFor(() => expect(regionState()).toBe("empty"));
    expect(screen.getByRole("button", { name: "Victor Aldridge" }).getAttribute("data-selected")).toBe("false");
  });

  it("deselecting does NOT zoom the camera back out (only the rail focus zooms)", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");
    // Baseline AFTER the graph settles (the mount may legitimately fit once).
    const before = graphMocks.fitCalls ?? 0;

    fireEvent.click(screen.getByRole("button", { name: "Victor Aldridge" }));
    await waitFor(() => expect(regionState()).toBe("empty"));
    // Give a stray delayed fit a chance to fire, then assert NONE landed —
    // clearing a selection must release the focus visually without zooming out.
    await new Promise((r) => setTimeout(r, 250));
    expect(graphMocks.fitCalls ?? 0).toBe(before);
  });

  it("re-opening Detect Gaps after pitching a gap shows the list again", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    const gapButton = (await screen.findAllByRole("button")).find((b) => (b.textContent ?? "").includes("IMPACT"));
    expect(gapButton).toBeDefined();
    fireEvent.click(gapButton as HTMLButtonElement);
    await waitFor(() => expect(regionState()).toBe("resolved"));
    expect(regionKind()).toBe("gap");
    expect(screen.queryByText("Investigative Gaps")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    await screen.findByText("Investigative Gaps");
    expect(screen.queryByRole("complementary", { name: "Contextual panel" })).not.toBeInTheDocument();
  });

  it("opening Detect Gaps collapses the right contextual panel so the two never double-cover the graph", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");
    expect(screen.getByRole("complementary", { name: "Contextual panel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    expect(screen.getByText("Investigative Gaps")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Contextual panel" })).not.toBeInTheDocument(),
    );

    // Selecting a gap from the overlay reopens the panel with the gap.
    const gapButton = (await screen.findAllByRole("button")).find((b) => (b.textContent ?? "").includes("IMPACT"));
    expect(gapButton).toBeDefined();
    fireEvent.click(gapButton as HTMLButtonElement);
    await waitFor(() => expect(regionState()).toBe("resolved"));
    expect(regionKind()).toBe("gap");
  });

  it("selecting an entity never opens the legacy in-graph drawer in the shell", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    expect(screen.queryByRole("button", { name: "Close entity details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Vulnerability Details")).not.toBeInTheDocument();
  });

  it("Focus requests the owning graph node through the canvas control", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    expect(graphMocks.focusCalls).not.toContain(GN_VICTOR);
    fireEvent.click(railSlot("focus"));
    await waitFor(() => expect(graphMocks.focusCalls).toContain(GN_VICTOR));
  });

  it("selecting a gap resolves it and disables Focus (no deterministic graph target)", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    const gapButton = (await screen.findAllByRole("button")).find((b) => (b.textContent ?? "").includes("IMPACT"));
    expect(gapButton).toBeDefined();
    fireEvent.click(gapButton as HTMLButtonElement);

    await waitFor(() => expect(regionState()).toBe("resolved"));
    expect(regionKind()).toBe("gap");
    expect(document.querySelector("[data-context-panel-kind]")?.textContent).toBe("Gap");

    const focus = railSlot("focus");
    expect(focus).toBeDisabled();
    expect(focus.getAttribute("data-capability")).toBe("false");
    expect(focus.getAttribute("title")).toContain("no deterministic graph target");
  });

  it("exposes capability awareness without faking un-wired commands", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    for (const [slot, expected] of [
      ["expand", "true"],
      ["review", "true"],
      ["resolve", "true"],
      ["challenge", "false"],
    ] as const) {
      const el = railSlot(slot);
      expect(el).toBeDisabled();
      expect(el.getAttribute("data-capability")).toBe(expected);
    }
  });

  it("activating a cross-case overlay selects it; deactivation clears it", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Cross-Case/ }));
    const pick = await screen.findByRole("button", { name: /Match: Operation Cobalt/ });
    fireEvent.click(pick);

    await waitResolved("Operation Cobalt", "cross-case");
    expect(railSlot("focus")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Match: Operation Cobalt/ }));
    await waitFor(() => expect(regionState()).toBe("empty"));
    expect(regionKind()).toBe("");
  });

  it("deactivating an overlay never clears a real entity selection", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    fireEvent.click(screen.getByRole("button", { name: /^Cross-Case/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Match: Operation Cobalt/ }));
    await waitResolved("Operation Cobalt", "cross-case");

    // Re-selecting the entity while the overlay is active overrides it.
    fireEvent.click(screen.getByRole("button", { name: "Victor Aldridge" }));
    await waitResolved("Victor Aldridge", "entity");

    fireEvent.click(screen.getByRole("button", { name: /Match: Operation Cobalt/ }));
    await waitResolved("Victor Aldridge", "entity");
  });

  it("timeline activation reveals the backing evidence in the contextual panel", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Activate Account 0092 ledger" }));
    await waitResolved("Account 0092 — Transaction Ledger", "evidence");
    expect(document.querySelector("[data-context-panel-kind]")?.textContent).toBe("Evidence");
  });
});

// ============================================================================
// 6. Deep-link intent + source guards
// ============================================================================

describe("PR-3 — deep-link intent and source guards", () => {
  it("standalone rendering (no context bridge) keeps the legacy drawer intact", async () => {
    const providers = makeProviders();
    render(
      <WorkspaceProvider providers={providers}>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceProvider>,
    );
    await screen.findByTestId("graph-canvas");

    fireEvent.click(await screen.findByRole("button", { name: "Victor Aldridge" }));
    expect(await screen.findByRole("button", { name: "Close entity details" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close entity details" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Close entity details" })).not.toBeInTheDocument(),
    );
  });

  it("a ?focus deep link surfaces as an initial entity intent through the bridge", async () => {
    const providers = makeProviders();
    const onContextSelect = vi.fn();
    render(
      <WorkspaceProvider providers={providers}>
        <GraphPanel activeTimeRange={null} initialFocusNodeId={GN_VICTOR} onContextSelect={onContextSelect} />
      </WorkspaceProvider>,
    );
    await screen.findByTestId("graph-canvas");

    await waitFor(() => {
      expect(onContextSelect).toHaveBeenCalledWith({ kind: "entity", id: ENT_VICTOR, source: "deep-link" });
    });
    await waitFor(() => expect(graphMocks.focusCalls).toContain(GN_VICTOR));
  });

  it("lib/context stays importable by any surface: no demo/live/fixture/provider-construction imports", () => {
    const dir = path.resolve(__dirname, "../src/lib/context");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    walk(dir);

    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const importLines = src.split("\n").filter((l) => /^(import|export[\s\S]*\bfrom\b)/.test(l.trim()));
      expect(importLines.join("\n"), file).not.toMatch(/providers\/(demo|live)/);
      expect(importLines.join("\n"), file).not.toMatch(/demo-\w*fixtures/);
      expect(importLines.join("\n"), file).not.toMatch(/create(WorkspaceDemo|Live)Providers/);
      expect(importLines.join("\n"), file).not.toMatch(/graph-live/);
      expect(importLines.join("\n"), file).not.toMatch(/useGraphLiveOverlay/);
    }
  });

  it("the bridge files exist with their canonical exports", () => {
    const dir = path.resolve(__dirname, "../src/lib/context");
    for (const name of [
      "investigative-context.ts",
      "context-resolver.ts",
      "use-investigative-context.ts",
      "use-context-resolution.ts",
    ]) {
      expect(fs.existsSync(path.join(dir, name))).toBe(true);
    }
  });
});