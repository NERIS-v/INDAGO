import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { CaseList } from "@/components/case-list/case-list";
import type { CaseProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

afterEach(cleanup);

const demoCase = createDemoWorkspaceState("case-list:test").case;

function mockProvider(
  impl: Partial<CaseProvider> = {},
): { cases: CaseProvider; list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } {
  const list = impl.list ?? vi.fn(() =>
    Promise.resolve({
      items: [demoCase],
      page: 1,
      pageSize: 100,
      totalItems: 1,
      hasMore: false,
    }),
  );
  const remove = impl.remove ?? vi.fn(() => Promise.resolve());
  const get = impl.get ?? vi.fn();
  const cases: CaseProvider = { list, get, remove };
  return { cases, list, remove };
}

describe("CaseList", () => {
  it("loads and renders the demo case from the provider", async () => {
    const { cases } = mockProvider();
    render(<CaseList cases={cases} mode="demo" />);
    expect(await screen.findByText(/Operation Financial Shadow/)).toBeInTheDocument();
    expect(screen.queryByText("Demo")).toBeNull();
  });

  it("renders an empty state when the provider returns no cases", async () => {
    const { cases } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 100,
        totalItems: 0,
        hasMore: false,
      }),
    });
    render(<CaseList cases={cases} mode="demo" />);
    expect(await screen.findByText(/No cases/)).toBeInTheDocument();
  });

  it("renders an error state when the provider fails", async () => {
    const { cases } = mockProvider({
      list: vi.fn().mockRejectedValue(ProviderError.network("Connection lost")),
    });
    render(<CaseList cases={cases} mode="demo" />);
    expect(await screen.findByText(/Connection lost/)).toBeInTheDocument();
  });

  it("renders a typed unsupported state in live mode without a case-list endpoint", async () => {
    const { cases } = mockProvider({
      list: vi.fn().mockRejectedValue(ProviderError.unsupported()),
    });
    render(<CaseList cases={cases} mode="live" />);
    expect(
      await screen.findByText(/Case catalog not available in live mode/),
    ).toBeInTheDocument();
  });

  it("opens the correct investigation workspace route, preserving caseId", async () => {
    const { cases } = mockProvider();
    const { container } = render(<CaseList cases={cases} mode="demo" />);
    await screen.findByText(/Operation Financial Shadow/);
    const link = container.querySelector("a[href]");
    expect(link?.getAttribute("href")).toBe(
      `/investigations/${INVESTIGATION_ID}?caseId=${CASE_ID}`,
    );
  });

  it("does not show a case link when the case has no investigation", async () => {
    const { cases } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [{ ...demoCase, investigationIds: [] }],
        page: 1,
        pageSize: 100,
        totalItems: 1,
        hasMore: false,
      }),
    });
    render(<CaseList cases={cases} mode="demo" />);
    expect(await screen.findByText(/No investigations yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open investigation/ })).toBeNull();
  });

  it("retries after a transient error", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(ProviderError.network("try again"))
      .mockResolvedValue({
        items: [demoCase],
        page: 1,
        pageSize: 100,
        totalItems: 1,
        hasMore: false,
      });
    const cases: CaseProvider = { list, get: vi.fn(), remove: vi.fn() };
    render(<CaseList cases={cases} mode="demo" />);
    await screen.findByText(/try again/);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() =>
      expect(screen.getByText(/Operation Financial Shadow/)).toBeInTheDocument(),
    );
  });

  it("shows delete controls and removes only the selected case after confirm", async () => {
    const { cases, remove, list } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [
          { ...demoCase, id: "case-1", title: "Alpha Case" },
          { ...demoCase, id: "case-2", title: "Beta Case" },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 2,
        hasMore: false,
      }),
    });
    render(<CaseList cases={cases} mode="live" />);
    await screen.findByText(/Alpha Case/);

    // Select only Alpha, then arm + confirm the delete.
    fireEvent.click(screen.getByRole("checkbox", { name: /Select Alpha Case/ }));
    const selectedButton = screen.getByRole("button", {
      name: /Delete selected \(1\)/,
    });
    expect(selectedButton).not.toBeDisabled();
    fireEvent.click(selectedButton);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    // The confirm bar closed and nothing was removed yet.
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm delete" })).toBeNull();

    // Re-arm and actually confirm.
    fireEvent.click(screen.getByRole("button", { name: /Delete selected \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledWith("case-1");
    expect(remove).not.toHaveBeenCalledWith("case-2");
    // Reloaded after success.
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("delete all cases removes every listed case after confirm", async () => {
    const { cases, remove } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [
          { ...demoCase, id: "case-1", title: "Alpha Case" },
          { ...demoCase, id: "case-2", title: "Beta Case" },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 2,
        hasMore: false,
      }),
    });
    render(<CaseList cases={cases} mode="live" />);
    await screen.findByText(/Alpha Case/);

    fireEvent.click(screen.getByRole("button", { name: /Delete all cases/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove).toHaveBeenCalledWith("case-1");
    expect(remove).toHaveBeenCalledWith("case-2");
  });

  it("skips already-deleted (NOT_FOUND) cases and completes the delete", async () => {
    const { cases, remove } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [
          { ...demoCase, id: "case-1", title: "Alpha Case" },
          { ...demoCase, id: "case-2", title: "Beta Case" },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 2,
        hasMore: false,
      }),
      remove: vi
        .fn()
        .mockRejectedValueOnce(ProviderError.notFound())
        .mockResolvedValueOnce(undefined),
    });
    render(<CaseList cases={cases} mode="live" />);
    await screen.findByText(/Alpha Case/);

    fireEvent.click(screen.getByRole("button", { name: /Delete all cases/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    // The NOT_FOUND was treated as already-gone success: no error surfaced.
    expect(screen.queryByText(/Could not delete case/)).toBeNull();
  });

  it("surfaces a delete failure and keeps the confirm bar armed for retry", async () => {
    const { cases, remove } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [{ ...demoCase, id: "case-1", title: "Alpha Case" }],
        page: 1,
        pageSize: 100,
        totalItems: 1,
        hasMore: false,
      }),
      remove: vi
        .fn()
        .mockRejectedValueOnce(ProviderError.server("Backend exploded")),
    });
    render(<CaseList cases={cases} mode="live" />);
    await screen.findByText(/Alpha Case/);

    fireEvent.click(screen.getByRole("button", { name: /Delete all cases/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await screen.findByText(/Backend exploded/);
    // Confirm bar stays armed (Cancel still present) so the operator can retry.
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("select-all toggles every case", async () => {
    const { cases } = mockProvider({
      list: vi.fn().mockResolvedValue({
        items: [
          { ...demoCase, id: "case-1", title: "Alpha Case" },
          { ...demoCase, id: "case-2", title: "Beta Case" },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 2,
        hasMore: false,
      }),
    });
    render(<CaseList cases={cases} mode="live" />);
    await screen.findByText(/Alpha Case/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all cases" }));
    expect(screen.getByRole("checkbox", { name: /Select Alpha Case/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Select Beta Case/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /Delete selected \(2\)/ })).not.toBeDisabled();
  });

  describe("Command center topology", () => {
    const enrichment = (() => {
      const state = createDemoWorkspaceState("case-list:test");
      return {
        investigationId: state.investigation.id,
        investigation: state.investigation,
        leads: Array.from(state.leadById.values()),
        gaps: Array.from(state.gapById.values()),
        contradictions: state.contradictions,
        graphNodes: Array.from(state.graphNodeById.values()),
        graphEdges: Array.from(state.graphEdgeById.values()),
        sources: Array.from(state.sourceById.values()),
        evidence: Array.from(state.evidenceById.values()),
        observations: Array.from(state.observationById.values()),
      };
    })();

    it("renders the network mini-map from the real fixture node ids", async () => {
      const { cases } = mockProvider();
      const { container } = render(
        <CaseList cases={cases} mode="demo" enrichment={enrichment} />,
      );
      await screen.findByRole("img", {
        name: "Preview of the active investigation topology",
      });

      // All six fixture nodes render a circle (plus the hub halo);
      // prior to the MINI_LAYOUT id fix nothing matched and the mini-map was
      // an empty near-black card.
      expect(screen.getByText("Topology · 6 nodes")).toBeInTheDocument();
      expect(container.querySelectorAll("svg circle").length).toBeGreaterThanOrEqual(7);
      expect(container.querySelectorAll("svg line")).toHaveLength(6);
      expect(screen.getByText("Victor Aldridge")).toBeInTheDocument();
      expect(screen.getByText("Intermediary")).toBeInTheDocument();
    });
  });
});
