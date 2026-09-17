"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { toLeadDrawerFields } from "@/lib/intel/lead-adapter";
import type { Lead } from "@indago/contracts";

interface LeadDrawerProps {
  leadId: string;
  onClose: () => void;
}

export function LeadDrawer({ leadId, onClose }: LeadDrawerProps) {
  const workspace = useWorkspace();
  const [mounted, setMounted] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void workspace.leads
      .get(leadId)
      .then((l) => {
        if (!cancelled) setLead(l);
      })
      .catch((err) => {
        if (!cancelled) setError(toProviderError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, leadId]);

  const fields = lead ? toLeadDrawerFields(lead) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-surface-0/60 backdrop-blur-sm transition-opacity duration-slow ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Drawer Surface */}
      <div
        className={`relative flex w-full max-w-lg flex-col border-l border-surface-200/40 bg-surface-100 shadow-2xl transition-transform duration-normal ease-restrained ${mounted ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-surface-200/30 px-6 py-4">
          <Badge variant="muted">Investigative Lead</Badge>
          <Button variant="quiet" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner label="Loading lead" />
            </div>
          )}

          {!loading && error && (
            <div className="p-6">
              <ErrorDisplay title="Could not load lead" message={error} />
            </div>
          )}

          {!loading && lead && fields && (
            <>
              {/* CLAIM */}
              <div className="p-6">
                <h2 className="text-lg font-medium text-surface-900 leading-snug">
                  {lead.title}
                </h2>
                {lead.description && (
                  <p className="mt-3 text-sm leading-relaxed text-surface-600">
                    {lead.description}
                  </p>
                )}
              </div>

              <div className="divide-y divide-surface-200/30 border-y border-surface-200/30">
                {/* CONFIDENCE */}
                <div className="flex flex-col gap-2 p-6">
                  <span className="text-[11px] uppercase tracking-widest text-surface-500">Confidence Analysis</span>
                  <div className="grid grid-cols-2 gap-4 font-mono text-sm text-surface-800">
                    <div>
                      <div className="text-surface-500">Confidence</div>
                      <div>{(fields.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-surface-500">Structural Signal</div>
                      <div className="text-brand-500">{fields.structuralSignal}</div>
                    </div>
                    <div>
                      <div className="text-surface-500">Posture</div>
                      <div>{fields.posture}</div>
                    </div>
                    <div>
                      <div className="text-surface-500">Priority</div>
                      <div>{fields.priority}</div>
                    </div>
                    <div>
                      <div className="text-surface-500">Candidate</div>
                      <div>{fields.sourceCandidateType}</div>
                    </div>
                  </div>
                </div>

                {/* FOR AND AGAINST (Equal Visual Weight) */}
                <div className="grid grid-cols-2 divide-x divide-surface-200/30 bg-surface-50">
                  <div className="p-6">
                    <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Evidence For</span>
                    <ul className="flex flex-col gap-3 text-sm text-surface-700">
                      <li className="flex gap-2">
                        <span className="text-brand-500">→</span>
                        {fields.supportCount} supporting observation{fields.supportCount === 1 ? "" : "s"}
                      </li>
                    </ul>
                  </div>
                  <div className="p-6">
                    <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Evidence Against</span>
                    <ul className="flex flex-col gap-3 text-sm text-surface-700">
                      <li className="flex gap-2">
                        <span className="text-surface-400">→</span>
                        {fields.againstCount} contradicting observation{fields.againstCount === 1 ? "" : "s"}
                      </li>
                    </ul>
                  </div>
                </div>

                {/* ALTERNATIVES */}
                <div className="p-6">
                  <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Alternative Explanations</span>
                  {fields.alternatives.length ? (
                    <ul className="flex flex-col gap-3 text-sm text-surface-700">
                      {fields.alternatives.map((alt, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-surface-400">→</span>
                          <div className="min-w-0">
                            <p>{alt.statement}</p>
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-surface-400">
                              {alt.kind} · plausibility {(alt.plausibility * 100).toFixed(0)}%
                            </p>
                            {alt.requiresAdditionalEvidence.length > 0 && (
                              <p className="mt-0.5 text-xs text-surface-400">
                                Would require: {alt.requiresAdditionalEvidence.join("; ")}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-surface-500">None recorded.</p>
                  )}
                </div>

                {/* PROVENANCE */}
                <div className="p-6">
                  <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Provenance</span>
                  {fields.provenance && fields.provenance.entries.length ? (
                    <ul className="flex flex-col gap-3 text-sm text-surface-700">
                      {fields.provenance.entries.map((entry, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-surface-400">→</span>
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-surface-800">
                              Source {entry.sourceId}
                            </p>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-surface-400">
                              {entry.extractor}
                              {entry.documentRef ? ` · ${entry.documentRef}` : ""}
                              {entry.pageRef ? ` · p.${entry.pageRef}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-surface-500">No provenance recorded.</p>
                  )}
                </div>

                {/* GAPS */}
                <div className="bg-brand-500/5 p-6">
                  <span className="mb-3 block text-[11px] uppercase tracking-widest text-brand-500/80">Linked Gaps</span>
                  {fields.gapCount > 0 ? (
                    <p className="text-sm text-surface-800">
                      {fields.gapCount} investigative gap{fields.gapCount === 1 ? "" : "s"} linked to this lead.
                    </p>
                  ) : (
                    <p className="text-sm text-surface-800">No linked investigative gaps.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}