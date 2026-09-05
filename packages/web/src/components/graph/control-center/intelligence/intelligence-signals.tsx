"use client";

// ============================================================================
// PR-5 — Intelligence · Signals tab
//
// A deterministic signal surface built ONLY from provider-owned domain data:
//   - contradictions         intelligence.listContradictions      → observation ctx
//   - open gaps              gaps.listByInvestigation (isOpenGap) → gap ctx
//   - weak support edges     relations with support < threshold    → relation ctx
//   - active leads           leads.listByInvestigation (isActiveLead) → lead ctx
//   - cross-case overlays    crossCase.listForeignOverlays        → cross-case ctx
//   - review queue           review.listTasks (PENDING/IN_PROGRESS) → informational
//
// No scoring or ranking: weak edges are a documented threshold filter, review
// counts are task status counts, everything else is a filtered provider list.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { ObservationContradiction, ForeignCaseOverlay } from "@/lib/providers/types";
import type { InvestigativeGap, Lead, RelationHypothesis, ReviewTask } from "@indago/contracts";
import type { InvestigativeContext, ContextKind } from "@/lib/context/investigative-context";
import { isOpenGap, isActiveLead } from "@/lib/context/context-details";
import { WEAK_SUPPORT_BAND_THRESHOLD } from "@/lib/graph/graph-visual-state";
import {
  IntelligencePanel,
  IntelligenceLoading,
  IntelligenceError,
  UnavailableState,
  EmptyIntelligenceState,
  SelectOnGraphButton,
} from "./shared";

/**
 * Documented weakness threshold for relation support edges.
 *
 * Canonical constant lives in the PR-6 graph visual-language module (the graph
 * layer must NOT import the intelligence tab); this re-export keeps existing
 * consumers and the PR-5 regression tests (`WEAK_SUPPORT_THRESHOLD === 0.3`)
 * working without drift.
 */
export const WEAK_SUPPORT_THRESHOLD = WEAK_SUPPORT_BAND_THRESHOLD;

export type SignalKind = "contradiction" | "open-gap" | "weak-relation" | "active-lead" | "cross-case" | "review";

export interface SignalItem {
  readonly key: string;
  readonly kind: SignalKind;
  readonly title: string;
  readonly description: string;
  readonly select: InvestigativeContext | null;
}

interface SignalsPanelProps {
  onSelectContext: (ctx: InvestigativeContext) => void;
}

interface SignalsModel {
  readonly contradictions: readonly ObservationContradiction[] | null;
  readonly openGaps: readonly InvestigativeGap[] | null;
  readonly weakRelations: readonly RelationHypothesis[] | null;
  readonly activeLeads: readonly Lead[] | null;
  readonly overlays: readonly ForeignCaseOverlay[] | null;
  readonly pendingReviews: readonly ReviewTask[] | null;
  /** true when every dependent data source is unavailable. */
  readonly noneAvailable: boolean;
}

function useSignals(): {
  model: SignalsModel | null;
  loading: boolean;
  error: Error | null;
} {
  const workspace = useWorkspace();
  const [model, setModel] = useState<SignalsModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const guarded = async <T,>(call: () => Promise<{ readonly items: T[] }>): Promise<T[] | null> => {
      try {
        const page = await call();
        return page.items;
      } catch {
        return null;
      }
    };

    const probe = { pageSize: 200 };

    (async () => {
      const [contradictions, gaps, relations, leads, overlays, tasks] = await Promise.all([
        guarded(() => workspace.intelligence.listContradictions(workspace.investigationId, probe)),
        guarded(() => workspace.gaps.listByInvestigation(workspace.investigationId, probe)),
        guarded(() => workspace.relations.listByInvestigation(workspace.investigationId, probe)),
        guarded(() => workspace.leads.listByInvestigation(workspace.investigationId, probe)),
        guarded(() => workspace.crossCase.listForeignOverlays(workspace.caseId, probe)),
        guarded(() => workspace.review.listTasks(workspace.investigationId, probe)),
      ]);
      if (!active) return;

      const noneAvailable =
        contradictions === null &&
        gaps === null &&
        relations === null &&
        leads === null &&
        overlays === null &&
        tasks === null;

      setModel({
        contradictions,
        openGaps: gaps?.filter(isOpenGap) ?? null,
        weakRelations: relations?.filter((r) => r.support < WEAK_SUPPORT_THRESHOLD) ?? null,
        activeLeads: leads?.filter(isActiveLead) ?? null,
        overlays,
        pendingReviews:
          tasks?.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS") ?? null,
        noneAvailable,
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
  }, [workspace]);

  return { model, loading, error };
}

const SIGNAL_LABELS: Record<SignalKind, string> = {
  contradiction: "Contradiction",
  "open-gap": "Open gap",
  "weak-relation": "Weak support edge",
  "active-lead": "Active lead",
  "cross-case": "Cross-case overlay",
  review: "Review queue",
};

function SignalRow({ item, onSelectContext }: { item: SignalItem; onSelectContext: SignalsPanelProps["onSelectContext"] }) {
  const selectFor = (kind: ContextKind, id: string) =>
    onSelectContext({ kind, id, source: "intelligence" });
  return (
    <li
      data-signal-item
      data-signal-kind={item.kind}
      data-signal-key={item.key}
      className="flex items-start justify-between gap-3 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-surface-800">{item.title}</p>
        <p className="type-caption line-clamp-2 text-surface-500">{item.description}</p>
      </div>
      {item.select ? (
        <SelectOnGraphButton id={item.key} onClick={() => selectFor(item.select!.kind, item.select!.id)} />
      ) : (
        <span className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-surface-400">
          Informational
        </span>
      )}
    </li>
  );
}

function buildSignals(model: SignalsModel): SignalItem[] {
  const items: SignalItem[] = [];

  if (model.contradictions !== null) {
    for (const c of model.contradictions) {
      items.push({
        key: `contradiction:${c.id}`,
        kind: "contradiction",
        title: `Contradiction · ${c.contradictionType.replace(/_/g, " ")}`,
        description: c.description,
        select: { kind: "observation", id: c.leftObservationId, source: "intelligence" },
      });
    }
  }

  if (model.openGaps !== null) {
    for (const g of model.openGaps) {
      items.push({
        key: `gap:${g.id}`,
        kind: "open-gap",
        title: `Open gap · ${g.title}`,
        description: g.description,
        select: { kind: "gap", id: g.id, source: "intelligence" },
      });
    }
  }

  if (model.weakRelations !== null) {
    for (const r of model.weakRelations) {
      items.push({
        key: `relation:${r.id}`,
        kind: "weak-relation",
        title: `Weak support edge · ${r.relationType.replace(/_/g, " ")}`,
        description: `Support ${Math.round(r.support * 100)}% — below the ${Math.round(WEAK_SUPPORT_THRESHOLD * 100)}% documented threshold.`,
        select: { kind: "relation", id: r.id, source: "intelligence" },
      });
    }
  }

  if (model.activeLeads !== null) {
    for (const l of model.activeLeads) {
      items.push({
        key: `lead:${l.id}`,
        kind: "active-lead",
        title: `Active lead · ${l.title}`,
        description: l.description,
        select: { kind: "lead", id: l.id, source: "intelligence" },
      });
    }
  }

  if (model.overlays !== null) {
    for (const o of model.overlays) {
      items.push({
        key: `overlay:${o.ref}`,
        kind: "cross-case",
        title: `Cross-case overlay · ${o.caseId}`,
        description: `${o.title} — local target "${o.localTargetMatch}".`,
        select: { kind: "cross-case", id: o.ref, source: "intelligence" },
      });
    }
  }

  if (model.pendingReviews !== null) {
    items.push({
      key: "review-queue",
      kind: "review",
      title: `Review queue · ${model.pendingReviews.length} pending task${model.pendingReviews.length === 1 ? "" : "s"}`,
      description: "Human review tasks flagged PENDING or IN_PROGRESS.",
      select: null,
    });
  }

  return items;
}

export function IntelligenceSignals({ onSelectContext }: SignalsPanelProps) {
  const { model, loading, error } = useSignals();

  const items = model ? buildSignals(model) : [];
  const groups = useMemo(() => {
    const grouped = new Map<SignalKind, SignalItem[]>();
    for (const item of items) {
      const list = grouped.get(item.kind) ?? [];
      list.push(item);
      grouped.set(item.kind, list);
    }
    return grouped;
  }, [items]);

  if (loading) return <IntelligencePanel><IntelligenceLoading label="Scanning for signals..." /></IntelligencePanel>;
  if (error) return <IntelligencePanel><IntelligenceError message={error.message} onRetry={() => window.location.reload()} /></IntelligencePanel>;
  if (!model) return <IntelligencePanel><IntelligenceLoading label="Scanning for signals..." /></IntelligencePanel>;

  if (model.noneAvailable) {
    return (
      <UnavailableState
        title="Signals"
        detail="Signal detection sources are not supported in this data mode. No provider-owned signal data is fabricated."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyIntelligenceState
        title="No signals detected"
        detail="No contradictions, open gaps, weak edges, active leads, overlays, or pending reviews are present right now."
      />
    );
  }

  return (
    <IntelligencePanel>
      <div data-intelligence-signals className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
            Signals
          </h2>
          <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400">
            Thresholds · No rankings
          </span>
        </div>
        {Array.from(groups.entries()).map(([kind, group]) => (
          <div key={kind} data-signal-group={kind} className="space-y-2">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
              {SIGNAL_LABELS[kind]} · {group.length}
            </h3>
            <ul className="space-y-2">
              {group.map((item) => (
                <SignalRow key={item.key} item={item} onSelectContext={onSelectContext} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </IntelligencePanel>
  );
}