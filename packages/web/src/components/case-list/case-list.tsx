"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { Case, GraphNode, GraphEdge } from "@indago/contracts";
import type {
  CaseProvider,
  AppDataMode,
  DashboardEnrichment,
} from "@/lib/providers";
import { toProviderError } from "@/lib/providers";
import { investigationUrl } from "@/lib/workspace/url";
import {
  GN_BANK,
  GN_VICTOR,
  GN_MARIA,
  GN_SHELL_ONE,
  GN_SHELL_TWO,
  GN_WITNESS,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  GN_A_CALLAHAN,
  GN_A_RICO,
  GN_A_WJA,
  GN_A_FBI,
  GN_A_SOCTF,
  GN_A_MCGUIGAN,
  GN_B_CALLAHAN,
  GN_B_RICO,
  GN_B_WJA,
  GN_B_FBI,
  GN_B_WHEELER,
  GN_B_SHC,
} from "@/lib/providers/real-case/lookup";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

function statusBadge(status: Case["status"]): {
  variant: BadgeVariant;
  pulse: boolean;
} {
  switch (status) {
    case "OPEN":
      return { variant: "info", pulse: true };
    case "ACTIVE":
      return { variant: "accent", pulse: true };
    case "CLOSED":
      return { variant: "muted", pulse: false };
    case "ARCHIVED":
      return { variant: "muted", pulse: false };
  }
}

function formatUpdated(value: { value: string }): string {
  const d = new Date(value.value);
  if (Number.isNaN(d.getTime())) return value.value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Plain YYYY-MM-DD projection for incident windows and telemetry. */
function shortIso(value: string): string {
  return value.slice(0, 10);
}

function formatIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Latest updatedAt across a list of timestamped workspace entries. */
function latestUpdate(entries: readonly { updatedAt: { value: string } }[]): string {
  let max = "";
  for (const e of entries) if (e.updatedAt.value > max) max = e.updatedAt.value;
  return max || "1970-01-01T00:00:00.000Z";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

interface CaseCardProps {
  readonly caseItem: Case;
  readonly mode: AppDataMode;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
  readonly featured?: boolean;
  /** Per-case real graph projection for the mini topology preview (present
   *  only when the workspace can genuinely serve one). */
  readonly nodes?: readonly GraphNode[];
  readonly edges?: readonly GraphEdge[];
}

function CaseCard({ caseItem, mode, selected, disabled, onToggle, featured, nodes, edges }: CaseCardProps) {
  const badge = statusBadge(caseItem.status);
  const primaryInvestigation = caseItem.investigationIds[0];

  if (featured) {
    return (
      <li className="rounded-xl border border-semantic-border bg-semantic-surface transition-colors duration-fast">
        <div className="flex items-start justify-between gap-4 p-8 pb-0">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[1.125rem] font-medium text-semantic-foreground leading-snug">
                {caseItem.title}
              </h3>
              <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
                {caseItem.status}
              </Badge>
              {mode === "demo" && <Badge variant="default">Demo</Badge>}
            </div>
            {caseItem.description && (
              <p className="text-sm text-semantic-foreground-muted leading-relaxed max-w-2xl">
                {caseItem.description}
              </p>
            )}
          </div>
          <input
            type="checkbox"
            aria-label={`Select ${caseItem.title}`}
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(caseItem.id)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-semantic-border-subtle accent-accent-rose"
          />
        </div>

        <div className="mx-8 mt-6 grid grid-cols-2 gap-px bg-semantic-border-subtle rounded-lg overflow-hidden sm:grid-cols-4">
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Evidence
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.evidenceIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Entities
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.entityIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Investigations
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.investigationIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Sources
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.sourceIds.length).padStart(2, "0")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-8 mt-5 font-mono text-[10px] text-semantic-foreground-faint">
          {caseItem.jurisdiction && (
            <span className="uppercase tracking-widest">Jurisdiction {caseItem.jurisdiction}</span>
          )}
          <span className="uppercase tracking-widest">Updated {formatUpdated(caseItem.updatedAt)}</span>
          {caseItem.labels && caseItem.labels.length > 0 && (
            <span className="uppercase tracking-widest">
              {caseItem.labels.map((l) => l.value).join(" · ")}
            </span>
          )}
        </div>

        <div className="mx-8 mt-5 pt-5 border-t border-semantic-border-subtle flex items-center justify-between">
          {primaryInvestigation ? (
            <Link
              href={investigationUrl(primaryInvestigation, caseItem.id)}
              className="group/link inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
            >
              Open investigation
              <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
            </Link>
          ) : (
            <p className="type-caption text-semantic-foreground-faint">No investigations yet.</p>
          )}
          <span className="font-mono text-[10px] text-semantic-foreground-faint">
            {caseItem.id.slice(0, 8)}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-xl border border-semantic-border bg-semantic-surface p-5 transition-colors duration-fast hover:border-semantic-border hover:bg-semantic-surface-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-semantic-foreground">
              {caseItem.title}
            </h3>
            {mode === "demo" && <Badge variant="default">Demo</Badge>}
          </div>
          {caseItem.description && (
            <p className="mt-1 line-clamp-2 text-xs text-semantic-foreground-muted leading-relaxed">
              {caseItem.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Select ${caseItem.title}`}
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(caseItem.id)}
            className="h-4 w-4 rounded border-semantic-border-subtle accent-accent-rose"
          />
          <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
            {caseItem.status}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-semantic-foreground-faint">
        <span>{caseItem.evidenceIds.length} evidence</span>
        <span className="text-semantic-border-subtle">·</span>
        <span>{caseItem.entityIds.length} entities</span>
        <span className="text-semantic-border-subtle">·</span>
        <span>{caseItem.investigationIds.length} investigation{caseItem.investigationIds.length === 1 ? "" : "s"}</span>
        {caseItem.jurisdiction && (
          <>
            <span className="text-semantic-border-subtle">·</span>
            <span>{caseItem.jurisdiction}</span>
          </>
        )}
        <span className="ml-auto uppercase tracking-widest">
          Updated {formatUpdated(caseItem.updatedAt)}
        </span>
      </div>

      {nodes && nodes.length > 0 && (
        <div className="mt-3 rounded-xl border border-semantic-border-subtle bg-semantic-background p-4">
          <NetworkMiniMap nodes={nodes} edges={edges ?? []} />
          <div className="mt-3 flex items-center justify-between border-t border-semantic-border-subtle pt-3 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
            <span>Topology · {nodes.length} nodes</span>
            <span>{edges?.length ?? 0} edges</span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-semantic-border-subtle">
        {primaryInvestigation ? (
          <Link
            href={investigationUrl(primaryInvestigation, caseItem.id)}
            className="group/link inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
          >
            Open investigation
            <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
          </Link>
        ) : (
          <p className="type-caption text-semantic-foreground-faint">No investigations yet.</p>
        )}
      </div>
    </li>
  );
}

function SectionOverline({ label, className }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
        {label}
      </span>
      <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
    </div>
  );
}

// ============================================================================
// Network mini preview — a STATIC, lightweight SVG projection of the ACTIVE
// investigation topology. It renders the real canonical graph nodes/edges
// (last-verified projection v3 of Operation Financial Shadow). This is display
// work only — it is NOT the graph surface, is not interactive, and makes no
// claim beyond the data it draws (hub-and-spoke layout, contradicted edge in
// rose dash, weak edge in faint dash). Node positions are a deterministic
// layout hint keyed by fixture node id; unknown ids degrade to omission.
// ============================================================================

const MINI_LAYOUT: Record<string, [number, number]> = {
  // Operation Financial Shadow (hub-and-spoke around the intermediary account)
  [GN_BANK]: [170, 56],
  [GN_VICTOR]: [46, 132],
  [GN_MARIA]: [36, 240],
  [GN_SHELL_ONE]: [294, 132],
  [GN_SHELL_TWO]: [304, 240],
  [GN_WITNESS]: [96, 348],
  // Real Case A (Connecticut) — World Jai Alai hub with the security/LE network
  [GN_A_WJA]: [170, 60],
  [GN_A_CALLAHAN]: [60, 148],
  [GN_A_RICO]: [280, 148],
  [GN_A_SOCTF]: [60, 290],
  [GN_A_FBI]: [280, 290],
  [GN_A_MCGUIGAN]: [170, 356],
  // Real Case B (Tulsa) — WJA hub with Wheeler's ownership line; FBI is
  // deliberately alone (isolated node in the real graph, no edges).
  [GN_B_WJA]: [170, 60],
  [GN_B_CALLAHAN]: [60, 148],
  [GN_B_RICO]: [280, 148],
  [GN_B_WHEELER]: [60, 290],
  [GN_B_FBI]: [280, 290],
  [GN_B_SHC]: [170, 356],
};

function collapseLabel(label: string): string {
  if (label.length <= 20) return label;
  const cut = label.slice(0, 20).split(" ").slice(0, -1).join(" ");
  return cut.length > 0 ? cut : label.slice(0, 19);
}

function NetworkMiniMap({
  nodes,
  edges,
}: {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}) {
  const nodePos = (id: string): [number, number] | null => MINI_LAYOUT[id] ?? null;
  const mapped = nodes.filter((n) => nodePos(n.id));

  return (
    <svg
      viewBox="0 0 340 384"
      className="h-auto w-full select-none"
      role="img"
      aria-label="Preview of the active investigation topology"
    >
      <defs>
        <radialGradient id="mini-hub-halo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopOpacity="0.12"
            style={{ stopColor: "var(--color-semantic-accent)" }}
          />
          <stop
            offset="100%"
            stopOpacity="0"
            style={{ stopColor: "var(--color-semantic-accent)" }}
          />
        </radialGradient>
      </defs>

      <circle cx={170} cy={56} r={88} fill="url(#mini-hub-halo)" />

      <g>
        {edges.map((e) => {
          const s = nodePos(e.sourceNodeId);
          const t = nodePos(e.targetNodeId);
          if (!s || !t) return null;
          const contradicted = e.status === "CONTRADICTED";
          const weak = e.support <= 0.35;
          return (
            <line
              key={e.id}
              x1={s[0]}
              y1={s[1]}
              x2={t[0]}
              y2={t[1]}
              strokeWidth={1}
              strokeDasharray={contradicted || weak ? "3 3" : undefined}
              opacity={contradicted ? 0.9 : weak ? 0.45 : 0.6}
              style={{
                stroke: contradicted
                  ? "var(--color-semantic-contradiction)"
                  : "var(--color-semantic-foreground-faint)",
              }}
            />
          );
        })}
      </g>

      <g>
        {mapped.map((n) => {
          const p = nodePos(n.id);
          if (!p) return null;
          const [x, y] = p;
          const isEntity = n.type === "ENTITY";
          const isHub = n.structuralImportance >= 0.9;
          const r = Math.max(6, Math.min(13, 5 + n.structuralImportance * 10));
          return (
            <g key={n.id}>
              <circle
                cx={x}
                cy={y}
                r={r}
                strokeWidth={1}
                strokeDasharray={isEntity ? undefined : "2 2"}
                style={{
                  fill: isEntity ? "var(--color-semantic-surface-elevated)" : "transparent",
                  stroke: isHub || !isEntity
                    ? "var(--color-semantic-accent)"
                    : "var(--color-semantic-foreground-faint)",
                }}
              />
              <text
                x={x}
                y={y + r + 12}
                textAnchor="middle"
                fill="currentColor"
                className="font-mono text-[9px] text-semantic-foreground-faint"
              >
                {collapseLabel(n.label)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ============================================================================
// Dashboard command center — one coherent 12-column composition rendered only
// when a genuine demo workspace enrichment is present. Every number is derived
// from real case/lead/gap/contradiction/graph data; nothing is fabricated.
// ============================================================================

interface MetricCell {
  readonly label: string;
  readonly value: string;
  readonly sub: string;
}

function MetricBand({
  aggregates,
  enrichment,
}: {
  readonly aggregates: Aggregates;
  readonly enrichment: DashboardEnrichment;
}) {
  const activeCount = aggregates.statusCounts.ACTIVE ?? 0;
  const openLeads = enrichment.leads.filter(
    (l) => l.status === "ACTIVE" || l.status === "NEW",
  ).length;
  const openGaps = enrichment.gaps.filter(
    (g) =>
      g.status === "UNDER_REVIEW" ||
      g.status === "IDENTIFIED" ||
      g.status === "EVIDENCE_REQUESTED" ||
      g.status === "WAITING_FOR_EVIDENCE",
  ).length;

  const cells: MetricCell[] = [
    {
      label: "Active investigations",
      value: pad(aggregates.investigations),
      sub: `${activeCount} active`,
    },
    { label: "Evidence items", value: pad(aggregates.evidence), sub: `${enrichment.evidence.length} on file` },
    { label: "Entities", value: pad(aggregates.entities), sub: "named parties" },
    { label: "Leads", value: pad(enrichment.leads.length), sub: `${openLeads} open` },
    { label: "Investigative gaps", value: pad(enrichment.gaps.length), sub: `${openGaps} unresolved` },
    {
      label: "Contradictions",
      value: pad(enrichment.contradictions.length),
      sub: "unresolved",
    },
    { label: "Sources", value: pad(enrichment.sources.length), sub: `${enrichment.sources.length} ingested` },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-semantic-border-subtle bg-semantic-border-subtle md:grid-cols-4 xl:grid-cols-7">
      {cells.map((c) => (
        <div key={c.label} className="bg-semantic-surface px-6 py-5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            {c.label}
          </span>
          <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
            {c.value}
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
            {c.sub}
          </p>
        </div>
      ))}
    </div>
  );
}

function FeaturedPanel({
  caseItem,
  mode,
  enrichment,
}: {
  readonly caseItem: Case;
  readonly mode: AppDataMode;
  readonly enrichment: DashboardEnrichment;
}) {
  const badge = statusBadge(caseItem.status);
  const primaryInvestigation = caseItem.investigationIds[0];
  const investigation = enrichment.investigation;
  const windowFrom = enrichment.investigation.temporalScope?.validFrom?.value;
  const windowTo = enrichment.investigation.temporalScope?.validTo?.value;

  const stats = [
    { label: "Evidence", value: pad(caseItem.evidenceIds.length) },
    { label: "Entities", value: pad(caseItem.entityIds.length) },
    { label: "Leads", value: pad(enrichment.leads.length) },
    { label: "Gaps", value: pad(enrichment.gaps.length) },
    { label: "Confidence", value: investigation.confidence?.toFixed(2) ?? "—" },
    { label: "Priority", value: String(investigation.priority) },
  ];

  return (
    <article className="overflow-hidden rounded-2xl border border-semantic-border bg-semantic-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-semantic-border-subtle px-8 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            Featured investigation
          </span>
          <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
            {caseItem.status}
          </Badge>
          {mode === "demo" && <Badge variant="default">Demo</Badge>}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
          {caseItem.id.slice(0, 8)}
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative px-8 pb-7 pt-8">
          <h2 className="font-display text-[2rem] font-light tracking-[-0.02em] leading-tight text-semantic-foreground">
            {caseItem.title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-semantic-foreground-muted">
            {caseItem.description}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {caseItem.jurisdiction && (
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                  Jurisdiction
                </dt>
                <dd className="mt-0.5 text-xs text-semantic-foreground">{caseItem.jurisdiction}</dd>
              </div>
            )}
            {windowFrom && windowTo && (
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                  Incident window
                </dt>
                <dd className="mt-0.5 font-mono text-[10px] text-semantic-foreground">
                  {shortIso(windowFrom)} → {shortIso(windowTo)}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                Opened
              </dt>
              <dd className="mt-0.5 text-xs text-semantic-foreground">{formatUpdated(caseItem.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                Last updated
              </dt>
              <dd className="mt-0.5 text-xs text-semantic-foreground">{formatUpdated(caseItem.updatedAt)}</dd>
            </div>
            {caseItem.labels && caseItem.labels.length > 0 && (
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                  Classification
                </dt>
                <dd className="mt-0.5 text-xs text-semantic-foreground">
                  {caseItem.labels.map((l) => l.value).join(" · ")}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-semantic-border-subtle sm:grid-cols-6">
            {stats.map((s) => (
              <div key={s.label} className="bg-semantic-surface px-4 py-3 text-center">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  {s.label}
                </span>
                <p className="mt-0.5 font-mono text-base font-light text-semantic-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border-subtle pt-5">
            {primaryInvestigation ? (
              <Link
                href={investigationUrl(primaryInvestigation, caseItem.id)}
                className="group/link inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
              >
                Open investigation
                <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
              </Link>
            ) : (
              <p className="type-caption text-semantic-foreground-faint">No investigations yet.</p>
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
              {investigation.title}
            </span>
          </div>
        </div>

        <div className="border-t border-semantic-border-subtle px-8 pb-7 pt-6 lg:border-l lg:border-t-0">
          <div className="rounded-xl border border-semantic-border-subtle bg-semantic-background p-4">
            <NetworkMiniMap
              nodes={enrichment.graphNodes}
              edges={enrichment.graphEdges}
            />
            <div className="mt-3 flex items-center justify-between border-t border-semantic-border-subtle pt-3 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
              <span>Topology · {enrichment.graphNodes.length} nodes</span>
              <span>{enrichment.graphEdges.length} edges</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

interface AttentionRow {
  readonly kind: string;
  readonly meta: string;
  readonly title: string;
  readonly why: string;
  readonly href: string;
}

function buildAttentionRows(enrichment: DashboardEnrichment, caseId: string): AttentionRow[] {
  const inv = enrichment.investigationId;
  const u = (sub?: string) => investigationUrl(inv, caseId, sub);
  const rows: AttentionRow[] = [];

  for (const c of enrichment.contradictions) {
    rows.push({
      kind: "Contradiction",
      meta: c.contradictionType,
      title: `Strength ${c.strength.toFixed(2)} — ${c.leftObservationId} ↔ ${c.rightObservationId}`,
      why: c.description.length > 120 ? `${c.description.slice(0, 119)}…` : c.description,
      href: u("observations"),
    });
  }

  const gaps = [...enrichment.gaps]
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3))
    .slice(0, 2);
  for (const g of gaps) {
    rows.push({
      kind: "Open gap",
      meta: `${g.priority} · ${g.status}`,
      title: g.title,
      why: g.description.length > 120 ? `${g.description.slice(0, 119)}…` : g.description,
      href: u("gaps"),
    });
  }

  const leads = [...enrichment.leads]
    .filter((l) => l.status === "ACTIVE" || l.status === "NEW")
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3))
    .slice(0, 1);
  for (const l of leads) {
    rows.push({
      kind: "Lead",
      meta: `${l.priority} · confidence ${l.confidence.toFixed(2)}`,
      title: l.title,
      why: l.description.length > 120 ? `${l.description.slice(0, 119)}…` : l.description,
      href: u("leads"),
    });
  }

  return rows;
}

function RequiresAttention({
  enrichment,
  caseId,
}: {
  readonly enrichment: DashboardEnrichment;
  readonly caseId: string;
}) {
  const rows = buildAttentionRows(enrichment, caseId);
  if (rows.length === 0) return null;

  return (
    <section aria-label="Requires attention">
      <SectionOverline label="Requires attention" className="flex items-center gap-3" />
      <ol className="mt-4 divide-y divide-semantic-border-subtle overflow-hidden rounded-xl border border-semantic-border-subtle bg-semantic-surface">
        {rows.map((r, i) => (
          <li key={`${r.kind}-${i}`} className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="type-section text-semantic-foreground-muted">{r.kind}</span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                {r.meta}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium leading-snug text-semantic-foreground">{r.title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-semantic-foreground-muted">{r.why}</p>
            <div className="mt-2.5">
              <Link
                href={r.href}
                className="group/link inline-flex items-center gap-1.5 text-xs font-medium text-accent-rose"
              >
                {r.kind === "Contradiction" ? "Review" : "Pursue"}
                <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ActivityRow {
  readonly time: string;
  readonly label: string;
  readonly sub: string;
  readonly href?: string;
}

function buildActivityRows(
  caseItem: Case,
  enrichment: DashboardEnrichment,
): ActivityRow[] {
  const inv = enrichment.investigationId;
  const caseId = caseItem.id;
  const u = (sub?: string) => investigationUrl(inv, caseId, sub);
  const investigation = enrichment.investigation;

  return [
    {
      time: caseItem.createdAt.value,
      label: "Case file opened",
      sub: `case ${caseItem.id.slice(0, 8)}`,
    },
    {
      time: caseItem.updatedAt.value,
      label: "Case file updated",
      sub: "boundary revision",
    },
    {
      time: investigation.createdAt.value,
      label: `Investigation started — ${investigation.title}`,
      sub: `priority ${investigation.priority}`,
      href: u(),
    },
    {
      time: latestUpdate(enrichment.evidence),
      label: "Evidence catalog updated",
      sub: `${enrichment.evidence.length} items on file`,
      href: u("evidence"),
    },
    {
      time: latestUpdate(enrichment.observations),
      label: "Observations journal updated",
      sub: `${enrichment.observations.length} records`,
      href: u("observations"),
    },
    {
      time: latestUpdate(enrichment.sources),
      label: "Source catalogs ingested",
      sub: `${enrichment.sources.length} sources`,
    },
  ];
}

function RecentActivity({
  caseItem,
  enrichment,
}: {
  readonly caseItem: Case;
  readonly enrichment: DashboardEnrichment;
}) {
  const rows = buildActivityRows(caseItem, enrichment);

  return (
    <section aria-label="Recent activity">
      <SectionOverline label="Recent activity" className="flex items-center gap-3" />
      <ol className="mt-4 divide-y divide-semantic-border-subtle overflow-hidden rounded-xl border border-semantic-border-subtle bg-semantic-surface">
        {rows.map((r) => {
          const content = (
            <>
              <div className="min-w-0">
                <span className="block truncate text-sm text-semantic-foreground">{r.label}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                  {r.sub}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-semantic-foreground-faint">
                {formatIso(r.time)}
              </span>
            </>
          );
          return r.href ? (
            <li key={r.time + r.label}>
              <Link
                href={r.href}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-fast hover:bg-semantic-surface-elevated"
              >
                {content}
              </Link>
            </li>
          ) : (
            <li key={r.time + r.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
              {content}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function QuickActions({
  enrichment,
  caseId,
}: {
  readonly enrichment: DashboardEnrichment;
  readonly caseId: string;
}) {
  const inv = enrichment.investigationId;
  const u = (sub?: string) => investigationUrl(inv, caseId, sub);
  const actions = [
    { label: "Open investigation", hint: "workspace", href: u() },
    { label: "Evidence catalog", hint: `${enrichment.evidence.length} items`, href: u("evidence") },
    { label: "Leads queue", hint: `${enrichment.leads.length} leads`, href: u("leads") },
    { label: "Gaps ledger", hint: `${enrichment.gaps.length} gaps`, href: u("gaps") },
    { label: "Observations journal", hint: `${enrichment.observations.length} records`, href: u("observations") },
  ];

  return (
    <section aria-label="Quick actions">
      <SectionOverline label="Quick actions" className="flex items-center gap-3" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="group rounded-xl border border-semantic-border-subtle bg-semantic-surface px-4 py-3.5 transition-colors duration-fast hover:border-semantic-border hover:bg-semantic-surface-elevated"
          >
            <span className="block text-xs font-medium text-semantic-foreground">{a.label}</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
              {a.hint}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

interface Aggregates {
  readonly evidence: number;
  readonly entities: number;
  readonly investigations: number;
  readonly sources: number;
  readonly total: number;
  readonly statusCounts: Record<string, number>;
}

interface DashboardPanelsProps {
  readonly caseItem: Case;
  readonly mode: AppDataMode;
  readonly enrichment: DashboardEnrichment;
  readonly aggregates: Aggregates;
  readonly items: Case[];
  readonly allSelected: boolean;
  readonly selected: string[];
  readonly deleting: boolean;
  readonly pendingDelete: "selected" | "all" | null;
  readonly deleteError: string | null;
  readonly onToggleAll: () => void;
  readonly onDeleteSelected: () => void;
  readonly onDeleteAll: () => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
}

function DashboardPanels({
  caseItem,
  mode,
  enrichment,
  aggregates,
  items,
  allSelected,
  selected,
  deleting,
  pendingDelete,
  deleteError,
  onToggleAll,
  onDeleteSelected,
  onDeleteAll,
  onCancelDelete,
  onConfirmDelete,
}: DashboardPanelsProps) {
  const badge = statusBadge(caseItem.status);
  const windowFrom = caseItem.incidentDateRange?.validFrom?.value;
  const windowTo = caseItem.incidentDateRange?.validTo?.value;

  return (
    <div className="space-y-10">
      {/* Operational telemetry header */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            Operational telemetry
          </span>
          <span className="h-px w-16 bg-semantic-border-subtle" aria-hidden="true" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
            {caseItem.status}
          </Badge>
          {caseItem.jurisdiction && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
              Jurisdiction {caseItem.jurisdiction}
            </span>
          )}
          {windowFrom && windowTo && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
              Incident {shortIso(windowFrom)} → {shortIso(windowTo)}
            </span>
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
            Updated {formatUpdated(caseItem.updatedAt)}
          </span>
        </div>
      </div>

      <MetricBand aggregates={aggregates} enrichment={enrichment} />

      {/* Command grid — featured 8 / attention 4; activity 8 / quick actions 4 */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <FeaturedPanel caseItem={caseItem} mode={mode} enrichment={enrichment} />
          <RecentActivity caseItem={caseItem} enrichment={enrichment} />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <RequiresAttention enrichment={enrichment} caseId={caseItem.id} />
          <QuickActions enrichment={enrichment} caseId={caseItem.id} />
        </div>
      </div>

      {/* Case file management (selection + delete) */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            Case file
          </span>
          <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          <label className="inline-flex items-center gap-2 text-[11px] font-mono text-semantic-foreground-faint">
            <input
              type="checkbox"
              aria-label="Select all cases"
              checked={allSelected}
              disabled={deleting}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 rounded border-semantic-border-subtle accent-accent-rose"
            />
            {items.length} case{items.length === 1 ? "" : "s"}
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={selected.length === 0 || deleting}
              onClick={onDeleteSelected}
            >
              Delete selected
              {selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
            <Button variant="ghost" size="sm" disabled={deleting} onClick={onDeleteAll}>
              Delete all cases
            </Button>
          </div>
        </div>

        {deleteError && <ErrorDisplay title="Could not delete case" message={deleteError} />}

        {pendingDelete && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3"
          >
            <p className="text-xs text-semantic-foreground-muted">
              {pendingDelete === "all"
                ? `Delete all ${items.length} case${items.length === 1 ? "" : "s"}?`
                : `Delete ${selected.length} selected case${selected.length === 1 ? "" : "s"}?`}{" "}
              This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={deleting} onClick={onCancelDelete}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" loading={deleting} onClick={onConfirmDelete}>
                Confirm delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CaseListProps {
  readonly cases: CaseProvider;
  readonly mode: AppDataMode;
  readonly enrichment?: DashboardEnrichment;
  /** Per-case real graph projection for mini topology previews (demo mode
   *  only; genuinely derived from the same fixtures the cases are served from). */
  readonly topology?: Readonly<Record<string, { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] }>>;
}

export function CaseList({ cases, mode, enrichment, topology }: CaseListProps) {
  const [items, setItems] = useState<Case[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<"selected" | "all" | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await cases.list({ pageSize: 100 });
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
  }, [cases]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.length === items!.length ? [] : items!.map((c) => c.id),
    );
  }, [items]);

  const runDelete = useCallback(
    async (ids: string[]) => {
      setDeleting(true);
      setDeleteError(null);
      let failed = false;
      for (const id of ids) {
        try {
          await cases.remove(id);
        } catch (err) {
          const pe = toProviderError(err);
          if (pe.code !== "NOT_FOUND") {
            setDeleteError(pe.message);
            failed = true;
            break;
          }
        }
      }
      if (!failed) {
        setPendingDelete(null);
        setSelected([]);
      }
      setDeleting(false);
      await load();
    },
    [cases, load],
  );

  const confirmDelete = useCallback(async () => {
    if (!items) return;
    const ids = pendingDelete === "all" ? items.map((c) => c.id) : selected;
    await runDelete(ids);
  }, [items, pendingDelete, selected, runDelete]);

  const isEmpty = !loading && !error && !unavailable && items !== null && items.length === 0;
  const allSelected = items !== null && items.length > 0 && selected.length === items.length;

  const aggregates = useMemo(() => {
    if (!items || items.length === 0) return null;
    const evidence = items.reduce((n, c) => n + c.evidenceIds.length, 0);
    const entities = items.reduce((n, c) => n + c.entityIds.length, 0);
    const investigations = items.reduce((n, c) => n + c.investigationIds.length, 0);
    const sources = items.reduce((n, c) => n + c.sourceIds.length, 0);
    const statusCounts: Record<string, number> = {};
    for (const c of items) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }
    return { evidence, entities, investigations, sources, total: items.length, statusCounts };
  }, [items]);

  const featured = items && items.length === 1 ? items[0] : null;
  const recentItems = useMemo(() => {
    if (!items || items.length <= 1) return [];
    return [...items]
      .sort((a, b) => new Date(b.updatedAt.value).getTime() - new Date(a.updatedAt.value).getTime())
      .slice(0, 3);
  }, [items]);

  const showCommandCenter = enrichment !== undefined && featured !== null && aggregates !== null;

  return (
    <div className="space-y-8 animate-fade-in">
      {unavailable ? (
        <EmptyState
          title="Case catalog not available in live mode"
          description="The connected platform does not expose a case-list endpoint yet. Try demo mode to see the authored case catalog."
          action={<Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button>}
        />
      ) : error ? (
        <ErrorDisplay
          title="Could not load cases"
          message={error}
          retry={() => void load()}
        />
      ) : loading && items === null ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner label="Loading cases" />
        </div>
      ) : isEmpty ? (
        <EmptyState title="No cases" description="There are no cases to display in this catalogue." />
      ) : items ? (
        showCommandCenter ? (
          <DashboardPanels
            caseItem={featured!}
            mode={mode}
            enrichment={enrichment!}
            aggregates={aggregates!}
            items={items}
            allSelected={allSelected}
            selected={selected}
            deleting={deleting}
            pendingDelete={pendingDelete}
            deleteError={deleteError}
            onToggleAll={toggleAll}
            onDeleteSelected={() => setPendingDelete("selected")}
            onDeleteAll={() => setPendingDelete("all")}
            onCancelDelete={() => setPendingDelete(null)}
            onConfirmDelete={() => void confirmDelete()}
          />
        ) : (
          <>
            {/* Aggregate KPI strip */}
            {aggregates && (
              <div className="grid grid-cols-2 gap-px bg-semantic-border-subtle rounded-xl overflow-hidden sm:grid-cols-4">
                <div className="bg-semantic-surface px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                    Investigations
                  </span>
                  <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                    {String(aggregates.total).padStart(2, "0")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {aggregates.statusCounts.ACTIVE && (
                      <span className="font-mono text-[9px] uppercase tracking-widest text-accent-amber">
                        {aggregates.statusCounts.ACTIVE} active
                      </span>
                    )}
                    {aggregates.statusCounts.OPEN && (
                      <span className="font-mono text-[9px] uppercase tracking-widest text-info">
                        {aggregates.statusCounts.OPEN} open
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-semantic-surface px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                    Evidence Items
                  </span>
                  <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                    {String(aggregates.evidence).padStart(2, "0")}
                  </p>
                </div>
                <div className="bg-semantic-surface px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                    Entities
                  </span>
                  <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                    {String(aggregates.entities).padStart(2, "0")}
                  </p>
                </div>
                <div className="bg-semantic-surface px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                    Active Investigations
                  </span>
                  <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                    {String(aggregates.investigations).padStart(2, "0")}
                  </p>
                </div>
              </div>
            )}

            {/* Investigations section */}
            <div>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  My investigations
                </span>
                <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
                <label className="inline-flex items-center gap-2 text-[11px] font-mono text-semantic-foreground-faint">
                  <input
                    type="checkbox"
                    aria-label="Select all cases"
                    checked={allSelected}
                    disabled={deleting}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-semantic-border-subtle accent-accent-rose"
                  />
                  {items.length} case{items.length === 1 ? "" : "s"}
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={selected.length === 0 || deleting}
                    onClick={() => setPendingDelete("selected")}
                  >
                    Delete selected
                    {selected.length > 0 ? ` (${selected.length})` : ""}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setPendingDelete("all")}
                  >
                    Delete all cases
                  </Button>
                </div>
              </div>

              {deleteError && (
                <ErrorDisplay title="Could not delete case" message={deleteError} />
              )}

              {pendingDelete && (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3"
                >
                  <p className="text-xs text-semantic-foreground-muted">
                    {pendingDelete === "all"
                      ? `Delete all ${items.length} case${items.length === 1 ? "" : "s"}?`
                      : `Delete ${selected.length} selected case${selected.length === 1 ? "" : "s"}?`}{" "}
                    This cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleting}
                      onClick={() => setPendingDelete(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleting}
                      onClick={() => void confirmDelete()}
                    >
                      Confirm delete
                    </Button>
                  </div>
                </div>
              )}

              {featured ? (
                <ul>
                  <CaseCard
                    key={featured.id}
                    caseItem={featured}
                    mode={mode}
                    selected={selected.includes(featured.id)}
                    disabled={deleting}
                    onToggle={toggleSelected}
                    featured
                    nodes={enrichment?.graphNodes}
                    edges={enrichment?.graphEdges}
                  />
                </ul>
              ) : (
                <ul className="grid gap-4 md:grid-cols-2">
                  {items.map((c) => (
                    <CaseCard
                      key={c.id}
                      caseItem={c}
                      mode={mode}
                      selected={selected.includes(c.id)}
                      disabled={deleting}
                      onToggle={toggleSelected}
                      nodes={topology?.[c.id]?.nodes ?? enrichment?.graphNodes}
                      edges={topology?.[c.id]?.edges ?? enrichment?.graphEdges}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Recent activity — only when enough cases to benefit from recency */}
            {recentItems.length > 0 && items.length > 3 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                    Recently updated
                  </span>
                  <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
                </div>
                <div className="space-y-px rounded-xl border border-semantic-border-subtle overflow-hidden">
                  {recentItems.map((c) => {
                    const inv = c.investigationIds[0];
                    return inv ? (
                      <Link
                        key={c.id}
                        href={investigationUrl(inv, c.id)}
                        className="flex items-center justify-between gap-4 bg-semantic-surface px-5 py-3.5 transition-colors duration-fast hover:bg-semantic-surface-elevated"
                      >
                        <div className="min-w-0">
                          <span className="text-sm text-semantic-foreground">
                            {c.title}
                          </span>
                          <span className="ml-3 font-mono text-[10px] text-semantic-foreground-faint uppercase tracking-widest">
                            {c.status}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-semantic-foreground-faint uppercase tracking-widest">
                          {formatUpdated(c.updatedAt)}
                        </span>
                      </Link>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  );
}