"use client";

// ============================================================================
// PASS 4 — Phase-2 Motive Investigation Panel
//
// Renders the Phase-2 motive assessment ("why was Roger Wheeler killed?") as a
// read-only projection of the workspace seams. It appears ONLY when the
// workspace genuinely carries the derived Phase-2 analysis (enriched real-case
// Case B); live/OFS workspaces omit the seams and render nothing.
//
// Honesty contract (mirrors the data layer):
//   - Every score is DERIVED_BY_DEMO_LOGIC investigative relevance, never a
//     guilt or probability statement.
//   - The physical corporate audit document is BLOCKED; the ingested reference
//     is the House-report public account (REPORT_TEXT_ACCOUNT).
//   - The later-historical hearsay is rendered as LATER_HISTORICAL_KNOWLEDGE —
//     an overlay only, never PROVEN/CONFIRMED.
// ============================================================================

import { useWorkspace } from "@/lib/providers/workspace/context";
import type {
  MotiveHypothesisKey,
  MotiveHypothesisScoreRow,
  Phase2AssessmentFreeze,
  Phase2EvidenceDelta,
  Phase2HistoricalValidation,
} from "@/lib/providers/types";
import { Badge } from "@/components/ui/badge";

export function scoreRowLabel(row: MotiveHypothesisScoreRow): string {
  const short = row.title.replace(/^H\d\s*[—-]\s*/, "");
  return `${row.key} — ${short}`;
}

export interface MergedMotiveRow {
  readonly key: MotiveHypothesisKey;
  readonly hypothesisId: string;
  readonly label: string;
  readonly before: number;
  readonly after?: number;
  readonly status: string;
  readonly rank: number;
  readonly supporting: readonly string[];
  readonly contradicting: readonly string[];
  readonly exclusive: readonly string[];
}

/** Merge the frozen pre-evidence rows with the post-ingest delta rows (when the
 *  S1 comparator exists) into ONE deterministic H1/H2/H3 projection. Both the
 *  overview panel and the Hypothesis route consume this SAME projection so the
 *  two surfaces can never drift apart. */
export function mergeMotiveRows(
  freeze: Phase2AssessmentFreeze,
  delta?: Phase2EvidenceDelta,
): readonly MergedMotiveRow[] {
  const after = delta?.after.rows;
  return freeze.rows.map((pre) => {
    const post = after?.find((r) => r.key === pre.key);
    return {
      key: pre.key,
      hypothesisId: pre.hypothesisId,
      label: scoreRowLabel(pre),
      before: pre.score,
      after: post?.score,
      status: post?.canonicalStatus ?? pre.canonicalStatus,
      rank: post?.rank ?? pre.rank,
      supporting: post?.supportingObservationIds ?? pre.supportingObservationIds,
      contradicting: post?.contradictingObservationIds ?? pre.contradictingObservationIds,
      exclusive: post?.exclusiveObservationIds ?? [],
    };
  });
}

export function ScoreCell({
  label,
  score,
  status,
  delta,
}: {
  readonly label: string;
  readonly score: number;
  readonly status: string;
  readonly delta?: number;
}) {
  const pct = Math.round(score * 100);
  const promoted = status === "SUPPORTED";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-semantic-foreground-muted">
          {label}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={`font-mono text-[10px] font-bold tabular-nums ${
              delta > 0 ? "text-success" : "text-accent-amber"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className={`font-mono text-[1.4rem] font-extralight tabular-nums tracking-wide ${
            promoted ? "text-success" : "text-semantic-foreground"
          }`}
        >
          {score.toFixed(2)}
        </span>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
            promoted
              ? "border-success/30 bg-success/10 text-success"
              : "border-semantic-border-subtle bg-semantic-surface text-semantic-foreground-faint"
          }`}
        >
          {status}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-semantic-border-subtle"
      >
        <div
          className={`h-full rounded-full ${promoted ? "bg-success" : "bg-semantic-foreground-muted"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function HistoricalValidationOverlay({ v }: { readonly v: Phase2HistoricalValidation }) {
  return (
    <div className="relative mt-6 overflow-hidden rounded-xl border border-semantic-border-subtle bg-semantic-surface px-5 py-4">
      <span className="absolute left-0 top-0 h-full w-1 bg-accent-amber" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-amber">
          Later-historical validation · overlay only
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">{v.classification}</Badge>
          <Badge variant="muted">{v.verdict}</Badge>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-semantic-foreground-muted">{v.nonMeeting}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {v.hearsayChain.map((hop) => (
          <p key={hop.hopLabel} className="font-mono text-[10px] leading-relaxed text-semantic-foreground-faint">
            <span className="uppercase tracking-widest text-semantic-foreground-muted">{hop.hopLabel}:</span>{" "}
            {hop.note}
          </p>
        ))}
      </div>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
        Stance {v.stance} · Manner of proof {v.mannerOfProof} · Never confirmed
      </p>
    </div>
  );
}

export function Phase2MotivePanel() {
  const workspace = useWorkspace();
  const freeze = workspace.phase2AssessmentFreeze;
  const delta = workspace.phase2EvidenceDelta;
  const historical = workspace.phase2HistoricalValidation;

  // Live/OFS workspaces never carry the phase-2 seams — render nothing rather
  // than fabricate a motive analysis.
  if (!freeze) return null;

  const after = delta?.after.rows;
  const merged = mergeMotiveRows(freeze, delta);

  const h1After = after?.find((r) => r.key === "H1");
  const h2After = after?.find((r) => r.key === "H2");
  const promoted = h1After?.canonicalStatus === "SUPPORTED";

  return (
    <section
      className="mt-12"
      aria-labelledby="phase2-motive-heading"
      data-testid="phase2-motive-panel"
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
          Phase-2 · motive investigation
        </span>
        <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
      </div>

      <h2
        id="phase2-motive-heading"
        className="mt-4 font-display text-[1.5rem] font-light leading-tight tracking-[-0.01em] text-semantic-foreground"
      >
        Why was Roger Wheeler killed?
      </h2>
      <p className="mt-2 max-w-[70ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
        Three competing motive readings are compared against the Case B
        narrative. The pre-evidence comparison ties H1 and H2 on the shared
        storyline (none has won); the audit-discriminator closes the ranking if
        and when its second evidence is ingested.
      </p>

      {freeze.caveat && (
        <p className="mt-3 rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-4 py-2.5 font-mono text-[11px] leading-relaxed text-accent-amber">
          {freeze.caveat}
        </p>
      )}

      <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-semantic-border-subtle bg-semantic-border-subtle sm:grid-cols-3">
        {merged.map((row) => (
          <div key={row.key} className="bg-semantic-surface px-5 py-4">
            <ScoreCell
              label={row.label}
              score={row.after ?? row.before}
              status={row.status}
              delta={
                row.after !== undefined && row.after !== row.before
                  ? row.after - row.before
                  : undefined
              }
            />
            {row.exclusive.length > 0 && (
              <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                {row.exclusive.length} exclusive observation
                {row.exclusive.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        ))}
      </div>

      {delta && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
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

      <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-semantic-border-subtle bg-semantic-surface px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed text-semantic-foreground-muted">
          <span className="uppercase tracking-widest text-semantic-foreground-faint">
            Evidence posture:{" "}
          </span>
          T1_INVESTIGATIVE_LEAD — the physical corporate audit document is
          BLOCKED; the derived reference is the House-report public account
          (REPORT_TEXT_ACCOUNT). No score here establishes who killed Roger
          Wheeler.
        </p>
        <p className="font-mono text-[10px] leading-relaxed text-semantic-foreground-faint">
          Reference class: {delta?.leakSafeClass ?? freeze.hypothesisIds.join(", ")}
        </p>
      </div>

      {historical && <HistoricalValidationOverlay v={historical} />}
    </section>
  );
}