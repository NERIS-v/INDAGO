"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import {
  ObservationContradictionKindBadge,
  type Hop,
  HopTrail,
} from "./provenance-trail";
import type {
  Observation,
  Source,
  Artifact,
  Entity,
  RelationHypothesis,
} from "@indago/contracts";
import type { EvidenceListItem } from "@/lib/api/types";
import type { ObservationContradiction } from "@/lib/providers/types";

type FetchState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

interface IntelligenceDetailPanelProps {
  investigationId: string;
  observationId: string;
  contradictions: readonly ObservationContradiction[];
  onClose: () => void;
  onSelectObservation?: (observationId: string) => void;
  onFocusEntity?: (entityId: string) => void;
  onSelectRelation?: (relationId: string) => void;
}

export function IntelligenceDetailPanel({
  investigationId,
  observationId,
  contradictions,
  onClose,
  onSelectObservation,
  onFocusEntity,
  onSelectRelation,
}: IntelligenceDetailPanelProps) {
  const workspace = useWorkspace();
  const [observationState, setObservationState] = useState<FetchState<Observation>>({
    kind: "loading",
  });
  const [evidenceState, setEvidenceState] = useState<FetchState<EvidenceListItem | null>>({
    kind: "loading",
  });
  const [sourceState, setSourceState] = useState<FetchState<Source | null>>({
    kind: "loading",
  });
  const [artifactState, setArtifactState] = useState<FetchState<Artifact[]>>({
    kind: "loading",
  });
  const [entityState, setEntityState] = useState<FetchState<Entity[]>>({
    kind: "loading",
  });
  const [relationState, setRelationState] = useState<FetchState<RelationHypothesis[]>>({
    kind: "loading",
  });

  const thisObservationContradictions = contradictions.filter(
    (c) => c.leftObservationId === observationId || c.rightObservationId === observationId,
  );

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setObservationState({ kind: "loading" });
      try {
        const page = await workspace.observations.listByInvestigation(
          investigationId,
          { pageSize: 200 },
        );
        const observation = page.items.find((o) => o.id === observationId);
        if (!observation) {
          if (isMounted)
            setObservationState({
              kind: "error",
              message: "Observation not found in this investigation.",
            });
          return;
        }
        if (!isMounted) return;
        setObservationState({ kind: "ready", value: observation });

        const evidence = await workspace.evidence.get(observation.evidenceId).catch(() => null);
        if (!isMounted) return;
        setEvidenceState({ kind: "ready", value: evidence });

        const source = evidence
          ? await workspace.intelligence.getSource(evidence.sourceRef).catch(() => null)
          : await workspace.intelligence.getSource(observation.sourceId).catch(() => null);
        if (!isMounted) return;
        setSourceState({ kind: "ready", value: source });

        const artifacts = evidence
          ? (
              await Promise.all(
                evidence.artifactIds.map((id) =>
                  workspace.intelligence.getArtifact(id).catch(() => null),
                ),
              )
            ).filter((a): a is Artifact => a !== null)
          : [];
        if (!isMounted) return;
        setArtifactState({ kind: "ready", value: artifacts });

        const [entities, relations] = await Promise.all([
          Promise.all(
            observation.entityIds.map((id) =>
              workspace.entities.get(id).catch(() => null),
            ),
          ).then((list) => list.filter((e): e is Entity => e !== null)),
          workspace.relations
            .listByInvestigation(investigationId, { pageSize: 100 })
            .then((p) => p.items)
            .catch(() => []),
        ]);
        if (!isMounted) return;
        setEntityState({ kind: "ready", value: entities });
        setRelationState({ kind: "ready", value: relations });
      } catch (err) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to load observation";
          setObservationState({ kind: "error", message: msg });
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, investigationId, observationId]);

  const relatedRelations = relationState.kind === "ready"
    ? relationState.value.filter(
        (r) =>
          observationState.kind === "ready" &&
          (r.evidenceBasis.includes(observationId) ||
            r.contradictions?.includes(observationId)),
      )
    : [];

  const hops: Hop[] = [
    { key: "observation", label: "Observation", targetId: observationId },
    ...(evidenceState.kind === "ready" && evidenceState.value
      ? [{ key: "evidence", label: "Evidence", targetId: evidenceState.value.id }]
      : []),
    ...(sourceState.kind === "ready" && sourceState.value
      ? [{ key: "source", label: "Source", targetId: sourceState.value.id }]
      : []),
    ...(artifactState.kind === "ready" && artifactState.value.length > 0
      ? [
          {
            key: "artifact",
            label: "Artifact",
            targetId: artifactState.value.map((a) => a.id).join(","),
          },
        ]
      : []),
    ...(entityState.kind === "ready" && entityState.value.length > 0
      ? [
          {
            key: "entity",
            label: "Entity",
            targetId: entityState.value.map((e) => e.id).join(","),
          },
        ]
      : []),
    ...(relatedRelations.length > 0
      ? [
          {
            key: "relation",
            label: "Relation",
            targetId: relatedRelations.map((r) => r.id).join(","),
          },
        ]
      : []),
  ];

  const observation = observationState.kind === "ready" ? observationState.value : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-normal ease-restrained"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={observation ? "Observation provenance" : "Loading observation"}
        className="relative flex h-full w-full max-w-lg flex-col bg-surface-50 border-l border-border-standard shadow-2xl animate-slide-in-right"
      >
        <div className="flex items-start justify-between border-b border-border-subtle bg-surface-0/50 p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="info" dot>Observation</Badge>
              <span className="type-mono-small text-text-faint">
                {observationId.slice(0, 8)}
              </span>
            </div>
            {observation && (
              <h2 className="type-title text-text-primary">{observation.type}</h2>
            )}
          </div>
          <Button
            onClick={onClose}
            aria-label="Close panel"
            variant="quiet"
            size="sm"
            className="text-text-faint hover:text-text-primary hover:bg-surface-200 text-lg leading-none"
          >
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {observationState.kind === "loading" && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" label="Loading observation" />
            </div>
          )}
          {observationState.kind === "error" && (
            <ErrorDisplay
              message={observationState.message}
              retry={onClose}
            />
          )}
          {observation && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <section>
                <h3 className="type-eyebrow mb-3">Assertion</h3>
                <p className="text-sm text-text-strong">{observation.content}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <ConfidenceIndicator value={observation.strength} label="Strength" />
                  <Badge variant="muted" dot>Canonical</Badge>
                  {observation.observedAt && (
                    <span className="type-mono-small text-text-muted">
                      Observed{" "}
                      {new Date(observation.observedAt.value)
                        .toISOString()
                        .slice(0, 10)}
                    </span>
                  )}
                </div>
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Contradictions</h3>
                {thisObservationContradictions.length === 0 ? (
                  <p className="text-sm text-text-muted italic">
                    No contradictions detected for this observation.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {thisObservationContradictions.map((c) => {
                      const otherId =
                        c.leftObservationId === observationId
                          ? c.rightObservationId
                          : c.leftObservationId;
                      return (
                        <div
                          key={c.id}
                          className="rounded-lg border border-border-standard bg-surface-0 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <ObservationContradictionKindBadge
                              kind={c.contradictionType}
                            />
                            <ConfidenceIndicator
                              value={c.strength}
                              label="Strength"
                            />
                          </div>
                          <p className="mt-2 text-sm text-text-strong">{c.description}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {onSelectObservation && (
                              <Button
                                variant="quiet"
                                size="sm"
                                onClick={() => onSelectObservation(otherId)}
                              >
                                Open paired observation
                              </Button>
                            )}
                            {onSelectObservation && (
                              <span className="type-mono-small text-text-faint">
                                {otherId.slice(0, 8)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-1">Provenance trail</h3>
                <p className="mb-4 text-xs text-text-muted">
                  Follow the chain from this observation back to its evidence,
                  source, and any artifacts or linked entities.
                </p>
                <HopTrail hops={hops} activeKey="observation" />
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Evidence package</h3>
                {evidenceState.kind === "ready" && evidenceState.value ? (
                  <div className="flex flex-col gap-1">
                    <EvidenceRow
                      label={evidenceState.value.title}
                      detail={`${evidenceState.value.status} · ${evidenceState.value.type}`}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">Evidence unavailable.</p>
                )}
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Source of origin</h3>
                {sourceState.kind === "ready" && sourceState.value ? (
                  <div className="flex flex-col gap-1">
                    <EvidenceRow
                      label={sourceState.value.name}
                      detail={`${sourceState.value.systemOrigin} · ${sourceState.value.type} · ${sourceState.value.status}`}
                    />
                    <span className="type-mono-small text-text-faint">
                      {sourceState.value.evidenceIds.length} evidence in source
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">Source unavailable.</p>
                )}
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Artifacts</h3>
                {artifactState.kind === "ready" && artifactState.value.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {artifactState.value.map((a) => (
                      <EvidenceRow
                        key={a.id}
                        label={a.filename}
                        detail={`${a.type} · ${a.mimeType}`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">
                    No artifacts attach to this evidence package.
                  </p>
                )}
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Linked entities</h3>
                {entityState.kind === "ready" && entityState.value.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {entityState.value.map((e) => (
                      <EntityRow
                        key={e.id}
                        entity={e}
                        onClick={onFocusEntity ? () => onFocusEntity(e.id) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">
                    No canonical entities linked to this observation. See the
                    resolution queue for this observation's unresolved mention
                    candidates.
                  </p>
                )}
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Relationships</h3>
                {relatedRelations.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {relatedRelations.map((r) => (
                      <EvidenceRow
                        key={r.id}
                        label={`${r.relationType} hypothesis`}
                        detail={`${r.status} · source ${r.sourceEntityId.slice(0, 8)} → target ${r.targetEntityId.slice(0, 8)}`}
                        onClick={
                          onSelectRelation ? () => onSelectRelation(r.id) : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">
                    No relationship hypotheses are grounded in this observation.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-sm text-text-strong">{label}</span>
      <span className="type-mono-small text-text-muted">{detail}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className="flex flex-col gap-0.5 py-2">{content}</div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-0.5 rounded-md px-0 py-2 text-left transition-colors duration-fast ease-restrained hover:text-accent-rose focus-visible:outline-2 focus-visible:outline-accent-rose"
    >
      {content}
    </button>
  );
}

function EntityRow({
  entity,
  onClick,
}: {
  entity: Entity;
  onClick?: () => void;
}) {
  const variant: BadgeVariant =
    entity.status === "ACTIVE"
      ? "accent"
      : entity.status === "MERGED" || entity.status === "SPLIT"
      ? "info"
      : entity.status === "CANDIDATE"
      ? "warning"
      : "muted";
  const content = (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-text-strong">{entity.canonicalName}</span>
      <span className="flex items-center gap-2">
        <Badge variant={variant}>{entity.status}</Badge>
        <span className="type-mono-small text-text-muted">
          {entity.id.slice(0, 8)}
        </span>
      </span>
    </div>
  );
  if (!onClick) {
    return <div className="py-2">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-0 py-2 text-left transition-colors duration-fast ease-restrained hover:text-accent-rose focus-visible:outline-2 focus-visible:outline-accent-rose"
    >
      {content}
    </button>
  );
}
