// ============================================================================
// PASS 4 — Real-Case Hypothesis Route integration tests
//
// The Hypothesis navigation route for the real Case-B workspace must render the
// REAL Phase-2 motive hypotheses (H1/H2/H3) projected from the workspace seams
// — not the generic OFS pipeline. The three hypotheses appear as COLLAPSED
// cards; details (statement, scores, supporting/contradicting observations)
// are revealed ONLY when the card is clicked, mirroring the demo flow
// ("Select a card to inspect its ranking and the evidence behind it").
//
// Coverts:
//   - route navigation: Case-B shows the card list (collapsed) and expands
//     details on click; OFS keeps the legacy pipeline; live never fabricates
//     Phase-2.
//   - cross-surface consistency: the Hypothesis route and the overview
//     Phase-2 motive panel render the SAME H1/H2/H3 scores and statuses
//     (shared mergeMotiveRows projection).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { HypothesisWorkspace } from "@/components/intel/hypothesis-workspace";
import { Phase2MotivePanel } from "@/components/intel/phase2-motive-panel";
import { Phase2HypothesisSurface } from "@/components/intel/phase2-hypothesis-surface";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { resetDemoSession } from "@/lib/providers/demo/session";
import {
  getDataModeConfig,
  TIMING_SCALE_ENV,
  DATA_MODE_ENV,
  DEMO_CASE_ID_ENV,
} from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity, WorkspaceProviders } from "@/lib/providers/types";
import type { UploadedFileReference } from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import { CASE_B_ID, INVESTIGATION_B_ID } from "@/lib/providers/real-case/lookup";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/investigations/i-b/hypothesis"),
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

function caseBIdentity(workspaceId = `p4-route:${INVESTIGATION_B_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID };
}

function ofsIdentity(workspaceId = `p4-route:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderWorkspace(providers: WorkspaceProviders) {
  return render(
    <WorkspaceProvider providers={providers}>
      <HypothesisWorkspace />
    </WorkspaceProvider>,
  );
}

function renderSurfaces(providers: WorkspaceProviders, children: ReactNode) {
  return render(
    <WorkspaceProvider providers={providers}>
      {children}
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

beforeEach(() => resetDemoSession());

afterEach(() => {
  cleanup();
  resetDemoSession();
});

describe("PASS 4 — Case-B hypothesis route: real Phase-2 hypotheses as cards", () => {
  it("renders the collapsed H1/H2/H3 cards with derived scores while details stay hidden", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    const surface = await screen.findByTestId("phase2-hypothesis-surface");
    expect(surface).toBeInTheDocument();

    // Collapsed cards carry the derived (post-ingest projection) values.
    const h1 = screen.getByTestId("phase2-surface-hypothesis-H1");
    const h2 = screen.getByTestId("phase2-surface-hypothesis-H2");
    const h3 = screen.getByTestId("phase2-surface-hypothesis-H3");
    expect(within(h1).getByText("0.68")).toBeInTheDocument();
    expect(within(h1).getByText("SUPPORTED")).toBeInTheDocument();
    expect(within(h2).getByText("0.32")).toBeInTheDocument();
    expect(within(h2).getByText("ACTIVE")).toBeInTheDocument();
    expect(within(h3).getByText("0.00")).toBeInTheDocument();
    expect(within(h3).getByText("ACTIVE")).toBeInTheDocument();

    // No details are projected before any card is clicked.
    expect(screen.queryByText(/Supporting observations/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // The post-ingest comparison banner renders.
    expect(screen.getByText(/Audit discriminator ingested/i)).toBeInTheDocument();
    expect(screen.getByText(/H1 promoted to SUPPORTED \(0\.68\)/)).toBeInTheDocument();

    // The route keeps the honest frame without the internal derivation labels.
    expect(screen.queryByText(/Phase-2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DERIVED_BY_DEMO_LOGIC/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Motive hypotheses/i)).toBeInTheDocument();
    expect(screen.getByText(/BLOCKED/)).toBeInTheDocument();
    expect(screen.getByText(/REPORT_TEXT_ACCOUNT/)).toBeInTheDocument();
  });

  it("reveals the hypothesis details (statement, evidence for/against) only on click", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");

    const toggle = screen.getByTestId("phase2-surface-hypothesis-toggle-H1");
    fireEvent.click(toggle);

    await waitFor(
      () =>
        expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H1")).toHaveAttribute(
          "aria-expanded",
          "true",
        ),
      { timeout: 5000 },
    );

    const h1 = screen.getByTestId("phase2-surface-hypothesis-H1");
    // Supported statement + evidence sections only now appear.
    await waitFor(
      () =>
        expect(
          within(h1).getByText(/Protect the financial operation/),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(within(h1).getByText("Supporting observations")).toBeInTheDocument();
    expect(within(h1).getByText("Contradicting observations")).toBeInTheDocument();
    expect(within(h1).getByText(/Investigative relevance/)).toBeInTheDocument();
  });

  it("shows resolving supporting + contradicting evidence for every hypothesis", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");

    // H1 — the leading hypothesis carries the demo §14 FOR/AGAINST readout.
    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H1"));
    await waitFor(
      () =>
        expect(
          within(screen.getByTestId("phase2-surface-hypothesis-H1")).getByText(
            /Supporting observations/,
          ),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    const h1 = screen.getByTestId("phase2-surface-hypothesis-H1");
    expect(within(h1).getByText(/Wheeler came to suspect the president/)).toBeInTheDocument();
    expect(within(h1).getByText(/Winter Hill \/ WJA matter/)).toBeInTheDocument();
    expect(within(h1).getByText(/H\. Paul Rico as a security consultant/)).toBeInTheDocument();
    expect(within(h1).getByText(/audit Roger Wheeler ordered/)).toBeInTheDocument();
    expect(within(h1).getByText(/SECOND EVIDENCE LIMITATION/)).toBeInTheDocument();
    expect(within(h1).queryByText(/Content unavailable on this workspace\./)).not.toBeInTheDocument();

    // The cross-case connection evidence (Rico ↔ hitman / Boston gang) is
    // GATED: on a fresh workspace the edge between Rico and the hitman is only
    // the "?" hole, so H1's supporting set stays at 5 and the observation never
    // renders.
    expect(within(h1).getByText("5 OBS")).toBeInTheDocument();
    expect(within(h1).queryByText(/CROSS-CASE CONNECTION/)).not.toBeInTheDocument();

    // H2 — the control reading: shared fork record + its own against.
    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H2"));
    await waitFor(
      () =>
        expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H2")).toHaveAttribute(
          "aria-expanded",
          "true",
        ),
      { timeout: 5000 },
    );
    const h2 = screen.getByTestId("phase2-surface-hypothesis-H2");
    expect(within(h2).getByText(/Supporting observations/)).toBeInTheDocument();
    expect(within(h2).getByText(/Wheeler came to suspect the president/)).toBeInTheDocument();
    expect(within(h2).getByText(/SECOND EVIDENCE LIMITATION/)).toBeInTheDocument();

    // H3 — no supporting signal, but the network/operation evidence argues against it.
    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H3"));
    await waitFor(
      () =>
        expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H3")).toHaveAttribute(
          "aria-expanded",
          "true",
        ),
      { timeout: 5000 },
    );
    const h3 = screen.getByTestId("phase2-surface-hypothesis-H3");
    expect(within(h3).getByText(/Winter Hill \/ WJA matter/)).toBeInTheDocument();
    expect(within(h3).queryByText(/Content unavailable on this workspace\./)).not.toBeInTheDocument();
  });

  it("reveals the H1 connection evidence only once the Rico ↔ hitman edge solidifies", async () => {
    const workspaceId = "p4-route-conn:b";
    // Any Case-B submission (except the EREQ_P2 class) fires the breakthrough —
    // the cross-case operation that materializes the SOLID (ACTIVE) Rico ↔
    // hitman edge GE_B_RICO_HITMAN into the workspace graph.
    const boot = createWorkspaceProviders(caseBIdentity(workspaceId), fastEnv);
    const refs = await boot.evidence.prepareUpload(INVESTIGATION_B_ID, [
      new File([new Uint8Array(512)], "ledger.csv", { type: "text/csv" }),
    ]);
    await boot.evidence.submit(INVESTIGATION_B_ID, {
      sourceName: "Registry export",
      evidenceType: "FINANCIAL",
      evidenceTitle: "Ledger rows for shell",
      files: refs satisfies UploadedFileReference[],
    });

    // A fresh bundle over the SAME workspace id hydrates the session-recorded
    // breakthrough run, so its graph carries the solid edge and the H1
    // connection evidence becomes surfaceable (6 OBS, not 5).
    renderWorkspace(createWorkspaceProviders(caseBIdentity(workspaceId), fastEnv));
    await screen.findByTestId("phase2-hypothesis-surface");

    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H1"));
    const h1 = screen.getByTestId("phase2-surface-hypothesis-H1");
    await waitFor(
      () =>
        expect(within(h1).getByText(/CROSS-CASE CONNECTION/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(within(h1).getByText(/H\. Paul Rico and the shooter/)).toBeInTheDocument();
    expect(within(h1).getByText(/solid \(ACTIVE\) edge/)).toBeInTheDocument();
    expect(within(h1).getByText("6 OBS")).toBeInTheDocument();
    expect(within(h1).queryByText(/Content unavailable on this workspace\./)).not.toBeInTheDocument();
  });

  it("keeps a single card open at a time (accordion behavior)", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");

    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H1"));
    fireEvent.click(screen.getByTestId("phase2-surface-hypothesis-toggle-H2"));

    await waitFor(
      () =>
        expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H2")).toHaveAttribute(
          "aria-expanded",
          "true",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("phase2-surface-hypothesis-toggle-H1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("groups the derived hypotheses into real categories with workspace evidence", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");
    // Category sections render once the workspace lists resolve.
    const security = await screen.findByTestId("phase2-surface-category-security");
    const link = await screen.findByTestId("phase2-surface-category-link");
    expect(within(security).getByText(/Security function — who held the access\?/)).toBeInTheDocument();
    expect(within(link).getByText(/The hidden link — who connects the cases\?/)).toBeInTheDocument();

    // Security function → the derived HYP_B2 pathway, details on click.
    const secCard = await screen.findByTestId("phase2-surface-category-security-card");
    expect(within(secCard).getByText(/WJA internal security function/)).toBeInTheDocument();
    fireEvent.click(within(secCard).getByTestId("phase2-surface-category-security-card-toggle"));
    await waitFor(
      () =>
        expect(within(secCard).getByText(/Supporting observations/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(within(secCard).getByText(/H\. Paul Rico as a security consultant/)).toBeInTheDocument();

    // Hidden link → the HYP_P2_HL capsule: 3 base supporting records (in the
    // workspace) on the collapsed badge, details on click.
    const linkCard = await screen.findByTestId("phase2-surface-category-link-card");
    expect(
      within(linkCard).getByTestId("phase2-surface-category-link-card-toggle"),
    ).toHaveAttribute("aria-expanded", "false");
    expect(within(linkCard).getByText("3 obs")).toBeInTheDocument();
    fireEvent.click(within(linkCard).getByTestId("phase2-surface-category-link-card-toggle"));
    await waitFor(
      () =>
        expect(within(linkCard).getByText(/Supporting observations/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(within(linkCard).getByText(/Wheeler came to suspect the president/)).toBeInTheDocument();
    expect(within(linkCard).getByText(/H\. Paul Rico as a security consultant/)).toBeInTheDocument();
    expect(within(linkCard).getByText(/Winter Hill \/ WJA matter/)).toBeInTheDocument();
    // Nothing is post-ingest on a fresh workspace — corroboration stays absent.
    expect(within(linkCard).queryByText(/Post-ingest corroboration/)).not.toBeInTheDocument();
  });

  it("surfaces the hidden-link corroboration only once the live workflow produces it", async () => {
    const workspaceId = "p4-route-link:b";
    // Any Case-B submission fires the breakthrough → OBS_B10 and the SOLID
    // Rico ↔ hitman edge become real workspace records for this workspace.
    const boot = createWorkspaceProviders(caseBIdentity(workspaceId), fastEnv);
    const refs = await boot.evidence.prepareUpload(INVESTIGATION_B_ID, [
      new File([new Uint8Array(512)], "ledger.csv", { type: "text/csv" }),
    ]);
    await boot.evidence.submit(INVESTIGATION_B_ID, {
      sourceName: "Registry export",
      evidenceType: "FINANCIAL",
      evidenceTitle: "Ledger rows for shell",
      files: refs satisfies UploadedFileReference[],
    });

    renderWorkspace(createWorkspaceProviders(caseBIdentity(workspaceId), fastEnv));
    await screen.findByTestId("phase2-hypothesis-surface");

    const linkCard = await screen.findByTestId("phase2-surface-category-link-card");
    // 3 base supporting + OBS_B10 + the now-solid connection observation.
    expect(within(linkCard).getByText("5 obs")).toBeInTheDocument();

    fireEvent.click(within(linkCard).getByTestId("phase2-surface-category-link-card-toggle"));
    await waitFor(
      () =>
        expect(within(linkCard).getByText(/Post-ingest corroboration/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(within(linkCard).getAllByText(/Exhibit-719 pathway/).length).toBeGreaterThan(0);
    expect(
      within(linkCard).getByText(/H\. Paul Rico inside the company's security function/),
    ).toBeInTheDocument();
  });

  it("exposes the derived gap + next-best-evidence projection", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");

    await waitFor(
      () =>
        expect(
          screen.getByText(/Motive discrimination: protect the operation vs\. regain control/),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      screen.getByText(/Pursue the motive discriminator: the WJA audit \/ financial record/),
    ).toBeInTheDocument();
  });

  it("the reverse hypothesis tab still works on the Case-B route", async () => {
    renderWorkspace(createWorkspaceProviders(caseBIdentity(), fastEnv));

    await screen.findByTestId("phase2-hypothesis-surface");

    fireEvent.click(screen.getByTestId("hypothesis-mode-reverse"));

    await waitFor(
      () => expect(screen.getByTestId("reverse-hypothesis-engine")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("phase2-hypothesis-surface")).not.toBeInTheDocument();
  });

  it("never fabricates Phase-2 on a live workspace (keeps the existing surface)", async () => {
    const providers = createLiveWorkspaceProviders(caseBIdentity("p4-route-live"), config);
    expect(providers.phase2AssessmentFreeze).toBeUndefined();

    renderWorkspace(providers);
    await awaitLegacyPipeline();

    // Existing OFS pipeline remains the default for live.
    expect(screen.queryByTestId("phase2-hypothesis-surface")).not.toBeInTheDocument();
    expect(screen.getByText("Operation Financial Shadow")).toBeInTheDocument();
  });

  it("keeps the previous OFS pipeline for non-real-case workspaces", async () => {
    renderWorkspace(createWorkspaceProviders(ofsIdentity(), fastEnv));

    await awaitLegacyPipeline();

    expect(screen.queryByTestId("phase2-hypothesis-surface")).not.toBeInTheDocument();
    expect(screen.getByText(/INDAGO \/\/ Hypothesis Generation Pipeline/i)).toBeInTheDocument();
    expect(screen.getByText("Operation Financial Shadow")).toBeInTheDocument();
    expect(screen.getByText("SYSTEM_READY")).toBeInTheDocument();
  });
});

describe("PASS 4 — cross-surface consistency", () => {
  it("the Hypothesis route and the overview Phase-2 panel agree on H1/H2/H3 values", async () => {
    const providers = createWorkspaceProviders(caseBIdentity(), fastEnv);

    renderSurfaces(
      providers,
      <>
        <Phase2MotivePanel />
        <Phase2HypothesisSurface onRequestChallenge={() => undefined} />
      </>,
    );

    const panel = await screen.findByTestId("phase2-motive-panel");
    const surface = screen.getByTestId("phase2-hypothesis-surface");

    // Same derived scores on both surfaces (post-ingest projection).
    for (const value of ["0.68", "0.32", "0.00"]) {
      expect(within(panel).getByText(value)).toBeInTheDocument();
      expect(within(surface).getAllByText(value).length).toBeGreaterThan(0);
    }

    // Same statuses: H1 promoted, H2/H3 held ACTIVE.
    expect(within(panel).getByText("SUPPORTED")).toBeInTheDocument();
    expect(within(surface).getAllByText("SUPPORTED").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("ACTIVE").length).toBeGreaterThan(0);
    expect(within(surface).getAllByText("ACTIVE").length).toBeGreaterThan(0);
  });
});