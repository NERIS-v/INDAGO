"use client";

// ============================================================================
// PR-5 — Intelligence · Activity tab
//
// Lower-density case activity history streamed through the EXISTING realtime
// seam (connect + subscribe), mirroring the established subscribe pattern used
// by investigation-overview / observations-feed / timeline-panel. The demo
// provider replays its history memory bank on subscribe, so events that fired
// while the tab was closed still surface here; Live streams via the SSE proxy.
//
// De-duplication mirrors the realtime normalizer: an event id, or a
// deterministic action|targetId|timestamp key, is only rendered once. The
// visible list is bounded (newest 100).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type { ProviderEvent, RealtimeStatus } from "@/lib/providers/types";
import {
  IntelligencePanel,
  EmptyIntelligenceState,
} from "./shared";

const MAX_EVENTS = 100;

function eventKey(event: ProviderEvent): string {
  return event.id ?? `${event.action ?? "event"}|${event.targetId ?? ""}|${event.timestamp ?? ""}`;
}

function formatEventTime(timestamp?: string): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function IntelligenceActivity() {
  const workspace = useWorkspace();
  const [events, setEvents] = useState<ProviderEvent[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const seenRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const handleEvent = useCallback(
    (event: ProviderEvent) => {
      const key = eventKey(event);
      setEvents((prev) => {
        if (seenRef.current.has(key)) return prev;
        seenRef.current.add(key);
        const next = [event, ...prev];
        return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
      });
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

  return (
    <IntelligencePanel>
      <div data-intelligence-activity className="space-y-3">
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
        {events.length === 0 ? (
          <EmptyIntelligenceState
            title="No case activity yet"
            detail="Events will stream here as the case unfolds."
          />
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
                  {formatEventTime(event.timestamp)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </IntelligencePanel>
  );
}