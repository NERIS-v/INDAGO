// ============================================================================
// F-PR8 — Flow context summary (Zone 3, Flow representation variant)
//
// The right-hand Context zone adapts to the Adaptive Flow: a selected flow
// entity shows that entity's role (source / intermediary / destination),
// degree counts and per-currency in/out flows (NEVER mixed-summed) with the
// real "Open in Graph" seam; a selected segment shows the directed hypothesis
// it rests on (status, evidence count, per-currency amounts, contradiction);
// a selected gap shows the unobserved-destination observation. Otherwise it
// shows the data-backed flow overview. The base ContextualPanel is untouched —
// this is a representation variant composed at the shell, never an edit to it.
//
// Only provider-backed facts render. No invented labels or severity.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";
import {
  FLOW_DOMAIN_LABELS,
  FLOW_ROLE_LABELS,
  flowEntityFromContext,
  flowSegmentFromContext,
  formatFlowAmount,
} from "@/lib/network/flow/flow-model";
import type { FlowEntity, FlowSegment } from "@/lib/network/flow/flow-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PanelToggle } from "../panel-toggle";

interface FlowContextSummaryProps {
  open: boolean;
  onToggle: () => void;
  /** Same shell-owned flow analysis shared with every supporting zone. */
  readonly meta: FlowLoadState;
  /** The canonical shell-owned selection. */
  readonly context: InvestigativeContext | null;
  /** "Open in Graph" — hands the selected entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
}

function AmountRow({
  flow,
}: {
  flow: ReadonlyArray<{ readonly currency: string; readonly total: number }>;
}) {
  if (flow.length === 0) {
    return (
      <dd className="font-mono text-[11px] text-surface-500">No observed amounts</dd>
    );
  }
  return (
    <dd className="flex flex-col gap-0.5">
      {flow.map((amount) => (
        <span key={amount.currency} className="font-mono text-[11px] text-surface-800">
          {formatFlowAmount(amount.total, amount.currency)}
        </span>
      ))}
    </dd>
  );
}

function EntityContextCard({
  entity,
  onOpenInGraph,
}: {
  entity: FlowEntity;
  onOpenInGraph?: (entityId: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3"
      data-context-flow-entity
      data-flow-context-entity={entity.entityId}
    >
      <div>
        <h3 className="text-base font-medium leading-tight text-surface-900" data-flow-context-title>
          {entity.label}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-surface-400">
          {FLOW_ROLE_LABELS[entity.role].toLowerCase()} ·{" "}
          {entity.crossCase ? "appears in a cross-case match record" : "no cross-case match"}
        </p>
      </div>

      <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200/50">
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Incoming segments
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800">
            {entity.inCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Outgoing segments
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800">
            {entity.outCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Evidence observations
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800">
            {entity.observationCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Inflow
          </dt>
          <AmountRow flow={entity.inFlow} />
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Outflow
          </dt>
          <AmountRow flow={entity.outFlow} />
        </div>
      </dl>

      {onOpenInGraph && (
        <button
          type="button"
          onClick={() => onOpenInGraph(entity.entityId)}
          data-testid="flow-context-open-in-graph"
          className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose"
        >
          Open in Graph
        </button>
      )}
    </div>
  );
}

function SegmentContextCard({
  segment,
  entityLabel,
}: {
  segment: FlowSegment;
  entityLabel: (entityId: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3" data-context-flow-segment data-flow-context-segment={segment.relationId}>
      <div>
        <h3 className="text-base font-medium leading-tight text-surface-900" data-flow-context-title>
          {entityLabel(segment.sourceEntityId)} → {entityLabel(segment.targetEntityId)}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-surface-400">
          {FLOW_DOMAIN_LABELS[segment.domain].toLowerCase()} segment
          {segment.status === "PROPOSED" ? " · proposed" : " · accepted"}
        </p>
      </div>

      <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200/50">
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Evidence observations
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800">
            {segment.observationCount}
          </dd>
        </div>
        {segment.hasAmount ? (
          <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              Observed {segment.mixedCurrencies ? "amounts" : "amount"}
            </dt>
            <AmountRow flow={segment.amounts} />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              Observed amount
            </dt>
            <dd className="font-mono text-[11px] text-surface-500">None recorded</dd>
          </div>
        )}
        {segment.conflict && (
          <div className="flex items-center justify-between gap-3 bg-accent-rose/5 px-3 py-2">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              Contradicted by
            </dt>
            <dd className="font-mono text-[11px] font-medium text-accent-rose">
              {segment.contradictionIds.length} evidence
              {segment.contradictionIds.length === 1 ? "" : " record"}
              {segment.contradictionIds.length === 1 ? "" : "s"}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function FlowContextSummary({
  open,
  onToggle,
  meta,
  context,
  onOpenInGraph,
}: FlowContextSummaryProps) {
  const ready = meta.status === "ready";

  const selectedEntity =
    ready ? (flowEntityFromContext(meta.meta.entities, context) ?? null) : null;
  const selectedSegment =
    ready ? (flowSegmentFromContext(meta.meta.segments, context) ?? null) : null;
  const selectedGap =
    ready && context?.kind === "observation"
      ? (meta.meta.gaps.find((gap) => gap.observationId === context.id) ?? null)
      : null;

  const entityLabel = (entityId: string) =>
    ready
      ? (meta.meta.entities.find((entity) => entity.entityId === entityId)?.label ?? entityId)
      : entityId;

  return (
    <aside
      id="flow-context-panel"
      aria-label="Flow context"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="flow-context-summary"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-2.5">
        <div className="min-w-0">
          <span className="block text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-surface-500">
            Context
          </span>
          {selectedEntity && (
            <span className="block truncate text-[12px] font-medium text-surface-800">
              {selectedEntity.label}
            </span>
          )}
        </div>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open right contextual panel"
          expandedActionLabel="Collapse right contextual panel"
          controlsId="flow-context-panel"
          side="right"
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {ready ? (
          selectedEntity ? (
            <EntityContextCard entity={selectedEntity} onOpenInGraph={onOpenInGraph} />
          ) : selectedSegment ? (
            <SegmentContextCard segment={selectedSegment} entityLabel={entityLabel} />
          ) : selectedGap ? (
            <div className="flex flex-col gap-3" data-context-flow-gap data-flow-context-gap={selectedGap.id}>
              <div>
                <h3 className="text-base font-medium leading-tight text-surface-900" data-flow-context-title>
                  Outflow gap
                </h3>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-surface-400">
                  {entityLabel(selectedGap.sourceEntityId)} → ???
                </p>
              </div>
              <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200/50">
                <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Observed amount
                  </dt>
                  {selectedGap.amount ? (
                    <dd className="font-mono text-[11px] text-surface-800">
                      {formatFlowAmount(selectedGap.amount.total, selectedGap.amount.currency)}
                    </dd>
                  ) : (
                    <dd className="font-mono text-[11px] text-surface-500">None recorded</dd>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Destination
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-500">Unobserved</dd>
                </div>
              </dl>
              <p className="type-caption text-surface-400">{selectedGap.note}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2" data-flow-context-overview>
              <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
                Adaptive Flow
              </p>
              <p className="type-caption text-surface-500" data-flow-context-summary>{meta.meta.summary}</p>
              <p className="type-caption text-surface-400">
                Select a segment or entity to inspect the directed movement behind
                it. SELECT is distinct from FOCUS: this highlights the object
                across the workspace.
              </p>
            </div>
          )
        ) : meta.status === "error" ? (
          <p className="type-caption text-surface-500">{meta.error.message}</p>
        ) : (
          <LoadingSpinner size="sm" label="Building the flow analysis..." />
        )}
      </div>
    </aside>
  );
}