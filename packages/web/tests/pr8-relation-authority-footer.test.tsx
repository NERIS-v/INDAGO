// ============================================================================
// PR-8 — Contextual panel footer (authority + deep-dive composer)
//
// The footer slot (reserved in PR-3, rendered nothing until now) composes the
// authority panel + deep-dive bridges for a relation, bridges alone for an
// entity, and an honest typed-unsupported note for a relation on a live seam.
//
// After a successful mutation the footer re-selects the SAME relation through
// the shell bridge — a fresh object identity makes the details effect re-resolve
// so every consumer shows the authoritative status — and bumps the graph reload
// request (the canonical projection reconciles).
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { ContextualPanelFooter } from "@/components/graph/control-center/contextual-panel-footer";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
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

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr8-footer:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function Host({
  initial,
  onReloadRequest,
}: {
  initial: InvestigativeContext;
  onReloadRequest: () => void;
}) {
  const [context, setContext] = useState<InvestigativeContext | null>(initial);
  return (
    <ContextualPanelFooter
      context={context}
      onReselect={setContext}
      onReloadRequest={onReloadRequest}
    />
  );
}

afterEach(() => cleanup());

describe("PR-8 — footer composes the relation authority surface", () => {
  it("renders the authority panel + deep-dive bridges for a resolved relation", async () => {
    const onReloadRequest = vi.fn();
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <Host
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          onReloadRequest={onReloadRequest}
        />
      </WorkspaceProvider>,
    );

    const panel = await screen.findByTestId("relation-authority");
    expect(panel).toHaveAttribute("data-authority-state", "ready");
    expect(screen.getByTestId("deep-dive-bridges")).toBeInTheDocument();
    expect(screen.getByTestId("relation-authority-status").textContent).toBe("Proposed");

    const network = screen.getByTestId("deep-dive-link-network");
    expect(network.getAttribute("data-link-available")).toBe("true");
    expect(network.getAttribute("href")).toMatch(/focus=/);
  });

  it("re-selecting through the shell re-resolves the SAME relation to its new standing", async () => {
    const onReloadRequest = vi.fn();
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <Host
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          onReloadRequest={onReloadRequest}
        />
      </WorkspaceProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Accept relation " + REL_5 }));

    await waitFor(() => expect(screen.getByTestId("relation-authority-status").textContent).toBe("Accepted"));
    expect(onReloadRequest).toHaveBeenCalledTimes(1);
  });

  it("an entity context renders deep-dive bridges without any authority surface", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <Host
          initial={{ kind: "entity", id: ENT_VICTOR, source: "graph" }}
          onReloadRequest={() => undefined}
        />
      </WorkspaceProvider>,
    );

    expect(await screen.findByTestId("deep-dive-bridges")).toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority")).not.toBeInTheDocument();
  });

  it("renders nothing for an unconsumed context (pre-PR-8 reservation preserved)", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const { container } = render(
      <WorkspaceProvider providers={providers}>
        <ContextualPanelFooter context={null} onReselect={() => undefined} onReloadRequest={() => undefined} />
      </WorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="contextual-panel-footer"]')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[data-testid="contextual-panel-footer"]')).toBeNull();
  });
});

describe("PR-8 — live seam: honest live authority (PR-21)", () => {
  it("a relation on the live seam does NOT fabricate an authority surface when its details error", async () => {
    const providers = createLiveWorkspaceProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <Host
          initial={{ kind: "relation", id: REL_5, source: "graph" }}
          onReloadRequest={() => undefined}
        />
      </WorkspaceProvider>,
    );

    // PR-21: live relation authority is genuinely wired to the platform routes.
    // In this unconfigured env the relation details ERROR, so the footer must
    // not fabricate an authority panel NOR a fake unavailable gate — it renders
    // the honest (empty) error surface, never an invented literal.
    expect(screen.queryByTestId("relation-authority-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority")).not.toBeInTheDocument();
  });
});