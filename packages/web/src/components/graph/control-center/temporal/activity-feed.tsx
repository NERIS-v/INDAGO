"use client";

// ============================================================================
// PR-7 — Temporal · ACTIVITY tab
//
// The live case-activity stream, read through the EXISTING realtime seam
// (connect + subscribe), mirroring the subscribe pattern used by
// intelligence-activity / investigation-overview / timeline-panel. The demo
// provider replays its memory bank on subscribe, so events that fired while the
// tab was closed still surface; Live streams via the SSE proxy.
//
// Integrity rule: while a HISTORICAL graph version is selected, the feed keeps
// recording events in record-only mode, but realtime NEVER mutates the visible
// historical view (see temporal-workspace.realtimeMayMutateVisibleGraph).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type { ProviderEvent, RealtimeStatus } from "@/lib/providers/types";
import {
  createActivityFeedState,
  eventKey,
  formatActivityTime,
  reduceActivityEvent,
  type ActivityFeedState,
} from "@/lib/context/activity-feed";
import {
  HISTORICAL_NO_SILENT_MUTATION,
  isHistoricalView,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";

interface TemporalActivityFeedProps {
  readonly selection: TemporalVersionSelection;
}

export function TemporalActivityFeed({ selection }: TemporalActivityFeedProps) {
  const workspace = useWorkspace();
  const [feed, setFeed] = useState<ActivityFeedState>(() =>
    createActivityFeedState(),
  );
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const mountedRef = useRef(true);
  const historical = isHistoricalView(selection);

  const handleEvent = useCallback(
    (event: ProviderEvent) => {
      setFeed((prev) => reduceActivityEvent(prev, event));
      setStatus(workspace.realtime.getStatus());
    },
    [workspace],
  );

  useEffect(() => {
    mountedRef.current = true;
    const ws = workspace;
    ws.realtime.connect(ws.investigationId);
    setStatus(ws.realtime.getStatus());
    const unsubscribe = ws.realtime.subscribe(handleEvent);
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [workspace, handleEvent]);

  // Refresh the live connection badge as the stream transitions.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      const next = workspace.realtime.getStatus();
      setStatus((prev) => (prev === next ? prev : next));
    }, 1500);
    return () => clearInterval(interval);
  }, [workspace]);

  const events = feed.events;

  return (
    <div data-temporal-activity className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          Case activity
        </h2>
        <span
          data-activity-status
          className={`text-[9px] font-mono uppercase tracking-widest ${
            status === "connected" ? "text-brand-600" : "text-surface-400"
          }`}
        >
          {status} · {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      {historical && (
        <p
          data-activity-record-only
          className="rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-[10px] leading-relaxed text-amber-800"
        >
          Record-only: {HISTORICAL_NO_SILENT_MUTATION}
        </p>
      )}

      {events.length === 0 ? (
        <p className="type-caption text-surface-400">
          No case activity yet — events will stream here as the case unfolds.
        </p>
      ) : (
        <ul data-activity-list className="space-y-2">
          {events.map((event, i) => (
            <li
              key={eventKey(event)}
              data-activity-event
              data-activity-event-key={eventKey(event)}
              data-activity-action={event.action ?? event.targetType ?? "event"}
              className="flex items-start justify-between gap-3 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2"
              style={{ animationDelay: `${Math.min(i * 15, 200)}ms` }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-surface-800">
                  {event.description ?? "No event description."}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-widest text-surface-500">
                  {event.action ?? event.targetType ?? "event"}
                  {event.targetType ? ` · ${event.targetType}` : ""}
                  {event.targetId ? ` · ${event.targetId}` : ""}
                </p>
              </div>
              <time className="shrink-0 text-[9px] font-mono text-surface-400">
                {formatActivityTime(event.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}