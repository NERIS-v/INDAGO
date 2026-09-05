"use client";

// ============================================================================
// PR-5 — Intelligence · Evidence tab
//
// Sources groups + posture surfaces built ONLY from provider-owned evidence
// and hypothesis data:
//   - no context              investigation-level evidence grouped by sourceRef
//   - evidence selection      that package + its same-source group + supporting
//                             and contradicting hypotheses + related leads
//   - hypothesis selection    supporting vs contradicting evidence lists
//   - entity selection        evidence packages referencing the entity
//   - other selections        investigation-level source groups (no fabricated
//                             posture surface exists for those kinds)
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { useContextDetails } from "@/lib/context/use-context-details";
import type { ResolvedContextDetails } from "@/lib/context/context-details";
import type { EvidenceListItem } from "@/lib/api/types";
import type { Hypothesis, Lead } from "@indago/contracts";
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

interface EvidencePanelProps {
  context: InvestigativeContext | null;
  onSelectContext: (ctx: InvestigativeContext) => void;
}

function EvidenceRow({
  item,
  note,
  onSelectContext,
}: {
  item: EvidenceListItem;
  note?: string;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  return (
    <li
      data-evidence-row
      data-evidence-id={item.id}
      className="flex items-start justify-between gap-3 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-surface-800">{item.title}</p>
        <p className="type-caption line-clamp-2 text-surface-500">{item.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-mono text-surface-400">{item.sourceRef}</span>
          <span className="text-[9px] font-mono text-surface-400">·</span>
          <span className="text-[9px] font-mono uppercase text-surface-500">{item.type}</span>
          <span className="text-[9px] font-mono uppercase text-surface-500">· {item.status}</span>
          <span className="text-[9px] font-mono text-surface-500">· {item.observationCount} observations</span>
          {note && <span className="text-[9px] font-mono text-brand-600">· {note}</span>}
        </div>
      </div>
      <SelectOnGraphButton
        id={item.id}
        onClick={() => onSelectContext({ kind: "evidence", id: item.id, source: "intelligence" })}
      />
    </li>
  );
}

function SourceGroupedList({
  items,
  onSelectContext,
  heading,
}: {
  items: readonly EvidenceListItem[];
  onSelectContext: (ctx: InvestigativeContext) => void;
  heading: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, EvidenceListItem[]>();
    for (const item of items) {
      const key = item.sourceRef || "UNKNOWN SOURCE";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <div data-evidence-source-groups className="space-y-3">
      <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
        {heading}
      </h2>
      {groups.map(([source, group]) => (
        <div key={source} data-evidence-source-group={source} className="space-y-2">
          <h3 className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
            <span>{source}</span>
            <Badge variant="muted" className="text-[9px] font-mono">× {group.length}</Badge>
          </h3>
          <ul className="space-y-2">
            {group.map((item) => (
              <EvidenceRow key={item.id} item={item} onSelectContext={onSelectContext} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PostureNote({ truth }: { truth: boolean }) {
  return (
    <p className="type-caption text-surface-400" data-posture-unavailable>
      {truth
        ? "This posture surface is unavailable in this data mode — only provider-owned data is shown."
        : "No items recorded in this data mode."}
    </p>
  );
}

function HypList({
  items,
  onSelectContext,
}: {
  items: readonly Hypothesis[] | null;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  if (items === null) return <PostureNote truth />;
  if (items.length === 0) return <PostureNote truth={false} />;
  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="flex items-start justify-between gap-3 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-surface-800">{h.title}</p>
            <p className="text-[9px] font-mono text-surface-500">{h.status} · CONF {Math.round(h.confidence * 100)}%</p>
          </div>
          <SelectOnGraphButton
            id={h.id}
            onClick={() => onSelectContext({ kind: "hypothesis", id: h.id, source: "intelligence" })}
          />
        </li>
      ))}
    </ul>
  );
}

function LeadList({
  items,
  onSelectContext,
}: {
  items: readonly Lead[] | null;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  if (items === null) return <PostureNote truth />;
  if (items.length === 0) return <PostureNote truth={false} />;
  return (
    <ul className="space-y-2">
      {items.map((l) => (
        <li key={l.id} className="flex items-start justify-between gap-3 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-surface-800">{l.title}</p>
            <p className="text-[9px] font-mono text-surface-500">{l.status} · {l.priority}</p>
          </div>
          <SelectOnGraphButton
            id={l.id}
            onClick={() => onSelectContext({ kind: "lead", id: l.id, source: "intelligence" })}
          />
        </li>
      ))}
    </ul>
  );
}

function EvidencePosture({ details, onSelectContext }: { details: Extract<ResolvedContextDetails, { kind: "evidence" }>; onSelectContext: (ctx: InvestigativeContext) => void }) {
  const d = details;
  return (
    <div data-evidence-posture className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          {d.item.title}
        </h2>
        <Badge variant="muted" className="text-[9px] font-mono uppercase">{d.item.type}</Badge>
      </div>
      <p className="type-caption line-clamp-3 text-surface-500">{d.item.description}</p>
      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono uppercase tracking-widest text-surface-500 sm:grid-cols-3">
        <span className="rounded border border-surface-200/60 bg-surface-0 px-2 py-1">Source {d.item.sourceRef}</span>
        <span className="rounded border border-surface-200/60 bg-surface-0 px-2 py-1">Status {d.item.status}</span>
        <span className="rounded border border-surface-200/60 bg-surface-0 px-2 py-1">
          {d.item.observationCount} observations
        </span>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">Source group</h3>
        {d.sameSourceEvidence === null ? (
          <PostureNote truth />
        ) : (
          <p className="type-caption text-surface-600">
            {d.sameSourceEvidence.length} other evidence package{d.sameSourceEvidence.length === 1 ? "" : "s"} share this source identity; the investigation holds {d.investigationSourceCount ?? "—"} distinct source{d.investigationSourceCount === null || d.investigationSourceCount === 1 ? "" : "s"}.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">Supports</h3>
        <HypList items={d.supportingHypotheses} onSelectContext={onSelectContext} />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">Contradicts</h3>
        <HypList items={d.contradictingHypotheses} onSelectContext={onSelectContext} />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">Related leads</h3>
        <LeadList items={d.relatedLeads} onSelectContext={onSelectContext} />
      </div>
    </div>
  );
}

function EvidenceBrowseBody({
  items,
  onSelectContext,
  heading,
}: {
  items: readonly EvidenceListItem[];
  onSelectContext: (ctx: InvestigativeContext) => void;
  heading: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyIntelligenceState
        title="No evidence yet"
        detail="Evidence packages will appear here once documents are processed."
      />
    );
  }
  return <SourceGroupedList items={items} onSelectContext={onSelectContext} heading={heading} />;
}

export function IntelligenceEvidence({ context, onSelectContext }: EvidencePanelProps) {
  const workspace = useWorkspace();
  const ctx = useContextDetails(context);
  const [items, setItems] = useState<EvidenceListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setError(null);
    workspace.evidence
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

  if (unavailable) {
    return (
      <UnavailableState
        title="Evidence"
        detail="Evidence is not supported in this data mode. No provisional evidence is shown."
      />
    );
  }
  if (loading) return <IntelligencePanel><IntelligenceLoading label="Loading evidence..." /></IntelligencePanel>;
  if (error) return <IntelligencePanel><IntelligenceError message={error.message} onRetry={() => window.location.reload()} /></IntelligencePanel>;

  if (context && (context.kind === "evidence" || context.kind === "hypothesis" || context.kind === "entity")) {
    if (ctx.loading) return <IntelligencePanel><IntelligenceLoading label="Compositing evidence..." /></IntelligencePanel>;
    const details = ctx.details;
    if (details?.status === "unsupported") return <UnavailableState title="Evidence" detail={details.reason} />;
    if (details?.status === "not-found") return <UnavailableState title="Evidence" detail="The selected object no longer exists in this workspace." />;
    if (details?.status === "error") return <IntelligencePanel><IntelligenceError message={details.message} onRetry={() => window.location.reload()} /></IntelligencePanel>;
    if (details?.status === "resolved") {
      const resolved = details as ResolvedContextDetails;
      if (resolved.kind === "evidence") {
        return <IntelligencePanel><EvidencePosture details={resolved} onSelectContext={onSelectContext} /></IntelligencePanel>;
      }
      if (resolved.kind === "hypothesis") {
        return (
          <IntelligencePanel>
            <div data-evidence-posture className="space-y-4">
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">Supporting evidence</h2>
              <HypEvidenceList items={resolved.supportingEvidence} onSelectContext={onSelectContext} note="supporting" />
              <h2 className="pt-2 text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">Contradicting evidence</h2>
              <HypEvidenceList items={resolved.contradictingEvidence} onSelectContext={onSelectContext} note="contradicting" />
            </div>
          </IntelligencePanel>
        );
      }
      if (resolved.kind === "entity") {
        return (
          <IntelligencePanel>
            <div data-evidence-posture className="space-y-3">
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">Evidence referencing this entity</h2>
              {resolved.evidence === null ? (
                <PostureNote truth />
              ) : resolved.evidence.length === 0 ? (
                <PostureNote truth={false} />
              ) : (
                <ul className="space-y-2">{resolved.evidence.map((e) => <EvidenceRow key={e.id} item={e} onSelectContext={onSelectContext} />)}</ul>
              )}
            </div>
          </IntelligencePanel>
        );
      }
    }
  }

  return <IntelligencePanel><EvidenceBrowseBody items={items ?? []} onSelectContext={onSelectContext} heading="Evidence by source" /></IntelligencePanel>;
}

function HypEvidenceList({
  items,
  note,
  onSelectContext,
}: {
  items: readonly EvidenceListItem[] | null;
  note: string;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  if (items === null) return <PostureNote truth />;
  if (items.length === 0) return <PostureNote truth={false} />;
  return <ul className="space-y-2">{items.map((e) => <EvidenceRow key={e.id} item={e} note={note} onSelectContext={onSelectContext} />)}</ul>;
}