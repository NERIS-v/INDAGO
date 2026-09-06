import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
  NetworkWorkspaceProvider,
  useNetworkWorkspace,
} from "@/lib/network/use-network-workspace";

// Mutable URL lane so tests can drive back/forward and router.replace replay.
const lanes = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/investigations/i-1/graph",
  useSearchParams: () => lanes.searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: lanes.replaceMock, back: vi.fn() }),
}));

function Probe() {
  const ws = useNetworkWorkspace();
  return (
    <div>
      <span data-testid="view">{ws.activeNetworkView}</span>
      <span data-testid="focus">{ws.focusEntityId ?? "null"}</span>
      <span data-testid="range">
        {ws.timeRange ? ws.timeRange.join(":") : "null"}
      </span>
      <span data-testid="filter">
        {ws.graphFilter.minSupport}:{ws.graphFilter.hideContradicted ? "1" : "0"}
      </span>
      <button onClick={() => ws.setActiveNetworkView("flow")}>set-view-flow</button>
      <button onClick={() => ws.setActiveNetworkView("graph")}>set-view-graph</button>
      <button
        onClick={() => {
          // F-PR16 "Show on Graph": switch to graph AND focus in one tick.
          ws.setActiveNetworkView("graph");
          ws.setFocusEntityId("ent-9");
        }}
      >
        show-on-graph
      </button>
      <button onClick={() => ws.setFocusEntityId("ent-9")}>set-focus-nine</button>
      <button onClick={() => ws.setFocusEntityId("ent-9")}>set-focus-nine-again</button>
      <button onClick={() => ws.setFocusEntityId(null)}>clear-focus</button>
      <button onClick={() => ws.setTimeRange([1, 500])}>set-range</button>
      <button
        onClick={() => ws.setGraphFilter({ minSupport: 0.5, hideContradicted: true })}
      >
        set-filter-both
      </button>
      <button
        onClick={() => ws.setGraphFilter({ minSupport: 0.5, hideContradicted: true })}
      >
        set-filter-both-again
      </button>
      <button
        onClick={() => ws.setGraphFilter({ minSupport: 0, hideContradicted: false })}
      >
        set-filter-clear
      </button>
      <button onClick={() => ws.clearAnalyticalState()}>clear-all</button>
    </div>
  );
}

function urlWith(values: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) p.set(k, v);
  return p;
}

afterEach(() => {
  cleanup();
  lanes.searchParamsRef.current = new URLSearchParams();
  lanes.replaceMock.mockClear();
});

describe("F-PR5 — NetworkWorkspaceProvider two-way URL state", () => {
  it("seeds view/focus from the URL and leaves timeRange null", () => {
    lanes.searchParamsRef.current = urlWith({
      caseId: "c-1",
      view: "pulse",
      focus: "ent-1",
    });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("pulse");
    expect(container.querySelector('[data-testid="focus"]')?.textContent).toBe("ent-1");
    expect(container.querySelector('[data-testid="range"]')?.textContent).toBe("null");
  });

  it("defaults to graph when the URL has no ?view=", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
  });

  it("setter writes the URL, preserving ?caseId= and other params", async () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "pulse" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("pulse");

    act(() => {
      screen.getByRole("button", { name: "set-focus-nine" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenCalledTimes(1);
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph?caseId=c-1&view=pulse&focus=ent-9",
      { scroll: false },
    );
  });

  it("returns to graph by DROPPING ?view= (REST-ful default)", () => {
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-view-flow" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenLastCalledWith(
      "/investigations/i-1/graph?view=flow",
      { scroll: false },
    );
    lanes.replaceMock.mockClear();
    act(() => {
      screen.getByRole("button", { name: "set-view-graph" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph",
      { scroll: false },
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
  });

  it("guards no-op focus writes: repeating the same value never churns the URL", () => {
    render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-focus-nine" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenCalledTimes(1);
    lanes.replaceMock.mockClear();
    act(() => {
      screen.getByRole("button", { name: "set-focus-nine-again" }).click();
    });
    expect(lanes.replaceMock).not.toHaveBeenCalled();
    act(() => {
      screen.getByRole("button", { name: "clear-focus" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenCalledTimes(1);
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph",
      { scroll: false },
    );
  });

  it("applies URL changes from back/forward to state without looping", () => {
    const { container, rerender } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");

    act(() => {
      lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "matrix" });
    });
    rerender(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("matrix");
    // URL->state never writes the URL.
    expect(lanes.replaceMock).not.toHaveBeenCalled();
  });

  it("keeps timeRange across a child remount (shared, not page-local)", () => {
    const { container, rerender } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-range" }).click();
    });
    expect(container.querySelector('[data-testid="range"]')?.textContent).toBe("1:500");

    rerender(
      <NetworkWorkspaceProvider>
        <div data-testid="gone" />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="gone"]')).toBeTruthy();

    rerender(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="range"]')?.textContent).toBe("1:500");
  });

  it("clearAnalyticalState returns to defaults and drops both params", () => {
    lanes.searchParamsRef.current = urlWith({
      caseId: "c-1",
      view: "flow",
      focus: "ent-9",
    });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("flow");
    act(() => {
      screen.getByRole("button", { name: "clear-all" }).click();
    });
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
    expect(container.querySelector('[data-testid="focus"]')?.textContent).toBe("null");
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph?caseId=c-1",
      { scroll: false },
    );
  });

  it("throws when used outside a NetworkWorkspaceProvider", () => {
    expect(() => render(<Probe />)).toThrowError(/NetworkWorkspaceProvider/);
  });

  it("F-PR16: Show on Graph from Pulse does NOT snap back (coalesced URL writes)", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "pulse" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("pulse");

    // "Show on Graph" switches representation AND sets focus within one tick —
    // the exact sequence that used to re-serialize ?view=pulse and snap back.
    act(() => {
      screen.getByRole("button", { name: "show-on-graph" }).click();
    });

    // Final written URL: graph is the REST-ful default (param dropped) and the
    // focus must be applied atop THAT URL, never resurrecting ?view=pulse.
    expect(lanes.replaceMock).toHaveBeenLastCalledWith(
      "/investigations/i-1/graph?caseId=c-1&focus=ent-9",
      { scroll: false },
    );
    expect(lanes.replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining("view=pulse"),
    );
    // State reflects graph as the active representation with focus intact.
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
    expect(container.querySelector('[data-testid="focus"]')?.textContent).toBe("ent-9");
  });

  it("F-PR16: Show on Graph from Matrix does NOT snap back", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "matrix" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("matrix");

    act(() => {
      screen.getByRole("button", { name: "show-on-graph" }).click();
    });

    expect(lanes.replaceMock).toHaveBeenLastCalledWith(
      "/investigations/i-1/graph?caseId=c-1&focus=ent-9",
      { scroll: false },
    );
    expect(lanes.replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining("view=matrix"),
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
    expect(container.querySelector('[data-testid="focus"]')?.textContent).toBe("ent-9");
  });

  it("F-PR16: Show on Graph from Flow does NOT snap back", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "flow" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("flow");

    act(() => {
      screen.getByRole("button", { name: "show-on-graph" }).click();
    });

    expect(lanes.replaceMock).toHaveBeenLastCalledWith(
      "/investigations/i-1/graph?caseId=c-1&focus=ent-9",
      { scroll: false },
    );
    expect(lanes.replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining("view=flow"),
    );
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe("graph");
    expect(container.querySelector('[data-testid="focus"]')?.textContent).toBe("ent-9");
  });
});

describe("F-PR14 — NetworkWorkspaceProvider readability filter URL state", () => {
  it("seeds the filter from ?support= and ?hidec=", () => {
    lanes.searchParamsRef.current = urlWith({
      caseId: "c-1",
      support: "0.5",
      hidec: "1",
    });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0.5:1");
  });

  it("defaults to the unfiltered workspace when the URL is clean or malformed", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0:0");
    cleanup();
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", support: "bogus", hidec: "not1" });
    const { container: second } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(second.querySelector('[data-testid="filter"]')?.textContent).toBe("0:0");
  });

  it("writes both params on set, preserving ?caseId= and other params", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", view: "matrix" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-filter-both" }).click();
    });
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0.5:1");
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph?caseId=c-1&view=matrix&support=0.5&hidec=1",
      { scroll: false },
    );
  });

  it("drops ?support= and ?hidec= when the filter returns to default (REST-ful)", () => {
    lanes.searchParamsRef.current = urlWith({ caseId: "c-1", support: "0.7", hidec: "1" });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-filter-clear" }).click();
    });
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0:0");
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph?caseId=c-1",
      { scroll: false },
    );
  });

  it("guards no-op filter writes: repeating the same value never churns the URL", () => {
    render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-filter-both" }).click();
    });
    expect(lanes.replaceMock).toHaveBeenCalledTimes(1);
    lanes.replaceMock.mockClear();
    act(() => {
      screen.getByRole("button", { name: "set-filter-both-again" }).click();
    });
    expect(lanes.replaceMock).not.toHaveBeenCalled();
  });

  it("applies back/forward URL filter changes to state without looping", () => {
    const { container, rerender } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0:0");
    act(() => {
      lanes.searchParamsRef.current = urlWith({
        caseId: "c-1",
        support: "0.4",
        hidec: "1",
      });
    });
    rerender(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0.4:1");
    expect(lanes.replaceMock).not.toHaveBeenCalled();
  });

  it("clearAnalyticalState resets the filter and drops both params", () => {
    lanes.searchParamsRef.current = urlWith({
      caseId: "c-1",
      view: "flow",
      support: "0.5",
      hidec: "1",
    });
    const { container } = render(
      <NetworkWorkspaceProvider>
        <Probe />
      </NetworkWorkspaceProvider>,
    );
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0.5:1");
    act(() => {
      screen.getByRole("button", { name: "clear-all" }).click();
    });
    expect(container.querySelector('[data-testid="filter"]')?.textContent).toBe("0:0");
    expect(lanes.replaceMock).toHaveBeenCalledWith(
      "/investigations/i-1/graph?caseId=c-1",
      { scroll: false },
    );
  });
});