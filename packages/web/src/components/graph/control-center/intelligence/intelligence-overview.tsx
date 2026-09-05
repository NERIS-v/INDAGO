"use client";

// ============================================================================
// PR-5 — Intelligence · Overview tab
//
// Two surfaces, both grounded strictly in provider-owned data:
//   - NO context  : investigation-level counts (parallel guarded reads; a
//                   source that is UNSUPPORTED is simply omitted honestly).
//   - context     : useContextDetails → deterministic stat grid + narrative
//                   clauses from the resolved bundle (no scoring, no ranking).
// ============================================================================

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { useContextDetails } from "@/lib/context/use-context-details";
import { buildResolvedStats, buildResolvedNarrative } from "@/lib/context/context-narrative";
import { contextKindLabel } from "@/lib/context/investigative-context";
import type { InvestigativeContext, ContextKind } from "@/lib/context/investigative-context";
import type { ResolvedContextDetails } from "@/lib/context/context-details";
import {
  IntelligencePanel,
  IntelligenceLoading,
  IntelligenceError,
  UnavailableState,
  StatGrid,
  ClauseList,
} from "./shared";

interface OverviewPanelProps {
  context: InvestigativeContext | null;
}

interface InvestigationCounts {
  readonly evidence: number | null;
  readonly observations: number | null;
  readonly entities: number | null;
  readonly hypotheses: number | null;
  readonly relations: number | null;
  readonly leads: number | null;
  readonly openGaps: number | null;
  readonly contradictions: number | null;
  readonly foreignOverlays: number | null;
}

function useInvestigationCounts(): {
  counts: InvestigationCounts | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
} {
  const workspace = useWorkspace();
  const [counts, setCounts] = useState<InvestigationCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const guarded = async (call: () => Promise<{ readonly totalItems: number }>): Promise<number | null> => {
      try {
        const page = await call();
        return page.totalItems;
      } catch {
        return null;
      }
    };

    const probe = { pageSize: 1 };

    (async () => {
      const [evidence, observations, entities, hypotheses, relations, leads, openGaps, contradictions, foreignOverlays] =
        await Promise.all([
          guarded(() => workspace.evidence.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.observations.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.entities.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.hypotheses.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.relations.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.leads.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.gaps.listByInvestigation(workspace.investigationId, probe)),
          guarded(() => workspace.intelligence.listContradictions(workspace.investigationId, probe)),
          guarded(() => workspace.crossCase.listForeignOverlays(workspace.caseId, probe)),
        ]);
      if (!active) return;
      setCounts({
        evidence,
        observations,
        entities,
        hypotheses,
        relations,
        leads,
        openGaps,
        contradictions,
        foreignOverlays,
      });
      setLoading(false);
    })().catch((err: unknown) => {
      if (!active) return;
      setError(toProviderError(err));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [workspace, nonce]);

  return {
    counts,
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
  };
}

function Summary({ counts }: { counts: InvestigationCounts }) {
  const dash = (value: number | null): string => (value === null ? "--" : String(value));
  const stats = [
    { label: "Evidence", value: dash(counts.evidence) },
    { label: "Observations", value: dash(counts.observations) },
    { label: "Entities", value: dash(counts.entities) },
    { label: "Hypotheses", value: dash(counts.hypotheses) },
    { label: "Relations", value: dash(counts.relations) },
    { label: "Leads", value: dash(counts.leads) },
    { label: "Open gaps", value: dash(counts.openGaps) },
    { label: "Contradictions", value: dash(counts.contradictions) },
    { label: "Foreign overlays", value: dash(counts.foreignOverlays) },
  ];
  const unavailableSources = stats.filter((s) => s.value === "--").map((s) => s.label);
  return (
    <div data-intelligence-overview data-intelligence-overview-kind="investigation" className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          Investigation overview
        </h2>
        <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400">
          Counts · No rankings
        </span>
      </div>
      <StatGrid stats={stats} />
      <p className="type-caption max-w-xl text-surface-500" data-intelligence-overview-narrative>
        {unavailableSources.length > 0
          ? `${unavailableSources.join(", ")} unavailable in this data mode — only real provider counts are shown.`
          : "All investigation surfaces are available in this data mode; counts are provider-owned totals."}
      </p>
    </div>
  );
}

function ContextResolved({ details }: { details: ResolvedContextDetails }) {
  const stats = buildResolvedStats(details);
  const clauses = buildResolvedNarrative(details);
  return (
    <div
      data-intelligence-overview
      data-intelligence-overview-kind={details.kind}
      className="space-y-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          {contextKindLabel(details.kind)} overview
        </h2>
        <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400">
          Grounded surface · No scoring
        </span>
      </div>
      <StatGrid stats={stats} />
      <div className="rounded-lg border border-surface-200/60 bg-surface-0 p-4">
        <p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-surface-400">
          Referenced context
        </p>
        <ClauseList clauses={clauses} />
      </div>
    </div>
  );
}

function UnresolvedOverview({ kind }: { kind: ContextKind }) {
  return (
    <p className="type-caption p-4 text-surface-400">
      {contextKindLabel(kind)} selection is not resolvable in this data mode.
    </p>
  );
}

function InvestigationSummaryBody() {
  const { counts, loading, error, reload } = useInvestigationCounts();
  if (loading) return <IntelligencePanel><IntelligenceLoading label="Summarizing investigation..." /></IntelligencePanel>;
  if (error) return <IntelligencePanel><IntelligenceError message={error.message} onRetry={reload} /></IntelligencePanel>;
  if (!counts) return <IntelligencePanel><IntelligenceLoading label="Summarizing investigation..." /></IntelligencePanel>;
  return <IntelligencePanel><Summary counts={counts} /></IntelligencePanel>;
}

export function IntelligenceOverview({ context }: OverviewPanelProps) {
  const ctx = useContextDetails(context);

  if (context) {
    if (ctx.loading) return <IntelligencePanel><IntelligenceLoading label="Compositing context..." /></IntelligencePanel>;
    const details = ctx.details;
    if (details?.status === "unsupported") {
      return (
        <UnavailableState
          title={`Overview · ${contextKindLabel(context.kind)}`}
          detail={details.reason}
        />
      );
    }
    if (details?.status === "not-found") {
      return (
        <UnavailableState
          title={`Overview · ${contextKindLabel(context.kind)}`}
          detail="The selected object no longer exists in this workspace."
        />
      );
    }
    if (details?.status === "error") {
      return <IntelligencePanel><IntelligenceError message={details.message} onRetry={() => window.location.reload()} /></IntelligencePanel>;
    }
    if (!details) return <IntelligencePanel><UnresolvedOverview kind={context.kind} /></IntelligencePanel>;
    return <IntelligencePanel><ContextResolved details={details} /></IntelligencePanel>;
  }

  return <InvestigationSummaryBody />;
}