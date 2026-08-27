"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { InvestigationStatusResponse } from "@/lib/api/types";
import type { SseEvent } from "@/lib/realtime/sse-client";
import { createSseClient } from "@/lib/realtime/sse-client";
import { InvestigationStatus } from "@/components/status/investigation-status";
import { EvidenceSubmission } from "@/components/evidence/evidence-submission";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getInvestigationStatus } from "@/lib/api/server-action";

interface InvestigationDetailProps {
  readonly initialData: InvestigationStatusResponse;
  readonly caseId: string;
}

export function InvestigationDetail({
  initialData,
  caseId,
}: InvestigationDetailProps) {
  const [investigation, setInvestigation] =
    useState<InvestigationStatusResponse>(initialData);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [sseError, setSseError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const sseRef = useRef<ReturnType<typeof createSseClient> | null>(null);

  const handleRefresh = useCallback(async () => {
    try {
      const data = await getInvestigationStatus(
        investigation.investigationId,
        caseId,
      );
      setInvestigation(data);
    } catch {
      // Silent fail — SSE will keep state current
    }
  }, [investigation.investigationId, caseId]);

  useEffect(() => {
    const client = createSseClient({
      investigationId: investigation.investigationId,
      onEvent: (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 100));
        handleRefresh();
      },
      onOpen: () => setSseConnected(true),
      onClose: () => setSseConnected(false),
      onError: (err) => setSseError(err.message),
    });

    sseRef.current = client;
    client.connect();

    return () => {
      client.destroy();
      sseRef.current = null;
    };
  }, [investigation.investigationId, handleRefresh]);

  const canAddEvidence =
    investigation.state === "CREATED" || investigation.state === "INGESTING";

  return (
    <div className="space-y-6 p-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="type-title text-text-primary">Investigation</h1>
            <Badge variant={sseConnected ? "success" : "muted"}>
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${sseConnected ? "bg-success animate-slow-pulse" : "bg-surface-400"}`} />
              {sseConnected ? "Live" : "Offline"}
            </Badge>
          </div>
          <p className="type-mono-small">
            {investigation.investigationId}
          </p>
        </div>
        {canAddEvidence && !showEvidenceForm && (
          <Button onClick={() => setShowEvidenceForm(true)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Evidence
          </Button>
        )}
        {showEvidenceForm && (
          <Button variant="ghost" onClick={() => setShowEvidenceForm(false)}>
            Close
          </Button>
        )}
      </div>

      {sseError && (
        <div className="rounded-lg bg-danger/10 p-4 text-sm border border-danger/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-danger/70" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="font-medium text-danger/80">SSE Connection Error</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSseError(null);
                sseRef.current?.connect();
              }}
            >
              Reconnect
            </Button>
          </div>
          <p className="mt-1 text-xs text-danger/60">{sseError}</p>
        </div>
      )}

      <InvestigationStatus investigation={investigation} />

      {canAddEvidence && showEvidenceForm && (
        <Card>
          <CardContent>
            <EvidenceSubmission
              investigationId={investigation.investigationId}
              onComplete={() => {
                setShowEvidenceForm(false);
                handleRefresh();
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card padding="none">
        <div className="border-b border-surface-200/40 px-6 py-4">
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
            <Badge variant="muted">{events.length}</Badge>
          </CardHeader>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-8 w-8 text-surface-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="mt-3 text-xs text-surface-500">
                No activity yet. Events appear as the investigation progresses.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-200/30">
              {events.map((event, idx) => (
                <div
                  key={`${event.investigationId}-${idx}`}
                  className="px-6 py-3 transition-all duration-500 hover:bg-surface-100/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-200/50 text-surface-500">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-surface-700">
                          {event.action ?? "Unknown Event"}
                        </p>
                        {event.description && (
                          <p className="text-[11px] text-surface-500 truncate">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-surface-500 whitespace-nowrap shrink-0">
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
