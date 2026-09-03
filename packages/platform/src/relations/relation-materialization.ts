// ============================================================================
// M-A10 Canonical Relation Materialization Authority
//
// The smallest explicit authority/decision boundary that turns an ACCEPTED
// RelationHypothesis into a durable Canonical Relation — the prerequisite the
// Graphology projection demands (the graph consumes canonical Relations, never
// PROPOSED hypotheses).
//
// Identity boundary (locked):
//   - A canonical Relation is created ONLY through this explicit ACCEPT decision.
//   - It is NEVER fabricated from a pair score, a resolution score, graph
//     proximity, or automated scoring alone.
//   - The canonical RelationId is derived deterministically from (source, target,
//     relationType, directed, scoreModelVersion) under the canonical namespace —
//     distinct from the hypothesis id that produced it.
//
// Lifecycle (locked):
//   RelationHypothesis:  PROPOSED → ACCEPTED (materialize canonical Relation)
//                        PROPOSED → REJECTED (no canonical relation)
//                        ACCEPTED → REVERSED (canonical relation marked REVERSED)
//                        REJECTED → REVERSED
//   Transitions are validated by RelationHypothesisStore.updateStatus; repeat
//   / terminal authority decisions are refused (never clobbered).
//
// This module owns ONLY the decision semantics. All persistence is delegated to
// the existing RelationHypothesisStore / RelationStore boundaries (which own
// idempotency, P2002 races, and lifecycle preservation).
// ============================================================================

import type { DurableRelationHypothesis } from "../persistence/relation-hypothesis-store.js";
import { relationHypothesisStore } from "../persistence/relation-hypothesis-store.js";
import {
  buildRelationKey,
  deterministicRelationId,
  relationStore,
} from "../persistence/relation-store.js";

/**
 * Injectable store boundaries (same seam used by entity-materialization) so the
 * real-Postgres integration suite can point the authority at TEST_DATABASE_URL.
 */
export interface RelationMaterializationStores {
  readonly relationHypothesisStore: Pick<
    typeof relationHypothesisStore,
    "findById" | "acceptHypothesis" | "rejectHypothesis" | "reverseHypothesis"
  >;
  readonly relationStore: Pick<
    typeof relationStore,
    "materializeRelation" | "markReversed" | "findById"
  >;
}

const DEFAULT_STORES: RelationMaterializationStores = {
  relationHypothesisStore,
  relationStore,
};

export interface AcceptRelationResult {
  readonly hypothesis: DurableRelationHypothesis;
  readonly relationId: string;
  readonly materialized: boolean;
  readonly reused: boolean;
}

export class RelationMaterializationError extends Error {
  constructor(
    public readonly code:
      | "HYPOTHESIS_NOT_FOUND"
      | "HYPOTHESIS_NOT_PROPOSED"
      | "RELATION_NOT_FOUND"
      | "RELATION_NOT_ACTIVE"
      | "HYPOTHESIS_NOT_REVERSIBLE",
    public readonly id: string,
  ) {
    super(`Relation authority refused (${code}) for ${id}`);
    this.name = "RelationMaterializationError";
  }
}

/**
 * Accept a PROPOSED RelationHypothesis and materialize its canonical Relation —
 * the explicit relation-decision boundary the Graphology projection consumes.
 *
 * 1. Loads the durable hypothesis (case-scoped).
 * 2. Guards: exists, in the current case, PROPOSED (ACCEPTED/REJECTED/REVERSED
 *    decisions are never clobbered).
 * 3. Derives the deterministic canonical RelationId + relationKey.
 * 4. Marks the hypothesis ACCEPTED (transition-guarded), then materializes the
 *    canonical Relation (idempotent on relationKey).
 *
 * Returns the post-decision hypothesis + materialized relation id. The caller
 * emits the authority audit event with the ACTUAL RelationId.
 */
export async function materializeCanonicalRelationFromAcceptedHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
    actor: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<AcceptRelationResult> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore, relationStore: relStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }
  if (hypothesis.status !== "PROPOSED") {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
  }

  const relationKey = buildRelationKey({
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    scoreModelVersion: hypothesis.scoreModelVersion,
  });
  const relationId = await deterministicRelationId({
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    scoreModelVersion: hypothesis.scoreModelVersion,
  });

  const provenance = {
    ...(hypothesis.provenance !== undefined &&
    typeof hypothesis.provenance === "object" &&
    hypothesis.provenance !== null &&
    "sourceId" in hypothesis.provenance &&
    hypothesis.provenance.sourceId !== undefined
      ? { sourceId: hypothesis.provenance.sourceId as string }
      : {}),
    derivedFrom: hypothesis.evidenceBasis,
    extractor: "indago:relation-materialization:authority",
    extractionMethod: params.actor,
    hypothesisId,
  };

  // Durable-state-first: persist the authoritative decision THEN materialize.
  const updatedHypothesis = await hypStore.acceptHypothesis(hypothesisId, {
    caseId,
  });
  if (!updatedHypothesis) {
    // The hypothesis passed the PROPOSED guard above, so this is an unexpected
    // invariant break (e.g. a concurrent authority transitioned it between our
    // read and write). Refuse rather than materialize a relation for a
    // hypothesis the durable store no longer honors.
    throw new RelationMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
  }

  const result = await relStore.materializeRelation({
    id: relationId,
    relationKey,
    caseId,
    investigationId: hypothesis.investigationId ?? undefined,
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    support: hypothesis.support,
    evidenceBasis: hypothesis.evidenceBasis,
    contradictions: hypothesis.contradictions,
    scoreModelVersion: hypothesis.scoreModelVersion,
    evidenceCount: hypothesis.evidenceCount,
    provenance,
    hypothesisId,
  });

  return {
    hypothesis: updatedHypothesis,
    relationId,
    materialized: true,
    reused: result.reusedExisting,
  };
}

/**
 * Reject a PROPOSED RelationHypothesis. No canonical relation is created. Falls
 * through to the transition-guarded store — an already-resolved hypothesis is
 * refused.
 */
export async function rejectRelationHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<DurableRelationHypothesis> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }
  const updated = await hypStore.rejectHypothesis(hypothesisId, { caseId });
  if (!updated) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_REVERSIBLE", hypothesisId);
  }
  return updated;
}

/**
 * Reverse an ACCEPTED (or REJECTED) RelationHypothesis. If a canonical relation
 * exists and is ACTIVE, it is marked REVERSED (REVERSED != MERGED; history kept).
 */
export async function reverseRelationHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<DurableRelationHypothesis> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore, relationStore: relStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }

  const updated = await hypStore.reverseHypothesis(hypothesisId, { caseId });
  if (!updated) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_REVERSIBLE", hypothesisId);
  }

  // Reversing also flips an ACTIVE canonical relation to REVERSED if one exists.
  const canonical = await relStore.findById(
    await deterministicRelationId({
      sourceEntityId: hypothesis.sourceEntityId,
      targetEntityId: hypothesis.targetEntityId,
      relationType: hypothesis.relationType,
      directed: hypothesis.directed,
      scoreModelVersion: hypothesis.scoreModelVersion,
    }),
    { caseId },
  );
  if (canonical) {
    await relStore.markReversed(canonical.id, { caseId });
  }

  return updated;
}