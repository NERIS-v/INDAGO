// ============================================================================
// PR-10 §20/§51 — Historical authority gate
//
// A selected historical graph version must never expose a MUTATION surface:
// the analyst is reading history, and an authority decision would apply to the
// LIVE graph. The footer reads the shell-owned temporal selection and, when a
// historical version is selected, renders an honest gated note instead of the
// Relation Authority panel (even "disabled" controls would invite a wrong
// belief). Deep-dive navigation bridges are navigation, not mutation, and stay.
//
// The gate is enforced at the footer boundary (unit) and wired through the real
// shell (E2E: relation selected via the Flow representation, then the Versions
// tab locks a historical version).
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { ContextualPanelFooter } from "@/components/graph/control-center/contextual-panel-footer";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import type { NetworkView } from "@/lib/network/network-workspace";
import {
  CASE_ID,
  INVESTIGATION_ID,
  REL_5,
  ENT_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";

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

// The graph representation's canvas is a pure visual leaf — shell wiring tests
// interact with the contextual footer and the temporal panel, not the d3 layer.
vi.mock("@/components/graph/graph-canvas", () => ({
  GraphCanvas: () => <div data-testid="graph-canvas-mock" />,
}));

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr10-authority:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function FooterHost({
  initial,
  historical,
}: {
  initial: InvestigativeContext;
  historical?: boolean;
}) {
  const [context, setContext] = useState<InvestigativeContext | null>(initial);
  return (
    <ContextualPanelFooter
      context={context}
      onReselect={setContext}
      onReloadRequest={() => undefined}
      historical={historical}
    />
  );
}

function temporalTabs() {
  return screen.getByRole("tablist", { name: "Temporal context tabs" });
}

/** Owns the representation so the test can move Flow → Graph through the real
 *  state seam after selecting a relation on a Flow segment. */
function ShellWithView() {
  const [view, setView] = useState<NetworkView>("flow");
  return (
    <GraphControlCenter
      activeTimeRange={null}
      onTimeRangeChange={() => undefined}
      activeNetworkView={view}
      onNetworkViewChange={setView}
    />
  );
}

afterEach(() => cleanup());

describe("PR-10 §20 — the footer gate: historical relation view never mutates", () => {
  it("a historical relation selection renders the gated note, never the authority panel", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <FooterHost
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          historical
        />
      </WorkspaceProvider>,
    );

    const note = await screen.findByTestId("relation-authority-historical-unavailable");
    expect(note.textContent).toContain("never mutated from a historical view");
    expect(screen.getByTestId("contextual-panel-footer")).toBeInTheDocument();
    // The honest "Relation authority" section header is kept; the mutation
    // surface itself is gone — not even a disabled panel may invite the belief
    // that history can be edited.
    expect(screen.getAllByText("Relation authority").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("relation-authority")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority-reject")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority-reverse")).not.toBeInTheDocument();
    // Deep-dive navigation bridges are safe under history and stay.
    expect(screen.getByTestId("deep-dive-bridges")).toBeInTheDocument();
  });

  it("the authority gate never makes the graph-selection footer disappear", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <FooterHost
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          historical
        />
      </WorkspaceProvider>,
    );

    expect(await screen.findByTestId("contextual-panel-footer")).toBeInTheDocument();
    expect(screen.getByTestId("relation-authority-historical-unavailable")).toBeInTheDocument();
  });

  it("a historical selection renders no actionable mutation controls at all", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const { container } = render(
      <WorkspaceProvider providers={providers}>
        <FooterHost
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          historical
        />
      </WorkspaceProvider>,
    );

    await screen.findByTestId("relation-authority-historical-unavailable");
    expect(container.querySelector('[data-authority-state]')).toBeNull();
    expect(container.querySelector('[data-testid^="relation-authority-"][data-testid$="-reason"]')).toBeNull();
  });

  it("historical=false (the pre-PR-10 default) keeps the full authority panel", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <FooterHost initial={{ kind: "relation", id: REL_5, source: "graph" }} />
      </WorkspaceProvider>,
    );

    const panel = await screen.findByTestId("relation-authority");
    expect(panel).toHaveAttribute("data-authority-state", "ready");
    expect(screen.queryByTestId("relation-authority-historical-unavailable")).not.toBeInTheDocument();
  });

  it("an entity context under a historical selection stays bridges-only (no gate note)", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <FooterHost
          initial={{ kind: "entity", id: ENT_VICTOR, source: "graph" }}
          historical
        />
      </WorkspaceProvider>,
    );

    expect(await screen.findByTestId("deep-dive-bridges")).toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority")).not.toBeInTheDocument();
    // The gate note is for relation authority contexts only.
    expect(screen.queryByTestId("relation-authority-historical-unavailable")).not.toBeInTheDocument();
  });
});

describe("PR-10 §51 — shell wiring: the lifted version selection gates the footer", () => {
  it("selecting a historical version flips the authority footer to the gate, Return to current restores it", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const utils = render(
      <WorkspaceProvider providers={providers}>
        {/* Flow representation's segment edges SELECT RELATION contexts through
            the same shell bridge the live graph uses. The footer zone only
            exists in the graph representation, so the journey moves back to
            Graph (via the state seam) with the relation still selected. */}
        <ShellWithView />
      </WorkspaceProvider>,
    );

    // 1. Select a relation through the shell (Flow segment → revealContext).
    await waitFor(() =>
      expect(utils.container.querySelector('[data-flow-edge-id^="edge:seg:"]')).not.toBeNull(),
    );
    const segment = utils.container.querySelector('[data-flow-edge-id^="edge:seg:"]')!;
    fireEvent.click(segment);

    // 2. Switch to the graph representation: the contextual footer (which owns
    //    the authority gate) is the graph-context zone.
    const switcher = screen.getByTestId("representation-switcher");
    fireEvent.click(within(switcher).getByRole("button", { name: "Graph" }));
    await screen.findByTestId("relation-authority");

    // 3. Lock the graph to a historical version from the Versions tab.
    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Versions" }));
    const v2 = await screen.findByRole("button", { name: "view-version-2" });
    fireEvent.click(v2);

    const gate = await screen.findByTestId("relation-authority-historical-unavailable");
    expect(gate).toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority")).not.toBeInTheDocument();
    expect(screen.getByTestId("deep-dive-bridges")).toBeInTheDocument();

    // 4. Return to current → the mutation surface is back only for the live graph.
    const ret = await screen.findByRole("button", { name: "Return to current" });
    fireEvent.click(ret);
    await waitFor(() => expect(screen.getByTestId("relation-authority")).toBeInTheDocument());
    expect(screen.queryByTestId("relation-authority-historical-unavailable")).not.toBeInTheDocument();
  });

  it("the lifted version selection is honestly displayed as historical in the versions panel", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const utils = render(
      <WorkspaceProvider providers={providers}>
        <GraphControlCenter
          activeTimeRange={null}
          onTimeRangeChange={() => undefined}
          activeNetworkView="flow"
          onNetworkViewChange={() => undefined}
        />
      </WorkspaceProvider>,
    );

    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Versions" }));
    const v2 = await screen.findByRole("button", { name: "view-version-2" });
    fireEvent.click(v2);

    await waitFor(() =>
      expect(utils.container.querySelector('[data-version-badge="historical"]')).not.toBeNull(),
    );
    expect(utils.container.querySelector("[data-versions-replay-note]")).not.toBeNull();
    expect(utils.container.querySelector("[data-return-current]")).not.toBeNull();
  });
});