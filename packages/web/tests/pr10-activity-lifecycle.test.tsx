// ============================================================================
// PR-10 §46 — ACTIVITY feed lifecycle discipline
//
// The feed must attach EXACTLY ONE realtime subscription per mount and hold it
// for the whole lifetime of the surface. The 1500ms connection-badge poll is a
// separate concern: it only reads getStatus() and MUST never cause a re-spin of
// the effect (which would re-subscribe, replay the memory bank, and duplicate
// every event). On unmount it unsubscribes immediately — no listener leaks, no
// setState-after-unmount.
//
// Record-only integrity: while a historical version is selected the feed keeps
// recording events (so nothing is silently lost) but realtime never mutates the
// visible historical view.
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { TemporalActivityFeed } from "@/components/graph/control-center/temporal/activity-feed";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, ProviderEvent, WorkspaceIdentity } from "@/lib/providers/types";
import { CASE_ID, INVESTIGATION_ID, GRAPH_VERSION_V1 } from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  createActivityFeedState,
  reduceActivityEvent,
  reduceActivityBatch,
  eventKey,
  DEFAULT_ACTIVITY_FEED_LIMIT,
} from "@/lib/context/activity-feed";
import {
  CURRENT_VERSION_SELECTION,
  isHistoricalView,
  realtimeMayMutateVisibleGraph,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr10-activity:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PR-10 §46 — one subscription per mount, held for the component lifetime", () => {
  it("subscribes exactly once and never re-subscribes across the 1500ms badge poll", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const subscribeCalls: number[] = [];
    const unsubscribeCalls: number[] = [];
    const rawSubscribe = providers.realtime.subscribe.bind(providers.realtime);
    vi.spyOn(providers.realtime, "subscribe").mockImplementation(
      (listener: (event: ProviderEvent) => void) => {
        subscribeCalls.push(1);
        const unsub = rawSubscribe(listener);
        return () => {
          unsub();
          unsubscribeCalls.push(1);
        };
      },
    );

    const { unmount, container } = render(
      <WorkspaceProvider providers={providers}>
        <TemporalActivityFeed selection={CURRENT_VERSION_SELECTION} />
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
    await waitFor(() =>
      expect(screen.getByText(/connected · \d+ events/)).toBeInTheDocument(),
    );
    expect(subscribeCalls.length).toBe(1);
    expect(unsubscribeCalls.length).toBe(0);

    // A full badge-poll window (1500ms) must NOT re-spin the effect.
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(subscribeCalls.length).toBe(1);
    expect(unsubscribeCalls.length).toBe(0);

    unmount();
    expect(unsubscribeCalls.length).toBe(1);
    expect(subscribeCalls.length).toBe(1);
  });

  it("a fresh mount attaches a fresh subscription after cleaning up the old one", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const subscribeCalls: number[] = [];
    const unsubscribeCalls: number[] = [];
    const rawSubscribe = providers.realtime.subscribe.bind(providers.realtime);
    vi.spyOn(providers.realtime, "subscribe").mockImplementation(
      (listener: (event: ProviderEvent) => void) => {
        subscribeCalls.push(1);
        const unsub = rawSubscribe(listener);
        return () => {
          unsub();
          unsubscribeCalls.push(1);
        };
      },
    );

    const harness = (key: string) =>
      render(
        <div key={key}>
          <WorkspaceProvider providers={providers}>
            <TemporalActivityFeed selection={CURRENT_VERSION_SELECTION} />
          </WorkspaceProvider>
        </div>,
      );

    const first = harness("mount-1");
    await waitFor(() => {
      expect(first.container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
    first.unmount();
    expect(unsubscribeCalls.length).toBe(1);

    const second = harness("mount-2");
    await waitFor(() => {
      expect(second.container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
    expect(subscribeCalls.length).toBe(2);
    second.unmount();
    expect(unsubscribeCalls.length).toBe(2);
  });
});

describe("PR-10 §46 — the reducer is deterministic and bounded", () => {
  const base = {
    action: "edit" as const,
    targetType: "entity" as const,
    targetId: "ent-1",
    timestamp: "2026-09-06T10:00:00.000Z",
    description: "Investigator edited entity",
  };

  it("eventKey falls back to the action|targetId|timestamp composite", () => {
    expect(eventKey(base)).toBe("edit|ent-1|2026-09-06T10:00:00.000Z");
    expect(eventKey({ ...base, id: "evt-42" })).toBe("evt-42");
  });

  it("de-duplicates identical composites within the live replay stream", () => {
    const first = reduceActivityEvent(createActivityFeedState(), base);
    const second = reduceActivityEvent(first, base);
    expect(second.events).toHaveLength(1);
    // A further event with the SAME composite but an explicit id is distinct.
    const third = reduceActivityEvent(second, { ...base, id: "evt-1" });
    expect(third.events).toHaveLength(2);
  });

  it("a batched replay respects the bounded feed limit", () => {
    const state = createActivityFeedState();
    const batch = Array.from({ length: DEFAULT_ACTIVITY_FEED_LIMIT + 20 }, (_, i) => ({
      ...base,
      id: `evt-${i}`,
      targetId: `ent-${i}`,
    }));
    const reduced = reduceActivityBatch(state, batch);
    expect(reduced.events).toHaveLength(DEFAULT_ACTIVITY_FEED_LIMIT);
    // Newest-first: the first element of the batch is the newest.
    expect(reduced.events[0]!.id).toBe(`evt-${batch.length - 1}`);
  });
});

describe("PR-10 §46 — record-only integrity under historical selection", () => {
  it("keeps recording the stream (no silent loss) while showing the banner", async () => {
    const historical: TemporalVersionSelection = { mode: "historical", versionId: GRAPH_VERSION_V1 };
    const providers = createWorkspaceDemoProviders(identity(), config);
    const { container } = render(
      <WorkspaceProvider providers={providers}>
        <TemporalActivityFeed selection={historical} />
      </WorkspaceProvider>,
    );

    expect(isHistoricalView(historical)).toBe(true);
    expect(
      screen.getByText(/Record-only:/).textContent,
    ).toContain("never mutate this historical graph view");

    await waitFor(() => {
      // Events still arrive — recording continues in record-only mode.
      expect(container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
  });

  it("realtime cannot mutate the visible graph while a historical version is selected", () => {
    const current = CURRENT_VERSION_SELECTION;
    const historical: TemporalVersionSelection = { mode: "historical", versionId: GRAPH_VERSION_V1 };

    expect(realtimeMayMutateVisibleGraph(current)).toBe(true);
    expect(realtimeMayMutateVisibleGraph(historical)).toBe(false);
    expect(isHistoricalView(historical)).toBe(true);
  });
});