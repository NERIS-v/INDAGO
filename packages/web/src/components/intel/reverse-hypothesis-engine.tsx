"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { ProviderError } from "@/lib/providers/types";
import { investigationUrl } from "@/lib/workspace/url";
import type { HypothesisAssessment, HypothesisDecision, InverseCondition } from "@/lib/intel/reverse-hypothesis/hypothesis-model";
import { temporalLabel } from "@/lib/intel/reverse-hypothesis/hypothesis-model";
import type { EvidenceListItem } from "@/lib/api/types";

const STAGE_LABEL: Record<string, string> = {
  IDLE: "Idle — awaiting a hypothesis to test",
  INTERPRETING: "Interpreting the hypothesis into one structured condition",
  RETRIEVING_SUPPORT: "Retrieving observations in semantic reach (supporting candidates)",
  BUILDING_INVERSE: "Building the exclusive inverse conditions",
  RETRIEVING_CONTRADICTION: "Retrieving observations matching an inverse condition",
  VALIDATING: "Validating each classification and assembling the trail",
  READY: "Assessment ready",
  ERROR: "Stopped before reaching an assessment",
};

const STATUS_LABEL: Record<string, string> = {
  SUPPORTED: "SUPPORTED",
  SUPPORTED_WITH_CONFLICT: "SUPPORTED WITH CONFLICT",
  CONTRADICTED: "CONTRADICTED",
  UNRESOLVED: "UNRESOLVED",
};

const DECISIONS: readonly { value: HypothesisDecision; label: string }[] = [
  {
    value: "ACCEPT_AS_WORKING_HYPOTHESIS",
    label: "Accept as working hypothesis",
  },
  { value: "REVISE_HYPOTHESIS", label: "Revise hypothesis" },
  { value: "KEEP_UNRESOLVED", label: "Keep unresolved" },
  { value: "OPEN_EVIDENCE", label: "Open evidence" },
];

function openInGraphHref(investigationId: string, caseId: string, entityId: string): string {
  return `${investigationUrl(investigationId, caseId, "graph")}&focus=${encodeURIComponent(entityId)}`;
}

function TemporalRefLabel({ value }: { value: HypothesisAssessment["interpretation"]["temporal"] }) {
  if (!value) return <span className="font-mono text-[10px] text-surface-500">no temporal bound</span>;
  return (
    <span className="font-mono text-[10px] text-surface-700">
      window {temporalLabel(value)}
    </span>
  );
}

function FindingCard({
  finding,
  onDrill,
  drilled,
  evidence,
  workspace,
}: {
  finding: HypothesisAssessment["supporting"][number];
  onDrill: (observationId: string) => void;
  drilled: boolean;
  evidence: EvidenceListItem | null;
  workspace: ReturnType<typeof useWorkspace>;
}) {
  const classification = finding.classification;
  const tone =
    classification === "SUPPORTING"
      ? "border-l-2 border-surface-500"
      : classification === "CONTRADICTING"
        ? "border-l-2 border-danger/50"
        : "border-l-2 border-accent-amber/50";
  return (
    <li className={`flex flex-col gap-2 rounded-md border border-surface-200 bg-surface-0 p-3 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold text-surface-700">{finding.observationId}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-surface-500">{finding.type}</span>
      </div>
      <p className="type-caption text-surface-700">{finding.content}</p>
      <p className="type-caption text-surface-500">{finding.why}</p>
      {finding.inverseMatch && (
        <p data-inverse-match className="type-caption text-surface-600">
          Inverse match: {finding.inverseMatch.kind} — {finding.inverseMatch.description}
        </p>
      )}
      {finding.canonicalContradictionId && (
        <p className="font-mono text-[9px] text-surface-500">
          contradiction registry: {finding.canonicalContradictionId}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDrill(finding.observationId)}
          className="font-mono text-[10px] text-brand-600 underline underline-offset-2"
        >
          {drilled ? "Hide evidence trail" : "Evidence trail"}
        </button>
        {finding.entityIds[0] && (
          <a
            href={openInGraphHref(workspace.investigationId, workspace.caseId, finding.entityIds[0])}
            className="font-mono text-[10px] text-brand-600 underline underline-offset-2"
          >
            Open in graph
          </a>
        )}
      </div>
      {drilled && (
        <div data-evidence-trail className="mt-1 flex flex-col gap-1 rounded border border-surface-100 bg-surface-50 p-2">
          {evidence ? (
            <>
              <p className="type-caption text-surface-700">{evidence.title}</p>
              {evidence.description && (
                <p className="type-caption text-surface-500">{evidence.description}</p>
              )}
              <p className="font-mono text-[9px] text-surface-500">
                evidence {evidence.id} · source {evidence.sourceRef} · artifacts{" "}
                {evidence.artifactIds.length}
              </p>
            </>
          ) : (
            <p className="type-caption text-surface-500">Resolving evidence trail…</p>
          )}
        </div>
      )}
    </li>
  );
}

export function ReverseHypothesisEngine() {
  const workspace = useWorkspace();
  const capability = workspace.capabilities.intelligence;

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [assessment, setAssessment] = useState<HypothesisAssessment | null>(null);
  const [lastTested, setLastTested] = useState("");
  const [error, setError] = useState<ProviderError | null>(null);
  const [drills, setDrills] = useState<ReadonlySet<string>>(new Set());
  const [evidenceById, setEvidenceById] = useState<ReadonlyMap<string, EvidenceListItem>>(new Map());
  const [decisions, setDecisions] = useState<readonly [string, string][]>([]);
  const [recording, setRecording] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    workspace.intelligence
      .listHypothesisDecisions(workspace.investigationId)
      .then((trail) => {
        if (active) setDecisions(trail.map((r) => [r.hypothesisText, r.decision]));
      })
      .catch(() => {
        if (active) setDecisions([]);
      });
    return () => {
      active = false;
    };
  }, [workspace]);

  const stale =
    assessment !== null && input.trim() !== lastTested && lastTested !== "";

  const run = useCallback(async () => {
    const hypothesis = input.trim();
    if (!hypothesis || running) return;
    setRunning(true);
    setError(null);
    setDrills(new Set());
    setEvidenceById(new Map());
    try {
      const result = await workspace.intelligence.testHypothesis(
        workspace.investigationId,
        { hypothesis },
      );
      setAssessment(result);
      setLastTested(hypothesis);
    } catch (err: unknown) {
      setAssessment(null);
      setLastTested("");
      setError(toProviderError(err));
    } finally {
      setRunning(false);
    }
  }, [input, running, workspace]);

  const toggleDrill = useCallback(
    async (observationId: string) => {
      const next = new Set(drills);
      if (next.has(observationId)) {
        next.delete(observationId);
        setDrills(next);
        return;
      }
      next.add(observationId);
      setDrills(next);
      const finding = [...(assessment?.supporting ?? []), ...(assessment?.contradicting ?? []), ...(assessment?.unresolved ?? [])].find(
        (f) => f.observationId === observationId,
      );
      if (!finding?.evidenceId || evidenceById.has(finding.evidenceId)) return;
      const evidenceId: string = finding.evidenceId;
      try {
        const item = await workspace.evidence.get(evidenceId);
        setEvidenceById((prev) => new Map(prev).set(evidenceId, item));
      } catch {
        // Evidence unavailable — the trail shows the id without details.
      }
    },
    [drills, assessment, evidenceById, workspace],
  );

  const recordDecision = useCallback(
    async (decision: HypothesisDecision, hypothesisText: string) => {
      if (recording) return;
      setRecording(true);
      setDecisionError(null);
      try {
        const trail = await workspace.intelligence.recordHypothesisDecision(
          workspace.investigationId,
          { hypothesis: hypothesisText, decision },
        );
        setDecisions(trail.map((r) => [r.hypothesisText, r.decision]));
      } catch (err: unknown) {
        setDecisionError(toProviderError(err).message);
      } finally {
        setRecording(false);
      }
    },
    [recording, workspace],
  );

  const interpretation = assessment?.interpretation;
  const inverseConditions: readonly InverseCondition[] = assessment?.inverseConditions ?? [];
  const statusLabel = assessment?.status ? STATUS_LABEL[assessment.status] : null;

  const invalidate = useCallback(() => {
    setAssessment(null);
    setLastTested("");
    setDrills(new Set());
    setEvidenceById(new Map());
    setError(null);
  }, []);

  if (capability === "not-ready") {
    return (
      <section data-testid="reverse-hypothesis-provider-unavailable" className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-surface-200 bg-surface-0 p-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">
            Reverse hypothesis
          </p>
          <p className="type-caption mt-3 text-surface-600">
            The reverse-test surface is not served by this provider seam. Calls fail
            typed rather than being fabricated; nothing is shown here instead.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="reverse-hypothesis-engine" className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-10 py-8 pb-16">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-surface-600">
          Reverse hypothesis
        </p>
        <p className="type-caption text-surface-500">
          Write a hypothesis in your own words. The deterministic model reads its
          one structured condition, retrieves saved observations in reach, and
          classifies them three ways — supporting, contradicting, unresolved —
          as counts with reasons. No confidence score is emitted.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-surface-200 bg-surface-0 p-4">
        <label htmlFor="reverse-hypothesis-input" className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-500">
          Hypothesis under test
        </label>
        <textarea
          id="reverse-hypothesis-input"
          data-testid="reverse-hypothesis-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="e.g. Intermediary account 0093 received funds from Aldridge Holdings in February 2024."
          className="w-full resize-y rounded border border-surface-200 bg-surface-50 p-3 type-caption text-surface-800 outline-none focus:border-brand-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-caption text-surface-500">
            {assessment
              ? lastTested === input.trim()
                ? "Results reflect the text above."
                : "The text changed — results below are stale until you run again."
              : "No hypothesis tested yet."}
          </p>
          <div className="flex items-center gap-2">
            {assessment && (
              <button
                type="button"
                onClick={invalidate}
                className="font-mono text-[10px] text-surface-500 underline underline-offset-2"
              >
                Clear results
              </button>
            )}
            <button
              type="button"
              data-testid="reverse-hypothesis-submit"
              onClick={() => void run()}
              disabled={running || input.trim() === ""}
              className="rounded border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-brand-700 disabled:opacity-40"
            >
              {running ? "Testing…" : "Test hypothesis"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div data-testid="reverse-hypothesis-error" className="rounded border border-danger/30 bg-danger/5 p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-danger">
            {error.code}
          </p>
          <p className="type-caption mt-1 text-surface-600">{error.message}</p>
        </div>
      )}

      {assessment && stale && (
        <div data-testid="reverse-hypothesis-invalidated" className="rounded border border-accent-amber/40 bg-accent-amber/5 p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-amber">
            HYPOTHESIS CHANGED — RUN AGAIN
          </p>
          <p className="type-caption mt-1 text-surface-600">
            The assessment below reflects the previous text. Decisions are disabled
            until you run the current hypothesis.
          </p>
        </div>
      )}

      {assessment && !assessment.status && (
        <div data-testid="reverse-hypothesis-unstructured" className="rounded border border-accent-amber/40 bg-accent-amber/5 p-4">
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-surface-700">{assessment.hypothesisText}</pre>
          <p className="type-caption mt-2 text-surface-600">
            {assessment.notices.join(" ")}
          </p>
          {interpretation && (
            <p data-testid="reverse-hypothesis-reading" className="type-caption mt-2 text-surface-600">
              {interpretation.reading}
            </p>
          )}
        </div>
      )}

      {assessment && assessment.status && (
        <div data-testid="reverse-hypothesis-results" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-200 bg-surface-0 p-4">
            <div className="flex items-center gap-3">
              <span
                data-testid="reverse-hypothesis-status"
                className="font-mono text-[11px] font-black uppercase tracking-widest text-surface-800"
              >
                {statusLabel}
              </span>
              <span className="font-mono text-[10px] text-surface-500">
                {assessment.retrieval.pool} pool · {assessment.retrieval.supporting} supporting ·{" "}
                {assessment.retrieval.contradicting} contradicting · {assessment.retrieval.unresolved} unresolved
              </span>
            </div>
            <TemporalRefLabel value={interpretation?.temporal} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div data-testid="reverse-hypothesis-interpretation" className="rounded-lg border border-surface-200 bg-surface-0 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-500">
                  Structured interpretation
                </p>
                {interpretation?.reading && (
                  <p data-testid="reverse-hypothesis-reading" className="type-caption mt-2 text-surface-700">
                    {interpretation.reading}
                  </p>
                )}
                {interpretation?.resolute && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-surface-500">
                      {interpretation.predicate}
                    </span>
                    {interpretation.subject && (
                      <span className="font-mono text-[10px] text-surface-700">
                        {interpretation.subject.label}
                        {interpretation.object
                          ? ` → ${interpretation.object.label}`
                          : ""}
                      </span>
                    )}
                  </div>
                )}
                {interpretation?.unresolved.length ? (
                  <p className="type-caption mt-2 text-surface-500">
                    Unresolved tokens: {interpretation.unresolved.join(", ")}
                  </p>
                ) : null}
              </div>

              <div data-testid="reverse-hypothesis-inverse" className="rounded-lg border border-surface-200 bg-surface-0 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-500">
                  Inverse conditions
                </p>
                {inverseConditions.length === 0 ? (
                  <p className="type-caption mt-2 text-surface-500">None generated.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {inverseConditions.map((iv) => (
                      <li key={iv.kind} className="flex flex-col gap-1 rounded border border-surface-100 bg-surface-50 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold text-surface-700">{iv.kind}</span>
                          <span
                            className={`font-mono text-[9px] uppercase tracking-widest ${
                              iv.contradicting ? "text-danger" : "text-surface-500"
                            }`}
                          >
                            {iv.contradicting ? "contradicting" : "not a contradiction"}
                          </span>
                        </div>
                        <p className="type-caption text-surface-600">{iv.description}</p>
                        <p className="type-caption text-surface-500">{iv.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div data-testid="reverse-hypothesis-conditions" className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div data-testid="reverse-hypothesis-supporting" className="flex flex-col gap-1 rounded-md border border-surface-200 bg-surface-50 p-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-600">
                    Supporting
                  </p>
                  <p className="font-mono text-lg font-black text-surface-800">{assessment.retrieval.supporting}</p>
                </div>
                <div data-testid="reverse-hypothesis-contradicting" className="flex flex-col gap-1 rounded-md border border-surface-200 bg-surface-50 p-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-danger">
                    Contradicting
                  </p>
                  <p className="font-mono text-lg font-black text-surface-800">{assessment.retrieval.contradicting}</p>
                </div>
                <div data-testid="reverse-hypothesis-unresolved" className="flex flex-col gap-1 rounded-md border border-surface-200 bg-surface-50 p-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-amber">
                    Unresolved
                  </p>
                  <p className="font-mono text-lg font-black text-surface-800">{assessment.retrieval.unresolved}</p>
                </div>
              </div>

              {assessment.notices.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {assessment.notices.map((notice) => (
                    <li key={notice} data-testid="reverse-hypothesis-notice" className="type-caption rounded border border-surface-100 bg-surface-50 p-2 text-surface-600">
                      {notice}
                    </li>
                  ))}
                </ul>
              )}

              <ul className="flex flex-col gap-3">
                {assessment.supporting.map((f) => (
                  <FindingCard
                    key={f.observationId}
                    finding={f}
                    onDrill={toggleDrill}
                    drilled={drills.has(f.observationId)}
                    evidence={f.evidenceId ? (evidenceById.get(f.evidenceId) ?? null) : null}
                    workspace={workspace}
                  />
                ))}
                {assessment.contradicting.map((f) => (
                  <FindingCard
                    key={f.observationId}
                    finding={f}
                    onDrill={toggleDrill}
                    drilled={drills.has(f.observationId)}
                    evidence={f.evidenceId ? (evidenceById.get(f.evidenceId) ?? null) : null}
                    workspace={workspace}
                  />
                ))}
                {assessment.unresolved.map((f) => (
                  <FindingCard
                    key={f.observationId}
                    finding={f}
                    onDrill={toggleDrill}
                    drilled={drills.has(f.observationId)}
                    evidence={f.evidenceId ? (evidenceById.get(f.evidenceId) ?? null) : null}
                    workspace={workspace}
                  />
                ))}
              </ul>
            </div>
          </div>

          <div data-testid="reverse-hypothesis-stages" className="rounded-lg border border-surface-200 bg-surface-0 p-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-500">
              Run trail — completed deterministically, no simulated processing
            </p>
            <ol className="mt-2 flex flex-wrap gap-2">
              {assessment.stages.map((stage) => (
                <li key={stage} className="flex items-center gap-1 rounded border border-surface-100 bg-surface-50 px-2 py-1">
                  <span className="font-mono text-[10px] font-bold text-surface-700">{stage}</span>
                  <span className="type-caption text-surface-500">{STAGE_LABEL[stage] ?? ""}</span>
                </li>
              ))}
            </ol>
          </div>

          {!stale && (
            <div data-testid="reverse-hypothesis-decisions" className="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-0 p-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-500">
                Analyst decision — recorded for the tested text only
              </p>
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    disabled={recording}
                    onClick={() => void recordDecision(d.value, lastTested)}
                    className="rounded border border-surface-300 bg-surface-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 hover:bg-surface-100 disabled:opacity-40"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {decisionError && <p className="type-caption text-danger">{decisionError}</p>}
              {decisions.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {decisions.map(([text, decision], idx) => (
                    <li key={`${text}-${decision}-${idx}`} className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-surface-600">
                      <span className="font-bold text-surface-700">{decision}</span>
                      <span className="text-surface-400">·</span>
                      <span className="truncate">{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}