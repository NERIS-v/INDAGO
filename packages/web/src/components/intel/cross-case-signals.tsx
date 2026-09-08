"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CrossCaseMatch } from "@indago/contracts";
import type { CrossCaseSignal as Phase1Signal } from "@/lib/providers/types";

type AuthState = "idle" | "confirming" | "authorized";

interface ResolvedMatch {
  readonly match: CrossCaseMatch;
  readonly sourceEntityName: string;
  readonly targetEntityLabel: string;
  readonly targetCaseLabel: string;
  readonly targetCaseSummary?: string;
}

const PAGE_SIZE = 50;

function getLabel(match: CrossCaseMatch, key: string): string | undefined {
  return match.metadata?.labels?.find((l) => l.key === key)?.value;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function matchKey(m: CrossCaseMatch): string {
  return `${m.sourceCaseId}:${m.targetCaseId}:${m.sourceEntityId}:${m.targetEntityId}`;
}

function formatDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

/** PASS 2 — Phase-1 cross-case analysis banner. Renders ONLY when the workspace
 *  carries a derived crossCaseSignal projection (real cases); OFS/live workspaces
 *  render nothing. All scores are DERIVED_BY_DEMO_LOGIC. */
function Phase1SignalBanner({ signal }: { signal?: Phase1Signal }) {
  if (!signal) return null;
  return (
    <div className="glass-panel rounded-xl px-6 py-4 border-l-4 border-l-accent-blue/70 bg-accent-blue/5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-accent-blue uppercase tracking-widest font-bold">
              Phase-1 Cross-Case Analysis
            </span>
            <span className="text-[9px] font-mono text-surface-700 uppercase tracking-widest">
              DERIVED_BY_DEMO_LOGIC · deterministic structural comparison
            </span>
          </div>
          <Badge variant="info" className="bg-info/10 border-info/30 font-mono text-[9px] uppercase tracking-widest text-surface-900">
            {signal.supportingEntityIds.length} SHARED ORG MEMBERS
          </Badge>
        </div>

        <p className="text-sm leading-relaxed text-surface-900">{signal.signal}</p>
        <p className="text-[10px] font-mono text-surface-700 leading-relaxed uppercase tracking-widest">
          {signal.rationale}
        </p>

        {signal.candidateRanking.length > 0 && (
          <div className="mt-1 border-t border-surface-200/50 pt-3 flex flex-col gap-1.5">
            {signal.candidateRanking.map((candidate) => (
              <div key={candidate.candidateId} className="flex items-center justify-between gap-4 text-[11px] font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-surface-700 w-5 shrink-0 tabular-nums">#{candidate.rank}</span>
                  <span className="text-surface-900 font-medium truncate">{candidate.label}</span>
                  {candidate.roleLabel && (
                    <span className="text-surface-700 truncate hidden sm:inline">· {candidate.roleLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {candidate.status === "SELECTED" && (
                    <Badge variant="success" dot className="bg-success/10 border-success/30 text-surface-900 font-mono text-[9px] uppercase tracking-widest">
                      Selected
                    </Badge>
                  )}
                  <span className={`tabular-nums text-xs font-bold ${candidate.status === "SELECTED" ? "text-accent-blue" : "text-surface-700"}`}>
                    {candidate.score.toFixed(4)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CrossCaseSignals() {
  const workspace = useWorkspace();
  const [resolved, setResolved] = useState<ResolvedMatch[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [sourceCaseTitle, setSourceCaseTitle] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [authByKey, setAuthByKey] = useState<Record<string, AuthState>>({});
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [page, sourceCase] = await Promise.all([
          workspace.crossCase.listMatches(workspace.caseId, { pageSize: PAGE_SIZE }),
          workspace.cases.get(workspace.caseId).catch(() => null),
        ]);

        const withNames = await Promise.all(
          page.items.map(async (match): Promise<ResolvedMatch> => {
            const sourceEntity = await workspace.entities.get(match.sourceEntityId).catch(() => null);
            return {
              match,
              sourceEntityName: sourceEntity?.canonicalName ?? `Entity ${shortId(match.sourceEntityId)}`,
              targetEntityLabel: getLabel(match, "targetEntityLabel") ?? `Entity ${shortId(match.targetEntityId)}`,
              targetCaseLabel: getLabel(match, "targetCaseLabel") ?? `Case ${shortId(match.targetCaseId)}`,
              targetCaseSummary: getLabel(match, "targetCaseSummary"),
            };
          })
        );

        if (isMounted) {
          setResolved(withNames);
          setSourceCaseTitle(sourceCase?.title ?? null);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error("Failed to load cross-case signals"));
      }
    }
    load();
    return () => { isMounted = false; };
  }, [workspace]);

  const visible = useMemo(
    () => (resolved ?? []).filter((r) => showDismissed || !dismissedKeys.has(matchKey(r.match))),
    [resolved, dismissedKeys, showDismissed]
  );
  
  const dismissedCount = (resolved ?? []).filter((r) => dismissedKeys.has(matchKey(r.match))).length;
  const topScore = resolved && resolved.length > 0 ? Math.max(...resolved.map((r) => r.match.matchScore)) : null;

  const handleAuthorize = useCallback((key: string) => {
    setAuthByKey((prev) => {
      const cur = prev[key] ?? "idle";
      if (cur === "idle") return { ...prev, [key]: "confirming" };
      if (cur === "confirming") return { ...prev, [key]: "authorized" };
      return prev;
    });
  }, []);
  
  const handleCancelAuthorize = useCallback((key: string) => {
    setAuthByKey((prev) => ({ ...prev, [key]: "idle" }));
  }, []);
  
  const handleDismiss = useCallback((key: string) => {
    setDismissedKeys((prev) => new Set(prev).add(key));
    setExpandedKey((cur) => (cur === key ? null : cur));
  }, []);
  
  const handleRestore = useCallback((key: string) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  if (error) {
    return (
      <div className="w-full py-16 flex items-center justify-center glass-panel rounded-xl border border-danger/40 bg-danger/5">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <Phase1SignalBanner signal={workspace.crossCaseSignal} />
        <div className="w-full py-20 flex flex-col gap-4 items-center justify-center glass-panel rounded-xl">
          <LoadingSpinner size="lg" />
          <span className="text-[10px] font-mono text-surface-700 uppercase tracking-widest animate-pulse">Scanning global boundaries...</span>
        </div>
      </div>
    );
  }

  if (resolved.length === 0) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <Phase1SignalBanner signal={workspace.crossCaseSignal} />
        <div className="glass-panel rounded-xl p-8">
          <EmptyState
            title="No cross-case signals yet"
            description="INDAGO checks new entities, infrastructure, and patterns against other cases as evidence comes in. Nothing has matched so far."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">

      <Phase1SignalBanner signal={workspace.crossCaseSignal} />
      
      <div className="flex items-center justify-between gap-4 px-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-surface-700 uppercase tracking-widest font-bold">Boundary Scans</span>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-light text-surface-900 tabular-nums">{visible.length}</span>
            <span className="text-sm text-surface-700 font-mono uppercase tracking-widest">
              {visible.length === 1 ? "CANDIDATE" : "CANDIDATES"} DETECTED
            </span>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1">
          {topScore !== null && (
            <span className="text-[10px] font-mono text-accent-amber uppercase tracking-widest flex items-center gap-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
              Peak Match: {Math.round(topScore * 100)}%
            </span>
          )}
          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDismissed((v) => !v)}
              className="text-[10px] font-mono text-surface-700 hover:text-surface-900 transition-colors uppercase tracking-widest underline decoration-surface-500/30 underline-offset-4 font-bold mt-1"
            >
              {showDismissed ? "Hide" : "Show"} {dismissedCount} Dismissed
            </button>
          )}
        </div>
      </div>

      {/* CANDIDATE LIST */}
      {visible.length === 0 ? (
        <div className="glass-panel rounded-xl p-8">
          <EmptyState
            title="All candidates reviewed"
            description="Every boundary candidate has been dismissed. Use the toggle above to review them again."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((r) => {
            const key = matchKey(r.match);
            return (
              <CandidateCard
                key={key}
                sourceCaseTitle={sourceCaseTitle ?? "This case"}
                resolved={r}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey((cur) => (cur === key ? null : key))}
                dismissed={dismissedKeys.has(key)}
                authState={authByKey[key] ?? "idle"}
                onAuthorize={() => handleAuthorize(key)}
                onCancelAuthorize={() => handleCancelAuthorize(key)}
                onDismiss={() => handleDismiss(key)}
                onRestore={() => handleRestore(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CandidateCardProps {
  readonly sourceCaseTitle: string;
  readonly resolved: ResolvedMatch;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly dismissed: boolean;
  readonly authState: AuthState;
  readonly onAuthorize: () => void;
  readonly onCancelAuthorize: () => void;
  readonly onDismiss: () => void;
  readonly onRestore: () => void;
}

function CandidateCard({
  sourceCaseTitle,
  resolved,
  expanded,
  onToggle,
  dismissed,
  authState,
  onAuthorize,
  onCancelAuthorize,
  onDismiss,
  onRestore,
}: CandidateCardProps) {
  const { match, sourceEntityName, targetEntityLabel, targetCaseLabel, targetCaseSummary } = resolved;
  const matchPct = Math.round(match.matchScore * 100);
  const confidencePct = Math.round(match.confidence * 100);

  const statusColor = dismissed ? "text-surface-700" : matchPct >= 80 ? "text-accent-rose" : "text-accent-amber";
  const glowShadow = dismissed ? "none" : matchPct >= 80 ? "0 0 15px var(--color-accent-rose-subtle)" : "0 0 15px var(--color-accent-amber-subtle)";

  return (
    <div
      className={`glass-panel transition-all duration-300 rounded-xl overflow-hidden ${
        dismissed ? "opacity-50 grayscale-[50%]" : "hover:border-surface-400/50 shadow-lg"
      }`}
      style={{ boxShadow: expanded ? glowShadow : undefined }}
    >

      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-6 px-6 py-5 text-left focus-visible:outline-none focus-visible:bg-surface-100/50 transition-colors group"
        aria-expanded={expanded}
      >
        <ConnectingThread 
          sourceLabel={sourceEntityName} 
          targetLabel={targetEntityLabel} 
          pulse={!dismissed && expanded} 
          statusColor={statusColor}
        />

        <div className="flex flex-col items-end gap-1.5 shrink-0 min-w-[100px]">
          <span className={`text-xl font-light tabular-nums tracking-tight ${statusColor}`}>
            {matchPct}% <span className="text-xs font-mono tracking-widest opacity-90">MATCH</span>
          </span>
          
          {dismissed && <Badge variant="muted" className="text-surface-900 border-surface-600 bg-surface-800">Dismissed</Badge>}
          {!dismissed && authState === "authorized" && <Badge variant="success" dot className="bg-success/10 border-success/30 text-surface-900">Authorized</Badge>}
          {!dismissed && authState !== "authorized" && (
            <span className="text-[9px] font-mono text-surface-700 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to inspect <span aria-hidden>↓</span>
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="bg-surface-0/40 shadow-[inset_0_4px_20px_rgba(0,0,0,0.4)] border-t border-black/40">
          
          {/* Metadata Grid */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: Local Context & Meters */}
            <div className="flex flex-col gap-6">
              <div>

                <p className="text-[10px] font-mono uppercase tracking-widest text-surface-700 mb-2 border-b border-surface-200/50 pb-1 font-bold">Origin Node (Local)</p>
                <p className="text-sm font-mono text-surface-700 mb-1">{sourceCaseTitle}</p>
                <p className="text-lg font-medium text-surface-900">{sourceEntityName}</p>
              </div>

              <div className="flex flex-col gap-4 bg-surface-50/50 p-4 rounded-lg border border-surface-100">
                <Meter label="IDENTITY MATCH STRENGTH" pct={matchPct} colorClass="bg-accent-rose shadow-[0_0_8px_var(--color-accent-rose)]" />
                <Meter label="ANALYTICAL CONFIDENCE" pct={confidencePct} colorClass="bg-accent-amber shadow-[0_0_8px_var(--color-accent-amber)]" />
                <p className="text-[9px] font-mono text-surface-700 leading-relaxed uppercase tracking-widest mt-1">
                  Scores decoupled. High identity match does not guarantee investigative relevance.
                </p>
              </div>
            </div>

            {/* Right Column: Foreign Context & Badges */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-accent-blue mb-2 border-b border-surface-200/50 pb-1 flex items-center gap-2 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                  Target Node (External Boundary)
                </p>
                <p className="text-sm font-mono text-surface-700 mb-1">{targetCaseLabel}</p>
                <p className="text-lg font-medium text-surface-900">{targetEntityLabel}</p>
                
                <div className="mt-3 text-sm text-surface-700 leading-relaxed bg-surface-0/50 p-3 rounded border border-surface-200/50">
                  {targetCaseSummary ? (
                    <span className="text-surface-700 italic">"{targetCaseSummary}"</span>
                  ) : (
                    <span className="flex items-center gap-2 text-surface-700">
                      <svg className="w-4 h-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      Visibility restricted pending authorization.
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {match.sharedEvidenceTypes.map((t) => (
                  <Badge key={t} variant="info" className="bg-info/10 border-info/30 font-mono text-[9px] uppercase tracking-widest text-surface-900">
                    {t}
                  </Badge>
                ))}
                <Badge variant="muted" className="font-mono text-[9px] uppercase tracking-widest text-surface-800 border-surface-500">
                  {match.sharedEntityCount} SHARED {match.sharedEntityCount === 1 ? "NODE" : "NODES"}
                </Badge>
                <Badge variant="muted" className="font-mono text-[9px] uppercase tracking-widest text-surface-800 border-surface-500">
                  SYNCED {formatDate(match.computedAt.value)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-surface-50/80 px-6 py-4 border-t border-surface-200/50 flex flex-wrap items-center justify-between gap-4">
            {!dismissed ? (
              <>
                <div className="flex items-center gap-3">
                  {authState === "idle" && (
                    <Button variant="primary" size="sm" onClick={onAuthorize} className="font-mono uppercase tracking-widest text-[10px] bg-accent-blue text-surface-0 hover:bg-accent-blue/80 shadow-[0_0_10px_var(--color-accent-blue-subtle)]">
                      Request Boundary Expansion
                    </Button>
                  )}
                  {authState === "confirming" && (
                    <div className="flex items-center gap-3 bg-warning/10 border border-warning/30 px-3 py-1.5 rounded-lg">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-warning font-bold">Merge into active graph?</span>
                      <Button variant="primary" size="sm" onClick={onAuthorize} className="bg-warning text-surface-0 hover:bg-warning/80 h-7 text-[10px] font-mono uppercase">
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onClick={onCancelAuthorize} className="h-7 text-[10px] font-mono uppercase text-surface-700 hover:text-surface-900">
                        Abort
                      </Button>
                    </div>
                  )}
                  {authState === "authorized" && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-success flex items-center gap-2 font-bold">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Authorization logged. (Demo Mode: Sync pending)
                    </span>
                  )}
                </div>
                {authState === "idle" && (
                  <Button variant="ghost" size="sm" onClick={onDismiss} className="font-mono uppercase tracking-widest text-[10px] text-surface-700 hover:text-danger hover:bg-danger/10">
                    Dismiss Match
                  </Button>
                )}
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={onRestore} className="font-mono uppercase tracking-widest text-[10px] text-surface-700 hover:text-surface-900">
                Restore Candidate
              </Button>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}

function Meter({ label, pct, colorClass }: { label: string; pct: number; colorClass: string }) {
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        {/* HIGH CONTRAST FIX */}
        <span className="text-[10px] font-mono text-surface-700 uppercase tracking-widest font-bold">{label}</span>
        <span className="font-mono text-[10px] font-bold text-surface-900 tabular-nums">{pct}%</span>
      </div>
      <div className="h-[2px] w-full bg-surface-600/30 rounded-full relative">
        <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ease-out ${colorClass}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-[2px] h-2.5 bg-surface-0 rounded-sm shadow-sm transition-all duration-700 ease-out" style={{ left: `calc(${pct}% - 1px)` }} />
      </div>
    </div>
  );
}

function ConnectingThread({
  sourceLabel,
  targetLabel,
  pulse,
  statusColor,
}: {
  sourceLabel: string;
  targetLabel: string;
  pulse: boolean;
  statusColor: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
      {/* Left Node (Local) */}
      <div className="min-w-0 shrink-0 max-w-[35%] flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-surface-600 shrink-0 ring-[3px] ring-surface-0/10" />
        <p className="text-base font-medium text-surface-900 truncate">{sourceLabel}</p>
      </div>

      {/* The Laser Thread */}
      <div className="flex-1 flex items-center justify-center relative h-6 min-w-[64px]">
        {/* Base dark track */}
        <div className="absolute left-0 right-0 h-[1px] bg-surface-500/50" />
        
        {/* Center Diamond Hub */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border border-surface-0 bg-surface-800 z-10 ${pulse ? "animate-slow-pulse" : ""}`} />

        {/* Animated Laser Pulse */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {pulse && (
            <line
              x1="0" y1="12" x2="100%" y2="12"
              className={statusColor}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 12"
              strokeOpacity="0.8"
            >
              <animate attributeName="stroke-dashoffset" from="16" to="0" dur="0.8s" repeatCount="indefinite" />
            </line>
          )}
        </svg>
      </div>

      {/* Right Node (Foreign) */}
      <div className="min-w-0 shrink-0 max-w-[35%] flex items-center gap-3 justify-end">
        <p className="text-base font-medium text-surface-900 truncate text-right">{targetLabel}</p>
        <div className={`w-2 h-2 rounded-full shrink-0 ring-[3px] ring-surface-0/10 ${statusColor.replace('text-', 'bg-')}`} />
      </div>
    </div>
  );
}