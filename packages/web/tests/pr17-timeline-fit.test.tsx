import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowTimeline } from "@/lib/providers/demo/demo-fixtures/timeline";
import fs from "fs";
import path from "path";

// ============================================================================
// F-PR17 · Timeline Fit
//
// The redesigned timeline is one surface that FITS the workspace bottom band:
//   - fills it (h-full / min-h-0 / flex-1) with NO internal vertical scroll,
//   - a single ~46px header (play path M8 5v14l11-7z retained, Investigation
//     Window + date range, inline M/E/O legend),
//   - THREE data lanes (milestones / evidence / observations) carrying EVERY
//     fixture item honestly (relationship stays off-surface, never hidden data),
//   - a MONO time axis (major/minor ticks + NOW marker) + analytical window
//     overlay at plain % bounds + two keyboard-accessible drag handles,
//   - under prefers-reduced-motion, play PUBLISHES the full frame immediately
//     (no rAF stepping), while the stepped playback frames stay intact.
// ============================================================================

const fixture = operationFinancialShadowTimeline;
const fixtureItemCount = fixture.items.length;

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr17:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function paddedDomain(): { start: number; end: number } {
  const times = fixture.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = Math.max((max - min) * 0.04, 1000 * 60 * 60 * 24 * 7);
  return { start: min - pad, end: max + pad };
}

const domain = paddedDomain();
const span = domain.end - domain.start;
const latestTs = Math.max(...fixture.items.map((it) => new Date(it.time).getTime()));

const mediaPrefs = vi.hoisted(() => ({ reduce: false }));

function stubPlatform() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mediaPrefs.reduce,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
}

beforeEach(() => {
  mediaPrefs.reduce = false;
  stubPlatform();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTimeline(onTimeRangeChange: (range: [number, number] | null) => void) {
  const providers = createWorkspaceDemoProviders(identity(), config);
  return render(
    <WorkspaceProvider providers={providers}>
      <TimelinePanel onTimeRangeChange={onTimeRangeChange} />
    </WorkspaceProvider>,
  );
}

function playButton(container: HTMLElement): HTMLButtonElement | null {
  const playSvg = container.querySelector('button svg path[d="M8 5v14l11-7z"]');
  return playSvg ? (playSvg.closest("button") as HTMLButtonElement) : null;
}

async function renderLoaded(onTimeRangeChange: (range: [number, number] | null) => void = () => undefined) {
  const result = renderTimeline(onTimeRangeChange);
  await screen.findAllByText("MILESTONES");
  return result;
}

// ─── Fit contract: the timeline FILLS its host and never scrolls ────────────

describe("F-PR17 §T the timeline fits its container without internal scroll", () => {
  it("renders exactly three analyst lanes carrying EVERY fixture item (honest data)", async () => {
    const { container } = await renderLoaded();
    const lanes = container.querySelectorAll("[data-timeline-lane]");
    expect(lanes).toHaveLength(3);
    expect(Array.from(lanes).map((l) => l.getAttribute("data-timeline-lane"))).toEqual([
      "milestone", "evidence", "observation",
    ]);
    // No fourth band seam leaks an empty relationship lane.
    expect(container.querySelector('[data-timeline-lane="relationship"]')).toBeNull();
    const diamonds = await screen.findAllByRole("button", { name: /^Activate / });
    expect(diamonds.length).toBe(fixtureItemCount);
    expect(fixtureItemCount).toBeGreaterThan(0);
  });

  it("the surface classes pin the panel to the host with zero internal scroll", () => {
    const src = fs.readFileSync(path.resolve("src/components/timeline/timeline-panel.tsx"), "utf-8");
    // Fills: flex-1 + min-h-0 column inside the fixed-height bottom band.
    expect(src).toContain("min-h-0 flex-1");
    expect(src).toContain("w-full min-h-0 flex-1 flex-col");
    // No scroll surface anywhere in the fit path.
    expect(src).not.toContain("overflow-y-auto");
    expect(src).not.toContain("overflow-scroll");
    // The track+axis block is a min-h-0 flex-1 child.
    expect(src).toContain("relative flex min-h-0 flex-1 flex-col");
    // Compact header row.
    expect(src).toContain("h-[46px]");
  });

  it("composes a compact header with the play path, window dates and inline legend", async () => {
    const { container } = await renderLoaded();
    expect(playButton(container)).not.toBeNull();
    expect(screen.getByText("Investigation Window")).not.toBeNull();
    expect(screen.getAllByText("MILESTONES").length).toBeGreaterThan(0);
    expect(screen.getAllByText("EVIDENCE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OBSERVATIONS").length).toBeGreaterThan(0);
  });
});

// ─── Analytical window overlay + mono axis + a11y handles ────────────────────

describe("F-PR17 §T the analytical window is honest and reaches the keyboard", () => {
  it("overlays the FULL track block at plain % bounds with a compact FOCUS label", async () => {
    const { container } = await renderLoaded();
    const overlay = container.querySelector("[data-timeline-window]");
    expect(overlay).not.toBeNull();
    const style = overlay!.getAttribute("style") ?? "";
    // Plain % framing — no legacy 140px sidebar offset in the math.
    expect(style).toContain("left: 0%");
    expect(style).toContain("right: 0%");
    expect(container.querySelector("[data-timeline-focus-label]")?.textContent).toContain("FOCUS:");
    expect(container.querySelector("[data-timeline-axis]")).not.toBeNull();
    expect(container.textContent).toContain("NOW");
  });

  it("renders a mono time axis in source (major/minor ticks never faked)", () => {
    const src = fs.readFileSync(path.resolve("src/components/timeline/timeline-panel.tsx"), "utf-8");
    expect(src).toContain("text-[7px] font-mono");
    expect(src).toContain("data-timeline-axis");
    // Major ticks derive from the live domain, never a hardcoded timeline.
    expect(src).toContain("formatDate(domain.start + span * (f / 100))");
  });

  it("both window handles are keyboard-accessible buttons with windowed drag bounds", async () => {
    const onTimeRangeChange = vi.fn();
    const { container } = await renderLoaded(onTimeRangeChange);
    await screen.findAllByRole("button", { name: /^Activate / });
    const handles = screen.getAllByRole("button", { name: /handle/ });
    expect(handles).toHaveLength(2);

    // Arrow-right on the START handle advances the window and publishes it.
    fireEvent.keyDown(handles[0]!, { key: "ArrowRight" });
    await waitFor(() => expect(onTimeRangeChange).toHaveBeenCalled(), { timeout: 3000 });
    const calls = onTimeRangeChange.mock.calls.map((c) => c[0] as [number, number]);
    expect(calls.some((c) => c[0] > domain.start && c[1] > c[0])).toBe(true);
    // The overlay follows the published window.
    const style = container.querySelector("[data-timeline-window]")!.getAttribute("style") ?? "";
    expect(style).not.toContain("left: 0%");
  });
});

// ─── Reduced motion publishes the full frame instantly ───────────────────────

describe("F-PR17 §T reduced-motion play publishes the full analytical window at once", () => {
  it("no rAF stepping — a single full-width frame anchored at the padded domain", async () => {
    mediaPrefs.reduce = true;
    const onTimeRangeChange = vi.fn();
    const { container } = await renderLoaded(onTimeRangeChange);
    const diamonds = await screen.findAllByRole("button", { name: /^Activate / });
    expect(diamonds.length).toBeGreaterThan(0);
    const play = playButton(container);
    expect(play).not.toBeNull();

    fireEvent.click(play!);
    await waitFor(() => expect(onTimeRangeChange).toHaveBeenCalled(), { timeout: 3000 });
    const calls = onTimeRangeChange.mock.calls.map((c) => c[0] as [number, number]);
    expect(calls.length).toBeGreaterThan(0);
    // Full frame: start exactly at the padded domain start, end == latest item.
    for (const [start, end] of calls) {
      expect(start).toBeCloseTo(domain.start, 3);
      expect(Math.abs(end - latestTs)).toBeLessThan(1);
    }
  }, 10000);
});