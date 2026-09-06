import { describe, it, expect } from "vitest";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import {
  DATA_MODE_ENV,
  DEMO_CASE_ID_ENV,
  TIMING_SCALE_ENV,
} from "@/lib/providers/config";
import { ProviderError } from "@/lib/providers/types";
import type { WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
} from "@/lib/providers/demo/demo-fixtures/lookup";

// Speed up the deterministic demo latency so async assertions stay quick.
const fast = { [TIMING_SCALE_ENV]: "0.001" };

// The configured demo workspace (mode "demo" is permitted for this case).
const demoIdentity: WorkspaceIdentity = {
  workspaceId: `workspace:${INVESTIGATION_ID}`,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
};

// A non-demo workspace: under AUTO it resolves to the capability-level bundle.
const autoIdentity: WorkspaceIdentity = {
  workspaceId: "workspace:auto-other",
  caseId: "case-auto-other",
  investigationId: "inv-auto-other",
};

const autoEnv = {
  ...fast,
  [DATA_MODE_ENV]: "auto",
  [DEMO_CASE_ID_ENV]: CASE_ID,
};

describe("F-PR5 — AUTO capability-level provider semantics", () => {
  it("DEMO -> the demo provider serves every demo-capable capability", async () => {
    const providers = createWorkspaceProviders(demoIdentity, {
      ...fast,
      [DATA_MODE_ENV]: "demo",
      [DEMO_CASE_ID_ENV]: CASE_ID,
    });

    expect(providers.mode).toBe("demo");
    expect(providers.capabilities.evidence).toBe("demo");
    expect(providers.capabilities.graph).toBe("demo");

    // The demo implementation is actually wired in: graph resolves seeded nodes.
    const nodes = await providers.graph.getNodes(INVESTIGATION_ID);
    expect(nodes.items.length).toBeGreaterThan(0);
  });

  it("LIVE -> the live provider serves live capabilities; demo-only capabilities are typed not-ready", async () => {
    const providers = createWorkspaceProviders(autoIdentity, {
      [DATA_MODE_ENV]: "live",
    });

    expect(providers.mode).toBe("live");
    expect(providers.capabilities.evidence).toBe("live");
    expect(providers.capabilities.graph).toBe("not-ready");
    // F-PR6: an explicit-live Entity Pulse is TYPED not-ready — a live workspace
    // must never silently fall back to the demo pulse visualization.
    expect(providers.capabilities["network.pulse"]).toBe("not-ready");

    // A demo-only capability in a pure live workspace fails typed (never demo).
    await expect(providers.graph.getNodes("any")).rejects.toBeInstanceOf(ProviderError);
  });

  it("AUTO + live-supported capability -> the live provider (typed runtime failure, never demo)", async () => {
    const providers = createWorkspaceProviders(autoIdentity, autoEnv);

    expect(providers.mode).toBe("live");
    expect(providers.capabilities.evidence).toBe("live");
    expect(providers.capabilities.investigation).toBe("live");

    // investigations.get is a REAL wired live call; with no platform reachable
    // it fails typed. It must NOT resolve to demo fixtures.
    await expect(
      providers.investigations.get(autoIdentity.investigationId),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("AUTO + live-unavailable capability -> the demo provider serves real data", async () => {
    const providers = createWorkspaceProviders(autoIdentity, autoEnv);

    expect(providers.capabilities.graph).toBe("demo");
    const nodes = await providers.graph.getNodes(autoIdentity.investigationId);
    expect(nodes.items.length).toBeGreaterThan(0);
    expect(nodes.items[0].id).toBeTruthy();
  });

  it("AUTO fallback is capability-level, not global — live and demo coexist in ONE bundle", async () => {
    const providers = createWorkspaceProviders(autoIdentity, autoEnv);

    // Simultaneously valid under AUTO:
    expect(providers.capabilities.evidence).toBe("live");
    expect(providers.capabilities.investigation).toBe("live");
    expect(providers.capabilities.cases).toBe("live");
    expect(providers.capabilities.observations).toBe("live");
    expect(providers.capabilities.realtime).toBe("live");
    expect(providers.capabilities.graph).toBe("demo");
    expect(providers.capabilities.timeline).toBe("demo");
    expect(providers.capabilities.intelligence).toBe("demo");
    expect(providers.capabilities.leads).toBe("demo");
    expect(providers.capabilities["network.graph"]).toBe("demo");
    expect(providers.capabilities["network.pulse"]).toBe("demo");
  });

  it("falling back for one capability does not switch the live ones, and a live failure does not contaminate the demo slot", async () => {
    const providers = createWorkspaceProviders(autoIdentity, autoEnv);

    // The demo fallback for graph does NOT switch the live evidence slot.
    expect(providers.capabilities.graph).toBe("demo");
    expect(providers.capabilities.evidence).toBe("live");
    await expect(
      providers.evidence.listByInvestigation(autoIdentity.investigationId),
    ).rejects.toBeInstanceOf(ProviderError);

    // The live evidence failure does NOT contaminate the demo graph slot.
    const nodes = await providers.graph.getNodes(autoIdentity.investigationId);
    expect(nodes.items.length).toBeGreaterThan(0);
    expect(providers.capabilities.evidence).toBe("live");
  });

  it("a runtime live ProviderError does not become demo data in the same AUTO bundle", async () => {
    const providers = createWorkspaceProviders(autoIdentity, autoEnv);

    const err = await providers.evidence
      .listByInvestigation(autoIdentity.investigationId)
      .then(
        () => null,
        (e: unknown) => e,
      );

    // A real wired live call failed: typed ProviderError, and NOT the
    // "unsupported stub" code — proving no silent demo fallback was attempted.
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("SERVER");

    // The demo-served graph capability is untouched afterwards.
    const nodes = await providers.graph.getNodes(autoIdentity.investigationId);
    expect(nodes.items.length).toBeGreaterThan(0);
  });
});