"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { mapInvestigativeGapToGapMock } from "@/lib/intel/gap-adapter";
import { GapsList, type GapMock } from "@/components/intel/gaps-list";
import { GapDrawer } from "@/components/drawers/gap-drawer";

export default function GapsPage() {
  const workspace = useWorkspace();
  const [gaps, setGaps] = useState<GapMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.gaps.listByInvestigation(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setGaps(page.items.map((gap) => mapInvestigativeGapToGapMock(gap)));
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setGaps([]);
      } else {
        setError(pe.message);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = gaps.filter((g) => g.status === "OPEN").length;

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Structural analysis</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Investigative gaps
            </h1>
            {!loading && !unavailable && !error && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(gaps.length).padStart(2, "0")} recorded
              </span>
            )}
            {openCount > 0 && (
              <span className="rounded-full border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-warning">
                {openCount} open
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Structural holes, missing relationships, and unresolved dependencies
            across the case graph. Each gap represents an unknown that prevents
            complete analysis.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <GapsList
            gaps={gaps}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
            onSelectGap={setSelectedGapId}
          />
        </div>
      </div>

      {selectedGapId && (
        <GapDrawer
          gapId={selectedGapId}
          onClose={() => setSelectedGapId(null)}
        />
      )}
    </div>
  );
}