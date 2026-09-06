import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowTimeline } from "@/lib/providers/demo/demo-fixtures/timeline";

// PR-6 §T regression: a fresh graph mount auto-published a temporal window
// BEFORE the timeline resolved, using the fallback domain [now-90d, now]. Every
// node in the demo case is 2023-24 era, so the graph pinned every node
// out-of-range until the analyst pressed play. The workspace temporal scope
// must stay null ("current status of everything") until a restore is applied or
// the analyst explicitly drags/plays/scrubs.

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr6-t:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Mirrors the panel's own padded domain derivation over the fixture. */
function paddedDomain(): { start: number; end: number } {
  const times = operationFinancialShadowTimeline.items
    .map((it) => new Date(it.time).getTime())
    .filter((t) => !Number.isNaN(t));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = Math.max((max - min) * 0.04, 1000 * 60 * 60 * 24 * 7);
  return { start: min - pad, end: max + pad };
}

const domain = paddedDomain();

function renderTimeline(onTimeRangeChange: (range: [number, number] | null) => void, restoredTimeRange?: [number, number] | null) {
  const providers = createWorkspaceDemoProviders(identity(), config);
  return render(
    <WorkspaceProvider providers={providers}>
      <TimelinePanel onTimeRangeChange={onTimeRangeChange} restoredTimeRange={restoredTimeRange} />
    </WorkspaceProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("PR-6 §T timeline default temporal scope", () => {
  it("fresh mount stays unbounded — no window is auto-published while the timeline calibrates", async () => {
    const onTimeRangeChange = vi.fn();
    renderTimeline(onTimeRangeChange, null);
    // Wait for the real timeline to resolve (MILESTONES renders only post-load),
    // then let the legacy 50ms mount debounce resolve: it must NOT have published.
    await screen.findAllByText("MILESTONES");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onTimeRangeChange).not.toHaveBeenCalled();
  });

  it("pressing play publishes a replay window anchored to the padded timeline domain", async () => {
    const onTimeRangeChange = vi.fn();
    const { container } = renderTimeline(onTimeRangeChange, null);
    await screen.findAllByText("MILESTONES");
    // Wait for the real item data (the M I L E S T O N E S legend renders as soon
    // as the fixture bands arrive — BEFORE items resolve). Playback must anchor
    // to the real padded domain, never the fallback [now-90d, now].
    const diamonds = await screen.findAllByRole("button", { name: /^Activate / });
    expect(diamonds.length).toBeGreaterThan(0);

    const playSvg = container.querySelector('button svg path[d="M8 5v14l11-7z"]');
    expect(playSvg).not.toBeNull();
    fireEvent.click(playSvg!.closest("button")!);

    await waitFor(() => expect(onTimeRangeChange).toHaveBeenCalled());
    const calls = onTimeRangeChange.mock.calls.map((c) => c[0] as [number, number]);
    // Every replay frame is anchored at the padded domain start (oldest item -
    // pad), never null. Playback widens monotonically while frames flow, BUT
    // under heavy CI contention the whole PLAY_DURATION_MS can elapse before the
    // first rAF fires, collapsing playback onto a single full-width frame — so a
    // strictly larger later frame is only REQUIRED when later frames published.
    expect(calls[0]![0]).toBe(domain.start);
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i]![0]).toBe(domain.start);
      expect(calls[i]![1]).toBeGreaterThanOrEqual(calls[i - 1]![1]);
    }
  });

  it("a restored workspace scope is still seeded and published once the domain is known", async () => {
    const onTimeRangeChange = vi.fn();
    const restored: [number, number] = [
      epochMs("2024-02-05T12:00:00.000Z"),
      epochMs("2024-02-15T12:00:00.000Z"),
    ];
    renderTimeline(onTimeRangeChange, restored);
    await screen.findAllByText("MILESTONES");

    await waitFor(() => expect(onTimeRangeChange).toHaveBeenCalled());
    const published = onTimeRangeChange.mock.calls[0]![0] as [number, number];
    // The seeded range projects onto the padded domain and round-trips the
    // restored window (float tolerance: <2ms).
    expect(Math.abs(published[0] - restored[0])).toBeLessThan(2);
    expect(Math.abs(published[1] - restored[1])).toBeLessThan(2);
  });
});