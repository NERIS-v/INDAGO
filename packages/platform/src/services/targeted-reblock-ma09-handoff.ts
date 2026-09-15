// ============================================================================
// Targeted Reblocking — M-A09 Entity Resolution Handoff (Phase 5A-PR11)
//
// Boundary driver for the targeted-reblock pipeline. Resolves ONLY the
// bounded pair subset surfaced by a targeted reblock run and persists
// PROPOSED EntityHypotheses through the lifecycle-preserving upsert.
//
// This is a faithful replica of the resolution loop in ingest-evidence.ts
// (completeMA09 + candidateResolutionToHypothesis) scoped to an explicit
// pair set. It reuses the same pure engines and same durable stores; the
// only difference is the input set (not the whole-case universe) — the
// contract and authority semantics are identical.
//
// NON-GOALS (enforced):
//   - Never reads the whole case (the caller provides the pair subset)
//   - Never fabricates canonical Entities
//   - Never resets an AUTHORITY lifecycle state (ACCEPTED / REJECTED /
//     REVERSED) back to PROPOSED
//   - Never resolves across case boundaries
// ============================================================================

import {
  type CandidatePair,
  type EntityHypothesis,
  type EntityMentionCandidate,
  EntityHypothesisSchema,
} from "@indago/contracts";
import {
  buildEntityHypothesisIdentityKey,
  compareCandidates,
  deterministicEntityHypothesisId,
} from "@indago/entity-resolution";
import { entityHypothesisStore } from "../persistence/entity-hypothesis-store.js";
import { logAuditEvent } from "../audit/logger.js";

/**
 * The handoff result — bounded counts only, never large payloads.
 */
export interface EntityHypothesisHandoffResult {
  /** Number of pairs handed to the M-A09 resolution boundary. */
  readonly handedOffPairs: number;
  /** Fresh PROPOSED hypotheses that landed (idempotent re-runs may yield 0). */
  readonly proposedHypotheses: number;
}

/**
 * Faithful replica of the candidateResolutionToHypothesis mapping in
 * ingest-evidence.ts (private function, not importable). Mapping is purely
 * data-driven — the PURE engine owns all semantics.
 *
 * HYPOTHESIS IDENTITY: deterministic — candidatePairId + scoreModelVersion →
 * SHA-256 → stable UUID (id) with the identical canonical key (identityKey).
 */
function candidateResolutionToHypothesis(params: {
  readonly resolution: import("@indago/contracts").CandidateResolution;
  readonly pair: CandidatePair;
  readonly leftCandidate: EntityMentionCandidate;
  readonly id: string;
  readonly nowIso: string;
}): EntityHypothesis {
  const { resolution, pair, leftCandidate, id, nowIso } = params;
  const derivedFrom = Array.from(
    new Set(
      [...resolution.supportingObservationIds, ...resolution.contradictingObservationIds],
    ),
  ).slice(
    0,
    resolution.supportingObservationIds.length + resolution.contradictingObservationIds.length,
  );
  return EntityHypothesisSchema.parse({
    id,
    caseId: pair.caseId,
    ...(pair.investigationId !== undefined ? { investigationId: pair.investigationId } : {}),
    candidatePairId: pair.id,
    supportingCandidateIds: [pair.leftCandidateId, pair.rightCandidateId],
    comparisonStatus: resolution.comparisonStatus,
    score: resolution.score,
    scoreModelVersion: resolution.scoreModelVersion,
    supportingObservationIds: resolution.supportingObservationIds,
    contradictingObservationIds: resolution.contradictingObservationIds,
    status: resolution.status,
    provenance: {
      sourceId: leftCandidate.provenance.sourceId,
      ...(leftCandidate.provenance.artifactId !== undefined
        ? { artifactId: leftCandidate.provenance.artifactId }
        : {}),
      ...(derivedFrom.length > 0 ? { derivedFrom } : {}),
      extractor: "indago:resolution:engine",
      extractionMethod: resolution.scoreModelVersion,
    },
    createdAt: { value: nowIso, precision: "exact" },
    updatedAt: { value: nowIso, precision: "exact" },
  });
}

/**
 * Resolve a bounded pair set and persist PROPOSED EntityHypotheses via the
 * lifecycle-preserving upsert (never resets ACCEPTED / REJECTED / REVERSED).
 *
 * Per-pair, partial-failure safe. No whole-batch gate. The candidate map is
 * built ONCE from the caller's candidate array (the targeted-reblock service's
 * bounded case-scoped universe — never re-read from DB).
 */
export async function handoffPairsToEntityResolution(params: {
  readonly caseId: string;
  readonly investigationId: string;
  readonly pairs: readonly CandidatePair[];
  readonly candidates: readonly EntityMentionCandidate[];
}): Promise<EntityHypothesisHandoffResult> {
  const { caseId, investigationId, pairs, candidates } = params;
  if (pairs.length === 0) return { handedOffPairs: 0, proposedHypotheses: 0 };

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const nowIso = new Date().toISOString();
  let proposedHypotheses = 0;

  for (const pair of pairs) {
    const leftCandidate = candidateById.get(pair.leftCandidateId);
    const rightCandidate = candidateById.get(pair.rightCandidateId);
    if (!leftCandidate || !rightCandidate) continue;
    if (leftCandidate.id === rightCandidate.id) continue; // defensive self-pair

    const { candidateResolution, proposed: fallsProposed } = await compareCandidates({
      pair,
      leftCandidate,
      rightCandidate,
    });
    if (!fallsProposed || candidateResolution.status !== "PROPOSED") continue;

    const scoreModelVersion = candidateResolution.scoreModelVersion;
    const identityKey = buildEntityHypothesisIdentityKey({
      candidatePairId: pair.id,
      scoreModelVersion,
    });
    const id = await deterministicEntityHypothesisId({
      candidatePairId: pair.id,
      scoreModelVersion,
    });

    const hypothesis = candidateResolutionToHypothesis({
      resolution: candidateResolution,
      pair,
      leftCandidate,
      id,
      nowIso,
    });

    const result = await entityHypothesisStore.upsertHypothesis({
      identityKey,
      hypothesis,
    });

    if (!result.preservedExisting && result.reusedExisting === false) {
      proposedHypotheses += 1;
      await logAuditEvent({
        investigationId,
        action: "ENTITY_RESOLUTION_PROPOSED",
        actor: "TARGETED_REBLOCK_PIPELINE",
        targetType: "SYSTEM",
        targetId: hypothesis.id,
        description: `Proposed entity identity hypothesis ${hypothesis.id} (case ${caseId}, pair ${pair.id}, score ${candidateResolution.score}, model ${scoreModelVersion}) via targeted reblock run`,
      });
    }
  }

  return { handedOffPairs: pairs.length, proposedHypotheses };
}