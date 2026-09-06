// ============================================================================
// F-PR9 — Hypothesis workspace (two modes): view tests
//
// The page keeps the previous hypothesis pipeline UI as its primary mode and
// ADDS Reverse Hypothesis as a second mode — it does not replace the existing
// surface:
//   - mode 1 (default) renders the legacy hypothesis pipeline intact,
//   - mode 2 runs the deterministic reverse-test on the REAL fixtures
//     (scenario A locked: SUPPORTED 4/2/0/2) with no scores and an honest
//     completed-run trail and no simulated-processing language,
//   - HYPOTHESIS CHANGED invalidation hides the decisions until re-run,
//   - a recorded analyst decision appears in the decision trail,
//   - live seam renders the reverse engine's typed-unsupported gate while the
//     pipeline keeps its existing pre-seam behavior.
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { HypothesisWorkspace } from "@/components/intel/hypothesis-workspace";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import {
  getDataModeConfig,
  TIMING_SCALE_ENV,
  DATA_MODE_ENV,
  DEMO_CASE_ID_ENV,
} from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  CONTRADICTION_1,
  OBS_2,
  OBS_3,
} from "@/lib/providers/demo/demo-fixtures/lookup";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/investigations/i-1/hypothesis"),
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

function identity(workspaceId = `pr9-view:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderWorkspace(providers = createWorkspaceDemoProviders(identity(), config)) {
  return render(
    <WorkspaceProvider providers={providers}>
      <HypothesisWorkspace />
    </WorkspaceProvider>,
  );
}

async function awaitLegacyPipeline() {
  await waitFor(
    () =>
      expect(
        screen.getByRole("button", { name: /Initialize Investigative Synthesis/i }),
      ).toBeInTheDocument(),
    { timeout: 5000 },
  );
}

const SCENARIO_A =
  "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.";
const SCENARIO_B =
  "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings.";

afterEach(() => {
  cleanup();
});

describe("F-PR9 — mode 1: the previous hypothesis pipeline is preserved", () => {
  it("defaults to the existing pipeline UI, untouched, with Reverse Hypothesis absent", async () => {
    renderWorkspace();

    await awaitLegacyPipeline();
    expect(
      screen.getByText(/INDAGO \/\/ Hypothesis Generation Pipeline/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Operation Financial Shadow")).toBeInTheDocument();
    expect(screen.getByText("SYSTEM_READY")).toBeInTheDocument();
    expect(screen.queryByTestId("reverse-hypothesis-engine")).not.toBeInTheDocument();
  });

  it("the mode toggle ADDS the reverse panel next to the pipeline, without removing it", async () => {
    renderWorkspace();
    await awaitLegacyPipeline();

    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    await waitFor(
      () => expect(screen.getByTestId("reverse-hypothesis-engine")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByRole("button", { name: /Initialize Investigative Synthesis/i }))
      .not.toBeInTheDocument();
  });
});

describe("F-PR9 — reverse mode: deterministic run, no scores, honest trail", () => {
  it("scenario A classifies SUPPORTED with 4/2/0/2 and no confidence score", async () => {
    renderWorkspace();
    await awaitLegacyPipeline();
    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    fireEvent.change(screen.getByTestId("reverse-hypothesis-input"), {
      target: { value: SCENARIO_A },
    });
    fireEvent.click(screen.getByTestId("reverse-hypothesis-submit"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-status")).toHaveTextContent(
          "SUPPORTED",
        ),
      { timeout: 5000 },
    );

    expect(
      screen.getByText(/4 pool · 2 supporting · 0 contradicting · 2 unresolved/),
    ).toBeInTheDocument();
    expect(screen.getByText(/window during 2024-02/)).toBeInTheDocument();

    const interpretation = screen.getByTestId("reverse-hypothesis-interpretation");
    expect(interpretation.textContent).toContain("Structured as:");
    expect(interpretation.textContent).toContain("transferred funds to");

    const inverse = screen.getByTestId("reverse-hypothesis-inverse");
    expect(inverse.textContent).toContain("REVERSE_DIRECTION");
    expect(inverse.textContent).toContain("not a contradiction");

    expect(screen.getByTestId("reverse-hypothesis-supporting")).toHaveTextContent("2");
    expect(screen.getByTestId("reverse-hypothesis-unresolved")).toHaveTextContent("2");
    expect(screen.getByTestId("reverse-hypothesis-contradicting")).toHaveTextContent("0");

    expect(screen.getByText(OBS_2)).toBeInTheDocument();
    expect(screen.getByText(OBS_3)).toBeInTheDocument();

    const trail = screen.getByTestId("reverse-hypothesis-stages");
    expect(trail.textContent).toContain("READY");
    expect(trail.textContent).toContain("no simulated processing");

    expect(screen.queryByText(/CONF \d+%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Verdict/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/guaranteed/i)).not.toBeInTheDocument();
  });

  it("scenario B surfaces CONTRADICTING evidence with its canonical contradiction id", async () => {
    renderWorkspace();
    await awaitLegacyPipeline();
    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    fireEvent.change(screen.getByTestId("reverse-hypothesis-input"), {
      target: { value: SCENARIO_B },
    });
    fireEvent.click(screen.getByTestId("reverse-hypothesis-submit"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-status")).toHaveTextContent(
          "SUPPORTED WITH CONFLICT",
        ),
      { timeout: 5000 },
    );
    expect(
      screen.getByText(/2 pool · 1 supporting · 1 contradicting · 0 unresolved/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("reverse-hypothesis-contradicting")).toHaveTextContent("1");
    expect(screen.getByText(new RegExp(CONTRADICTION_1))).toBeInTheDocument();
  });
});

describe("F-PR9 — invalidation and decisions", () => {
  it("editing the tested text invalidates results and hides the decisions", async () => {
    renderWorkspace();
    await awaitLegacyPipeline();
    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    fireEvent.change(screen.getByTestId("reverse-hypothesis-input"), {
      target: { value: SCENARIO_A },
    });
    fireEvent.click(screen.getByTestId("reverse-hypothesis-submit"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-status")).toHaveTextContent(
          "SUPPORTED",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("reverse-hypothesis-decisions")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("reverse-hypothesis-input"), {
      target: { value: SCENARIO_A.replace("February 2024", "March 2024") },
    });

    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-invalidated")).toHaveTextContent(
          "HYPOTHESIS CHANGED",
        ),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("reverse-hypothesis-decisions")).not.toBeInTheDocument();
  });

  it("an analyst decision is recorded into the session decision trail", async () => {
    renderWorkspace();
    await awaitLegacyPipeline();
    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    fireEvent.change(screen.getByTestId("reverse-hypothesis-input"), {
      target: { value: SCENARIO_A },
    });
    fireEvent.click(screen.getByTestId("reverse-hypothesis-submit"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-status")).toHaveTextContent(
          "SUPPORTED",
        ),
      { timeout: 5000 },
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Accept as working hypothesis/i }),
    );

    await waitFor(
      () =>
        expect(
          screen.getByText("ACCEPT_AS_WORKING_HYPOTHESIS"),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      within(screen.getByTestId("reverse-hypothesis-decisions")).getByText(
        /Intermediary account 0093 received funds/i,
      ),
    ).toBeInTheDocument();
  });
});

describe("F-PR9 — live seam keeps the pipeline and gates the reverse engine", () => {
  it("the pipeline keeps its pre-seam behavior; the reverse mode renders the typed-unsupported panel", async () => {
    const providers = createLiveWorkspaceProviders(identity("pr9-view-live"), config);
    renderWorkspace(providers);

    await awaitLegacyPipeline();

    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));
    await waitFor(
      () =>
        expect(screen.getByTestId("reverse-hypothesis-provider-unavailable")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("reverse-hypothesis-input")).not.toBeInTheDocument();
  });
});