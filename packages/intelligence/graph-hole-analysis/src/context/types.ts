// ============================================================================
// Graph-Hole Analysis Context Types (Phase 5A-PR7)
//
// The bounded, typed AI package the analyst sends to the model. Built only
// from the caller's authoritative input; deterministic (see build-context.ts).
//
// CLASSIFICATION CONTRACT — items are never flattened into one blob. The
// model receives explicitly distinguished kinds:
//   OBSERVED FACT      observations (content assertions extracted from evidence)
//   HYPOTHESIS         atomic relationship/entity hypotheses (derivedIds)
//   CONTRADICTION      explicit contradicting observation/hypothesis references
//   STRUCTURAL SIGNAL  graph structure / topology / qualification signals
//   INFERENCE          qualification scores and structural expectations
//                      (analyst interpretation, never observed facts)
//
// Every item carries a stable identifier from the authoritative source:
//   observation.id, atomic.derivedId, group.groupId, node.id, edge.id,
//   candidateId, sourceId.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';

import type { GraphHoleAnalysisPolicyVersion } from '../contracts/analysis-policy.js';

/** Explicitly-classified knowledge kinds present in the context package. */
export const CONTEXT_ITEM_KIND = {
  OBSERVED_FACT: 'OBSERVED_FACT',
  HYPOTHESIS: 'HYPOTHESIS',
  CONTRADICTION: 'CONTRADICTION',
  STRUCTURAL_SIGNAL: 'STRUCTURAL_SIGNAL',
  INFERENCE: 'INFERENCE',
} as const;
export type ContextItemKind = (typeof CONTEXT_ITEM_KIND)[keyof typeof CONTEXT_ITEM_KIND];

/** One supplied observation, transcribed to a bounded representation. */
export interface ContextObservation {
  readonly id: string;
  readonly kind: typeof CONTEXT_ITEM_KIND.OBSERVED_FACT;
  readonly type: string;
  readonly content: string;
  readonly entityIds: readonly string[];
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly supportUnitKey: string;
  readonly eventTime?: string;
  readonly validityInterval?: TemporalInterval | null;
}

/** One supplied atomic hypothesis (PR3-derived, authoritative derivedId). */
export interface ContextAtomicHypothesis {
  readonly derivedId: string;
  readonly kind: typeof CONTEXT_ITEM_KIND.HYPOTHESIS;
  readonly hypothesisType: string;
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
  readonly referencedCanonicalEntityIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly contradictingHypothesisIds: readonly string[];
  readonly evidenceSupport: number;
  readonly structuralRelevance: number;
  readonly graphVersion: string | null;
  readonly temporalScope?: TemporalInterval | null;
}

/** One supplied hypothesis group (PR3 output, content-addressed groupId). */
export interface ContextHypothesisGroup {
  readonly groupId: string;
  readonly componentId: string;
  readonly atomicHypotheses: readonly ContextAtomicHypothesis[];
  readonly sharedNodeIds: readonly string[];
  readonly canonicalEntityCount: number;
  readonly truncated: boolean;
  readonly truncatedReason: 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null;
}

/** One explicit contradiction reference (preserved, never resolved by PR7). */
export interface ContextContradiction {
  readonly id: string;
  readonly kind: typeof CONTEXT_ITEM_KIND.CONTRADICTION;
  readonly observationId: string | null;
  readonly hypothesisId: string | null;
  readonly contradictsObservationId: string | null;
  readonly contradictsHypothesisId: string | null;
}

/** One structural-graph signal (node or edge). */
export interface ContextStructuralSignal {
  readonly id: string;
  readonly kind: typeof CONTEXT_ITEM_KIND.STRUCTURAL_SIGNAL;
  readonly kindLabel: 'NODE' | 'EDGE';
  readonly label: string;
  readonly relationType?: string;
  readonly structuralImportance: number;
  readonly observationCount: number;
  readonly sourceCount: number;
  readonly temporalRange?: TemporalInterval | null;
}

/** One qualification/inference signal (analyst interpretation, not observed fact). */
export interface ContextInferenceSignal {
  readonly id: string;
  readonly kind: typeof CONTEXT_ITEM_KIND.INFERENCE;
  readonly label: string;
  readonly value: number;
}

/** One provenance/source reference (deduplicated by sourceId). */
export interface ContextProvenance {
  readonly sourceId: string;
  readonly sourceContextId?: string;
  readonly artifactId?: string;
  readonly documentRef?: string;
  readonly pageRef?: string;
  readonly spanRef?: string;
  readonly rowRef?: string;
  readonly extractor?: string;
  readonly observedFactIds: readonly string[];
}

/**
 * Completeness metadata — derived ONLY from authoritative signals:
 *   - semanticRetrievalTruncated := region semantic-expansion providerTruncated
 *     flag OR an explicit SEMANTIC_RESULTS_TRUNCATED region limitation. The
 *     frozen "truncated = genuinely more results existed" semantics apply;
 *     an exactly-full result set is NEVER counted as truncated.
 *   - regionLimited := region.truncated OR region status LIMITED/DEGRADED.
 *   - observationContextLimited / hypothesisContextLimited := an OVERFLOW was
 *     OBSERVED in the caller's input beyond the enforced package cap — never
 *     "we returned exactly the cap".
 *   - hypothesisGroupingTruncated := the PR3 grouping itself had to split
 *     components (accounting.truncatedGroups > 0).
 *   - temporalContextLimited := the candidate's claimed temporal scope is not
 *     covered by the region's declared temporal context.
 *   - contextBudgetLimited := reserved for future char-budget-based
 *     over-provisioning (currently a hard CONTEXT_TOO_LARGE failure instead).
 */
export interface ContextCompleteness {
  readonly semanticRetrievalTruncated: boolean;
  readonly regionLimited: boolean;
  readonly observationContextLimited: boolean;
  readonly hypothesisContextLimited: boolean;
  readonly hypothesisGroupingTruncated: boolean;
  readonly temporalContextLimited: boolean;
  readonly contextBudgetLimited: boolean;
}

/** Exact effective counts — what the model actually saw. */
export interface ContextCounts {
  readonly suppliedRegions: number;
  readonly suppliedCandidate: number;
  readonly suppliedNodeIds: number;
  readonly suppliedEdgeIds: number;
  readonly suppliedObservations: number;
  readonly suppliedAtomicHypotheses: number;
  readonly suppliedGroups: number;
  readonly includedObservations: number;
  readonly includedAtomicHypotheses: number;
  readonly includedGroups: number;
  readonly includedNodes: number;
  readonly includedEdges: number;
  readonly includedContradictions: number;
  readonly includedProvenanceSources: number;
  readonly excludedObservations: number;
  readonly excludedAtomicHypotheses: number;
  readonly serializedContextChars: number;
}

/**
 * The bounded, typed AI package (model input). Deterministic under identical
 * authoritative input: stable ordering, sorted id arrays, no clock/random ids,
 * canonical serialization (see sha256 of the serialized form).
 */
export interface GraphHoleAnalysisContext {
  readonly analysisPolicyVersion: GraphHoleAnalysisPolicyVersion;
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly regionId: string;
  readonly regionStatus: string;
  /** Region's declared temporal analysis window (authoritative, may be null). */
  readonly temporalContext: TemporalInterval | null;
  /** Candidate's claimed temporal scope (authoritative, may be null). */
  readonly candidateTemporalScope: TemporalInterval | null;
  readonly candidate: {
    readonly candidateId: string;
    readonly holeType: string;
    readonly expectedRelationshipType: string | null;
    readonly structuralBasis: string;
    readonly nodeIds: readonly string[];
    readonly observedEdgeIds: readonly string[];
    readonly supportingHypothesisIds: readonly string[];
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly structuralScore: number;
    readonly evidenceSupportScore: number;
    readonly expectedInformationValue: number;
    readonly significance: number;
    readonly independentSupportUnitIds: readonly string[];
    readonly regionStatus: string;
    readonly scoringPolicyVersion: string;
  };
  readonly observations: readonly ContextObservation[];
  readonly atomicHypotheses: readonly ContextAtomicHypothesis[];
  readonly groups: readonly ContextHypothesisGroup[];
  readonly structuralSignals: readonly ContextStructuralSignal[];
  readonly inferences: readonly ContextInferenceSignal[];
  readonly contradictions: readonly ContextContradiction[];
  readonly provenance: readonly ContextProvenance[];
  readonly communities: readonly {
    readonly nodeId: string;
    readonly communityId: string;
  }[];
  readonly completeness: ContextCompleteness;
  readonly counts: ContextCounts;
}

/** The flat set of ids a valid analysis may reference (for integrity checks). */
export interface ContextReferenceSets {
  readonly observationIds: ReadonlySet<string>;
  readonly hypothesisIds: ReadonlySet<string>;
  readonly groupIds: ReadonlySet<string>;
}