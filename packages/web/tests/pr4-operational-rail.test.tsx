// ============================================================================
// PR-4 — Context-Aware Operational Rail (end-to-end)
//
// Verifies the rail renders from the PR-4 action model, respects command TYPE
// semantics (immediate / surface-toggle / modal / mutation), stays honest about
// un-wired commands, wires every real action to its existing seam (PR-3 focus,
// PR-2 surfaces, and the new Filter), and never degrades the PR-2/PR-3 shell
// contracts: capability attrs, aria-pressed, disabled semantics, titles, and
// graph-cell preservation.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  GN_VICTOR,
  GE_1,
  GE_5,
  GE_6,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import { MIN_SUPPORT_MAX } from "@/lib/graph/graph-filter";

const graphMocks = vi.hoisted(() => ({
  focusCalls: [] as string[],
  fitCalls: null as null | number,
  lastEdges: [] as { id?: string }[],
}));

vi.mock("@/components/graph/graph-canvas", () => ({
  GraphCanvas: (props: any) => {
    graphMocks.lastEdges = props.edges ?? [];
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

function identity(workspaceId = `pr4:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderControlCenter() {
  const providers = createWorkspaceDemoProviders(identity(), config);
  const utils = render(
    <WorkspaceProvider providers={providers}>
      <GraphControlCenter activeTimeRange={null} onTimeRangeChange={() => undefined} />
    </WorkspaceProvider>,
  );
  return {
    ...utils,
    providers,
    graphCell: () => utils.container.querySelector("[data-graph-workspace]"),
  };
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

function railSlot(slot: string) {
  const el = document.querySelector<HTMLButtonElement>(`[data-slot="${slot}"]`);
  expect(el).not.toBeNull();
  return el as HTMLButtonElement;
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

beforeEach(() => {
  graphMocks.focusCalls.length = 0;
  graphMocks.fitCalls = 0;
  graphMocks.lastEdges = [];
});

afterEach(() => {
  cleanup();
});

describe("PR-4 — rail renders from the action model", () => {
  it("renders every command with a stable data-slot inside its group", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    const expected: Record<string, string[]> = {
      Graph: ["search", "focus", "expand", "filter", "layers", "layout"],
      Investigate: ["discover", "find-connections", "detect-gaps", "trace-evidence", "cross-case"],
      "Act / Verify": ["add-evidence", "review", "resolve", "challenge"],
    };
    for (const [group, slots] of Object.entries(expected)) {
      const heading = await screen.findByText(group);
      const groupNode = heading.closest("[data-rail-group]") ?? heading.parentElement;
      expect(groupNode).not.toBeNull();
      for (const slot of slots) {
        expect(railSlot(slot)).toBeInTheDocument();
      }
    }
  });

  it("labels every command with its metadata name", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    for (const name of ["Search", "Focus", "Expand", "Filter", "Layers", "Layout"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });

  it("defaults to a no-context baseline: Focus disabled with an honest reason", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    const focus = railSlot("focus");
    expect(focus).toBeDisabled();
    expect(focus.getAttribute("data-capability")).toBe("false");
    expect(focus.getAttribute("title")).toContain("Select an entity");
  });

  it("keeps un-wired commands disabled even when the selection is capable", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    for (const [slot, expectedCapability] of [
      ["expand", "true"],
      ["review", "true"],
      ["resolve", "true"],
      ["challenge", "false"],
    ] as const) {
      const el = railSlot(slot);
      expect(el).toBeDisabled();
      expect(el.getAttribute("data-capability")).toBe(expectedCapability);
      expect(el.getAttribute("title")).toBeTruthy();
    }
  });
});

describe("PR-4 — command-type semantics", () => {
  it("gives surface-toggle commands an open/closed state with aria-pressed", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    for (const slot of ["layers", "discover", "detect-gaps", "filter", "cross-case"]) {
      const el = railSlot(slot);
      expect(el.getAttribute("aria-pressed")).toBe("false");
    }
    expect(railSlot("add-evidence").getAttribute("aria-pressed")).toBeNull();
    expect(railSlot("focus").getAttribute("aria-pressed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    expect(railSlot("layers").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    expect(railSlot("layers").getAttribute("aria-pressed")).toBe("false");
  });

  it("treats surfaces as exclusive except Legend and Filter (independent surfaces)", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(railSlot("layers").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("filter").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^Discover/ }));
    expect(railSlot("discover").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("layers").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("filter").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    expect(railSlot("detect-gaps").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("discover").getAttribute("aria-pressed")).toBe("false");
    expect(railSlot("layers").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("filter").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the modal (Add Evidence) out of the toggle state machine", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    fireEvent.click(screen.getByRole("button", { name: /^Add Evidence/ }));
    expect(await screen.findByRole("heading", { name: "Upload Evidence" })).toBeInTheDocument();
    expect(railSlot("add-evidence").getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByRole("heading", { name: "Upload Evidence" })).not.toBeInTheDocument();
  });
});

describe("PR-4 — real actions reach their existing seams", () => {
  it("Focus (immediate) requests the owning graph node through the canvas control", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    expect(railSlot("focus")).not.toBeDisabled();
    expect(railSlot("focus").getAttribute("title")).toContain("Center selection on graph");
    fireEvent.click(railSlot("focus"));
    await waitFor(() => expect(graphMocks.focusCalls).toContain(GN_VICTOR));
  });

  it("Detect Gaps resolves a gap and disables Focus through the action model", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));
    const gapButton = (await screen.findAllByRole("button")).find((b) =>
      (b.textContent ?? "").includes("IMPACT"),
    );
    expect(gapButton).toBeDefined();
    fireEvent.click(gapButton as HTMLButtonElement);
    await waitFor(() => expect(regionState()).toBe("resolved"));
    expect(regionKind()).toBe("gap");

    const focus = railSlot("focus");
    expect(focus).toBeDisabled();
    expect(focus.getAttribute("title")).toContain("no deterministic graph target");
  });

  it("Cross-Case (surface-toggle) activates a provider overlay and resolves context", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    fireEvent.click(screen.getByRole("button", { name: /^Cross-Case/ }));
    const pick = await screen.findByRole("button", { name: /Match: Operation Cobalt/ });
    fireEvent.click(pick);

    await waitResolved("Operation Cobalt", "cross-case");
    expect(railSlot("cross-case").getAttribute("aria-pressed")).toBe("true");
    expect(railSlot("focus")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Match: Operation Cobalt/ }));
    await waitFor(() => expect(regionState()).toBe("empty"));
    // No selection remains, so Focus correctly returns to its honest baseline.
    expect(railSlot("focus")).toBeDisabled();
    expect(railSlot("focus").getAttribute("title")).toContain("Select an entity");
    // Active overlay cleared; closing the still-open picker releases the slot.
    fireEvent.click(screen.getByRole("button", { name: /^Cross-Case/ }));
    expect(railSlot("cross-case").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("PR-4 — Filter: the new real graph command", () => {
  it("opens its own pressable surface with inline controls", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    expect(screen.queryByLabelText("Minimum relation support threshold")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(railSlot("filter").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Minimum relation support threshold")).toBeInTheDocument();
    expect(screen.getByLabelText("Hide contradicted relations")).toBeInTheDocument();
  });

  it("visibly prunes rendered relations without touching physics/drawer topology", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await waitFor(() => expect(graphMocks.lastEdges.length).toBe(6));

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.change(screen.getByLabelText("Minimum relation support threshold"), {
      target: { value: String(MIN_SUPPORT_MAX) },
    });
    fireEvent.click(screen.getByLabelText("Hide contradicted relations"));

    await waitFor(() => expect(graphMocks.lastEdges.length).toBe(4));
    const remaining = graphMocks.lastEdges.map((e) => e.id);
    expect(remaining).toContain(GE_1);
    expect(remaining).not.toContain(GE_5); // contradicted
    expect(remaining).not.toContain(GE_6); // support 0.2 < 0.6
  });
});

describe("PR-4 — preservation and non-interference", () => {
  it("keeps the graph cell identity and the resolved selection across rail churn", async () => {
    const { graphCell } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitResolved("Victor Aldridge", "entity");

    const cellBefore = graphCell();
    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(graphCell()).toBe(cellBefore);
    expect(regionState()).toBe("resolved");
    expect(resolvedTitle()).toBe("Victor Aldridge");

    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    await waitResolved("Victor Aldridge", "entity");
    expect(railSlot("focus")).not.toBeDisabled();
  });

  it("surface toggles never fit/zoom the camera (only Focus zooms)", async () => {
    // Non-staging toggles (Layers / Filter / Cross-Case) must never fit or zoom
    // the camera — only Focus and the cross-case reveal legitimately do. Give
    // the deferred mount fit a chance to land FIRST so it cannot pollute the
    // baseline.
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await new Promise((r) => setTimeout(r, 500));
    const before = graphMocks.fitCalls ?? 0;

    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Discover/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    await new Promise((r) => setTimeout(r, 250));

    expect(graphMocks.fitCalls ?? 0).toBe(before);
  });

  it("stays honest under no selection: real commands remain available, stubs stay disabled", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");

    for (const name of [/^Filter/, /^Layers/, /^Discover/, /^Detect Gaps/, /^Cross-Case/, /^Add Evidence/]) {
      expect(screen.getByRole("button", { name })).not.toBeDisabled();
    }
    for (const name of [/^Search/, /^Focus/, /^Expand/, /^Layout/, /^Find Connections/, /^Trace Evidence/, /^Review/, /^Resolve/, /^Challenge/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});