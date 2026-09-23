"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type {
  Investigation,
  Case,
  Entity,
  Lead,
  InvestigativeGap,
  Hypothesis,
} from "@indago/contracts";
import type { EvidenceListItem } from "@/lib/api/types";

// ============================================================================
// Case Report Configuration
//
// The export dialog produces a CaseReportConfig that decides both the layout
// (full detail tables vs condensed summary) and which information is printed.
// CaseReport renders itself from this config; the dialog never touches print.
// ============================================================================

export type ReportLayout = "full" | "condensed";

export interface CaseReportConfig {
  readonly layout: ReportLayout;
  /** Maximum rows rendered per section (slice cap). */
  readonly rowCap: number;
  /** Sections / information to print. */
  readonly includeIdentity: boolean;
  readonly includeCurrentPicture: boolean;
  readonly includeState: boolean;
  readonly includeEntities: boolean;
  readonly includeEvidence: boolean;
  readonly includeLeads: boolean;
  readonly includeGaps: boolean;
  readonly includeHypotheses: boolean;
}

export const DEFAULT_CASE_REPORT_CONFIG: CaseReportConfig = {
  layout: "full",
  rowCap: 120,
  includeIdentity: true,
  includeCurrentPicture: true,
  includeState: true,
  includeEntities: true,
  includeEvidence: true,
  includeLeads: true,
  includeGaps: true,
  includeHypotheses: true,
};

interface CaseReportProps {
  readonly config?: CaseReportConfig;
}

interface CaseReportData {
  readonly investigation: Investigation;
  /** null = backend endpoint unavailable (distinct from empty). */
  readonly caseDoc: Case | null;
  readonly entities: Entity[] | null;
  readonly evidence: EvidenceListItem[] | null;
  readonly leads: Lead[] | null;
  readonly gaps: InvestigativeGap[] | null;
  readonly hypotheses: Hypothesis[] | null;
}

async function settleList<T>(
  load: () => Promise<{ items: T[] }>,
): Promise<T[] | null> {
  try {
    return (await load()).items;
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatObservedAt(value: EvidenceListItem["observedAt"]): string {
  if (!value) return "—";
  const iso = value.value;
  if (iso.startsWith("[")) return iso.length > 32 ? `${iso.slice(0, 32)}…` : iso;
  return formatDate(iso);
}

function listCell(value: string | number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

const TH =
  "text-left font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[#45403a]";
const TD = "align-top py-2 pr-4 text-[10.5px] leading-relaxed text-[#1a1815]";

export function CaseReport({
  config = DEFAULT_CASE_REPORT_CONFIG,
}: CaseReportProps) {
  const workspace = useWorkspace();
  const [data, setData] = useState<CaseReportData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const investigation = await workspace.investigations.get(
        workspace.investigationId,
      );
      const [caseDoc, entities, evidence, leads, gaps, hypotheses] =
        await Promise.all([
          workspace.cases.get(workspace.caseId).catch(() => null),
          settleList(() =>
            workspace.entities.listByInvestigation(workspace.investigationId, {
              pageSize: 200,
            }),
          ),
          settleList(() =>
            workspace.evidence.listByInvestigation(workspace.investigationId, {
              pageSize: 200,
            }),
          ),
          settleList(() =>
            workspace.leads.listByInvestigation(workspace.investigationId, {
              pageSize: 200,
            }),
          ),
          settleList(() =>
            workspace.gaps.listByInvestigation(workspace.investigationId, {
              pageSize: 200,
            }),
          ),
          settleList(() =>
            workspace.hypotheses.listByInvestigation(workspace.investigationId, {
              pageSize: 200,
            }),
          ),
        ]);
      setData({ investigation, caseDoc, entities, evidence, leads, gaps, hypotheses });
    } catch {
      setFailed(true);
    }
  }, [workspace]);

  useEffect(() => {
    void load();
  }, [load]);

  const stat = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "Unavailable"
      : String(value).padStart(2, "0");

  const sections: Array<{
    key: keyof CaseReportConfig;
    title: string;
  }> = [
    { key: "includeEntities", title: "Entity register" },
    { key: "includeEvidence", title: "Evidence" },
    { key: "includeLeads", title: "Leads" },
    { key: "includeGaps", title: "Investigative gaps" },
    { key: "includeHypotheses", title: "Working hypotheses" },
  ];

  const enabledSection = (key: keyof CaseReportConfig): boolean =>
    config[key] === true;

  const investigation = data?.investigation;

  return (
    <div className="case-report-print-root hidden print:block">
      <div className="mx-auto max-w-[880px] bg-[#ffffff] text-[#1a1815]">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className="border-b-[2px] border-[#1a1815] pb-6">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[#45403a]">
            INDAGO // OFFICIAL CASE REPORT
          </div>
          {investigation ? (
            <>
              <h1 className="mt-3 font-display text-[1.9rem] font-light leading-tight tracking-[-0.015em] text-[#1a1815]">
                {investigation.title}
              </h1>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[#45403a]">
                {data.caseDoc?.title ?? "Case"} · Generated{" "}
                {formatDate(new Date().toISOString())} · Layout{" "}
                {config.layout === "full" ? "full detail" : "condensed"}
              </p>
            </>
          ) : (
            <h1 className="mt-3 font-display text-[1.4rem] font-light text-[#1a1815]">
              {failed ? "Report unavailable" : "Preparing report…"}
            </h1>
          )}
        </header>

        {!investigation && (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-[#45403a]">
            {failed
              ? "The case report could not be assembled. Verify the workspace is connected and try again."
              : "Loading workspace data…"}
          </p>
        )}

        {investigation && (
          <>
            {/* ── Identity grid ────────────────────────────────────── */}
            {config.includeIdentity && (
              <section className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                {[
                  ["Case", data.caseDoc?.title ?? workspace.caseId],
                  ["Investigation", investigation.id],
                  [
                    "Status",
                    `${investigation.status}${data.caseDoc?.status ? ` / ${data.caseDoc.status} case` : ""}`,
                  ],
                  ["Priority", investigation.priority],
                  ["Owner", investigation.owner],
                  ["Mode", workspace.mode],
                  ["Created", formatDate(investigation.createdAt.value)],
                  ["Updated", formatDate(investigation.updatedAt.value)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.25em] text-[#67615a]">
                      {label}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#1a1815]">
                      {String(value ?? "—")}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* ── Current picture ──────────────────────────────────── */}
            {config.includeCurrentPicture && (
              <section className="mt-8">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#1a1815]">
                    Current picture
                  </span>
                  <span className="flex-1 border-t border-[#c9c2b7]" aria-hidden="true" />
                </div>
                {investigation.description ? (
                  <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-[#32302c]">
                    {investigation.description}
                  </p>
                ) : (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-[#67615a]">
                    No case description has been recorded for this investigation.
                  </p>
                )}
                {data.caseDoc?.description && (
                  <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[#32302c]">
                    {data.caseDoc.description}
                  </p>
                )}
              </section>
            )}

            {/* ── Investigative state ──────────────────────────────── */}
            {config.includeState && (
              <section className="mt-8">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#1a1815]">
                    Investigative state
                  </span>
                  <span className="flex-1 border-t border-[#c9c2b7]" aria-hidden="true" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-[#c9c2b7] bg-[#c9c2b7] sm:grid-cols-5">
                  {[
                    [
                      "Evidence",
                      stat(config.includeEvidence ? data.evidence?.length : null),
                    ],
                    [
                      "Entities",
                      stat(config.includeEntities ? data.entities?.length : null),
                    ],
                    [
                      "Leads",
                      stat(config.includeLeads ? data.leads?.length : null),
                    ],
                    [
                      "Gaps",
                      stat(config.includeGaps ? data.gaps?.length : null),
                    ],
                    [
                      "Hypotheses",
                      stat(config.includeHypotheses ? data.hypotheses?.length : null),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#ffffff] px-4 py-3">
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.25em] text-[#67615a]">
                        {label}
                      </div>
                      <div className="mt-1 font-mono text-xl font-extralight tracking-wide text-[#1a1815]">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Detail tables ────────────────────────────────────── */}
            {config.layout === "full" ? (
              <FullLayout data={data} config={config} />
            ) : (
              <CondensedLayout
                data={data}
                config={config}
                enabledSection={enabledSection}
              />
            )}

            {/* ── Empty/unavailable notes ──────────────────────────── */}
            {sections.map((section) => {
              if (!enabledSection(section.key)) return null;
              const value =
                section.key === "includeEntities"
                  ? data.entities
                  : section.key === "includeEvidence"
                    ? data.evidence
                    : section.key === "includeLeads"
                      ? data.leads
                      : section.key === "includeGaps"
                        ? data.gaps
                        : data.hypotheses;
              const isEmpty = value === null || value?.length === 0;
              if (!isEmpty) return null;
              return (
                <section key={section.key} className="mt-8">
                  <SectionHeading title={section.title} />
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-[#67615a]">
                    {value === null
                      ? "Unavailable in this mode"
                      : "None recorded"}
                  </p>
                </section>
              );
            })}

            {/* ── Footer ───────────────────────────────────────────── */}
            <footer className="mt-12 flex items-center justify-between border-t border-[#c9c2b7] pt-4">
              <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-[#67615a]">
                INDAGO // Analytical workspace
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-[#67615a]">
                {workspace.workspaceId}
              </span>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function FullLayout({
  data,
  config,
}: {
  readonly data: CaseReportData;
  readonly config: CaseReportConfig;
}) {
  const cap = config.rowCap;

  return (
    <>
      {config.includeEntities && data.entities && data.entities.length > 0 && (
        <section className="mt-9">
          <SectionHeading
            title="Entity register"
            counts={{ total: data.entities.length, cap }}
          />
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-[#c9c2b7]">
                <th className={TH}>Name</th>
                <th className={TH}>Status</th>
                <th className={TH}>Source identifiers</th>
              </tr>
            </thead>
            <tbody>
              {data.entities.slice(0, cap).map((entity) => (
                <tr key={entity.id} className="border-b border-[#e3ded4]">
                  <td className={TD}>{entity.canonicalName}</td>
                  <td className={TD}>{entity.status}</td>
                  <td className={TD}>
                    {listCell(entity.sourceIdentifiers?.length)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {config.includeEvidence && data.evidence && data.evidence.length > 0 && (
        <section className="mt-9">
          <SectionHeading
            title="Evidence"
            counts={{ total: data.evidence.length, cap }}
          />
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-[#c9c2b7]">
                <th className={TH}>Title</th>
                <th className={TH}>Type</th>
                <th className={TH}>Status</th>
                <th className={TH}>Source ref</th>
                <th className={TH}>Observed</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.slice(0, cap).map((item) => (
                <tr key={item.id} className="border-b border-[#e3ded4]">
                  <td className={TD}>{item.title}</td>
                  <td className={TD}>{item.type}</td>
                  <td className={TD}>{item.status}</td>
                  <td className={TD}>{listCell(item.sourceRef)}</td>
                  <td className={TD}>{formatObservedAt(item.observedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {config.includeLeads && data.leads && data.leads.length > 0 && (
        <section className="mt-9">
          <SectionHeading
            title="Leads"
            counts={{ total: data.leads.length, cap }}
          />
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-[#c9c2b7]">
                <th className={TH}>Title</th>
                <th className={TH}>Status</th>
                <th className={TH}>Priority</th>
                <th className={TH}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.slice(0, cap).map((lead) => (
                <tr key={lead.id} className="border-b border-[#e3ded4]">
                  <td className={TD}>{lead.title}</td>
                  <td className={TD}>{lead.status}</td>
                  <td className={TD}>{lead.priority}</td>
                  <td className={TD}>{lead.confidence?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {config.includeGaps && data.gaps && data.gaps.length > 0 && (
        <section className="mt-9">
          <SectionHeading
            title="Investigative gaps"
            counts={{ total: data.gaps.length, cap }}
          />
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-[#c9c2b7]">
                <th className={TH}>Title</th>
                <th className={TH}>Type</th>
                <th className={TH}>Status</th>
                <th className={TH}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps.slice(0, cap).map((gap) => (
                <tr key={gap.id} className="border-b border-[#e3ded4]">
                  <td className={TD}>{gap.title}</td>
                  <td className={TD}>{gap.type}</td>
                  <td className={TD}>{gap.status}</td>
                  <td className={TD}>{gap.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {config.includeHypotheses && data.hypotheses && data.hypotheses.length > 0 && (
        <section className="mt-9">
          <SectionHeading
            title="Working hypotheses"
            counts={{ total: data.hypotheses.length, cap }}
          />
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-[#c9c2b7]">
                <th className={TH}>Hypothesis</th>
                <th className={TH}>Status</th>
                <th className={TH}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.hypotheses.slice(0, cap).map((hypothesis) => (
                <tr key={hypothesis.id} className="border-b border-[#e3ded4]">
                  <td className={`${TD} max-w-[46ch]`}>
                    <div className="font-semibold text-[#1a1815]">
                      {hypothesis.title}
                    </div>
                    <div className="mt-0.5 text-[#45403a]">
                      {hypothesis.statement}
                    </div>
                  </td>
                  <td className={TD}>{hypothesis.status}</td>
                  <td className={TD}>{hypothesis.confidence?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function CondensedLayout({
  data,
  config,
  enabledSection,
}: {
  readonly data: CaseReportData;
  readonly config: CaseReportConfig;
  readonly enabledSection: (key: keyof CaseReportConfig) => boolean;
}) {
  const cap = config.rowCap;

  const entityRows: Array<{ title: string; meta: string }> = (data.entities ?? [])
    .slice(0, cap)
    .map((entity) => ({
      title: entity.canonicalName,
      meta: [entity.status, entity.sourceIdentifiers?.length
        ? `${entity.sourceIdentifiers.length} ids`
        : undefined]
        .filter(Boolean)
        .join(" · "),
    }));

  const evidenceRows: Array<{ title: string; meta: string }> = (data.evidence ?? [])
    .slice(0, cap)
    .map((item) => ({
      title: item.title,
      meta: [item.type, item.status, listCell(item.sourceRef, undefined)].filter(Boolean).join(" · "),
    }));

  const leadRows: Array<{ title: string; meta: string }> = (data.leads ?? [])
    .slice(0, cap)
    .map((lead) => ({
      title: lead.title,
      meta: [lead.status, lead.priority, lead.confidence !== undefined ? `${lead.confidence.toFixed(2)} conf` : undefined]
        .filter(Boolean)
        .join(" · "),
    }));

  const gapRows: Array<{ title: string; meta: string }> = (data.gaps ?? [])
    .slice(0, cap)
    .map((gap) => ({
      title: gap.title,
      meta: [gap.type, gap.status, gap.priority].filter(Boolean).join(" · "),
    }));

  const hypothesisRows: Array<{ title: string; meta: string }> = (data.hypotheses ?? [])
    .slice(0, cap)
    .map((hypothesis) => ({
      title: hypothesis.title,
      meta: [hypothesis.status, hypothesis.confidence !== undefined ? `${hypothesis.confidence.toFixed(2)} conf` : undefined]
        .filter(Boolean)
        .join(" · "),
    }));

  const groups: Array<{
    key: keyof CaseReportConfig;
    title: string;
    rows: Array<{ title: string; meta: string }>;
    total: number;
  }> = [
    {
      key: "includeEntities",
      title: "Entity register",
      rows: entityRows,
      total: (data.entities ?? []).length,
    },
    {
      key: "includeEvidence",
      title: "Evidence",
      rows: evidenceRows,
      total: (data.evidence ?? []).length,
    },
    {
      key: "includeLeads",
      title: "Leads",
      rows: leadRows,
      total: (data.leads ?? []).length,
    },
    {
      key: "includeGaps",
      title: "Investigative gaps",
      rows: gapRows,
      total: (data.gaps ?? []).length,
    },
    {
      key: "includeHypotheses",
      title: "Working hypotheses",
      rows: hypothesisRows,
      total: (data.hypotheses ?? []).length,
    },
  ];

  return (
    <>
      {groups.map((group) => {
        if (!enabledSection(group.key)) return null;
        if (group.rows.length === 0) return null;
        return (
          <section key={group.key} className="mt-9">
            <SectionHeading title={group.title} counts={{ total: group.total, cap }} />
            <ul className="mt-3 divide-y divide-[#e3ded4]">
              {group.rows.map((row) => (
                <li
                  key={row.title}
                  className="flex items-baseline justify-between gap-6 py-2"
                >
                  <span className={TD}>{row.title}</span>
                  <span className="shrink-0 text-right font-mono text-[8px] uppercase tracking-widest text-[#67615a]">
                    {row.meta}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function SectionHeading({
  title,
  counts,
}: {
  readonly title: string;
  readonly counts?: {
    readonly total: number;
    readonly cap: number;
  };
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[#1a1815] pb-1.5">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#1a1815]">
        {title}
      </span>
      {counts && (
        <span className="font-mono text-[8px] uppercase tracking-widest text-[#67615a]">
          {counts.total > counts.cap
            ? `${counts.total} total · first ${counts.cap} shown`
            : `${counts.total} total`}
        </span>
      )}
    </div>
  );
}