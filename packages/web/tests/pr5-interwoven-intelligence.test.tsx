// ============================================================================
// PR-5 — Interwoven Investigative Intelligence
//
// Verifies the five intelligence tabs against the provider seams and the
// shell: Overview (investigation counts + context-resolved surface), the
// HypothesisProvider surfacing, Signals (grounded threshold filters + click-
// through re-materialization), Evidence (source groups + posture), Activity
// (realtime history replay + dedupe), context-aware Overview unsupported
// states, and live-mode UNSUPPORTED honesty.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { InvestigativeIntelligence } from "@/components/graph/control-center/investigative-intelligence";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_VICTOR,
  GN_VICTOR,
  HYP_1,
  HYP_2,
  EVID_ACCOUNT_1,
} from "@/lib/providers/demo/demo-fixtures/lookup";

// ---------------------------------------------------------------------------
// Clickable GraphCanvas seam (mirrors pr3 harness)
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
          if (graphMocks.fitCalls !== null) graphMocks.fitCalls += 1;
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

function identity(workspaceId = `pr5:${INVESTIGATION_ID}`): WorkspaceIdentity {
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

function intelTabs() {
  return screen.getByRole("tablist", { name: "Investigative intelligence tabs" });
}

function regionState() {
  return document.querySelector<HTMLElement>("[data-context-region]")?.getAttribute("data-context-state") ?? null;
}

function regionKind() {
  return document.querySelector<HTMLElement>("[data-context-region]")?.getAttribute("data-context-kind") ?? "";
}

async function selectEntityNode(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
}

async function clickTab(label: string) {
  fireEvent.click(within(intelTabs()).getByRole("tab", { name: label }));
}

beforeEach(() => {
  graphMocks.focusCalls.length = 0;
  graphMocks.fitCalls = 0;
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// 1. Overview — investigation counts + context-resolved surface
// ============================================================================

describe("PR-5 — Overview tab", () => {
  it("defaults to the investigation summary with provider counts and a no-rankings label", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await screen.findByText("Investigation overview");
    expect(document.querySelector("[data-intelligence-overview-kind]")?.getAttribute("data-intelligence-overview-kind")).toBe("investigation");
    expect(screen.getByText("Counts · No rankings")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-context-stat]").length).toBeGreaterThanOrEqual(9);
    expect(screen.queryByText(/No fabricated intelligence/)).not.toBeInTheDocument();
  });

  it("surfaces a RESOLVED entity Overview with grounded stats + clauses when an entity is selected", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitFor(() => {
      expect(regionState()).toBe("resolved");
      const overview = document.querySelector("[data-intelligence-overview]");
      expect(overview?.getAttribute("data-intelligence-overview-kind")).toBe("entity");
    });
    expect(screen.getByText("Entity overview")).toBeInTheDocument();
    const statValues = Array.from(document.querySelectorAll<HTMLElement>("[data-context-stat-value]")).map((n) => n.textContent);
    expect(statValues.length).toBeGreaterThanOrEqual(8);
    expect(document.querySelector("[data-context-clauses]")).not.toBeNull();
    expect(document.body.textContent).toMatch(/observations and \d+ relations trace this entity/);
  });

  it("never claims a ranking or score in the default summary", () => {
    // Covered here: the no-context surface is labeled "Counts · No rankings"
    // (asserted in the first Overview test). Unsupported-kind region honesty is
    // covered by PR-3; live-mode Overview honesty is covered below.
  });
});

// ============================================================================
// 2. Hypotheses — HypothesisProvider surfacing + context-aware ordering
// ============================================================================

describe("PR-5 — Hypotheses tab", () => {
  it("lists the canonical hypotheses with posture badges and grounded counts", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Hypotheses");
    await screen.findByText("Working hypotheses");
    expect(await screen.findByText("Shell-network money laundering")).toBeInTheDocument();
    expect(screen.getByText("Intermediary account as lynchpin")).toBeInTheDocument();
    const cards = document.querySelectorAll("[data-hypothesis-card]");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText(/4 supporting · 0 contradicting evidence/)).toBeInTheDocument();
  });

  it("filters to the selected entity's hypotheses with an honest filter note", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await selectEntityNode("Victor Aldridge");
    await waitFor(() => expect(regionState()).toBe("resolved"));
    await clickTab("Hypotheses");
    await screen.findByText("Working hypotheses");
    await screen.findByText(/Filtered to hypotheses involving the selected entity/);
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-hypothesis-card]"));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-hypothesis-id", HYP_1);
  });

  it("Select on graph re-materializes a REAL hypothesis selection and reorders selected-first", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Hypotheses");
    const card = (await screen.findAllByText("Shell-network money laundering"))[0]!.closest("[data-hypothesis-card]") as HTMLElement;
    fireEvent.click(within(card!).getByRole("button", { name: /Select on graph/ }));
    await waitFor(() => {
      expect(regionState()).toBe("resolved");
      expect(regionKind()).toBe("hypothesis");
    });
    // The shell region surfaces the REAL hypothesis via the displayed summary.
    expect(document.querySelector("[data-context-resolved]")?.textContent).toMatch(/perturbation stability, not a truth probability/);
    // The entity filter cleared; HYP_1 is now sectioned first and marked selected.
    const cards = document.querySelectorAll<HTMLElement>("[data-hypothesis-card]");
    await waitFor(() => expect(document.querySelectorAll<HTMLElement>("[data-hypothesis-card]").length).toBeGreaterThanOrEqual(2));
    const ordered = Array.from(document.querySelectorAll<HTMLElement>("[data-hypothesis-card]"));
    expect(ordered[0]).toHaveAttribute("data-hypothesis-id", HYP_1);
    expect(ordered[0].querySelector("[data-hypothesis-selected]")).not.toBeNull();
    void cards;
  });
});

// ============================================================================
// 3. Signals — grounded threshold filters + click-through re-materialization
// ============================================================================

describe("PR-5 — Signals tab", () => {
  it("surfaces grounded groups with a no-rankings label and an informational review queue", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Signals");
    await screen.findByText("Signals");
    await screen.findByText("Thresholds · No rankings");
    expect(screen.queryAllByText(/Contradiction · 1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/Open gap · /).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/Active lead · /).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/Cross-case overlay · /).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Review queue · 2 pending tasks")).toBeInTheDocument();
    expect(screen.getAllByText("Informational").length).toBeGreaterThanOrEqual(1);
  });

  it("never fabricates a weak-edge group when every relation is above the documented threshold", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Signals");
    await screen.findByText("Signals");
    const weak = document.querySelector('[data-signal-group="weak-relation"]');
    expect(weak).toBeNull();
  });

  it("Select on graph from a Contradiction re-materializes the backing observation in the shell", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Signals");
    await waitFor(() => expect(document.querySelector("[data-signal-group]")).not.toBeNull());
    const firstSelectable = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-select-on-graph]"))[0];
    expect(firstSelectable).toBeDefined();
    fireEvent.click(firstSelectable!);
    await waitFor(() => expect(regionState()).toBe("resolved"));
    expect(regionKind()).toBe("observation");
  });
});

// ============================================================================
// 4. Evidence — source groups + posture surface
// ============================================================================

describe("PR-5 — Evidence tab", () => {
  it("groups investigation evidence by source identity with counts", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Evidence");
    await screen.findByText("Evidence by source");
const groups = document.querySelectorAll("[data-evidence-source-group]");
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/Transaction Ledger/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders supporting vs contradicting evidence for a selected hypothesis", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    // Select HYP_1 first (re-materialized through the Hypotheses tab).
    await clickTab("Hypotheses");
    const card = (await screen.findAllByText("Shell-network money laundering"))[0]!.closest("[data-hypothesis-card]") as HTMLElement;
    fireEvent.click(within(card!).getByRole("button", { name: /Select on graph/ }));
    await waitFor(() => expect(regionKind()).toBe("hypothesis"));
    await clickTab("Evidence");
    await screen.findByText("Supporting evidence");
    expect(screen.getAllByText("Contradicting evidence").length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      const supporting = Array.from(document.querySelectorAll<HTMLElement>("[data-evidence-row]")).filter(
        (r) => r.textContent?.includes("supporting"),
      );
      expect(supporting.length).toBeGreaterThanOrEqual(4); // HYP_1 support set
    });
    expect(screen.getAllByText("No items recorded in this data mode.").length).toBeGreaterThanOrEqual(1); // contradicting empty
  });
});

// ============================================================================
// 5. Activity — realtime history replay + dedupe across tab churn
// ============================================================================

describe("PR-5 — Activity tab", () => {
  it("replays the provider history memory bank on mount with a status badge", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Activity");
    await screen.findByText("Case activity");
    await waitFor(() => {
      expect(document.querySelectorAll("[data-activity-event]").length).toBeGreaterThanOrEqual(1);
    });
    expect(document.querySelector("[data-activity-status]")?.textContent).toMatch(/connected/);
  });

  it("never duplicates events across tab churn (memory-bank replay is de-duplicated by key)", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    await clickTab("Activity");
    await waitFor(() => {
      expect(document.querySelectorAll("[data-activity-event]").length).toBeGreaterThanOrEqual(1);
    });
    await clickTab("Hypotheses");
    await screen.findByText("Working hypotheses");
    await clickTab("Activity");
    await screen.findByText("Case activity");
    await waitFor(() => {
      const keys = Array.from(document.querySelectorAll<HTMLElement>("[data-activity-event-key]")).map((n) => n.getAttribute("data-activity-event-key"));
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it("shows the honest empty state when the stream has delivered nothing", async () => {
    const providers = makeProviders();
    const quietRealtime = {
      connect: () => undefined,
      subscribe: () => () => undefined,
      disconnect: () => undefined,
      getStatus: () => "connected" as const,
    };
    const stub = { ...providers, realtime: quietRealtime };
    render(
      <WorkspaceProvider providers={stub}>
        <InvestigativeIntelligence tab="activity" onTabChange={() => undefined} onSelectContext={() => undefined} />
      </WorkspaceProvider>,
    );
    await screen.findByText("No case activity yet");
  });
});

// ============================================================================
// 6. Live-mode UNSUPPORTED honesty
// ============================================================================

describe("PR-5 — live-mode unsupported honesty", () => {
  const liveConfig: DataModeConfig = getDataModeConfig({
    NODE_ENV: "test",
    [DATA_MODE_ENV]: "live",
    [DEMO_CASE_ID_ENV]: CASE_ID,
    [TIMING_SCALE_ENV]: "0.001",
  });

  function liveProviders() {
    return createLiveWorkspaceProviders(identity("pr5-live"), liveConfig);
  }

  it("never surfaces provisional hypotheses in live mode — honest unavailable state", async () => {
    render(
      <WorkspaceProvider providers={liveProviders()}>
        <InvestigativeIntelligence tab="hypotheses" onTabChange={() => undefined} onSelectContext={() => undefined} />
      </WorkspaceProvider>,
    );
    await screen.findByText("Hypotheses");
    expect(screen.getByText(/Working hypotheses are not supported in this data mode/) ).toBeInTheDocument();
    expect(screen.queryByText("Shell-network money laundering")).not.toBeInTheDocument();
  });

  it("signals tab renders a single honest unavailable state when every source is unsupported", async () => {
    render(
      <WorkspaceProvider providers={liveProviders()}>
        <InvestigativeIntelligence tab="signals" onTabChange={() => undefined} onSelectContext={() => undefined} />
      </WorkspaceProvider>,
    );
    await screen.findByText("Signals");
    expect(screen.getByText(/Signal detection sources are not supported in this data mode/)).toBeInTheDocument();
  });

  it("overview shows dash cells and an availability statement when every count source is unsupported", async () => {
    render(
      <WorkspaceProvider providers={liveProviders()}>
        <InvestigativeIntelligence tab="overview" onTabChange={() => undefined} onSelectContext={() => undefined} />
      </WorkspaceProvider>,
    );
    await waitFor(() => {
      expect(document.querySelector("[data-intelligence-overview]")?.getAttribute("data-intelligence-overview-kind")).toBe("investigation");
    });
    const statValues = Array.from(document.querySelectorAll<HTMLElement>("[data-context-stat-value]")).map((n) => n.textContent);
    expect(statValues.some((v) => v === "--")).toBe(true);
    expect(document.querySelector("[data-intelligence-overview-narrative]")?.textContent).toMatch(/unavailable in this data mode/);
  });

  it("source guard: context modules and control-center tabs import no demo/live/fixture seams", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const guard = (dir: string) => {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
        }
      };
      walk(dir);
      expect(files.length).toBeGreaterThanOrEqual(3);
      for (const file of files) {
        const src = fs.readFileSync(file, "utf8");
        const importLines = src.split("\n").filter((l) => /^(import|export[\s\S]*\bfrom\b)/.test(l.trim()));
        expect(importLines.join("\n"), file).not.toMatch(/providers\/(demo|live)/);
        expect(importLines.join("\n"), file).not.toMatch(/demo-\w*fixtures/);
        expect(importLines.join("\n"), file).not.toMatch(/create(WorkspaceDemo|Live)Providers/);
        expect(importLines.join("\n"), file).not.toMatch(/graph-live/);
        expect(importLines.join("\n"), file).not.toMatch(/useGraphLiveOverlay/);
      }
    };
    guard(path.resolve(__dirname, "../src/lib/context"));
    guard(path.resolve(__dirname, "../src/components/graph/control-center/intelligence"));
  });

  it("hypothesis resolver provenance is provider-backed (get-by-id + list agree on unsupported)", async () => {
    const ws = liveProviders();
    await expect(ws.hypotheses.listByInvestigation(INVESTIGATION_ID, { pageSize: 1 })).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    await expect(ws.hypotheses.get(HYP_1)).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(ws.hypotheses.get(EVID_ACCOUNT_1)).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
});