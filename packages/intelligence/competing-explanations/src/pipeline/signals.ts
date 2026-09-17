// ============================================================================
// Competing Explanation Signal Builder (Phase 5A-PR15)
//
// Derives the normalized, deterministic signal layer (policy §6) from the
// supplied closed-world package and the REAL PR14 classification:
//   - enforces the authority boundary (caseId/graphVersionId/regionId) and
//     every candidate reference against the supplied context
//     (CONTEXT_MISMATCH when a required id is absent);
//   - RE-RUNS the deterministic classifier (`classifyGap`) and requires the
//     recomputed classification to EQUAL the supplied `gapClassification`
//     (policy §7 — context binding, CONTEXT_MISMATCH otherwise);
//   - reuses PR14's `buildClassificationSignals` as the authoritative signal
//     source (never re-invented) and adds the small per-explanation
//     derivations (relation-type representation, temporal mismatch, entity
//     hypothesis presence, contradiction references);
//   - emits ONLY observed-fact signals (no fabrication, no content-semantic
//     reading, no hidden retrieval).
//
// Determinism (policy §2): input ordering never matters — all collections are
// deduped/sorted before derivation. No clock, no random ids.
// ============================================================================

import type { GapClassificationInput, GapClassificationResult } from '@indago/gap-classification';
import { buildClassificationSignals, classifyGap, GapClassificationError } from '@indago/gap-classification';
import { GapClassificationErrorCodes } from '@indago/gap-classification';
import type { DerivedClassificationFacts } from '@indago/gap-classification';
import type { TemporalInterval } from '@indago/contracts';

import type { CompetingExplanationInput } from '../contracts/competing-explanation-input.js';
import { CompetingExplanationError, CompetingExplanationErrorCodes } from './errors.js';
import { intervalsOverlap } from './temporal.js';
import { sortedUniqueString } from './sorted.js';

/** Derived signals + the bound PR14 classification (policy §6). */
export interface DerivedExplanationSignals {
  readonly facts: DerivedClassificationFacts;
  /** The bound, validated PR14 classification (equals the supplied one). */
  readonly classification: GapClassificationResult;
  /** Candidate actor entity ids (nodes + grounded hypotheses). */
  readonly candidateEntityIds: ReadonlySet<string>;
  /** Sorted-unique candidate contradicting observation ids (validated in scope). */
  readonly candidateContradictingObservationIds: readonly string[];
  /** Sorted-unique total contradiction observation ids (candidate + in-scope atomics). */
  readonly contradictionObservationIds: readonly string[];
  /** Sorted-unique total contradiction hypothesis ids (in-scope atomic derivedIds). */
  readonly contradictionHypothesisIds: readonly string[];
  /** Sorted-unique dated endpoint observations (temporal-mismatch evidence). */
  readonly datedEndpointObservationIds: readonly string[];
  /** The candidate's declared temporal scope (M-A12 authority), or null. */
  readonly holeTemporalScope: TemporalInterval | null;
  /** The effective temporal window (candidate scope, else region context), or null. */
  readonly windowScope: TemporalInterval | null;
  /** true when the candidate's expected relationship type is absent from in-scope edges + relation atomics. */
  readonly expectedRelationTypeRepresented: boolean;
  /** true when all dated endpoint observations fall outside the declared temporal window (policy §13). */
  readonly temporalMismatch: boolean;
  /** true when an in-scope ENTITY_HYPOTHESIS atomic references a candidate entity (or a candidate ref is one). */
  readonly entityHypothesisPresent: boolean;
  /** Sorted-unique in-scope ENTITY_HYPOTHESIS derivedIds referencing candidate entities (identity signal). */
  readonly entityHypothesisIds: readonly string[];
  /** Sorted-unique in-scope competing atomic derivedIds (grounds the INNOCENT_ALTERNATIVE family). */
  readonly competingHypothesisIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Authority + context binding (fail fast, deterministic; policy §7)
// ---------------------------------------------------------------------------

function enforceClassificationBinding(
  recomputed: GapClassificationResult,
  supplied: GapClassificationResult,
): void {
  if (recomputed.graphHoleId !== supplied.graphHoleId) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      'gapClassification.graphHoleId does not match the recomputed classification',
    );
  }
  if (recomputed.contextSha256 !== supplied.contextSha256) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      'gapClassification.contextSha256 does not match the recomputed classification; the supplied result does not bind to the context',
    );
  }
  if (recomputed.type !== supplied.type) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      'gapClassification.type does not match the recomputed classification',
    );
  }
  if (recomputed.status !== supplied.status) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      'gapClassification.status does not match the recomputed classification',
    );
  }
  if (
    recomputed.reasonCodes.length !== supplied.reasonCodes.length ||
    recomputed.reasonCodes.some((code, i) => code !== supplied.reasonCodes[i])
  ) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      'gapClassification.reasonCodes do not match the recomputed classification',
    );
  }
}

// ---------------------------------------------------------------------------
// Per-explanation derivations (observed-fact only, policy §6)
// ---------------------------------------------------------------------------

function deriveCandidateEntityIds(context: GapClassificationInput): Set<string> {
  const rc = context.qualifiedCandidate.rawCandidate;
  const nodeById = new Map(context.nodes.map((n) => [n.id, n]));
  const set = new Set<string>();
  for (const nid of rc.nodeIds) {
    const entityId = nodeById.get(nid)?.entityId;
    if (entityId) set.add(entityId);
  }
  for (const dId of rc.supportingHypothesisIds) {
    const atomic = context.hypothesisContext.atomic.find((a) => a.derivedId === dId);
    if (atomic) {
      for (const e of atomic.referencedCanonicalEntityIds) set.add(e);
    }
  }
  return set;
}

function deriveExpectedRelationTypeRepresented(
  context: GapClassificationInput,
  expectedRelationshipType: string | null,
): boolean {
  if (expectedRelationshipType === null) return false;
  const edgePresent = context.edges.some((e) => e.relationType === expectedRelationshipType);
  if (edgePresent) return true;
  return context.hypothesisContext.atomic.some(
    (a) => a.hypothesisType === 'RELATION_HYPOTHESIS' && a.predicate === expectedRelationshipType,
  );
}

function deriveTemporalMismatch(
  context: GapClassificationInput,
  endpointObservationIds: readonly string[],
): boolean {
  const rc = context.qualifiedCandidate.rawCandidate;
  const window = rc.temporalScope ?? context.region.identity.temporalContext ?? null;
  if (window === null) return false;
  const endpointIds = new Set(endpointObservationIds);
  const dated = context.observations.filter(
    (o) => endpointIds.has(o.id) && o.validityInterval !== undefined,
  );
  if (dated.length === 0) return false;
  return dated.every((o) => !intervalsOverlap(window, o.validityInterval ?? null));
}

function deriveEntityHypothesisPresence(
  context: GapClassificationInput,
  candidateEntityIds: ReadonlySet<string>,
  candidateSupportingHypothesisIds: readonly string[],
): { present: boolean; ids: string[] } {
  const supporting = new Set(candidateSupportingHypothesisIds);
  const ids: string[] = [];
  for (const a of context.hypothesisContext.atomic) {
    if (a.hypothesisType !== 'ENTITY_HYPOTHESIS') continue;
    if (
      supporting.has(a.derivedId) ||
      a.referencedCanonicalEntityIds.some((e) => candidateEntityIds.has(e))
    ) {
      ids.push(a.derivedId);
    }
  }
  return { present: ids.length > 0, ids: sortedUniqueString(ids) };
}

function deriveCompetingHypothesisIds(
  context: GapClassificationInput,
  candidateEntityIds: ReadonlySet<string>,
  candidateSupportingHypothesisIds: readonly string[],
): string[] {
  const supporting = new Set(candidateSupportingHypothesisIds);
  const ids: string[] = [];
  for (const a of context.hypothesisContext.atomic) {
    if (supporting.has(a.derivedId)) continue;
    if (a.referencedCanonicalEntityIds.some((e) => candidateEntityIds.has(e))) {
      ids.push(a.derivedId);
    }
  }
  return sortedUniqueString(ids);
}

// ---------------------------------------------------------------------------
// Public API: buildExplanationSignals
// ---------------------------------------------------------------------------

/**
 * Build the normalized explanation signals and bind the PR14 classification.
 * Throws a typed CompetingExplanationError on boundary violations
 * (CONTEXT_MISMATCH / INVALID_INPUT / UNSUPPORTED_POLICY) — never fabricates.
 */
export function buildExplanationSignals(input: CompetingExplanationInput): DerivedExplanationSignals {
  if (input === null || typeof input !== 'object') {
    throw new CompetingExplanationError(CompetingExplanationErrorCodes.INVALID_INPUT, 'input must be an object');
  }
  if (typeof input.competingExplanationPolicyVersion !== 'string') {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.INVALID_INPUT,
      'competingExplanationPolicyVersion is required',
    );
  }
  if (input.competingExplanationPolicyVersion !== 'v1') {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.UNSUPPORTED_POLICY,
      `unsupported competingExplanationPolicyVersion: ${String(input.competingExplanationPolicyVersion)}`,
    );
  }
  if (input.context == null || input.gapClassification == null) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.INVALID_INPUT,
      'context and gapClassification are required',
    );
  }

  // Re-run the deterministic classifier: supplies every authority check AND
  // produces the classification the supplied result must equal (policy §7).
  // PR14's GapClassificationError at this boundary is surfaced as a
  // CompetingExplanationError with a closed code (QUALIFIED_CANDIDATE_REQUIRED
  // maps to CONTEXT_MISMATCH — the candidate is not qulified in context).
  let recomputed: GapClassificationResult;
  try {
    recomputed = classifyGap(input.context);
  } catch (err) {
    if (err instanceof CompetingExplanationError) throw err;
    if (err instanceof GapClassificationError) {
      const code =
        err.code === GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED ||
        err.code === GapClassificationErrorCodes.CONTEXT_MISMATCH
          ? CompetingExplanationErrorCodes.CONTEXT_MISMATCH
          : err.code === GapClassificationErrorCodes.UNSUPPORTED_POLICY
            ? CompetingExplanationErrorCodes.UNSUPPORTED_POLICY
            : CompetingExplanationErrorCodes.INVALID_INPUT;
      throw new CompetingExplanationError(code, err.message);
    }
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.INVALID_INPUT,
      `context validation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  enforceClassificationBinding(recomputed, input.gapClassification);

  let facts: ReturnType<typeof buildClassificationSignals>;
  try {
    facts = buildClassificationSignals(input.context);
  } catch (err) {
    if (err instanceof GapClassificationError) {
      const code =
        err.code === GapClassificationErrorCodes.CONTEXT_MISMATCH
          ? CompetingExplanationErrorCodes.CONTEXT_MISMATCH
          : err.code === GapClassificationErrorCodes.UNSUPPORTED_POLICY
            ? CompetingExplanationErrorCodes.UNSUPPORTED_POLICY
            : err.code === GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED
              ? CompetingExplanationErrorCodes.CONTEXT_MISMATCH
              : CompetingExplanationErrorCodes.INVALID_INPUT;
      throw new CompetingExplanationError(code, err.message);
    }
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.INVALID_INPUT,
      `signal derivation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const rc = input.context.qualifiedCandidate.rawCandidate;

  const candidateEntityIds = deriveCandidateEntityIds(input.context);
  const contradictionObservationIds = sortedUniqueString([
    ...rc.contradictingObservationIds,
    ...input.context.hypothesisContext.atomic.flatMap((a) => a.contradictingObservations),
  ]);
  const contradictionHypothesisIds = sortedUniqueString(
    input.context.hypothesisContext.atomic.flatMap((a) => a.contradictingHypothesisIds),
  );
  const endpointIds = new Set(facts.endpointObservationIds);
  const datedEndpointObservationIds = sortedUniqueString(
    input.context.observations
      .filter((o) => endpointIds.has(o.id) && o.validityInterval !== undefined)
      .map((o) => o.id),
  );
  const entityPresence = deriveEntityHypothesisPresence(
    input.context,
    candidateEntityIds,
    facts.candidateSupportingHypothesisIds,
  );
  const holeTemporalScope = rc.temporalScope ?? null;
  const windowScope = holeTemporalScope ?? input.context.region.identity.temporalContext ?? null;

  return {
    facts,
    classification: recomputed,
    candidateEntityIds,
    candidateContradictingObservationIds: sortedUniqueString(rc.contradictingObservationIds),
    contradictionObservationIds,
    contradictionHypothesisIds,
    datedEndpointObservationIds,
    holeTemporalScope,
    windowScope,
    expectedRelationTypeRepresented: deriveExpectedRelationTypeRepresented(
      input.context,
      rc.expectedRelationshipType,
    ),
    temporalMismatch: deriveTemporalMismatch(input.context, facts.endpointObservationIds),
    entityHypothesisPresent: entityPresence.present,
    entityHypothesisIds: entityPresence.ids,
    competingHypothesisIds: deriveCompetingHypothesisIds(
      input.context,
      candidateEntityIds,
      facts.candidateSupportingHypothesisIds,
    ),
  };
}