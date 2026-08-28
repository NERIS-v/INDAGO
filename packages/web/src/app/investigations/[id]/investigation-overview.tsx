"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type {
  Investigation,
  Evidence,
  Entity,
  Lead,
  InvestigativeGap,
} from "@indago/contracts";
import { toProviderError, type ProviderEvent } from "@/lib/providers/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

interface OverviewData {
  readonly investigation: Investigation;
  readonly evidence: Evidence[];
  readonly entities: Entity[];
  readonly leads: Lead[];
  readonly gaps: InvestigativeGap[];
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [investigation, evidence, entities, leads, gaps] =
        await Promise.all([
          workspace.investigations.get(investigationId),
          workspace.evidence.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
          workspace.entities.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
          workspace.leads.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
          workspace.gaps.listByInvestigation(investigationId, {
            pageSize: 100,
          }),
        ]);
      setData({
        investigation,
        evidence: evidence.items,
        entities: entities.items,
        leads: leads.items,
        gaps: gaps.items,
      });
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

  const { investigation, evidence, entities, leads, gaps } = data;

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
            <p className="type-mono-xl text-text-primary">{evidence.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Entities</p>
            <p className="type-mono-xl text-text-primary">{entities.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Leads</p>
            <p className="type-mono-xl text-text-primary">{leads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="type-section text-text-muted">Gaps</p>
            <p className="type-mono-xl text-text-primary">{gaps.length}</p>
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
