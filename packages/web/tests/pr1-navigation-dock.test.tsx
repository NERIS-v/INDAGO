import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { WorkspaceNavDock } from "@/components/layout/workspace-nav-dock";
import { AppNavDock } from "@/components/layout/app-nav-dock";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
} from "@/lib/providers/demo/demo-fixtures/lookup";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
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

function identity(workspaceId = `pr1-dock:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

const pathnameMock = vi.mocked(usePathname);

// NOTE: next/navigation's usePathname() returns the PATHNAME ONLY (no query
// string), so the mocks below reflect that — the URL builders above still
// verify that links receive the full case-boundary href.
function graphPath() {
  return `/investigations/${INVESTIGATION_ID}/graph`;
}
function hypothesisPath() {
  return `/investigations/${INVESTIGATION_ID}/hypothesis`;
}
function basePath() {
  return `/investigations/${INVESTIGATION_ID}`;
}

function withCaseBoundary(pathname: string) {
  return `${pathname}?caseId=${CASE_ID}`;
}

function renderWorkspaceDock(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  const providers = createWorkspaceDemoProviders(identity(), config);
  return render(
    <WorkspaceProvider providers={providers}>
      <WorkspaceNavDock />
    </WorkspaceProvider>,
  );
}

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe("PR-1 — WorkspaceNavDock", () => {
  it("renders every workspace destination as a link", () => {
    renderWorkspaceDock(graphPath());
    for (const label of [
      "Dashboard",
      "Overview",
      "Network",
      "Evidence",
      "Observations",
      "Leads",
      "Gaps",
      "Hypothesis",
      "Cross-Case",
      "Ledger",
      "Robustness",
      "Review",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the Network route as the active page", () => {
    renderWorkspaceDock(graphPath());
    const network = screen.getByRole("link", { name: "Network" });
    expect(network).toHaveAttribute("aria-current", "page");
    expect(network).toHaveAttribute("href", withCaseBoundary(graphPath()));
  });

  it("groups workspaces into Core / Intelligence / Analysis segments", () => {
    renderWorkspaceDock(graphPath());
    for (const group of ["Core", "Intelligence", "Analysis"]) {
      expect(screen.getByText(group, { selector: "span.sr-only" })).toBeInTheDocument();
    }
  });

  it("marks the Hypothesis route as the active page", () => {
    renderWorkspaceDock(hypothesisPath());
    const hypothesis = screen.getByRole("link", { name: "Hypothesis" });
    expect(hypothesis).toHaveAttribute("aria-current", "page");
    expect(hypothesis).toHaveAttribute("href", withCaseBoundary(hypothesisPath()));
  });

  it("marks Overview as active on the base investigation route", () => {
    renderWorkspaceDock(basePath());
    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(overview).toHaveAttribute("href", withCaseBoundary(basePath()));
  });

  it("keeps the case boundary on every investigation link", () => {
    renderWorkspaceDock(graphPath());
    const evidence = screen.getByRole("link", { name: "Evidence" });
    expect(evidence.getAttribute("href")).toMatch(new RegExp(`\\?caseId=${CASE_ID}$`));
  });

  it("keeps Dashboard reachable at its /dashboard route", () => {
    renderWorkspaceDock(graphPath());
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");
  });

  it("never surfaces New Investigation as a dock destination", () => {
    renderWorkspaceDock(graphPath());
    expect(screen.queryByRole("link", { name: /new investigation/i })).not.toBeInTheDocument();
    expect(screen.queryByText("/investigations/new")).not.toBeInTheDocument();
  });

  it("renders the investigation context (title, status, graph version) without the mode pill", async () => {
    renderWorkspaceDock(graphPath());
    expect(await screen.findByText("Financial Shadow — Shell Network")).toBeInTheDocument();
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(await screen.findByText("v3")).toBeInTheDocument();
  });
});

describe("PR-1 — AppNavDock", () => {
  it("renders nothing on the cinematic Home route (no chrome over the scene)", () => {
    pathnameMock.mockReturnValue("/");
    const { container } = render(<AppNavDock />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("marks Dashboard active only on /dashboard (never on Home)", () => {
    pathnameMock.mockReturnValue("/dashboard");
    render(<AppNavDock />);
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "INDAGO Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "INDAGO Home" })).not.toHaveAttribute("aria-current");
  });

  it("hides itself on investigation workspace routes (workspace dock takes over)", () => {
    pathnameMock.mockReturnValue(graphPath());
    const { container } = render(<AppNavDock />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });
});