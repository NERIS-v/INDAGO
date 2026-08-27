import { describe, it, expect, afterEach } from "vitest";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import type { WorkspaceIdentity } from "@/lib/providers/types";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

const env = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "test",
  ...overrides,
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

function identity(overrides: Partial<WorkspaceIdentity> = {}): WorkspaceIdentity {
  return {
    workspaceId: `workspace:${INVESTIGATION_ID}`,
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
    ...overrides,
  };
}

describe("provider factory", () => {
  it("resolves the demo bundle for the matching demo case", () => {
    const providers = createWorkspaceProviders(
      identity(),
      env({ NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }),
    );
    expect(providers.mode).toBe("demo");
  });

  it("resolves the live bundle for a non-demo case in explicit live mode", () => {
    const providers = createWorkspaceProviders(
      identity({ caseId: "some-other-case" }),
      env({ NEXT_PUBLIC_DATA_MODE: "live" }),
    );
    expect(providers.mode).toBe("live");
  });

  it("resolves the live bundle for a non-demo case in auto mode", () => {
    process.env.NODE_ENV = "development";
    const providers = createWorkspaceProviders(
      identity({ caseId: "some-other-case" }),
      env({ NEXT_PUBLIC_DATA_MODE: "auto", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }),
    );
    expect(providers.mode).toBe("live");
  });

  it("is NOT a singleton: each call produces an independent bundle", () => {
    const a = createWorkspaceProviders(identity(), env({ NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }));
    const b = createWorkspaceProviders(identity(), env({ NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }));
    expect(a).not.toBe(b);
    expect(a.investigations).not.toBe(b.investigations);
    expect(a.realtime).not.toBe(b.realtime);
    expect(a.evidence).not.toBe(b.evidence);
  });

  it("resolves the demo bundle only for the configured demo case", () => {
    process.env.NODE_ENV = "development";
    // The demo case id must match NEXT_PUBLIC_DEMO_CASE_ID exactly.
    const demo = createWorkspaceProviders(
      identity({ caseId: CASE_ID }),
      env({ NEXT_PUBLIC_DATA_MODE: "auto", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }),
    );
    expect(demo.mode).toBe("demo");

    // Explicit demo mode for a non-demo case must throw, never silently demo.
    expect(() =>
      createWorkspaceProviders(
        identity({ caseId: "other-case" }),
        env({ NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID }),
      ),
    ).toThrow();
  });

  it("per-workspace state is isolated (no leakage between workspaces)", async () => {
    const envDemo = env({ NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID });
    const wsA = createWorkspaceProviders(identity(), envDemo);
    const wsB = createWorkspaceProviders(
      identity({ workspaceId: "workspace:B" }),
      envDemo,
    );

    // Distinct bundles, providers, and realtime instances — no singleton.
    expect(wsA).not.toBe(wsB);
    expect(wsA.investigations).not.toBe(wsB.investigations);
    expect(wsA.evidence).not.toBe(wsB.evidence);
    expect(wsA.realtime).not.toBe(wsB.realtime);
    expect(wsA.workspaceId).not.toBe(wsB.workspaceId);

    // The underlying per-workspace stores are distinct instances too, so a
    // mutation in one workspace can never reach the other.
    const stateA = createDemoWorkspaceState("workspace:A");
    const stateB = createDemoWorkspaceState("workspace:B");
    expect(stateA).not.toBe(stateB);
    expect(stateA.evidenceById).not.toBe(stateB.evidenceById);
    expect(stateA.eventLog).not.toBe(stateB.eventLog);
  });
});
