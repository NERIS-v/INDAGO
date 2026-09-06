// ============================================================================
// PR-10 §34 — Panel error boundaries (surface isolation)
//
// A render failure inside one provider-driven surface must degrade THAT surface
// alone — an honest compact fallback — while every sibling surface and the rest
// of the graph control center keeps working. Deliberately not an app-wide
// catch; the boundary never rethrows into the shell.
//
// The boundary testid contract is `error-boundary-<label>` with the label
// lowercased and whitespace hyphenated ("Versions panel" → "versions-panel").
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";

function Boom({ message = "kaboom" }: { message?: string }) {
  throw new Error(message);
}

function OkPane() {
  return <div data-testid="ok-pane">unaffected surface</div>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PR-10 §34 — the boundary contains a failing surface alone", () => {
  it("renders an honest alert fallback with the labeled testid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PanelErrorBoundary label="Activity feed">
        <Boom />
      </PanelErrorBoundary>,
    );

    const fallback = screen.getByTestId("error-boundary-activity-feed");
    expect(fallback).toHaveAttribute("role", "alert");
    expect(fallback.textContent).toContain("Activity feed is temporarily unavailable");
    expect(fallback.textContent).toContain("The rest of the graph control center is unaffected");
    expect(spy).toHaveBeenCalled();
    // React logs its own error-report first; OUR boundary diagnostic is the
    // one tagged with the surface label.
    expect(
      spy.mock.calls.some((call) => String(call[0]).includes("[Activity feed] render failure")),
    ).toBe(true);
  });

  it("hyphenates and lowercases the label into the testid slug", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PanelErrorBoundary label="Versions panel">
        <Boom />
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary-versions-panel")).toBeInTheDocument();
  });

  it("keeps sibling surfaces mounted and working after a sibling fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <div>
        <PanelErrorBoundary label="Activity feed">
          <Boom />
        </PanelErrorBoundary>
        <PanelErrorBoundary label="Versions panel">
          <OkPane />
        </PanelErrorBoundary>
      </div>,
    );

    expect(screen.getByTestId("error-boundary-activity-feed")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-versions-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("ok-pane")).toHaveTextContent("unaffected surface");
  });

  it("a healthy surface renders its children untouched (no fallback)", () => {
    render(
      <PanelErrorBoundary label="Relation authority">
        <OkPane />
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId("ok-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-relation-authority")).not.toBeInTheDocument();
  });

  it("never rethrows into the shell — the fallback is silent containment", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let thrown = false;
    const observe = () => {
      try {
        render(
          <PanelErrorBoundary label="Intelligence">
            <Boom />
          </PanelErrorBoundary>,
        );
      } catch {
        thrown = true;
      }
    };
    observe();
    expect(thrown).toBe(false);
    expect(screen.getByTestId("error-boundary-intelligence")).toBeInTheDocument();
  });
});

describe("PR-10 §34 — every provider-driven shell surface is boundary-wired", () => {
  it("all six composite regions declare their boundary labels and slugs in source", () => {
    const root = path.resolve(__dirname, "../src/components/graph/control-center");
    const shell = fs.readFileSync(path.join(root, "graph-control-center.tsx"), "utf8");
    const footer = fs.readFileSync(path.join(root, "contextual-panel-footer.tsx"), "utf8");
    const temporal = fs.readFileSync(path.join(root, "temporal-context-panel.tsx"), "utf8");

    expect(shell).toContain('label="Contextual panel"');
    expect(shell).toContain('label="Intelligence"');
    expect(footer).toContain('label="Relation authority"');
    expect(footer).toContain('label="Deep-dive bridges"');
    expect(temporal).toContain('label="Activity feed"');
    expect(temporal).toContain('label="Versions panel"');
  });

  it("the boundary testid slug format matches the documented contract", () => {
    const boundary = fs.readFileSync(
      path.resolve(__dirname, "../src/components/ui/panel-error-boundary.tsx"),
      "utf8",
    );
    expect(boundary).toContain("`error-boundary-${this.props.label.toLowerCase().replace(/\\s+/g, \"-\")}`");
  });
});