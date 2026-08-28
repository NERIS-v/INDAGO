import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "@/lib/providers/workspace/context";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

afterEach(() => {
  process.env.NODE_ENV = "test";
});

function ConsumerDisplay() {
  const ws = useWorkspace();
  return (
    <div>
      <span data-testid="workspaceId">{ws.workspaceId}</span>
      <span data-testid="caseId">{ws.caseId}</span>
      <span data-testid="investigationId">{ws.investigationId}</span>
      <span data-testid="mode">{ws.mode}</span>
    </div>
  );
}

describe("workspace context", () => {
  it("exposes explicit identity values through useWorkspace()", () => {
    const providers = createWorkspaceProviders(
      {
        workspaceId: `workspace:${INVESTIGATION_ID}`,
        caseId: CASE_ID,
        investigationId: INVESTIGATION_ID,
      },
      { NODE_ENV: "development", NEXT_PUBLIC_DATA_MODE: "demo", NEXT_PUBLIC_DEMO_CASE_ID: CASE_ID },
    );

    render(
      <WorkspaceProvider providers={providers}>
        <ConsumerDisplay />
      </WorkspaceProvider>,
    );

    expect(screen.getByTestId("workspaceId").textContent).toBe(`workspace:${INVESTIGATION_ID}`);
    expect(screen.getByTestId("caseId").textContent).toBe(CASE_ID);
    expect(screen.getByTestId("investigationId").textContent).toBe(INVESTIGATION_ID);
    expect(screen.getByTestId("mode").textContent).toBe("demo");
  });

  it("useWorkspace() throws cleanly outside a WorkspaceProvider", () => {
    let caught: Error | null = null;
    function Throws() {
      try {
        useWorkspace();
      } catch (e) {
        caught = e as Error;
      }
      return <div />;
    }
    render(<Throws />);
    expect(caught).not.toBeNull();
    expect(caught?.message).toMatch(/within a <WorkspaceProvider>/);
  });
});
