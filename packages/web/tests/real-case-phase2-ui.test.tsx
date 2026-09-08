import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { createWorkspaceProviders, createCaseListProviders } from "@/lib/providers/factory";
import { Phase2MotivePanel } from "@/components/intel/phase2-motive-panel";
import { CASE_B_ID, INVESTIGATION_B_ID } from "@/lib/providers/real-case/lookup";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { DEMO_CASE_ID_ENV, DATA_MODE_ENV } from "@/lib/providers/config";

describe("PASS 4 — Phase-2 motive panel UI", () => {
  it("renders the motive assessment on the enriched Case B workspace", () => {
    const providers = createWorkspaceProviders(
      {
        workspaceId: `workspace:${INVESTIGATION_B_ID}`,
        caseId: CASE_B_ID,
        investigationId: INVESTIGATION_B_ID,
      },
      {
        NODE_ENV: "development",
        [DATA_MODE_ENV]: "demo",
        [DEMO_CASE_ID_ENV]: CASE_ID,
      },
    );

    render(
      <WorkspaceProvider providers={providers}>
        <Phase2MotivePanel />
      </WorkspaceProvider>,
    );

    expect(screen.getByTestId("phase2-motive-panel")).toBeInTheDocument();
    expect(screen.getByText(/Why was Roger Wheeler killed\?/)).toBeInTheDocument();
    expect(screen.getByText(/DERIVED_BY_DEMO_LOGIC/)).toBeInTheDocument();
    expect(screen.getByText(/None of them has won yet/)).toBeInTheDocument();
    expect(screen.getByText(/BLOCKED/)).toBeInTheDocument();
    expect(screen.getByText(/REPORT_TEXT_ACCOUNT/)).toBeInTheDocument();
    expect(screen.getByText(/H1 — Protect the financial operation/)).toBeInTheDocument();
    expect(screen.getByText(/H2 — Regain \/ keep control/)).toBeInTheDocument();
    expect(screen.getByText(/Later-historical validation · overlay only/)).toBeInTheDocument();
    expect(screen.getByText(/LATER_HISTORICAL_KNOWLEDGE/)).toBeInTheDocument();
  });

  it("renders promoted H1 status when the S1 delta projection is present", () => {
    const providers = createWorkspaceProviders(
      {
        workspaceId: `workspace:${INVESTIGATION_B_ID}`,
        caseId: CASE_B_ID,
        investigationId: INVESTIGATION_B_ID,
      },
      {
        NODE_ENV: "development",
        [DATA_MODE_ENV]: "demo",
        [DEMO_CASE_ID_ENV]: CASE_ID,
      },
    );

    render(
      <WorkspaceProvider providers={providers}>
        <Phase2MotivePanel />
      </WorkspaceProvider>,
    );

    expect(screen.getByText(/H1 promoted to SUPPORTED/)).toBeInTheDocument();
    expect(screen.getByText(/H2 held at 0.32/)).toBeInTheDocument();
    expect(screen.getByText(/freeze/)).toBeInTheDocument();
  });

  it("renders nothing on a workspace that carries no phase-2 seams (OFS demo)", () => {
    const providers = createWorkspaceProviders(
      {
        workspaceId: `workspace:${INVESTIGATION_ID}`,
        caseId: CASE_ID,
        investigationId: INVESTIGATION_ID,
      },
      {
        NODE_ENV: "development",
        [DATA_MODE_ENV]: "demo",
        [DEMO_CASE_ID_ENV]: CASE_ID,
      },
    );

    const { container } = render(
      <WorkspaceProvider providers={providers}>
        <Phase2MotivePanel />
      </WorkspaceProvider>,
    );

    expect(container.querySelector('[data-testid="phase2-motive-panel"]')).toBeNull();
  });

  it("never fabricates a panel in live mode (no phase-2 seams)", () => {
    const providers = createWorkspaceProviders(
      {
        workspaceId: `workspace:${INVESTIGATION_B_ID}`,
        caseId: CASE_B_ID,
        investigationId: INVESTIGATION_B_ID,
      },
      { NODE_ENV: "production", [DATA_MODE_ENV]: "live" },
    );
    expect(providers.phase2AssessmentFreeze).toBeUndefined();

    const { container } = render(
      <WorkspaceProvider providers={providers}>
        <Phase2MotivePanel />
      </WorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="phase2-motive-panel"]')).toBeNull();
  });

  it("the dashboard case-list surface exposes the real-case catalogue (2 cards)", async () => {
    const providers = createCaseListProviders({ [DATA_MODE_ENV]: "demo" } as NodeJS.ProcessEnv);
    const listed = await providers.cases.list({ page: 1, pageSize: 20 });
    expect(listed.totalItems).toBe(2);
  });
});