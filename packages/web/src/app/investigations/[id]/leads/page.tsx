"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { mapLeadToLeadMock } from "@/lib/intel/lead-adapter";
import { LeadsList, type LeadMock } from "@/components/intel/leads-list";
import { LeadDrawer } from "@/components/drawers/lead-drawer";
import { Button } from "@/components/ui/button";

export default function LeadsPage() {
  const workspace = useWorkspace();
  const [leads, setLeads] = useState<LeadMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.leads.listByInvestigation(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setLeads(page.items.map(mapLeadToLeadMock));
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setLeads([]);
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

  const generate = workspace.leads.generate;
  const handleGenerate = useCallback(async () => {
    if (!generate) return;
    setGenerating(true);
    try {
      await generate(workspace.investigationId);
      await load();
    } catch (err) {
      setError(toProviderError(err).message);
    } finally {
      setGenerating(false);
    }
  }, [generate, workspace.investigationId, load]);

  const pendingReview = leads.filter((l) => l.status === "REVIEW").length;

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Pursuit queue</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Investigative leads
            </h1>
            {pendingReview > 0 && (
              <span className="rounded-full border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-warning">
                {pendingReview} pending review
              </span>
            )}
            {leads.length > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(leads.length).padStart(2, "0")} total
              </span>
            )}
            {generate && (
              <span className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                >
                  {generating ? "Generating..." : "Generate leads"}
                </Button>
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Leads are candidate lines of inquiry derived from the case graph.
            Each carries a claim to be tested and a structural signal worth pursuing.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <LeadsList
            leads={leads}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
            onSelectLead={setSelectedLeadId}
          />
        </div>
      </div>

      {selectedLeadId && (
        <LeadDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}