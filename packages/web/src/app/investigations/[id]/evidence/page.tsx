"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { EvidenceListItem } from "@/lib/api/types";
import { EvidenceList } from "@/components/evidence/evidence-list";
import {
  EvidenceIntake,
  type EvidenceIntakeSubmitRequest,
} from "@/components/evidence/evidence-intake";
import { triggerOrQueueUploadSequence } from "@/components/graph/graph-live";

export default function EvidencePage() {
  const workspace = useWorkspace();
  const [items, setItems] = useState<EvidenceListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.evidence.listByInvestigation(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setItems(page.items);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setItems([]);
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

  const handleSubmit = useCallback(
    async (request: EvidenceIntakeSubmitRequest) => {
      await workspace.evidence.submit(workspace.investigationId, request);
      
      triggerOrQueueUploadSequence(workspace.realtime);
      
      await load();
    },
    [workspace, load],
  );

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Materials</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Source workspace</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Evidence
            </h1>
            {items !== null && !loading && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(items.length).padStart(2, "0")} catalogued
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Source material submitted to this investigation. Each item is
            ingested and processed into the canonical observation set.
          </p>
        </header>

        <section className="pt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Submit evidence
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          </div>
          <div className="mt-5 rounded-lg border border-semantic-border-subtle bg-semantic-surface p-6">
            <EvidenceIntake
              evidence={workspace.evidence}
              investigationId={workspace.investigationId}
              caseId={workspace.caseId}
              onSubmitEvidence={handleSubmit}
              onComplete={() => undefined}
            />
          </div>
        </section>

        <section className="pt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Catalogued evidence
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            {items !== null && !loading && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(items.length).padStart(2, "0")}
              </span>
            )}
          </div>
          <EvidenceList
            items={items}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
          />
        </section>
      </div>
    </div>
  );
}