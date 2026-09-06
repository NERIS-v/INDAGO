"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type {
  Investigation,
  Entity,
  Lead,
  InvestigativeGap,
} from "@indago/contracts";
import type { EvidenceListItem } from "@/lib/api/types";
import { toProviderError, type ProviderEvent } from "@/lib/providers/types";
import { investigationUrl } from "@/lib/workspace/url";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

// F6: Import the visual feedback components
import { ProcessingFilament, RecoveryRing } from "@/components/feedback/shell-animations";

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
      // Deduplicate incoming events to prevent React key collisions
      setEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [event, ...prev].slice(0, 50);
      });
      
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
  }, [workspace, investigationId, load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12 relative">
        <ProcessingFilament isProcessing={true} />
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

  // F-PR15 briefing signals — derived ONLY from genuinely loaded list data.
  // "Unavailable" (null) is distinct from "no data" (0).
  const signals = useMemo(() => {
    const outstandingGapStatuses = ["IDENTIFIED", "ACKNOWLEDGED", "WORKING"];
    const inPursuitLeadStatuses = ["NEW", "UNDER_REVIEW", "ACTIVE"];
    return {
      openGaps: data.gaps === null
        ? null
        : data.gaps.filter((g) => outstandingGapStatuses.includes(g.status)).length,
      activeLeads: data.leads === null
        ? null
        : data.leads.filter((l) => inPursuitLeadStatuses.includes(l.status)).length,
    };
  }, [data.gaps, data.leads]);

  const nextActions = useMemo(() => {
    const base = investigationUrl(investigation.id, investigation.caseId);
    return [
      { label: "Review outstanding gaps", value: signals.openGaps, href: `${base}/gaps` },
      { label: "Review potential leads", value: signals.activeLeads, href: `${base}/leads` },
      { label: "Inspect evidence", href: `${base}/evidence` },
      { label: "Test hypothesis", href: `${base}/hypothesis` },
    ];
  }, [investigation.id, investigation.caseId, signals]);

  const stat = (value: number | null) =>
    value === null
      ? { display: "—", muted: true }
      : { display: String(value).padStart(2, "0"), muted: false };

  const evidenceStat = stat(data.evidence === null ? null : data.evidence.length);
  const entitiesStat = stat(data.entities === null ? null : data.entities.length);
  const leadsStat = stat(data.leads === null ? null : data.leads.length);
  const gapsStat = stat(data.gaps === null ? null : data.gaps.length);

  const activity = events.slice(0, 12);

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      {/* F6: Visual Feedback Layer */}
      <ProcessingFilament isProcessing={loading} />

      <div className="mx-auto max-w-[1080px]">
        {/* ── CASE IDENTITY ─────────────────────────────────────────── */}
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Investigation</span>
            <span className="h-px w-12 bg-semantic-border" aria-hidden="true" />
            <span className="text-semantic-foreground-faint">{investigation.id.slice(0, 8)}</span>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 max-w-3xl">
              <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
                {investigation.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Badge variant={live ? "success" : "muted"} dot dotPulse={live}>
                  {live ? "Live" : "Offline"}
                </Badge>
                <Badge variant="info">{investigation.status}</Badge>
                <Badge variant="accent">{investigation.priority}</Badge>
                {investigation.owner && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                    Owner {investigation.owner}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              {investigation.confidence !== undefined && (
                <ConfidenceIndicator
                  value={investigation.confidence}
                  label="Confidence"
                  showBar
                />
              )}
              <RecoveryRing isReconnecting={!live && data !== null} />
            </div>
          </div>
        </header>

        {/* ── CURRENT PICTURE ───────────────────────────────────────── */}
        <section className="pt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Current picture
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          </div>
          {investigation.description ? (
            <p className="mt-5 max-w-[70ch] font-display text-[1.35rem] font-light leading-[1.6] tracking-[-0.005em] text-semantic-foreground-muted">
              {investigation.description}
            </p>
          ) : (
            <p className="mt-5 type-caption text-semantic-foreground-faint">
              No case description has been recorded for this investigation.
            </p>
          )}
        </section>

        {/* ── INVESTIGATIVE STATE ───────────────────────────────────── */}
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Investigative state
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-px border border-semantic-border-subtle bg-semantic-border-subtle rounded-lg overflow-hidden sm:grid-cols-4">
            {[
              ["Evidence", evidenceStat.display],
              ["Entities", entitiesStat.display],
              ["Leads", leadsStat.display],
              ["Gaps", gapsStat.display],
            ].map(([label, display]) => {
              const isMuted =
                (label === "Evidence" && evidenceStat.muted) ||
                (label === "Entities" && entitiesStat.muted) ||
                (label === "Leads" && leadsStat.muted) ||
                (label === "Gaps" && gapsStat.muted);
              return (
                <div key={label} className="bg-semantic-surface px-6 py-5">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                    {label}
                  </span>
                  <p className={`mt-2 font-mono text-3xl font-extralight tracking-wide ${isMuted ? "text-semantic-foreground-faint" : "text-semantic-foreground"}`}>
                    {display}
                  </p>
                  {isMuted && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                      Unavailable
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SIGNALS / NEXT ACTIONS ────────────────────────────────── */}
        <section className="mt-12 grid gap-10 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                Signals
              </span>
              <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-0 divide-y divide-semantic-border-subtle">
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="type-caption text-semantic-foreground-muted">Outstanding gaps</span>
                {signals.openGaps === null ? (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">Unavailable</span>
                ) : (
                  <span className="font-mono text-sm text-semantic-foreground">
                    {String(signals.openGaps).padStart(2, "0")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="type-caption text-semantic-foreground-muted">Leads in pursuit</span>
                {signals.activeLeads === null ? (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">Unavailable</span>
                ) : (
                  <span className="font-mono text-sm text-semantic-foreground">
                    {String(signals.activeLeads).padStart(2, "0")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="type-caption text-semantic-foreground-muted">Live events</span>
                <span className="font-mono text-sm text-semantic-foreground">
                  {String(events.length).padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>

          <div className="sm:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                Next actions
              </span>
              <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            </div>
            <div className="mt-5 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle rounded-lg overflow-hidden sm:grid-cols-2">
              {nextActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex items-center justify-between gap-3 bg-semantic-surface px-5 py-4 transition-colors duration-fast hover:bg-semantic-surface-elevated"
                >
                  <span className="text-sm text-semantic-foreground">
                    {action.label}
                    {action.value !== undefined && action.value !== null && (
                      <span className="ml-2 font-mono text-[10px] text-semantic-foreground-faint">
                        {String(action.value)}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm text-accent-rose transition-transform duration-fast group-hover:translate-x-0.5">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── RECENT INVESTIGATIVE ACTIVITY ─────────────────────────── */}
        <section className="mt-12">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Recent investigative activity
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
              {String(events.length).padStart(2, "0")}
            </span>
          </div>

          <div className="mt-5">
            {activity.length === 0 ? (
              <div className="rounded-lg border border-dashed border-semantic-border px-6 py-10 text-center">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                  No activity yet
                </p>
                <p className="mt-2 type-caption text-semantic-foreground-faint">
                  Events appear as the investigation progresses.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-semantic-border-subtle">
                {activity.map((event, idx) => (
                  <div key={`${event.id ?? idx}`} className="flex items-baseline justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-semantic-foreground">
                        {event.action ?? "Event"}
                      </p>
                      {event.description && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-semantic-foreground-faint">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                      {event.timestamp
                        ? new Date(event.timestamp).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}