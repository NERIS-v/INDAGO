"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type {
  Investigation,
  Entity,
  Lead,
  InvestigativeGap,
} from "@indago/contracts";
import type { EvidenceListItem } from "@/lib/api/types";
import { toProviderError, type ProviderEvent } from "@/lib/providers/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

interface OverviewData {
  readonly investigation: Investigation;
  /** null = blocked/unavailable (backend endpoint not exposed), distinct from empty. */
  readonly evidence: EvidenceListItem[] | null;
  readonly entities: Entity[] | null;
  readonly leads: Lead[] | null;
  readonly gaps: InvestigativeGap[] | null;
}

/** Load one list resource; unsupported/backend failures become an explicit
 *  "unavailable" state — never a silent empty array that looks like "no data". */
async function settleList<T>(
  load: () => Promise<{ items: T[] }>,
): Promise<T[] | null> {
  try {
    return (await load()).items;
  } catch {
    return null;
  }
}

export function InvestigationOverview({
  investigationId,
}: {
  readonly investigationId: string;
}) {
  const workspace = useWorkspace();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ProviderEvent[]>([]);
  const [live, setLive] = useState(false);

  // Mirror the latest data for the realtime subscription callback (which is
  // stable across renders), so reconnect resync reads current state.
  const dataRef = useRef<OverviewData | null>(null);
  dataRef.current = data;
  const connectedOnceRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The investigation itself is authoritative: any failure here surfaces as
      // the full error state. Domain list resources are tolerated individually
      // so that live providers without a backend endpoint render a distinct
      // "unavailable" state rather than taking down the whole overview.
      const investigation = await workspace.investigations.get(investigationId);
      const [evidence, entities, leads, gaps] = await Promise.all([
        settleList(() =>
          workspace.evidence.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
        ),
        settleList(() =>
          workspace.entities.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
        ),
        settleList(() =>
          workspace.leads.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
        ),
        settleList(() =>
          workspace.gaps.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
        ),
      ]);
      setData({ investigation, evidence, entities, leads, gaps });
    } catch (err) {
      setError(toProviderError(err).message);
    } finally {
      setLoading(false);
    }
  }, [workspace, investigationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const realtime = workspace.realtime;
    const unsubscribe = realtime.subscribe((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      // Reconnect resync (Prompt 3 §19/§20): once the stream reconnects, the
      // database is authoritative — re-fetch the run state + lists. The first
      // connect is skipped because the initial load() already covers it (and
      // avoids a duplicate GET on mount).
      if (event.action === "STREAM_CONNECTED") {
        if (connectedOnceRef.current && dataRef.current !== null) {
          void load();
        }
        connectedOnceRef.current = true;
      }
    });
    const timer = window.setInterval(() => {
      setLive(realtime.getStatus() === "connected");
    }, 600);
    realtime.connect(investigationId);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      realtime.disconnect();
    };
  }, [workspace, investigationId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner label="Loading workspace…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay
          title="Unable to load investigation"
          message={error}
          retry={() => void load()}
        />
      </div>
    );
  }

  if (!data) return null;

  const { investigation } = data;

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="type-title text-text-primary">
              {investigation.title}
            </h1>
            <Badge variant={live ? "success" : "muted"} dot dotPulse={live}>
              {live ? "Live" : "Offline"}
            </Badge>
          </div>
          <p className="type-mono-small">{investigation.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="info">{investigation.status}</Badge>
          <Badge variant="accent">{investigation.priority}</Badge>
          {investigation.confidence !== undefined && (
            <ConfidenceIndicator
              value={investigation.confidence}
              label="Confidence"
              showBar
            />
          )}
        </div>
      </div>

      <p className="type-body text-surface-600 max-w-3xl">
        {investigation.description}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Evidence</p>
            {data.evidence === null ? (
              <p className="type-caption text-surface-500">Unavailable</p>
            ) : (
              <p className="type-mono-xl text-text-primary">{data.evidence.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Entities</p>
            {data.entities === null ? (
              <p className="type-caption text-surface-500">Unavailable</p>
            ) : (
              <p className="type-mono-xl text-text-primary">{data.entities.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Leads</p>
            {data.leads === null ? (
              <p className="type-caption text-surface-500">Unavailable</p>
            ) : (
              <p className="type-mono-xl text-text-primary">{data.leads.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Gaps</p>
            {data.gaps === null ? (
              <p className="type-caption text-surface-500">Unavailable</p>
            ) : (
              <p className="type-mono-xl text-text-primary">{data.gaps.length}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="border-b border-surface-200/40 px-6 py-4">
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
            <Badge variant="muted">{events.length}</Badge>
          </CardHeader>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {events.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Events appear as the investigation progresses."
            />
          ) : (
            <div className="divide-y divide-surface-200/30">
              {events.map((event, idx) => (
                <div key={`${event.id ?? idx}`} className="px-6 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-surface-700">
                        {event.action ?? "Event"}
                      </p>
                      {event.description && (
                        <p className="truncate text-[11px] text-surface-500">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-surface-500">
                      {event.timestamp
                        ? new Date(event.timestamp).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
