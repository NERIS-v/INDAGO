// ============================================================================
// Gap Classification Signal Builder (Phase 5A-PR14)
//
// Derives the normalized, deterministic signal layer (policy §5) from the
// supplied bounded context:
//   - validates the authority boundary (caseId/graphVersionId/regionId)
//     and every candidate reference against the supplied input
//     (CONTEXT_MISMATCH when a required id is absent);
//   - emits ONLY observed-fact signals (no fabrication, no content-semantic
//     reading, no hidden retrieval);
//   - validates the emitted signals against the frozen contract schema
//     (INVALID_INPUT when the runtime drifted from the contract).
//
// Determinism (policy §7): input ordering never matters — all collections are
// deduped/sorted before derivation. No clock, no random ids.
// ============================================================================

import type {
  Observation,
  QualifiedGraphHoleCandidate,
  GapClassificationSignals,
} from '@indago/contracts';
import { GapClassificationSignalsSchema } from '@indago/contracts';
import { REGION_TRUNCATING_LIMITATIONS } from '@indago/graph-hole-region';

import type { GapClassificationInput } from '../contracts/classification-input.js';
import { CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION } from '../contracts/classification-policy.js';
import { GapClassificationError, GapClassificationErrorCodes } from './errors.js';
import { intervalsOverlap } from './temporal.js';
import { sortedUnique, sortedUniqueString } from './sorted.js';

/** Derived reference sets (policy §9) alongside the normalized signals. */
export interface DerivedClassificationFacts {
  readonly signals: GapClassificationSignals;
  /** Sorted-unique in-scope observation ids referencing candidate node entities (concealment endpoint evidence). */
  readonly endpointObservationIds: readonly string[];
  /** Sorted-unique candidate raw supporting observation ids (validated in scope). */
  readonly candidateSupportingObservationIds: readonly string[];
  /** Sorted-unique candidate raw grounded-hypothesis ids (validated in scope). */
  readonly candidateSupportingHypothesisIds: readonly string[];
  /** Sorted-unique candidate anchor node ids. */
  readonly candidateNodeIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Authority + integrity (fail fast, deterministic; policy §12)
// ---------------------------------------------------------------------------

function enforceAuthority(input: GapClassificationInput): QualifiedGraphHoleCandidate {
  const rc = input.qualifiedCandidate.rawCandidate;

  if (input.caseId !== input.region.identity.caseId) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.CONTEXT_MISMATCH,
      'input.caseId disagrees with the region identity',
    );
  }
  if (input.graphVersionId !== input.region.identity.graphVersionId) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.CONTEXT_MISMATCH,
      'input.graphVersionId disagrees with the region identity',
    );
  }
  if (input.caseId !== rc.caseId) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.CONTEXT_MISMATCH,
      'input.caseId disagrees with the candidate',
    );
  }
  if (input.graphVersionId !== rc.graphVersionId) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.CONTEXT_MISMATCH,
      'input.graphVersionId disagrees with the candidate',
    );
  }
  if (input.region.regionId !== rc.regionId) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.CONTEXT_MISMATCH,
      'input.region.regionId disagrees with the candidate',
    );
  }

  // Every candidate reference MUST exist in the supplied bounded input.
  const observedById = new Map(input.observations.map((o) => [o.id, o]));
  for (const id of [...rc.supportingObservationIds, ...rc.contradictingObservationIds]) {
    if (!observedById.has(id)) {
      throw new GapClassificationError(
        GapClassificationErrorCodes.CONTEXT_MISMATCH,
        `candidate observation reference ${id} is absent from the supplied context`,
      );
    }
  }

  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  for (const id of rc.nodeIds) {
    if (!nodeById.has(id)) {
      throw new GapClassificationError(
        GapClassificationErrorCodes.CONTEXT_MISMATCH,
        `candidate node reference ${id} is absent from the supplied context`,
      );
    }
  }

  const derivedIds = new Set(input.hypothesisContext.atomic.map((a) => a.derivedId));
  for (const id of rc.supportingHypothesisIds) {
    if (!derivedIds.has(id)) {
      throw new GapClassificationError(
        GapClassificationErrorCodes.CONTEXT_MISMATCH,
        `candidate hypothesis reference ${id} is absent from the supplied context`,
      );
    }
  }

  return input.qualifiedCandidate;
}

// ---------------------------------------------------------------------------
// Normalized signal derivation (policy §5)
// ---------------------------------------------------------------------------

function endpointTouchObservationIds(
  observations: readonly Observation[],
  candidateEntityIds: ReadonlySet<string>,
): string[] {
  return sortedUnique(
    observations
      .filter((o) => o.entityIds.some((e) => candidateEntityIds.has(e)))
      .map((o) => o.id),
    (id) => id,
  );
}

function deriveSignals(input: GapClassificationInput): GapClassificationSignals {
  const rc = input.qualifiedCandidate.rawCandidate;
  const region = input.region;
  const candidate = input.qualifiedCandidate;
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));

  // Candidate anchor entity ids (nodes + grounded hypotheses) for baseline/endpoint checks.
  const candidateEntityIds = new Set<string>();
  for (const nid of rc.nodeIds) {
    const entityId = nodeById.get(nid)?.entityId;
    if (entityId) candidateEntityIds.add(entityId);
  }
  for (const dId of rc.supportingHypothesisIds) {
    const atomic = input.hypothesisContext.atomic.find((a) => a.derivedId === dId);
    if (atomic) {
      for (const e of atomic.referencedCanonicalEntityIds) candidateEntityIds.add(e);
    }
  }

  // Endpoint observation presence (every candidate node has >= 1 in-scope observation).
  const endpointObservationPresence = rc.nodeIds.every((nid) => {
    const node = nodeById.get(nid);
    if (!node || node.entityId === undefined) return false;
    return input.observations.some((o) => o.entityIds.includes(node.entityId as string));
  });

  // Contradictions (candidate refs + in-scope atomic contradictions; preserved, never resolved).
  const candidateContradictionSignals = sortedUniqueString(rc.contradictingObservationIds);
  const atomicContradictionSignals = sortedUniqueString(
    input.hypothesisContext.atomic.flatMap((a) => [
      ...a.contradictingObservations,
      ...a.contradictingHypothesisIds,
    ]),
  );
  const contradictionPresence =
    candidateContradictionSignals.length > 0 || atomicContradictionSignals.length > 0;

  // Comparison baseline: in-scope competing atomic hypotheses on the candidate actor set.
  const competingAtomics = new Set<string>();
  for (const a of input.hypothesisContext.atomic) {
    if (rc.supportingHypothesisIds.includes(a.derivedId)) continue;
    if (a.referencedCanonicalEntityIds.some((e) => candidateEntityIds.has(e))) {
      competingAtomics.add(a.derivedId);
    }
  }
  const comparisonBaselinePresent = competingAtomics.size > 0;
  const alternativeCoverage =
    candidateEntityIds.size === 0 ? 0 : Math.min(1, competingAtomics.size / 3);

  // Region/context representation status (observed-fact flags only).
  const regionTruncated =
    region.truncated === true ||
    region.limitations.some((l) => REGION_TRUNCATING_LIMITATIONS.includes(l));
  const regionLimited = region.status === 'LIMITED' || region.status === 'DEGRADED';
  const semanticRetrievalTruncated =
    region.semanticExpansion.providerTruncated === true ||
    region.limitations.includes('SEMANTIC_RESULTS_TRUNCATED') ||
    region.limitations.includes('SEMANTIC_RESULTS_BOUND_REACHED');
  const observationContextLimited = region.limitations.includes('CONTEXT_OBSERVATION_BOUND_REACHED');
  const hypothesisGroupingTruncated =
    input.hypothesisContext.accounting.truncatedGroups > 0 ||
    input.hypothesisContext.groups.some((g) => g.truncated);

  const temporalContext = region.identity.temporalContext ?? null;
  const candidateTemporalScope = rc.temporalScope ?? null;
  const temporalContextLimited =
    candidateTemporalScope !== null && !intervalsOverlap(temporalContext, candidateTemporalScope);

  const inScopeObservationTypes = sortedUnique(
    input.observations.map((o) => o.type),
    (t) => t,
  );

  return GapClassificationSignalsSchema.parse({
    candidateId: rc.candidateId,
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    regionId: region.regionId,
    holeType: rc.detectorType,
    expectedRelationshipType: rc.expectedRelationshipType,
    structuralBasis: rc.structuralBasis,
    regionStatus: region.status,
    regionTruncated,
    regionLimited,
    nodeIds: sortedUniqueString(rc.nodeIds),
    temporalScopeDeclared: candidateTemporalScope !== null,
    temporalContextDeclared: temporalContext !== null,
    structuralScore: candidate.structuralScore,
    evidenceSupportScore: candidate.evidenceSupportScore,
    expectedInformationValue: candidate.expectedInformationValue,
    significance: candidate.significance,
    independentSupportUnitCount: candidate.independentSupportUnitIds.length,
    supportingObservationCount: rc.supportingObservationIds.length,
    contradictingObservationCount: rc.contradictingObservationIds.length,
    supportingHypothesisCount: rc.supportingHypothesisIds.length,
    inScopeObservationCount: input.observations.length,
    inScopeAtomicHypothesisCount: input.hypothesisContext.atomic.length,
    inScopeGroupCount: input.hypothesisContext.groups.length,
    contradictionPresence,
    contradictionCount:
      candidateContradictionSignals.length + atomicContradictionSignals.length,
    comparisonBaselinePresent,
    alternativeCoverage,
    endpointObservationPresence,
    inScopeObservationTypes,
    contextCompleteness: {
      semanticRetrievalTruncated,
      observationContextLimited,
      hypothesisContextLimited: false,
      hypothesisGroupingTruncated,
      temporalContextLimited,
      contextBudgetLimited: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Public API: buildClassificationSignals
// ---------------------------------------------------------------------------

/**
 * Build the normalized classification signals for a qualified candidate's
 * bounded context. Throws a typed GapClassificationError on boundary
 * violations (CONTEXT_MISMATCH / INVALID_INPUT) — never fabricates a signal.
 */
export function buildClassificationSignals(input: GapClassificationInput): DerivedClassificationFacts {
  if (input === null || typeof input !== 'object') {
    throw new GapClassificationError(GapClassificationErrorCodes.INVALID_INPUT, 'input must be an object');
  }
  if (typeof input.classificationPolicyVersion !== 'string') {
    throw new GapClassificationError(
      GapClassificationErrorCodes.INVALID_INPUT,
      'classificationPolicyVersion is required',
    );
  }
  if (input.classificationPolicyVersion !== CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.UNSUPPORTED_POLICY,
      `unsupported classificationPolicyVersion: ${String(input.classificationPolicyVersion)}`,
    );
  }
  if (input.qualifiedCandidate?.qualified !== true) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED,
      'PR14 classifies only already-qualified candidates',
    );
  }
  if (input.hypothesisContext == null) {
    throw new GapClassificationError(GapClassificationErrorCodes.INVALID_INPUT, 'hypothesisContext is required');
  }

  enforceAuthority(input);

  const rc = input.qualifiedCandidate.rawCandidate;
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const candidateEntityIds = new Set<string>();
  for (const nid of rc.nodeIds) {
    const entityId = nodeById.get(nid)?.entityId;
    if (entityId) candidateEntityIds.add(entityId);
  }

  let endpointObservationIds: readonly string[];
  let signals: GapClassificationSignals;
  try {
    endpointObservationIds = endpointTouchObservationIds(input.observations, candidateEntityIds);
    signals = deriveSignals(input);
  } catch (err) {
    if (err instanceof GapClassificationError) throw err;
    throw new GapClassificationError(
      GapClassificationErrorCodes.INVALID_INPUT,
      `signal derivation failed against the frozen contract: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    signals,
    endpointObservationIds,
    candidateSupportingObservationIds: sortedUniqueString(rc.supportingObservationIds),
    candidateSupportingHypothesisIds: sortedUniqueString(rc.supportingHypothesisIds),
    candidateNodeIds: sortedUniqueString(rc.nodeIds),
  };
}