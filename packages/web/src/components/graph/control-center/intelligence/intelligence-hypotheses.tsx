"use client";

// ============================================================================
// PR-5 — Intelligence · Hypotheses tab
//
// Surfaces the canonical working hypotheses through the HypothesisProvider
// seam (aggregation of provider-owned posture lists; NO new claims, scores, or
// derived rankings). Context-sensitive:
//   - hypothesis selection → that hypothesis first, marked as selected
//   - entity selection     → only hypotheses involving that entity
//   - otherwise            → the full hypothesis set
// Live mode is UNSUPPORTED for the seam and renders the honest unavailable
// state (never demo data).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { Hypothesis } from "@indago/contracts";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { Badge } from "@/components/ui/badge";
import {
  IntelligencePanel,
  IntelligenceLoading,
  IntelligenceError,
  UnavailableState,
  EmptyIntelligenceState,
  SelectOnGraphButton,
} from "./shared";

interface HypothesesPanelProps {
  context: InvestigativeContext | null;
  onSelectContext: (ctx: InvestigativeContext) => void;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function HypothesisRow({
  hypothesis,
  selected,
  onSelectContext,
}: {
  hypothesis: Hypothesis;
  selected: boolean;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  return (
    <li
      data-hypothesis-card
      data-hypothesis-id={hypothesis.id}
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        selected
          ? "border-brand-500/50 bg-brand-500/5"
          : "border-surface-200/60 bg-surface-0 hover:bg-surface-100/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-surface-800">{hypothesis.title}</p>
          <p className="type-caption text-surface-500">{hypothesis.statement}</p>
        </div>
        {selected && (
          <span
            data-hypothesis-selected
            className="shrink-0 rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-brand-600"
          >
            Selected
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted" className="text-[10px] font-mono">
          {hypothesis.status}
        </Badge>
        <span className="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[9px] font-mono text-surface-600">
          CONF {pct(hypothesis.confidence)}
        </span>
        <span className="text-[9px] font-mono text-surface-500">
          {hypothesis.supportingEvidenceIds.length} supporting ·{" "}
          {hypothesis.contradictingEvidenceIds.length} contradicting evidence
        </span>
        <span className="text-[9px] font-mono text-surface-400">
          {hypothesis.supportingObservationIds.length} supporting ·{" "}
          {hypothesis.contradictingObservationIds.length} contradicting observations
        </span>
      </div>
      <div>
        <SelectOnGraphButton
          id={hypothesis.id}
          onClick={() =>
            onSelectContext({ kind: "hypothesis", id: hypothesis.id, source: "intelligence" })
          }
        />
      </div>
    </li>
  );
}

export function IntelligenceHypotheses({ context, onSelectContext }: HypothesesPanelProps) {
  const workspace = useWorkspace();
  const [items, setItems] = useState<Hypothesis[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setError(null);
    workspace.hypotheses
      .listByInvestigation(workspace.investigationId, { pageSize: 200 })
      .then((page) => {
        if (active) setItems(page.items);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const pe = toProviderError(err);
        if (pe.code === "UNSUPPORTED") {
          setUnavailable(true);
          setItems([]);
        } else {
          setError(pe);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspace]);

  const { ordered, filterNote } = useMemo<{ ordered: Hypothesis[]; filterNote: string | null }>(() => {
    const all = items ?? [];
    if (context?.kind === "hypothesis") {
      const selected = all.find((h) => h.id === context.id);
      const rest = all.filter((h) => h.id !== context.id);
      return {
        ordered: selected ? [selected, ...rest] : all,
        filterNote: selected ? null : "The selected hypothesis is no longer in the hypothesis set.",
      };
    }
    if (context?.kind === "entity") {
      const related = all.filter((h) => h.relatedEntityIds.includes(context.id));
      return {
        ordered: related,
        filterNote: "Filtered to hypotheses involving the selected entity.",
      };
    }
    return { ordered: all, filterNote: null };
  }, [items, context]);

  if (unavailable) {
    return (
      <UnavailableState
        title="Hypotheses"
        detail="Working hypotheses are not supported in this data mode. No provisional hypotheses are shown."
      />
    );
  }
  if (loading) return <IntelligencePanel><IntelligenceLoading label="Loading hypotheses..." /></IntelligencePanel>;
  if (error) return <IntelligencePanel><IntelligenceError message={error.message} onRetry={() => window.location.reload()} /></IntelligencePanel>;
  if (!items) return <IntelligencePanel><IntelligenceLoading label="Loading hypotheses..." /></IntelligencePanel>;

  return (
    <IntelligencePanel>
      <div className="space-y-3" data-intelligence-hypotheses>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
            Working hypotheses
          </h2>
          <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400">
            {ordered.length} {ordered.length === 1 ? "hypothesis" : "hypotheses"}
          </span>
        </div>
        {filterNote && (
          <p data-hypotheses-filter-note className="type-caption rounded border border-surface-200/60 bg-surface-0 px-3 py-2 text-surface-500">
            {filterNote}
          </p>
        )}
        {ordered.length === 0 ? (
          <EmptyIntelligenceState title="No hypotheses yet" detail="Working hypotheses will appear here as the investigation matures." />
        ) : (
          <ul className="space-y-2">
            {ordered.map((h) => (
              <HypothesisRow
                key={h.id}
                hypothesis={h}
                selected={context?.kind === "hypothesis" && context.id === h.id}
                onSelectContext={onSelectContext}
              />
            ))}
          </ul>
        )}
      </div>
    </IntelligencePanel>
  );
}