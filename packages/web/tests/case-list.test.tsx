import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { CaseList } from "@/components/case-list/case-list";
import type { CaseProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

afterEach(cleanup);

const demoCase = createDemoWorkspaceState("case-list:test").case;

function mockProvider(
  impl: Partial<CaseProvider> = {},
): { cases: CaseProvider; list: ReturnType<typeof vi.fn> } {
  const list = vi.fn(() =>
    Promise.resolve({
      items: [demoCase],
      page: 1,
      pageSize: 100,
      totalItems: 1,
      hasMore: false,
    }),
  );
  const cases: CaseProvider = { list, get: vi.fn(), ...impl };
  return { cases, list };
}

describe("CaseList", () => {
  it("loads and renders the demo case from the provider", async () => {
    const { cases } = mockProvider();
    render(<CaseList cases={cases} mode="demo" />);
    expect(await screen.findByText(/Operation Financial Shadow/)).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
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
    const cases: CaseProvider = { list, get: vi.fn() };
    render(<CaseList cases={cases} mode="demo" />);
    await screen.findByText(/try again/);
    screen.getByRole("button", { name: /Retry/ }).click();
    await waitFor(() =>
      expect(screen.getByText(/Operation Financial Shadow/)).toBeInTheDocument(),
    );
  });
});
