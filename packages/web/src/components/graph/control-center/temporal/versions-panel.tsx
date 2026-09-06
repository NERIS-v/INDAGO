"use client";

// ============================================================================
// PR-7 — Temporal · VERSIONS tab
//
// Honest graph-version surface. Reads CURRENT version through the existing
// getVersion seam and the historical series through the OPTIONAL listVersions
// seam (demo far; live UNSUPPORTED — no fabrication, no fake /as-of).
//
// A historical selection never falls back to the current graph: if the selected
// version has no materialized surface on this seam, the panel says so
// ("historical-unavailable") instead of silently rendering the current graph on
// its behalf. Realtime events never mutate this view (honesty rule #2).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type { GraphVersion } from "@indago/contracts";
import {
  deriveVersionViewState,
  HISTORICAL_NO_SILENT_MUTATION,
  HISTORICAL_SURFACE_UNAVAILABLE,
  isHistoricalView,
  sortVersionsByNumber,
  type TemporalVersionSelection,
  type VersionViewState,
} from "@/lib/context/temporal-workspace";

interface TemporalVersionsPanelProps {
  readonly selection: TemporalVersionSelection;
  /** Lock the graph to a historical version (demo: metadata-only surface). */
  onSelectVersion(versionId: string): void;
  /** Return the view to the live ACTIVE version. */
  onReturnCurrent(): void;
}

export function TemporalVersionsPanel({
  selection,
  onSelectVersion,
  onReturnCurrent,
}: TemporalVersionsPanelProps) {
  const workspace = useWorkspace();
  const [currentVersion, setCurrentVersion] = useState<GraphVersion | null>(null);
  const [versions, setVersions] = useState<GraphVersion[]>([]);
  const [listingAvailable, setListingAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const current = await workspace.graph.getVersion(workspace.investigationId);
        if (cancelled) return;
        setCurrentVersion(current);
      } catch {
        if (cancelled) return;
        setCurrentVersion(null);
      }
      try {
        if (!workspace.graph.listVersions) {
          if (cancelled) return;
          setListingAvailable(false);
        } else {
          const page = await workspace.graph.listVersions(workspace.investigationId);
          if (cancelled) return;
          setVersions(page.items);
        }
      } catch {
        if (cancelled) return;
        setListingAvailable(false);
      }
      if (!cancelled) setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const selectedVersion =
    versions.find((v) => v.id === selection.versionId) ?? null;

  const view: VersionViewState = deriveVersionViewState({
    selection,
    currentVersion,
    selectedVersion,
    listingAvailable,
    pending: !loaded,
  });

  const historical = isHistoricalView(selection);

  const handleSelect = useCallback(
    (versionId: string) => onSelectVersion(versionId),
    [onSelectVersion],
  );

  const handleReturn = useCallback(() => onReturnCurrent(), [onReturnCurrent]);

  return (
    <div data-temporal-versions className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          Graph versions
        </h2>
      </div>

      {view.kind === "unsupported" && (
        <p
          data-versions-unsupported
          className="type-caption rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2 text-surface-500"
        >
          {view.reason}
        </p>
      )}

      {view.kind === "loading" && (
        <p data-versions-loading className="type-caption text-surface-400">
          Loading graph versions…
        </p>
      )}

      {view.kind === "historical-unavailable" && (
        <div className="space-y-2">
          <p
            data-versions-unavailable
            className="type-caption rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-amber-800"
          >
            {view.reason}
          </p>
          <button
            type="button"
            data-return-current
            onClick={handleReturn}
            className="rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-700"
          >
            Return to current
          </button>
        </div>
      )}

      {view.kind === "current" && (
        <>
          <VersionSummary version={view.version} current />
          {versions.length > 0 ? (
            <VersionList
              versions={versions}
              currentVersionId={view.version.id}
              selectedVersionId={selection.versionId}
              historical={historical}
              onSelect={handleSelect}
              onReturn={handleReturn}
            />
          ) : (
            <p data-versions-no-history className="type-caption text-surface-400">
              No historical versions exist yet for this case.
            </p>
          )}
        </>
      )}

      {view.kind === "historical" && (
        <>
          <VersionSummary version={view.version} current={false} />
          <p
            data-versions-replay-note
            className="rounded-lg border border-brand-300/60 bg-brand-50/60 px-3 py-2 text-[10px] leading-relaxed text-brand-800"
          >
            {HISTORICAL_SURFACE_UNAVAILABLE} {HISTORICAL_NO_SILENT_MUTATION}
          </p>
          <VersionList
            versions={versions}
            currentVersionId={currentVersion?.id ?? null}
            selectedVersionId={selection.versionId}
            historical
            onSelect={handleSelect}
            onReturn={handleReturn}
          />
        </>
      )}
    </div>
  );
}

function VersionSummary({
  version,
  current,
}: {
  readonly version: GraphVersion;
  readonly current: boolean;
}) {
  return (
    <div
      data-version-summary
      className="flex items-center justify-between gap-2 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-surface-800">
          Graph version {version.versionNumber}
        </p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-surface-500">
          {version.nodeCount} nodes · {version.edgeCount} edges ·{" "}
          {version.projectionStatus}
        </p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-surface-400">
          {version.updatedAt.value}
        </p>
      </div>
      <span
        data-version-badge={current ? "current" : "historical"}
        className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-widest ${
          current
            ? "bg-brand-500 text-white"
            : "bg-surface-100 text-surface-500"
        }`}
      >
        {current ? "Current" : "Historical"}
      </span>
    </div>
  );
}

function VersionList({
  versions,
  currentVersionId,
  selectedVersionId,
  historical,
  onSelect,
  onReturn,
}: {
  readonly versions: readonly GraphVersion[];
  readonly currentVersionId: string | null;
  readonly selectedVersionId: string | null;
  readonly historical: boolean;
  onSelect(versionId: string): void;
  onReturn(): void;
}) {
  const sorted = sortVersionsByNumber(versions);
  return (
    <div className="space-y-2">
      {historical && (
        <button
          type="button"
          data-return-current
          onClick={onReturn}
          className="rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-700"
        >
          Return to current
        </button>
      )}
      <ul data-version-list className="space-y-1.5">
        {sorted.map((v) => {
          const isCurrent = v.id === currentVersionId;
          const isSelected = v.id === selectedVersionId;
          return (
            <li key={v.id}>
              <button
                type="button"
                data-version-number={v.versionNumber}
                aria-label={`view-version-${v.versionNumber}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(v.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-50"
                    : "border-surface-200/60 bg-surface-0 hover:border-surface-300"
                }`}
              >
                <span className="text-sm font-medium text-surface-800">
                  Version {v.versionNumber}
                  {isCurrent && (
                    <span
                      data-version-current-mark
                      className="ml-2 rounded bg-brand-500 px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-widest text-white"
                    >
                      Current
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-surface-500">
                  <span data-version-status>{v.status}</span>
                  <span>{v.nodeCount}·{v.edgeCount}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}