// ============================================================================
// Competing Explanation Generation (Phase 5A-PR15)
//
// Deterministic V1 pipeline (policy §9):
//   validate -> classify (bind) -> build signals -> generate candidates ->
//   identity + dedupe -> rank + bound -> validate the frozen contract.
//
// Each family is emitted ONLY when grounded (policy §2/§10):
//   - the PRIMARY family is grounded by the bound classification itself;
//   - alternatives are emitted iff their grounded signal is present.
//
// Contradictions are PRESERVED and never collapsed (policy §16/§30).
// INSUFFICIENT_CONTEXT classification -> valid empty set (a RESULT, not an
// error — mirrors PR14). No persistence, no mutation, no hidden retrieval.
//
// Frozen policy document: docs/architecture/pr15-competing-explanations.md.
// ============================================================================

import type {
  CompetingExplanationBasis,
  CompetingExplanationSet,
  CompetingExplanationSupportLevel,
  CompetingExplanationType,
  TemporalInterval,
} from '@indago/contracts';
import {
  CompetingExplanationSetSchema,
  MAX_COMPETING_EXPLANATIONS,
  canonicalizeDeterministic,
} from '@indago/contracts';
import type { GapClassificationType } from '@indago/contracts';

import type { CompetingExplanationInput } from '../contracts/competing-explanation-input.js';
import { buildExplanationSignals, type DerivedExplanationSignals } from './signals.js';
import { CompetingExplanationError, CompetingExplanationErrorCodes } from './errors.js';
import { uncertaintyHeuristic } from '../contracts/competing-explanation-policy.js';
import { PRIMARY_EXPLANATION_TYPE } from '../contracts/competing-explanation-policy.js';
import { computeExplanationId, dedupeByExplanationId, explanationIdentityFor } from './dedupe.js';
import type { ExplanationSetContext } from './dedupe.js';
import { rankingKeyFor, sortByRankingKey } from './rank.js';
import { sha256Hex } from './sha256.js';

// ---------------------------------------------------------------------------
// Explanation draft (identity-, rank- and contract-neutral working object)
// ---------------------------------------------------------------------------

export interface CompetingExplanationDraft {
  readonly explanationType: CompetingExplanationType;
  readonly basis: CompetingExplanationBasis;
  readonly statement: string;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly supportingHypothesisIds: readonly string[];
  readonly contradictingHypothesisIds: readonly string[];
  readonly structuralSignalIds: readonly string[];
  readonly temporalScope: TemporalInterval | null;
  readonly supportLevel: CompetingExplanationSupportLevel;
  readonly uncertainty: number;
  readonly assumptions: readonly string[];
}

// ---------------------------------------------------------------------------
// Frozen statement + assumption templates (policy §10)
// ---------------------------------------------------------------------------

function rel(expected: string | null): string {
  return expected ?? 'expected';
}

function statementFor(
  explanationType: CompetingExplanationType,
  signals: DerivedExplanationSignals,
): string {
  const expected = signals.facts.signals.expectedRelationshipType;
  const questionFramed =
    expected !== null || signals.facts.signals.supportingHypothesisCount > 0;
  switch (explanationType) {
    case 'MISSING_INVESTIGATION_EXPLANATION':
      return questionFramed
        ? `The expected ${rel(expected)} relationship was identified as a question but has not been conclusively evaluated by investigation so far; the hole persists because the question is open, not because evidence of absence exists.`
        : `The hole reflects an investigative question that has not yet been concluded; the absence of a resolved evaluation is the explanation, and the absence does not assert the relationship does not exist.`;
    case 'MISSING_DATA_EXPLANATION':
      return `The expected ${rel(expected)} relationship cannot yet be resolved because the necessary evidence is absent from the bounded context; absence of evidence is not evidence of absence.`;
    case 'MISSING_COMPARISON_EXPLANATION':
      return `The supported indication of ${rel(expected)} cannot be adequately evaluated because a competing or alternative interpretation is not yet established; no meaningful comparison baseline exists in the bounded context.`;
    case 'INFRASTRUCTURE_EXPLANATION':
      return `The hole is consistent with a technical or representation limitation — the relevant source or relationship structure is not fully represented in the bounded context — rather than with the relationship being absent in reality.`;
    case 'CONCEALMENT_CONSISTENT_EXPLANATION':
      return `The available structural/evidence pattern is compatible with behaviour consistent with concealment as ONE possible explanation, and is NOT an assertion that concealment occurred; the absence pattern does not establish intent, criminality, or guilt on its own.`;
    case 'RELATION_REPRESENTATION_EXPLANATION':
      return `The relationship type ${rel(expected)} is not represented by any in-scope edge or relationship hypothesis; the hole may reflect that this relationship structure cannot be represented or detected within the bounded context.`;
    case 'TEMPORAL_EXPLANATION':
      return `Relevant observations fall outside the declared temporal window; the hole may be a boundary/observation-window artefact rather than the absence of the underlying relationship.`;
    case 'ENTITY_FRAGMENTATION_EXPLANATION':
      return `Identity resolution of the candidate's entities is not fully proven within the bounded context; the same real-world actor could be represented by multiple entities, so the missing link may be an identity artefact rather than absence. Specific entity-split configurations are outside V1 (PR16).`;
    case 'INNOCENT_ALTERNATIVE_EXPLANATION':
      return `A legitimate, structurally supported alternative interpretation is present in the bounded context; it competes with the selected classification and may fully explain the hole absent any negative intent.`;
  }
}

function assumptionsFor(explanationType: CompetingExplanationType): readonly string[] {
  switch (explanationType) {
    case 'MISSING_INVESTIGATION_EXPLANATION':
      return ['the absence of a resolved evaluation does not assert the relationship does not exist'];
    case 'MISSING_DATA_EXPLANATION':
      return ['absence of evidence is not evidence of absence'];
    case 'MISSING_COMPARISON_EXPLANATION':
      return ['the supported indication is interpretation-relative until a baseline is compared'];
    case 'INFRASTRUCTURE_EXPLANATION':
      return ['the limitation is technical/representational, not substantive'];
    case 'CONCEALMENT_CONSISTENT_EXPLANATION':
      return ['the pattern is compatible with concealment as one explanation, not proof of it'];
    case 'RELATION_REPRESENTATION_EXPLANATION':
      return ['the relationship type is not representable within the bounded context'];
    case 'TEMPORAL_EXPLANATION':
      return ['observations outside the declared window are relevant to the hole'];
    case 'ENTITY_FRAGMENTATION_EXPLANATION':
      return ['identity resolution may merge or split real-world actors'];
    case 'INNOCENT_ALTERNATIVE_EXPLANATION':
      return ['the competing interpretation is legitimate and structurally supported'];
  }
}

// ---------------------------------------------------------------------------
// Family builders (policy §10) — every draft carries grounded references
// ---------------------------------------------------------------------------

function primaryDraft(
  signals: DerivedExplanationSignals,
  classificationType: GapClassificationType,
): CompetingExplanationDraft {
  const facts = signals.facts;
  const contradicted =
    signals.contradictionObservationIds.length > 0 ||
    signals.contradictionHypothesisIds.length > 0;
  const explanationType =
    classificationType === 'MISSING_INVESTIGATION'
      ? 'MISSING_INVESTIGATION_EXPLANATION'
      : classificationType === 'MISSING_DATA'
        ? 'MISSING_DATA_EXPLANATION'
        : classificationType === 'MISSING_COMPARISON'
          ? 'MISSING_COMPARISON_EXPLANATION'
          : classificationType === 'INFRASTRUCTURE_GAP'
            ? 'INFRASTRUCTURE_EXPLANATION'
            : 'CONCEALMENT_CONSISTENT_EXPLANATION';

  const regionLimited =
    facts.signals.regionTruncated ||
    facts.signals.regionLimited ||
    facts.signals.contextCompleteness.observationContextLimited;

  let basis: CompetingExplanationBasis;
  if (explanationType === 'MISSING_INVESTIGATION_EXPLANATION') {
    basis =
      facts.signals.expectedRelationshipType !== null || facts.signals.supportingHypothesisCount > 0
        ? 'QUESTION_IDENTIFIED_NOT_EVALUATED'
        : 'INVESTIGATION_NOT_CONCLUDED';
  } else if (explanationType === 'INFRASTRUCTURE_EXPLANATION') {
    basis = regionLimited ? 'REGION_REPRESENTATION_LIMITED' : 'SOURCE_CATEGORY_UNAVAILABLE';
  } else if (explanationType === 'MISSING_DATA_EXPLANATION') {
    basis = 'REQUIRED_INFORMATION_ABSENT';
  } else if (explanationType === 'MISSING_COMPARISON_EXPLANATION') {
    basis = 'COMPARISON_BASELINE_ABSENT';
  } else {
    basis = 'PATTERN_COMPATIBLE_ABSENCE';
  }

  let supportingObservationIds: readonly string[];
  let supportingHypothesisIds: readonly string[];
  if (explanationType === 'CONCEALMENT_CONSISTENT_EXPLANATION') {
    supportingObservationIds = facts.endpointObservationIds;
    supportingHypothesisIds = [];
  } else if (explanationType === 'MISSING_COMPARISON_EXPLANATION') {
    supportingObservationIds = facts.candidateSupportingObservationIds;
    supportingHypothesisIds = facts.candidateSupportingHypothesisIds;
  } else {
    supportingObservationIds = [];
    supportingHypothesisIds = facts.candidateSupportingHypothesisIds;
  }

  const supportLevel: CompetingExplanationSupportLevel = contradicted
    ? 'CONTRADICTED'
    : explanationType === 'CONCEALMENT_CONSISTENT_EXPLANATION'
      ? 'SUPPORTED'
      : signals.classification.status === 'CONFIDENT'
        ? 'SUPPORTED'
        : 'PLAUSIBLE';

  return {
    explanationType,
    basis,
    statement: statementFor(explanationType, signals),
    supportingObservationIds,
    contradictingObservationIds: signals.contradictionObservationIds,
    supportingHypothesisIds,
    contradictingHypothesisIds: signals.contradictionHypothesisIds,
    structuralSignalIds: facts.candidateNodeIds,
    temporalScope: signals.holeTemporalScope,
    supportLevel,
    uncertainty: uncertaintyHeuristic(contradicted, signals.classification.status),
    assumptions: assumptionsFor(explanationType),
  };
}

function alternativeDrafts(signals: DerivedExplanationSignals): CompetingExplanationDraft[] {
  const facts = signals.facts;
  const contradicted =
    signals.contradictionObservationIds.length > 0 ||
    signals.contradictionHypothesisIds.length > 0;
  const supportLevel: CompetingExplanationSupportLevel = contradicted
    ? 'CONTRADICTED'
    : 'PLAUSIBLE';
  const uncertainty = uncertaintyHeuristic(contradicted, signals.classification.status);
  const drafts: CompetingExplanationDraft[] = [];

  const entityGrounded = signals.entityHypothesisPresent;
  const relGrounded =
    facts.signals.expectedRelationshipType !== null &&
    !signals.expectedRelationTypeRepresented;
  const temporalGrounded = signals.temporalMismatch;
  const innocentGrounded = signals.competingHypothesisIds.length > 0;

  if (entityGrounded) {
    drafts.push({
      explanationType: 'ENTITY_FRAGMENTATION_EXPLANATION',
      basis: 'ENTITY_IDENTITY_UNRESOLVED',
      statement: statementFor('ENTITY_FRAGMENTATION_EXPLANATION', signals),
      supportingObservationIds: [],
      contradictingObservationIds: signals.contradictionObservationIds,
      supportingHypothesisIds: signals.entityHypothesisIds,
      contradictingHypothesisIds: signals.contradictionHypothesisIds,
      structuralSignalIds: facts.candidateNodeIds,
      temporalScope: signals.holeTemporalScope,
      supportLevel,
      uncertainty,
      assumptions: assumptionsFor('ENTITY_FRAGMENTATION_EXPLANATION'),
    });
  }

  if (relGrounded) {
    drafts.push({
      explanationType: 'RELATION_REPRESENTATION_EXPLANATION',
      basis: 'RELATIONSHIP_TYPE_UNREPRESENTED',
      statement: statementFor('RELATION_REPRESENTATION_EXPLANATION', signals),
      supportingObservationIds: [],
      contradictingObservationIds: signals.contradictionObservationIds,
      supportingHypothesisIds: [],
      contradictingHypothesisIds: signals.contradictionHypothesisIds,
      structuralSignalIds: facts.candidateNodeIds,
      temporalScope: signals.holeTemporalScope,
      supportLevel,
      uncertainty,
      assumptions: assumptionsFor('RELATION_REPRESENTATION_EXPLANATION'),
    });
  }

  if (temporalGrounded) {
    drafts.push({
      explanationType: 'TEMPORAL_EXPLANATION',
      basis: 'TEMPORAL_SCOPE_MISMATCH',
      statement: statementFor('TEMPORAL_EXPLANATION', signals),
      supportingObservationIds: signals.datedEndpointObservationIds,
      contradictingObservationIds: signals.contradictionObservationIds,
      supportingHypothesisIds: [],
      contradictingHypothesisIds: signals.contradictionHypothesisIds,
      structuralSignalIds: facts.candidateNodeIds,
      temporalScope: signals.windowScope,
      supportLevel,
      uncertainty,
      assumptions: assumptionsFor('TEMPORAL_EXPLANATION'),
    });
  }

  if (innocentGrounded) {
    drafts.push({
      explanationType: 'INNOCENT_ALTERNATIVE_EXPLANATION',
      basis: 'LEGITIMATE_STRUCTURAL_ALTERNATIVE',
      statement: statementFor('INNOCENT_ALTERNATIVE_EXPLANATION', signals),
      supportingObservationIds: facts.candidateSupportingObservationIds,
      contradictingObservationIds: signals.contradictionObservationIds,
      supportingHypothesisIds: signals.competingHypothesisIds,
      contradictingHypothesisIds: signals.contradictionHypothesisIds,
      structuralSignalIds: facts.candidateNodeIds,
      temporalScope: signals.holeTemporalScope,
      supportLevel,
      uncertainty,
      assumptions: assumptionsFor('INNOCENT_ALTERNATIVE_EXPLANATION'),
    });
  }

  return drafts;
}

/**
 * Build all grounded candidate drafts for the bound classification
 * (policy §10). Empty when the classification is INSUFFICIENT_CONTEXT.
 */
export function buildCandidateDrafts(signals: DerivedExplanationSignals): CompetingExplanationDraft[] {
  const type = signals.classification.type;
  if (type === undefined) return [];

  const contradicted =
    signals.contradictionObservationIds.length > 0 ||
    signals.contradictionHypothesisIds.length > 0;

  // Policy §16: contradictions must NEVER collapse into concealment or missing-data.
  if (type === 'CONCEALMENT_CONSISTENT_PATTERN' && contradicted) return [];
  if (type === 'MISSING_DATA' && contradicted) {
    // MISSING_DATA is forbidden under contradictions; fall back to no primary
    // family and emit only grounded alternatives (nothing is invented).
    return alternativeDrafts(signals);
  }

  return [primaryDraft(signals, type), ...alternativeDrafts(signals)];
}

// ---------------------------------------------------------------------------
// Public API: generateCompetingExplanations
// ---------------------------------------------------------------------------

/**
 * Generate the bounded, ranked, deduplicated competing-explanation set for a
 * qualified graph hole, bound to the REAL PR14 classification.
 *
 * Pure, deterministic, no clock/LLM/persistence. Throws typed
 * CompetingExplanationError for §7 boundary violations. Non-throwing epistemic
 * state (INSUFFICIENT_CONTEXT -> empty set) is a RESULT.
 */
export function generateCompetingExplanations(
  input: CompetingExplanationInput,
): CompetingExplanationSet {
  if (input === null || typeof input !== 'object') {
    throw new CompetingExplanationError(CompetingExplanationErrorCodes.INVALID_INPUT, 'input must be an object');
  }

  const signals = buildExplanationSignals(input);
  const { classification } = signals;
  const type: GapClassificationType | undefined = classification.type;
  const context = input.context;

  const setContext: ExplanationSetContext = {
    caseId: context.caseId,
    graphVersionId: context.graphVersionId,
    graphHoleId: classification.graphHoleId,
    classificationType: type ?? null,
    expectedRelationshipType: context.qualifiedCandidate.rawCandidate.expectedRelationshipType,
    policyVersion: input.competingExplanationPolicyVersion,
  };

  const candidates = buildCandidateDrafts(signals).map((draft) => {
    const identity = explanationIdentityFor(draft, setContext);
    const explanationId = computeExplanationId(identity);
    return { draft, explanationId, identity };
  });

  const distinct = dedupeByExplanationId(candidates);

  const sourceByObservation = new Map(context.observations.map((o) => [o.id, o.sourceId]));
  const ranked = distinct
    .map((c) => ({
      ...c,
      rankingKey: rankingKeyFor(
        {
          explanationType: c.draft.explanationType,
          supportLevel: c.draft.supportLevel,
          supportingObservationIds: c.draft.supportingObservationIds,
          supportingHypothesisIds: c.draft.supportingHypothesisIds,
          explanationId: c.explanationId,
        },
        type === undefined ? 'MISSING_INVESTIGATION_EXPLANATION' : PRIMARY_EXPLANATION_TYPE[type],
        sourceByObservation,
      ),
    }))
    .sort(sortByRankingKey);

  const truncated = ranked.length > MAX_COMPETING_EXPLANATIONS;
  const bounded = truncated ? ranked.slice(0, MAX_COMPETING_EXPLANATIONS) : ranked;

  // Explanation-context digest (policy §6): the classification the set binds to.
  const contextSha256 = sha256Hex(
    canonicalizeDeterministic({
      classificationContextSha256: classification.contextSha256,
      classificationType: type ?? null,
      competingExplanationPolicyVersion: input.competingExplanationPolicyVersion,
    }),
  );

  try {
    return CompetingExplanationSetSchema.parse({
      caseId: setContext.caseId,
      graphVersionId: setContext.graphVersionId,
      graphHoleId: setContext.graphHoleId,
      classification: {
        type: setContext.classificationType,
        status: classification.status,
        contextSha256: classification.contextSha256,
        classificationPolicyVersion: classification.classificationPolicyVersion,
      },
      explanations: bounded.map((c) => ({
        explanationId: c.explanationId,
        type: c.draft.explanationType,
        basis: c.draft.basis,
        statement: c.draft.statement,
        graphHoleId: setContext.graphHoleId,
        gapClassificationType: setContext.classificationType,
        supportingObservationIds: [...c.draft.supportingObservationIds],
        contradictingObservationIds: [...c.draft.contradictingObservationIds],
        supportingHypothesisIds: [...c.draft.supportingHypothesisIds],
        contradictingHypothesisIds: [...c.draft.contradictingHypothesisIds],
        structuralSignalIds: [...c.draft.structuralSignalIds],
        temporalScope: c.draft.temporalScope,
        supportLevel: c.draft.supportLevel,
        uncertainty: c.draft.uncertainty,
        assumptions: [...c.draft.assumptions],
        rankingKey: c.rankingKey,
        policyVersion: input.competingExplanationPolicyVersion,
      })),
      explanationCount: bounded.length,
      truncated,
      contextSha256,
      policyVersion: input.competingExplanationPolicyVersion,
      computedAt: input.computedAt,
    });
  } catch (err) {
    throw new CompetingExplanationError(
      CompetingExplanationErrorCodes.INVALID_INPUT,
      `competing-explanation set rejected by the frozen contract: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}