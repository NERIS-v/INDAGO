"use client";

// ============================================================================
// PR-21 — Live Hypothesis Workspace
//
// The canonical HypothesisProvider stays demo-only (the platform exposes no
// canonical Hypothesis store), so the LIVE hypothesis page is served by the
// platform's ACTUAL durable hypothesis universes through the entity/relation
// provider seams — nothing is fabricated:
//   1. Entity Hypotheses   — candidate identity propositions (M-A09),
//      EntityProvider.listEntityHypotheses + the explicit M-A09.5 accept.
//   2. Relation Hypotheses — reversible relationship propositions (M-A10),
//      RelationProvider.listByInvestigation + accept / reject / reverse.
//   3. Materialized Relations — the ACTIVE canonical relations the graph
//      projection consumes, via RelationProvider.listCanonical when present.
//
// After every mutation the surface re-reads the listed universes so statuses
// always reflect the durable platform state. A provider seam that is absent
// renders an honest unavailable section (never a mock or silent fallback).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import {
  relationAuthorityAllows,
  RELATION_STATUS_LABEL,
  type RelationAuthorityAction,
} from "@/lib/context/relation-authority";
import { Badge } from "@/components/ui/badge";
import type { EntityHypothesis, RelationHypothesis } from "@indago/contracts";
import type { CanonicalRelationDTO } from "@/lib/api/types";

interface SectionProps {
  readonly loading: boolean;
  readonly error: string | null;
  readonly unavailable?: string | null;
  readonly heading: string;
  readonly count: number | null;
  readonly testId: string;
  readonly children: React.ReactNode;
}

function Section({
  loading,
  error,
  unavailable,
  heading,
  count,
  testId,
  children,
}: SectionProps) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-surface-200 bg-surface-0 p-5"
    >
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
          {heading}
        </p>
        {!loading && !error && !unavailable && count !== null && (
          <Badge variant="muted">{count}</Badge>
        )}
      </div>
      {loading ? (
        <p
          className="mt-4 type-caption text-semantic-foreground-faint"
          data-testid={`${testId}-loading`}
        >
          Loading…
        </p>
      ) : error ? (
        <p
          className="mt-4 type-caption text-semantic-danger"
          data-testid={`${testId}-error`}
        >
          {error}
        </p>
      ) : unavailable ? (
        <p
          className="mt-4 type-caption text-semantic-foreground-faint"
          data-testid={`${testId}-unavailable`}
        >
          {unavailable}
        </p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function LiveHypothesisWorkspace() {
  const workspace = useWorkspace();
  const investigationId = workspace.investigationId;
  const entitiesProvider = workspace.entities;
  const relationsProvider = workspace.relations;

  const [entityHypotheses, setEntityHypotheses] = useState<EntityHypothesis[] | null>(null);
  const [relationHypotheses, setRelationHypotheses] = useState<RelationHypothesis[] | null>(null);
  const [canonicalRelations, setCanonicalRelations] = useState<CanonicalRelationDTO[] | null>(null);
  const [entityNames, setEntityNames] = useState<ReadonlyMap<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      entitiesProvider.listEntityHypotheses
        ? entitiesProvider.listEntityHypotheses(investigationId)
        : Promise.resolve(null),
      relationsProvider.listByInvestigation(investigationId),
      relationsProvider.listCanonical
        ? relationsProvider.listCanonical(investigationId)
        : Promise.resolve(null),
      entitiesProvider.listByInvestigation(investigationId),
    ]);
    const [eh, rh, cr, ents] = results;
    if (eh.status === "fulfilled") setEntityHypotheses(eh.value?.items ?? []);
    if (rh.status === "fulfilled") setRelationHypotheses(rh.value.items);
    if (cr.status === "fulfilled") setCanonicalRelations(cr.value?.items ?? []);
    if (ents.status === "fulfilled") {
      setEntityNames(new Map(ents.value.items.map((e) => [e.id, e.canonicalName])));
    }
    if (eh.status === "rejected" || rh.status === "rejected") {
      const reason =
        eh.status === "rejected" ? eh.reason : rh.status === "rejected" ? rh.reason : null;
      setError(
        errorText(reason as unknown, "The live hypothesis surface could not be loaded."),
      );
    }
    if (cr.status === "rejected") setCanonicalRelations(null);
    if (ents.status === "rejected") setEntityNames(new Map());
    setLoading(false);
  }, [entitiesProvider, relationsProvider, investigationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nameFor = useCallback(
    (id: string) => entityNames?.get(id) ?? id,
    [entityNames],
  );

  const entityHypothesisUnavailable =
    entitiesProvider.listEntityHypotheses
      ? null
      : "Entity hypotheses are not available on this provider seam.";

  const canonicalUnavailable = relationsProvider.listCanonical
    ? null
    : "Canonical relation reads are not available on this provider seam.";

  const mutateEntity = useCallback(
    async (hypothesisId: string) => {
      if (!entitiesProvider.acceptEntityHypothesis) return;
      setMutating(hypothesisId);
      try {
        await entitiesProvider.acceptEntityHypothesis(
          investigationId,
          hypothesisId,
        );
        await reload();
      } catch (err) {
        setError(errorText(err, "The entity acceptance could not be completed."));
      } finally {
        setMutating(null);
      }
    },
    [entitiesProvider, investigationId, reload],
  );

  const mutateRelation = useCallback(
    async (action: RelationAuthorityAction, hypothesisId: string) => {
      const fn =
        action === "accept"
          ? relationsProvider.accept
          : action === "reject"
            ? relationsProvider.reject
            : relationsProvider.reverse;
      if (!fn) return;
      setMutating(hypothesisId);
      try {
        await fn.call(relationsProvider, investigationId, hypothesisId);
        await reload();
      } catch (err) {
        setError(errorText(err, `The ${action} decision could not be completed.`));
      } finally {
        setMutating(null);
      }
    },
    [relationsProvider, investigationId, reload],
  );

  const sortedEntityHypotheses = useMemo(
    () =>
      (entityHypotheses ?? []).slice().sort((a, b) => b.score - a.score),
    [entityHypotheses],
  );

  const sortedRelationHypotheses = useMemo(
    () => (relationHypotheses ?? []).slice().sort((a, b) => b.support - a.support),
    [relationHypotheses],
  );

  return (
    <div
      className="flex w-full max-w-[1080px] flex-col gap-5"
      data-testid="live-hypothesis-workspace"
    >
      <Section
        heading="Entity hypotheses"
        testId="section-entity-hypotheses"
        loading={loading}
        error={entityHypotheses === null ? error : null}
        unavailable={entityHypothesisUnavailable}
        count={sortedEntityHypotheses.length}
      >
        {sortedEntityHypotheses.length === 0 ? (
          <p className="type-caption text-semantic-foreground-faint">
            No entity hypotheses have been generated for this investigation yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedEntityHypotheses.map((h) => (
              <li
                key={h.id}
                data-testid="entity-hypothesis-card"
                className="rounded-lg border border-surface-100 bg-surface-0 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.625rem] text-semantic-foreground-faint">
                      {h.id}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] font-medium text-semantic-foreground">
                      {h.comparisonStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">{h.status}</Badge>
                    <span className="font-mono text-[0.625rem] font-bold text-semantic-foreground-muted">
                      {h.score.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[0.6875rem] text-semantic-foreground-muted">
                  <span>{h.supportingObservationIds?.length ?? 0} supporting obs</span>
                  <span>{h.contradictingObservationIds?.length ?? 0} contradictions</span>
                  {h.scoreModelVersion && <span>{h.scoreModelVersion}</span>}
                </div>
                {h.status === "PROPOSED" && entitiesProvider.acceptEntityHypothesis && (
                  <button
                    type="button"
                    data-testid={`accept-entity-hypothesis-${h.id}`}
                    disabled={mutating === h.id}
                    onClick={() => void mutateEntity(h.id)}
                    className="mt-3 rounded bg-surface-800 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-0 transition-colors hover:bg-surface-600 disabled:opacity-50"
                  >
                    {mutating === h.id ? "Accepting…" : "Accept"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        heading="Relation hypotheses"
        testId="section-relation-hypotheses"
        loading={loading}
        error={relationHypotheses === null ? error : null}
        unavailable={null}
        count={sortedRelationHypotheses.length}
      >
        {sortedRelationHypotheses.length === 0 ? (
          <p className="type-caption text-semantic-foreground-faint">
            No relation hypotheses have been proposed for this investigation yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedRelationHypotheses.map((r) => (
              <li
                key={r.id}
                data-testid="relation-hypothesis-card"
                className="rounded-lg border border-surface-100 bg-surface-0 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[0.8125rem] font-medium text-semantic-foreground">
                    {nameFor(r.sourceEntityId)}{" "}
                    <span className="font-mono text-[0.625rem] uppercase text-semantic-foreground-faint">
                      {r.relationType}
                    </span>{" "}
                    {nameFor(r.targetEntityId)}
                    {r.directed ? "" : " (undirected)"}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="muted">
                      {RELATION_STATUS_LABEL[r.status]}
                    </Badge>
                    <span className="font-mono text-[0.625rem] font-bold text-semantic-foreground-muted">
                      {r.support.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {(["accept", "reject", "reverse"] as const).map((action) =>
                    relationAuthorityAllows(action, r.status) ? (
                      <button
                        key={action}
                        type="button"
                        data-testid={`${action}-relation-hypothesis-${r.id}`}
                        disabled={mutating === r.id}
                        onClick={() => void mutateRelation(action, r.id)}
                        className="rounded bg-surface-800 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-0 transition-colors hover:bg-surface-600 disabled:opacity-50"
                      >
                        {mutating === r.id ? "Working…" : action}
                      </button>
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        heading="Materialized relations"
        testId="section-canonical-relations"
        loading={loading}
        error={canonicalRelations === null ? error : null}
        unavailable={canonicalUnavailable}
        count={canonicalRelations?.length ?? null}
      >
        {(canonicalRelations ?? []).length === 0 ? (
          <p className="type-caption text-semantic-foreground-faint">
            No canonical relations have been accepted yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(canonicalRelations ?? []).map((r) => (
              <li
                key={r.id}
                data-testid="canonical-relation-card"
                className="rounded-lg border border-surface-100 bg-surface-0 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[0.8125rem] font-medium text-semantic-foreground">
                    {nameFor(r.sourceEntityId)}{" "}
                    <span className="font-mono text-[0.625rem] uppercase text-semantic-foreground-faint">
                      {r.relationType}
                    </span>{" "}
                    {nameFor(r.targetEntityId)}
                  </p>
                  <span className="shrink-0 font-mono text-[0.625rem] font-bold text-semantic-foreground-muted">
                    {r.support.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[0.625rem] text-semantic-foreground-faint">
                  {r.hypothesisId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}