"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_CASE_REPORT_CONFIG,
  type CaseReportConfig,
  type ReportLayout,
} from "@/components/intel/case-report";

export const REPORT_ROW_CAPS = [25, 60, 120] as const;

interface CaseReportExportDialogProps {
  readonly initial?: CaseReportConfig;
  readonly onConfirm: (config: CaseReportConfig) => void;
  readonly onClose: () => void;
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 rounded-lg border border-semantic-border-subtle bg-semantic-surface px-4 py-3 text-left transition-colors hover:border-semantic-border hover:bg-semantic-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
    >
      <span className="min-w-0">
        <span className="block text-sm text-semantic-foreground">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
          {hint}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-fast ${
          checked
            ? "border-semantic-selection bg-semantic-selection"
            : "border-semantic-border bg-semantic-background"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1/2 left-0.5 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-semantic-foreground transition-transform duration-fast ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function LayoutCard({
  value,
  selected,
  title,
  hint,
  onSelect,
}: {
  readonly value: ReportLayout;
  readonly selected: boolean;
  readonly title: string;
  readonly hint: string;
  readonly onSelect: (value: ReportLayout) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
        selected
          ? "border-semantic-selection bg-semantic-surface-elevated"
          : "border-semantic-border-subtle bg-semantic-surface hover:border-semantic-border"
      }`}
    >
      <span
        className={`flex items-center gap-2 text-sm ${
          selected ? "text-semantic-foreground" : "text-semantic-foreground-muted"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors ${
            selected ? "border-semantic-selection" : "border-semantic-border"
          }`}
        >
          {selected && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-semantic-selection"
            />
          )}
        </span>
        {title}
      </span>
      <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
        {hint}
      </span>
    </button>
  );
}

export function CaseReportExportDialog({
  initial = DEFAULT_CASE_REPORT_CONFIG,
  onConfirm,
  onClose,
}: CaseReportExportDialogProps) {
  const [layout, setLayout] = useState<ReportLayout>(initial.layout);
  const [rowCap, setRowCap] = useState<number>(initial.rowCap);
  const [flags, setFlags] = useState({
    includeIdentity: initial.includeIdentity,
    includeCurrentPicture: initial.includeCurrentPicture,
    includeState: initial.includeState,
    includeEntities: initial.includeEntities,
    includeEvidence: initial.includeEvidence,
    includeLeads: initial.includeLeads,
    includeGaps: initial.includeGaps,
    includeHypotheses: initial.includeHypotheses,
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleConfirm = () => {
    onConfirm({ ...flags, layout, rowCap });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-out"
        onClick={onClose}
      />

      {/* Dialog panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-report-export-title"
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-semantic-border-subtle bg-semantic-background shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-semantic-border-subtle bg-semantic-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-semantic-selection/10 border border-semantic-selection/30">
              <svg
                className="h-3 w-3 text-semantic-selection"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
              </svg>
            </span>
            <div>
              <h2
                id="case-report-export-title"
                className="font-mono text-[11px] font-bold uppercase tracking-widest text-semantic-foreground"
              >
                Export case report
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                Configure layout &amp; contents
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-muted transition-colors hover:text-semantic-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
          >
            <span className="hidden sm:inline">Close</span>
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Layout */}
          <section>
            <SectionLabel>Layout</SectionLabel>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <LayoutCard
                value="full"
                selected={layout === "full"}
                title="Full detail"
                hint="Dense tables — every row"
                onSelect={setLayout}
              />
              <LayoutCard
                value="condensed"
                selected={layout === "condensed"}
                title="Condensed"
                hint="One line per item"
                onSelect={setLayout}
              />
            </div>
          </section>

          {/* Row cap */}
          <section>
            <SectionLabel>Maximum rows per section</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {REPORT_ROW_CAPS.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setRowCap(cap)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
                    rowCap === cap
                      ? "border-semantic-selection bg-semantic-surface-elevated text-semantic-selection"
                      : "border-semantic-border-subtle bg-semantic-surface text-semantic-foreground-muted hover:border-semantic-border"
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>
          </section>

          {/* Sections */}
          <section>
            <SectionLabel>Include in the report</SectionLabel>
            <div className="mt-3 space-y-2">
              <ToggleRow
                label="Identity grid"
                hint="Case / investigation / status / priority / owner"
                checked={flags.includeIdentity}
                onChange={(v) => setFlags((f) => ({ ...f, includeIdentity: v }))}
              />
              <ToggleRow
                label="Current picture"
                hint="Investigation &amp; case descriptions"
                checked={flags.includeCurrentPicture}
                onChange={(v) =>
                  setFlags((f) => ({ ...f, includeCurrentPicture: v }))
                }
              />
              <ToggleRow
                label="Investigative state"
                hint="Evidence / entities / leads / gaps / hypotheses counts"
                checked={flags.includeState}
                onChange={(v) => setFlags((f) => ({ ...f, includeState: v }))}
              />
              <ToggleRow
                label="Entity register"
                hint="Canonical names, status, source identifier count"
                checked={flags.includeEntities}
                onChange={(v) => setFlags((f) => ({ ...f, includeEntities: v }))}
              />
              <ToggleRow
                label="Evidence"
                hint="Titles, type, status, source ref, observed date"
                checked={flags.includeEvidence}
                onChange={(v) =>
                  setFlags((f) => ({ ...f, includeEvidence: v }))
                }
              />
              <ToggleRow
                label="Leads"
                hint="Titles, status, priority, confidence"
                checked={flags.includeLeads}
                onChange={(v) => setFlags((f) => ({ ...f, includeLeads: v }))}
              />
              <ToggleRow
                label="Investigative gaps"
                hint="Titles, type, status, priority"
                checked={flags.includeGaps}
                onChange={(v) => setFlags((f) => ({ ...f, includeGaps: v }))}
              />
              <ToggleRow
                label="Working hypotheses"
                hint="Titles, statements, status, confidence"
                checked={flags.includeHypotheses}
                onChange={(v) =>
                  setFlags((f) => ({ ...f, includeHypotheses: v }))
                }
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-semantic-border-subtle bg-semantic-surface px-6 py-4">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirm}>
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659"
              />
            </svg>
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
    </div>
  );
}