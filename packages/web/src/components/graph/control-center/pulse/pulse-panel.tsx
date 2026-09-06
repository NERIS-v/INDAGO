// ============================================================================
// F-PR6 — Entity Pulse (Zone 2 representation, corrective pass) — MULTI-ENTITY
//
// Rendered ONLY when the workspace capability resolution says the pulse is
// ready in the effective mode (DEMO / AUTO-demo). LIVE renders a typed
// not-ready pane at the shell instead. Every entity is individually
// identifiable with its own enclosed, continuous field (PulseGlyph), readable
// labels and a deterministic, bounded set. The overview arrives from the
// SHELL-owned analysis (one source across all five zones) — this panel never
// fetches. The shared workspace timeRange (the timeline in Zone 4) is the ONLY
// temporal controller: both start and end handle changes morph the glyphs.
//
// SELECT (click a pulse) ≠ FOCUS (durable deep-link target). Clicking SELECTs
// through the shell context bridge; "Open in Graph" hands the entity to the
// existing graph focus seam. Focused entity is prominent; others are
// de-emphasized, never removed. Colors encode activity category only.
// ============================================================================

"use client";

import { useCallback, useMemo } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  PULSE_CATEGORIES,
  PULSE_CATEGORY_COLORS,
  PULSE_CATEGORY_LABELS,
  PULSE_MAX_TOPIC_ENTITIES,
} from "@/lib/network/pulse/pulse-model";
import type { EntityPulseField, PulseMarker } from "@/lib/network/pulse/pulse-model";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PulseGlyph } from "./pulse-glyph";

interface PulsePanelProps {
  /** Shell-owned Entity Pulse analysis shared with every supporting zone. */
  readonly overview: EntityPulseLoadState;
  /** The canonical shell-owned selection (derived highlight only). */
  readonly context?: InvestigativeContext | null;
  /** Shell handler that rematerializes pulse intents as context (SELECT). */
  readonly onSelectContext?: (context: InvestigativeContext | null) => void;
  /** Durable deep-link focus target — rendered prominent, others dimmed. */
  readonly focusEntityId?: string | null;
  /** "Open in Graph" — hands the entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
}

function MarkerIcon({ kind }: { kind: PulseMarker["kind"] }) {
  const color =
    kind === "contradiction"
      ? "var(--color-danger)"
      : kind === "identity-resolution"
        ? PULSE_CATEGORY_COLORS.identity
        : PULSE_CATEGORY_COLORS["cross-case"];
  if (kind === "contradiction") {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rotate-45 border border-surface-0"
        style={{ backgroundColor: color }}
      />
    );
  }
  if (kind === "identity-resolution") {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 border border-surface-0"
        style={{ backgroundColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: 0,
        height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderBottom: "9px solid var(--color-warning)",
      }}
    />
  );
}

interface PulseCardProps {
  readonly field: EntityPulseField;
  readonly prominent?: boolean;
  readonly dimmed?: boolean;
  readonly selected: boolean;
  readonly ariaLabel: string;
  readonly onSelect: () => void;
  readonly onOpenInGraph?: () => void;
  readonly markers: readonly PulseMarker[];
}

function PulseCard({
  field,
  prominent = false,
  dimmed = false,
  selected,
  ariaLabel,
  onSelect,
  onOpenInGraph,
  markers,
}: PulseCardProps) {
  const fieldMarkers = markers.filter(
    (marker) => marker.entityId === field.entityId,
  );
  const superLabel = field.salienceAvailable
    ? `Analytical relevance ${Math.round(field.salience * 100)}%`
    : "Analytical relevance unavailable";

  return (
    <div
      data-pulse-card
      data-pulse-card-entity={field.entityId}
      data-pulse-card-prominent={String(prominent)}
      className={`flex flex-col rounded-xl border bg-surface-50/70 p-3 shadow-sm transition-opacity duration-300 ${
        selected
          ? "border-accent-rose/60 ring-1 ring-accent-rose/30"
          : "border-surface-200/60"
      } ${prominent ? "gap-4 sm:flex-row" : "gap-2"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={ariaLabel}
        data-testid="pulse-entity-card"
        className={`flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose ${
          prominent ? "sm:w-2/5" : ""
        }`}
      >
        <span className={`${prominent ? "h-36 w-36 shrink-0" : "h-20 w-20 shrink-0"}`}>
          <PulseGlyph field={field} dimmed={dimmed} selected={selected} ariaLabel={ariaLabel} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-surface-900" title={field.label}>
            {field.label}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
            {field.categoryLabel}
          </span>
          <span className="mt-1 block font-mono text-[10px] text-surface-500">
            {field.observationCount} in window
            {field.totalObservationCount !== field.observationCount
              ? ` · ${field.totalObservationCount} total`
              : ""}
          </span>
        </span>
      </button>

      {prominent && onOpenInGraph && (
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenInGraph}
            data-testid="pulse-open-in-graph"
            className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose"
          >
            Open in Graph
          </button>
        </div>
      )}

      {prominent && (
        <dl className="flex min-w-0 flex-1 flex-col gap-1.5 sm:border-l sm:border-surface-200 sm:pl-4">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              Window activity
            </dt>
            <dd className="font-mono text-[11px] text-surface-800" data-pulse-dominant>
              {field.categoryLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              Observations
            </dt>
            <dd className="font-mono text-[11px] text-surface-800">
              {field.observationCount} in window · {field.totalObservationCount} total
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              {field.salienceAvailable ? "Analytical relevance" : "Analytical relevance"}
            </dt>
            <dd className="font-mono text-[11px] text-surface-800" data-pulse-salience>
              {superLabel}
            </dd>
          </div>
          {fieldMarkers.length > 0 && (
            <div className="flex flex-col gap-1 pt-1">
              {fieldMarkers.map((marker) => (
                <span key={`${marker.kind}:${marker.label}`} className="flex items-center gap-1.5">
                  <MarkerIcon kind={marker.kind} />
                  <span className="truncate font-mono text-[10px] text-surface-600" title={marker.detail}>
                    {marker.label}
                  </span>
                </span>
              ))}
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export function PulsePanel({
  overview,
  context = null,
  onSelectContext,
  focusEntityId = null,
  onOpenInGraph,
}: PulsePanelProps) {
  const selectedEntityId = context?.kind === "entity" ? context.id : null;
  const highlightId = focusEntityId ?? selectedEntityId;

  const handleSelect = useCallback(
    (entityId: string) => {
      onSelectContext?.({ kind: "entity", id: entityId, source: "graph" });
    },
    [onSelectContext],
  );

  const markerList = useMemo(
    () => (overview.status === "ready" ? overview.overview.markers : []),
    [overview],
  );

  if (overview.status === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="pulse-panel">
        <ErrorDisplay message={overview.error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (overview.status !== "ready") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="pulse-panel">
        <LoadingSpinner size="sm" label="Building the entity pulse..." />
      </div>
    );
  }

  const { entities, capped, entityNodeCount, summary, dominantCategoryLabel } =
    overview.overview;
  const focused = highlightId
    ? (entities.find((field) => field.entityId === highlightId) ?? null)
    : null;
  const others = focused
    ? entities.filter((field) => field.entityId !== focused.entityId)
    : entities;

  const legendCategories = PULSE_CATEGORIES.filter((category) =>
    entities.some((field) => field.category === category),
  );

  return (
    <div
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden"
      data-testid="pulse-panel"
    >
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-1">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-400">
            Entity Pulse
          </h2>
          <p className="truncate font-mono text-[11px] text-surface-500">
            {summary}
          </p>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="pulse-overview"
      >
        {summary}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {focused && (
          <PulseCard
            field={focused}
            prominent
            dimmed={false}
            selected={focused.entityId === selectedEntityId}
            ariaLabel={`${focused.label} pulse, ${focused.observationCount} observations in window, ${focused.categoryLabel} activity, ${Math.round(focused.salience * 100)}% analytical relevance`}
            onSelect={() => handleSelect(focused.entityId)}
            onOpenInGraph={onOpenInGraph ? () => onOpenInGraph(focused.entityId) : undefined}
            markers={markerList}
          />
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {others.map((field) => (
            <PulseCard
              key={field.entityId}
              field={field}
              dimmed={highlightId !== null && field.entityId !== highlightId}
              selected={field.entityId === selectedEntityId}
              ariaLabel={`${field.label} pulse, ${field.observationCount} observations in window, ${field.categoryLabel} activity, ${Math.round(field.salience * 100)}% analytical relevance`}
              onSelect={() => handleSelect(field.entityId)}
              markers={markerList}
            />
          ))}
        </div>

        {markerList.length > 0 && (
          <div
            className="flex flex-col gap-1.5 rounded-xl border border-surface-200/60 bg-surface-50/70 p-3"
            data-testid="pulse-markers"
          >
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
              Case signals
            </h3>
            {markerList.map((marker) => (
              <div
                key={`${marker.kind}:${marker.label}:${marker.entityId ?? "global"}`}
                className="flex items-start gap-2"
                data-pulse-marker={marker.kind}
              >
                <span className="mt-0.5 shrink-0">
                  <MarkerIcon kind={marker.kind} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700">
                    {marker.label}
                    {marker.entityLabel ? ` — ${marker.entityLabel}` : ""}
                  </p>
                  <p className="type-caption text-surface-500">{marker.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-3"
        data-testid="pulse-legend"
      >
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500">
          Shown: {entities.length} of {entityNodeCount} entity{entityNodeCount === 1 ? "" : "s"}
          {capped || entityNodeCount > PULSE_MAX_TOPIC_ENTITIES
            ? ` (overview cap ${PULSE_MAX_TOPIC_ENTITIES})`
            : ""}
        </span>
        {dominantCategoryLabel && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-surface-600">
            Dominant activity: {dominantCategoryLabel}
          </span>
        )}
        {legendCategories.map((category) => (
          <span
            key={category}
            className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: PULSE_CATEGORY_COLORS[category] }}
            />
            {PULSE_CATEGORY_LABELS[category]}
          </span>
        ))}
        {!overview.overview.salienceAvailable && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-surface-600">
            Analytical salience unavailable
          </span>
        )}
      </div>
    </div>
  );
}