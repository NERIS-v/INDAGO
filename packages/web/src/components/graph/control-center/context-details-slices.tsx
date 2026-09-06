"use client";

// ============================================================================
// PR-5 — Composible Context Detail Slices (right contextual panel)
//
// Renders the "In context" layer below the resolved summary for the CURRENTLY
// SELECTED InvestigativeContext. Every slice is built ONLY from the current
// provider-owned bundle produced by context-details.ts (real hypothesis ↔
// evidence ↔ observation ↔ entity ↔ gap ↔ lead ↔ overlay links). Nothing is
// derived, scored, or ranked here.
//
// - A row is a real button → rematerializes a canonical selection through the
//   shell (onSelectContext = reveal semantics).
// - A slice whose data source is unavailable (null) renders an explicit
//   "Unavailable in this data mode" row — never a fabricated empty.
// - Distinct empty, not a collapse: "None" is only rendered when the provider
//   really returned zero items.
//
// No Demo/Live imports, no fixtures, no provider construction.
// ============================================================================

import type { InvestigativeContext, ContextKind } from "@/lib/context/investigative-context";
import type {
  ResolvedContextDetails,
  EntityContextDetails,
  RelationContextDetails,
  EvidenceContextDetails,
  ObservationContextDetails,
  LeadContextDetails,
  HypothesisContextDetails,
  GapContextDetails,
  CrossCaseContextDetails,
} from "@/lib/context/context-details";
import type { Hypothesis } from "@indago/contracts";
import type { ObservationContradiction } from "@/lib/providers/types";

const ROW_CAP = 5;

function formatSupport(support: number): string {
  return `${Math.round(support * 100)}%`;
}

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

function SliceCard({
  label,
  count,
  available = true,
  children,
}: {
  label: string;
  count?: number;
  available?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-context-slice
      data-context-slice-available={available ? "true" : "false"}
      className="flex flex-col gap-1 overflow-hidden rounded-lg border border-surface-200/70 bg-white/60"
    >
      <header className="flex items-center justify-between px-2.5 py-1.5">
        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
          {label}
        </h4>
        {count !== undefined && (
          <span className="text-[9px] font-mono text-surface-400" data-context-slice-count>
            {count}
          </span>
        )}
      </header>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  );
}

function ObjectRow({
  kind,
  id,
  title,
  detail,
  onSelect,
}: {
  kind: ContextKind;
  id: string;
  title: string;
  detail?: string | null;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <button
      type="button"
      data-context-slice-object
      data-object-kind={kind}
      onClick={() => onSelect({ kind, id, source: "context-panel" })}
      className="flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-semantic-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
    >
      <span className="min-w-0 truncate text-[12px] font-medium text-semantic-foreground">{title}</span>
      {detail && (
        <span className="shrink-0 text-[10px] font-mono text-semantic-foreground-faint">{detail}</span>
      )}
    </button>
  );
}

function UnavailableRow() {
  return (
    <p className="px-2.5 py-1.5 text-[11px] italic text-semantic-foreground-faint" data-context-slice-unavailable>
      Unavailable in this data mode
    </p>
  );
}

function EmptyRow() {
  return (
    <p className="px-2.5 py-1.5 text-[11px] text-semantic-foreground-faint" data-context-slice-empty>
      None
    </p>
  );
}

function renderList<T>(
  items: readonly T[] | null,
  keyOf: (t: T) => string,
  row: (t: T) => React.ReactNode,
  onUnavailable: React.ReactNode,
) {
  if (items === null) return onUnavailable;
  if (items.length === 0) return <EmptyRow />;
  const shown = items.slice(0, ROW_CAP);
  const hidden = items.length - shown.length;
  return (
    <>
      {shown.map((t) => (
        <div key={keyOf(t)}>{row(t)}</div>
      ))}
      {hidden > 0 && (
        <p className="px-2.5 py-1 text-[10px] font-mono text-surface-400">
          +{hidden} more
        </p>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Entity slices
// ----------------------------------------------------------------------------

function HypothesisRow({
  hypothesis,
  onSelect,
}: {
  hypothesis: Hypothesis;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <ObjectRow
      kind="hypothesis"
      id={hypothesis.id}
      title={hypothesis.title}
      detail={hypothesis.status}
      onSelect={onSelect}
    />
  );
}

function EntitySlices({
  details,
  onSelect,
}: {
  details: EntityContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard label="Observations" count={details.observations?.length}>
        {renderList(
          details.observations,
          (o) => o.id,
          (o) => (
            <ObjectRow
              kind="observation"
              id={o.id}
              title={o.type}
              detail={o.content.slice(0, 48)}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard
        label="Relationships"
        count={details.relations?.length}
      >
        {renderList(
          details.relations,
          (r) => r.id,
          (r) => (
            <ObjectRow
              kind="relation"
              id={r.id}
              title={r.relationType.toUpperCase()}
              detail={formatSupport(r.support)}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Hypotheses" count={details.hypotheses?.length}>
        {renderList(
          details.hypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Evidence" count={details.evidence?.length}>
        {renderList(
          details.evidence,
          (e) => e.id,
          (e) => (
            <ObjectRow
              kind="evidence"
              id={e.id}
              title={e.title}
              detail={e.type}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Open gaps" count={details.openGaps?.length}>
        {renderList(
          details.openGaps,
          (g) => g.id,
          (g) => (
            <ObjectRow
              kind="gap"
              id={g.id}
              title={g.title}
              detail={g.priority}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Active leads" count={details.activeLeads?.length}>
        {renderList(
          details.activeLeads,
          (l) => l.id,
          (l) => (
            <ObjectRow kind="lead" id={l.id} title={l.title} detail={l.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Contradictions" count={details.contradictions?.length}>
        {renderList(
          details.contradictions,
          (c) => c.id,
          (c) => (
            <ObjectRow
              kind="observation"
              id={c.leftObservationId}
              title={c.contradictionType}
              detail="A vs ¬A"
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Foreign overlays" count={details.foreignOverlays?.length}>
        {renderList(
          details.foreignOverlays,
          (o) => o.ref,
          (o) => (
            <ObjectRow
              kind="cross-case"
              id={o.ref}
              title={o.title}
              detail={o.localTargetMatch}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Relation slices
// ----------------------------------------------------------------------------

function RelationSlices({
  details,
  onSelect,
}: {
  details: RelationContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  const axis = (
    <div className="flex items-center justify-between rounded-lg border border-surface-200/70 bg-white/60 px-2.5 py-2">
      <div className="text-[12px] font-medium text-surface-800">
        {details.sourceName ?? "—"}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-brand-600">
        {details.relation.relationType}
      </span>
      <div className="text-[12px] font-medium text-surface-800">
        {details.targetName ?? "—"}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {axis}
      <SliceCard label="Hypotheses involving endpoints" count={details.linkedHypotheses?.length}>
        {renderList(
          details.linkedHypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Basis observations" count={details.linkedObservations?.length}>
        {renderList(
          details.linkedObservations,
          (o) => o.id,
          (o) => (
            <ObjectRow
              kind="observation"
              id={o.id}
              title={o.type}
              detail={o.content.slice(0, 48)}
              onSelect={onSelect}
            />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Evidence slices
// ----------------------------------------------------------------------------

function ContradictionRow({
  contradiction,
  onSelect,
}: {
  contradiction: ObservationContradiction;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <ObjectRow
      kind="observation"
      id={contradiction.leftObservationId}
      title={contradiction.contradictionType}
      detail={contradiction.strength.toFixed(1)}
      onSelect={onSelect}
    />
  );
}

function EvidenceSlices({
  details,
  onSelect,
}: {
  details: EvidenceContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard
        label="Source group"
        count={details.sameSourceEvidence?.length !== undefined ? details.sameSourceEvidence.length + 1 : undefined}
      >
        {details.item.sourceRef ? (
          <>
            <p className="px-2.5 py-1.5 text-[11px] font-mono text-surface-500">
              {details.item.sourceRef}
            </p>
            {renderList(
              details.sameSourceEvidence,
              (e) => e.id,
              (e) => (
                <ObjectRow kind="evidence" id={e.id} title={e.title} detail={e.type} onSelect={onSelect} />
              ),
              <EmptyRow />,
            )}
          </>
        ) : (
          <UnavailableRow />
        )}
      </SliceCard>

      <SliceCard label="Supports hypotheses" count={details.supportingHypotheses?.length}>
        {renderList(
          details.supportingHypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Contradicts hypotheses" count={details.contradictingHypotheses?.length}>
        {renderList(
          details.contradictingHypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Related leads" count={details.relatedLeads?.length}>
        {renderList(
          details.relatedLeads,
          (l) => l.id,
          (l) => (
            <ObjectRow kind="lead" id={l.id} title={l.title} detail={l.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>

      <SliceCard label="Contradiction pairs" count={details.contradictions?.length}>
        {renderList(
          details.contradictions,
          (c) => c.id,
          (c) => <ContradictionRow contradiction={c} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Observation slices
// ----------------------------------------------------------------------------

function ObservationSlices({
  details,
  onSelect,
}: {
  details: ObservationContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard label="Contradiction pairs" count={details.contradictions?.length}>
        {renderList(
          details.contradictions,
          (c) => c.id,
          (c) => <ContradictionRow contradiction={c} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Supports hypotheses" count={details.supportingHypotheses?.length}>
        {renderList(
          details.supportingHypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Contradicts hypotheses" count={details.contradictingHypotheses?.length}>
        {renderList(
          details.contradictingHypotheses,
          (h) => h.id,
          (h) => <HypothesisRow hypothesis={h} onSelect={onSelect} />,
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Gave rise to leads" count={details.supportingLeads?.length}>
        {renderList(
          details.supportingLeads,
          (l) => l.id,
          (l) => (
            <ObjectRow kind="lead" id={l.id} title={l.title} detail={l.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lead slices
// ----------------------------------------------------------------------------

function LeadSlices({
  details,
  onSelect,
}: {
  details: LeadContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard label="Related entities" count={details.relatedEntities?.length}>
        {renderList(
          details.relatedEntities,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="entity" id={e.id} title={e.canonicalName} detail={e.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Related evidence" count={details.relatedEvidence?.length}>
        {renderList(
          details.relatedEvidence,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="evidence" id={e.id} title={e.title} detail={e.type} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Addresses open gaps" count={details.openGaps?.length}>
        {renderList(
          details.openGaps,
          (g) => g.id,
          (g) => (
            <ObjectRow kind="gap" id={g.id} title={g.title} detail={g.priority} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hypothesis slices
// ----------------------------------------------------------------------------

function HypothesisSlices({
  details,
  onSelect,
}: {
  details: HypothesisContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  const robustness = details.robustness;
  return (
    <div className="flex flex-col gap-2">
      {robustness && (
        <SliceCard label="Engine robustness" count={robustness.robustnessScore}>
          <p className="px-2.5 py-1.5 text-[11px] text-surface-500" data-hypothesis-robustness>
            {robustness.robustnessScore}/100 · perturbation stability, not truth probability
          </p>
        </SliceCard>
      )}
      <SliceCard label="Supporting evidence" count={details.supportingEvidence?.length}>
        {renderList(
          details.supportingEvidence,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="evidence" id={e.id} title={e.title} detail={e.type} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Contradicting evidence" count={details.contradictingEvidence?.length}>
        {renderList(
          details.contradictingEvidence,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="evidence" id={e.id} title={e.title} detail={e.type} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Related entities" count={details.relatedEntities?.length}>
        {renderList(
          details.relatedEntities,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="entity" id={e.id} title={e.canonicalName} detail={e.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Contradicting observations" count={details.contradictingObservations?.length}>
        {renderList(
          details.contradictingObservations,
          (o) => o.id,
          (o) => (
            <ObjectRow kind="observation" id={o.id} title={o.type} detail={o.content.slice(0, 48)} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Gap slices
// ----------------------------------------------------------------------------

function GapSlices({
  details,
  onSelect,
}: {
  details: GapContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard label="Affected entities" count={details.relatedEntities?.length}>
        {renderList(
          details.relatedEntities,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="entity" id={e.id} title={e.canonicalName} detail={e.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Related leads" count={details.relatedLeads?.length}>
        {renderList(
          details.relatedLeads,
          (l) => l.id,
          (l) => (
            <ObjectRow kind="lead" id={l.id} title={l.title} detail={l.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
      <SliceCard label="Evidence requests" count={details.evidenceRequests?.length}>
        {renderList(
          details.evidenceRequests,
          (r) => r.id,
          (r) => (
            <p className="px-2.5 py-1.5 text-[12px] font-medium text-surface-800" data-context-slice-object>
              {r.description ?? r.id}
            </p>
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cross-case slices
// ----------------------------------------------------------------------------

function CrossCaseSlices({
  details,
  onSelect,
}: {
  details: CrossCaseContextDetails;
  onSelect: (ctx: InvestigativeContext) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SliceCard label="Matched local entities" count={details.matchedEntities?.length}>
        {renderList(
          details.matchedEntities,
          (e) => e.id,
          (e) => (
            <ObjectRow kind="entity" id={e.id} title={e.canonicalName} detail={e.status} onSelect={onSelect} />
          ),
          <UnavailableRow />,
        )}
      </SliceCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Dispatch
// ----------------------------------------------------------------------------

export function ContextDetailsSlices({
  details,
  onSelectContext,
}: {
  details: ResolvedContextDetails;
  onSelectContext: (ctx: InvestigativeContext) => void;
}) {
  switch (details.kind) {
    case "entity":
      return <EntitySlices details={details} onSelect={onSelectContext} />;
    case "relation":
      return <RelationSlices details={details} onSelect={onSelectContext} />;
    case "evidence":
      return <EvidenceSlices details={details} onSelect={onSelectContext} />;
    case "observation":
      return <ObservationSlices details={details} onSelect={onSelectContext} />;
    case "lead":
      return <LeadSlices details={details} onSelect={onSelectContext} />;
    case "hypothesis":
      return <HypothesisSlices details={details} onSelect={onSelectContext} />;
    case "gap":
      return <GapSlices details={details} onSelect={onSelectContext} />;
    case "cross-case":
      return <CrossCaseSlices details={details} onSelect={onSelectContext} />;
    default:
      return null;
  }
}