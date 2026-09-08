"use client";

// ============================================================================
// Real-Case Hypothesis Route Surface
//
// Read-only projection of the motive-investigation state for the Hypothesis
// route of the real Case-B workspace. It renders ONLY when the workspace
// genuinely carries the assessment seams (enriched Case B); OFS/live
// workspaces never hit this component (HypothesisWorkspace gates it) and it
// defensively returns null without a freeze.
//
// Honesty contract (mirrors the overview panel + data layer):
//   - Scores are investigative relevance — never a guilt or probability
//     statement.
//   - The physical corporate audit document is BLOCKED; the ingested reference
//     is the House-report public account (REPORT_TEXT_ACCOUNT).
//   - H1/H2/H3 rows, scores, statuses, and ranking come from the SAME merged
//     projection the overview panel consumes (shared mergeMotiveRows), so the
//     two surfaces can never drift apart. FOR/AGAINST sources come from the
//     data-layer readout when the workspace carries it and fall back to the
//     merged rows' sets otherwise. Observation / gap / lead content is loaded
//     from the workspace providers — the source of truth — never hardcoded
//     here.
// ============================================================================

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type { MotiveHypothesisKey } from "@/lib/providers/types";
import type {
  Investigation,
  Observation,
  Hypothesis,
  Lead,
  InvestigativeGap,
  GraphEdge,
} from "@indago/contracts";
import { Badge } from "@/components/ui/badge";
import { mergeMotiveRows, ScoreCell } from "./phase2-motive-panel";

interface SurfaceData {
  readonly investigation: Investigation | null;
  readonly observations: Observation[] | null;
  readonly edges: GraphEdge[] | null;
  readonly hypotheses: Hypothesis[] | null;
  readonly gaps: InvestigativeGap[] | null;
  readonly leads: Lead[] | null;
}

/** Load one list resource; unsupported/backend failures become an explicit
 *  "unavailable" state — never a silent empty array that looks like "no data". */
async function settleList<T>(
  load: () => Promise<{ items: T[] }>,
): Promise<T[] | null> {
  try {
    return (await load()).items;
  } catch {
    return null;
  }
}

export function Phase2HypothesisSurface({
  onRequestChallenge,
}: {
  readonly onRequestChallenge: () => void;
}) {
  const workspace = useWorkspace();
  const freeze = workspace.phase2AssessmentFreeze;
  const delta = workspace.phase2EvidenceDelta;

  const [data, setData] = useState<SurfaceData | null>(null);
  const [openKey, setOpenKey] = useState<MotiveHypothesisKey | null>(null);

  useEffect(() => {
    if (!freeze) return;
    let cancelled = false;
    (async () => {
      const investigationId = workspace.investigationId;
      const [investigation, observations, edges, hypotheses, gaps, leads] = await Promise.all([
        workspace.investigations
          .get(investigationId)
          .catch(() => null),
        settleList(() =>
          workspace.observations.listByInvestigation(investigationId, { pageSize: 200 }),
        ),
        // The graph edge set drives the cross-case connection gate below: the
        // H1 connection evidence is surfaceable ONLY when the Rico ↔ hitman
        // edge is a real ACTIVE graph row (the "?" hole is never served here).
        settleList(() =>
          workspace.graph.getEdges(investigationId, { pageSize: 200 }),
        ),
        settleList(() =>
          workspace.hypotheses.listByInvestigation(investigationId, { pageSize: 100 }),
        ),
        settleList(() =>
          workspace.gaps.listByInvestigation(investigationId, { pageSize: 100 }),
        ),
        settleList(() =>
          workspace.leads.listByInvestigation(investigationId, { pageSize: 100 }),
        ),
      ]);
      if (!cancelled) {
        setData({ investigation, observations, edges, hypotheses, gaps, leads });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, freeze]);

  if (!freeze) return null;

  const merged = mergeMotiveRows(freeze, delta);

  const h1After = delta?.after.rows.find((r) => r.key === "H1");
  const h2After = delta?.after.rows.find((r) => r.key === "H2");
  const promoted = h1After?.canonicalStatus === "SUPPORTED";

  // Seam projections — the S1 second-evidence records and the cross-case
  // connection observation are delivered on the workspace bundle (never on the
  // base envelope) so their content resolves exactly like workspace records.
  const conn = workspace.phase2ConnectionEvidence;
  const seamObservations: Observation[] = [
    ...(workspace.phase2SecondEvidence ?? []),
    ...(conn ? [conn.observation] : []),
  ];
  const obsById = new Map(
    [...(data?.observations ?? []), ...seamObservations].map((o) => [o.id, o]),
  );
  const hypothesisById = new Map((data?.hypotheses ?? []).map((h) => [h.id, h]));

  // Cross-case connection gate: the H1 connection evidence surfaces ONLY when
  // the workspace graph genuinely carries the SOLID (ACTIVE) Rico ↔ hitman
  // edge. A graph hole ("?"), no edge, or a non-active edge never unlocks it.
  const edges = data?.edges ?? [];
  const connectionSolid = conn
    ? edges.some(
        (e) =>
          e.status === "ACTIVE" &&
          ((e.sourceNodeId === conn.sourceNodeId &&
            e.targetNodeId === conn.targetNodeId) ||
            (e.sourceNodeId === conn.targetNodeId &&
              e.targetNodeId === conn.sourceNodeId)),
      )
    : false;

  const phase2Gap =
    data?.gaps?.find((g) =>
      (g.relatedHypothesisIds ?? []).some((id) => freeze.hypothesisIds.includes(id)),
    ) ?? null;
  const nbeLead =
    phase2Gap
      ? data?.leads?.find((l) => (l.gapIds ?? []).includes(phase2Gap.id)) ?? null
      : null;

  return (
    <div
      data-testid="phase2-hypothesis-surface"
      className="mx-auto w-full max-w-[1080px] animate-fade-in flex flex-col gap-8 px-10 py-8 pb-16 text-semantic-foreground"
    >
      {/* ── Motive hypotheses header ────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            Motive hypotheses
          </span>
          <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h2 className="font-display text-[1.75rem] font-light leading-tight tracking-[-0.01em] text-semantic-foreground">
              {data?.investigation ? data.investigation.title : "Motive investigation"}
            </h2>
            <p className="mt-2 max-w-[70ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
              Three competing readings of why the owner was killed. The comparison
              and its values come from the workspace state — never authored on
              this page.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestChallenge}
            data-testid="challenge-hypothesis-button"
            className="shrink-0 rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-amber transition-colors hover:bg-accent-amber/10 focus-visible:outline-none"
          >
            Test / challenge a hypothesis →
          </button>
        </div>

        {freeze.caveat && (
          <p className="rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-4 py-2.5 font-mono text-[11px] leading-relaxed text-accent-amber">
            {freeze.caveat}
          </p>
        )}
      </div>

      {/* ── H1 / H2 / H3 comparison cards (details expand on click) ──── */}
      <section className="flex flex-col gap-5" aria-label="Competing motive hypotheses">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            Why was the owner killed?
          </span>
          <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
        </div>
        <p className="max-w-[80ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
          Three competing explanations. Select a card to inspect its ranking, its
          scores, and the supporting and contradicting evidence behind it. No card
          is a verdict — it is the next point of investigation.
        </p>

        <div className="flex flex-col gap-3">
          {merged.map((row) => {
            const hypothesis = hypothesisById.get(row.hypothesisId);
            const isOpen = openKey === row.key;
            const readoutRow = workspace.phase2EvidenceReadout?.[row.key] ?? {
              supporting: row.supporting,
              contradicting: row.contradicting,
            };
            // When the connection evidence is NOT yet unlocked (no solid
            // edge), it is dropped from H1's supporting set — the badge count
            // and render both follow the genuinely-visible evidence.
            const supporting = conn
              ? readoutRow.supporting.filter(
                  (id) => id !== conn.observation.id || connectionSolid,
                )
              : readoutRow.supporting;
            const forAgainst = {
              supporting,
              contradicting: readoutRow.contradicting,
            };
            const obsBlock = (kind: "supporting" | "contradicting") => {
              const ids =
                kind === "supporting" ? forAgainst.supporting : forAgainst.contradicting;
              const positive = kind === "supporting";
              return (
                <div
                  className={`rounded-lg border p-4 ${
                    positive ? "border-emerald-500/30 bg-emerald-500/5" : "border-danger/30 bg-danger/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider ${
                        positive ? "text-emerald-600" : "text-danger"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${positive ? "bg-emerald-500" : "bg-danger"}`} />
                      {positive ? "Supporting observations" : "Contradicting observations"}
                    </span>
                    <Badge
                      className={`font-mono text-[9px] ${
                        positive ? "bg-emerald-500/10 text-emerald-600" : "bg-danger/10 text-danger"
                      }`}
                    >
                      {ids.length} OBS
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {ids.length === 0 && (
                      <p className="font-mono text-[10px] text-semantic-foreground-faint">None</p>
                    )}
                    {ids.map((id) => {
                      const obs = obsById.get(id);
                      return (
                        <div
                          key={id}
                          className={`space-y-1 rounded border bg-semantic-surface p-3 ${
                            positive ? "border-emerald-500/20" : "border-danger/20"
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono text-[9px] text-semantic-foreground-faint">
                            <span className={`font-bold ${positive ? "text-emerald-700" : "text-danger"}`}>{id}</span>
                            {obs && <span>{obs.type}</span>}
                          </div>
                          <p className="text-xs leading-normal text-semantic-foreground-muted">
                            {obs ? obs.content : "Content unavailable on this workspace."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            };

            return (
              <div
                key={row.key}
                data-testid={`phase2-surface-hypothesis-${row.key}`}
                className={`overflow-hidden rounded-lg border bg-semantic-surface transition-colors ${
                  isOpen ? "border-accent-blue/40" : "border-semantic-border-subtle hover:border-semantic-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : row.key)}
                  aria-expanded={isOpen}
                  data-testid={`phase2-surface-hypothesis-toggle-${row.key}`}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant="muted" className="shrink-0">#{row.rank}</Badge>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-semantic-foreground-muted">
                      {row.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm font-bold tabular-nums text-semantic-foreground">
                      {(row.after ?? row.before).toFixed(2)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                        row.status === "SUPPORTED"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-semantic-border-subtle bg-semantic-surface text-semantic-foreground-faint"
                      }`}
                    >
                      {row.status}
                    </span>
                    <svg
                      className={`h-4 w-4 text-accent-blue transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="animate-fade-in border-t border-semantic-border-subtle px-5 py-4">
                    {hypothesis?.statement && (
                      <p className="text-[0.8125rem] leading-relaxed text-semantic-foreground-muted">
                        {hypothesis.statement}
                      </p>
                    )}
                    <div className="mt-4 max-w-sm">
                      <ScoreCell
                        label="Investigative relevance"
                        score={row.after ?? row.before}
                        status={row.status}
                        delta={
                          row.after !== undefined && row.after !== row.before
                            ? row.after - row.before
                            : undefined
                        }
                      />
                    </div>
                    {row.exclusive.length > 0 && (
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                        {row.exclusive.length} exclusive observation
                        {row.exclusive.length === 1 ? "" : "s"}
                      </p>
                    )}
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {obsBlock("supporting")}
                      {obsBlock("contradicting")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {delta && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-semantic-foreground-muted">
            {promoted ? "Audit discriminator ingested" : "Post-ingest comparison"}
          </span>
          {promoted && h1After && h2After && (
            <>
              <Badge variant="success" dot>
                H1 promoted to {h1After.canonicalStatus} ({h1After.score.toFixed(2)})
              </Badge>
              <Badge variant="muted">
                H2 held at {h2After.score.toFixed(2)}
              </Badge>
            </>
          )}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
            freeze {delta.before.fingerprint.slice(0, 8)} → {delta.after.fingerprint.slice(0, 8)}
          </span>
        </div>
      )}

      {/* ── Gap & next best evidence ────────────────────────────────── */}
      <section aria-label="Gap and next best evidence">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            Gap & next best evidence
          </span>
          <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
        </div>
        {!data ? (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
            Resolving gap / lead from the workspace…
          </p>
        ) : phase2Gap ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-blue">
                  Gap · {phase2Gap.type}
                </span>
                <Badge variant="muted">{phase2Gap.status}</Badge>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-semantic-foreground">
                {phase2Gap.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-semantic-foreground-muted">
                {phase2Gap.description}
              </p>
              {nbeLead && (
                <div className="mt-4 rounded-lg border border-accent-blue/20 bg-semantic-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-accent-rose font-bold">
                      Highest value verification action
                    </span>
                    <Badge variant="muted">{nbeLead.priority}</Badge>
                  </div>
                  <h4 className="mt-1.5 text-sm font-bold text-semantic-foreground">
                    {nbeLead.title}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-semantic-foreground-muted">
                    {nbeLead.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-semantic-border-subtle bg-semantic-surface px-4 py-3 font-mono text-[10px] leading-relaxed text-semantic-foreground-faint">
            No motive gap was surfaced by this workspace (provider unavailable).
            The caveat above remains the honest frame.
          </p>
        )}
      </section>

      {/* ── Honesty footer ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-semantic-border-subtle bg-semantic-surface px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed text-semantic-foreground-muted">
          <span className="uppercase tracking-widest text-semantic-foreground-faint">Evidence posture: </span>
          T1_INVESTIGATIVE_LEAD — the physical corporate audit document is BLOCKED;
          the reference is the House-report public account
          (REPORT_TEXT_ACCOUNT). No score here establishes who killed the owner.
        </p>
        <p className="font-mono text-[10px] leading-relaxed text-semantic-foreground-faint">
          Reference class: {delta?.leakSafeClass ?? freeze.hypothesisIds.join(", ")} ·{" "}
          {freeze.rows.length} hypothesis rows
        </p>
      </div>
    </div>
  );
}