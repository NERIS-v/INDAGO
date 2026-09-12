// ============================================================================
// Lead draft builders
//
// Pure, deterministic functions turning a P4 graph-analytics candidate
// (@indago/graphology-projection: BridgeCandidate / TemporalBurstCandidate /
// CommunityCandidate; or a cross-case match) plus caller-supplied entity/
// evidence context into a LeadDraft — no I/O, no randomness, no LLM calls.
// The platform's LeadRuntime is responsible for gathering the context
// (entity names, relation evidence bases) and persisting the result.
//
// confidence / priority are derived from the candidate's own structural
// score by a FIXED, DOCUMENTED, DETERMINISTIC transform per candidate type
// (never a learned or fabricated score) — see each function below.
// posture is always T1_INVESTIGATIVE_LEAD: a freshly generated P4 lead is,
// by definition, an investigative lead that has not yet been human-
// corroborated (T2) or escalated to an evidence-package candidate (T3).
// ============================================================================

import type { LeadDraft, LeadPriority, Provenance } from '@indago/contracts';
import { deterministicLeadId } from './identity.js';
import { generateAlternativeExplanations } from './alternative-explanations.js';

export interface EntityNameLookup {
  /** Returns the best-known canonical name for an entity id, or the id itself if unknown. */
  (entityId: string): string;
}

function priorityFromConfidence(confidence: number): LeadPriority {
  if (confidence >= 0.8) return 'CRITICAL';
  if (confidence >= 0.6) return 'HIGH';
  if (confidence >= 0.4) return 'MEDIUM';
  return 'LOW';
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ----------------------------------------------------------------------------
// BRIDGE
// ----------------------------------------------------------------------------

export interface BridgeLeadCandidateInput {
  readonly edgeId: string;
  readonly nodeIds: readonly [string, string];
  readonly relationType: string | null;
  readonly bridgeImpact: number;
  readonly componentSize: number;
}

export interface BuildBridgeLeadDraftParams {
  readonly caseId: string;
  readonly candidate: BridgeLeadCandidateInput;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly entityName: EntityNameLookup;
  readonly provenanceEntries: readonly Provenance[];
}

/**
 * confidence = bridgeImpact / componentSize — the fraction of the graph's
 * connected component that would be severed if this edge were removed.
 * A bridge that isolates half the component (impact ~= componentSize/2,
 * the theoretical max for a single cut) is the highest-confidence bridge
 * lead; a bridge that only lops off one peripheral node is low-confidence.
 */
export async function buildBridgeLeadDraft(params: BuildBridgeLeadDraftParams): Promise<LeadDraft> {
  const { candidate } = params;
  const confidence = clamp01(candidate.componentSize > 0 ? candidate.bridgeImpact / candidate.componentSize : 0);
  const sourceCandidateKey = candidate.edgeId;
  const identity = { caseId: params.caseId, sourceCandidateType: 'BRIDGE' as const, sourceCandidateKey };
  const id = await deterministicLeadId(identity);

  const [a, b] = candidate.nodeIds;
  const nameA = params.entityName(a);
  const nameB = params.entityName(b);
  const relationLabel = candidate.relationType ?? 'a relation';

  return {
    id,
    caseId: params.caseId,
    title: `Sole connecting relation between ${nameA} and ${nameB}`,
    description:
      `${nameA} and ${nameB} are connected by ${relationLabel} that is the ONLY path between the two sides ` +
      `of the graph it joins (removing it would separate ${candidate.bridgeImpact} of ${candidate.componentSize} ` +
      `connected entities). This is a structural signal about connectivity, not a claim about the nature of ` +
      `that connection — see the attached alternative explanations.`,
    priority: priorityFromConfidence(confidence),
    confidence,
    posture: 'T1_INVESTIGATIVE_LEAD',
    relatedEntityIds: [a, b],
    supportingObservationIds: [...params.evidenceBasis],
    contradictingObservationIds: [...params.contradictions],
    relatedEvidenceIds: [],
    sourceCandidateType: 'BRIDGE',
    sourceCandidateKey,
    sourceCandidateSnapshot: { ...candidate },
    alternativeExplanations: generateAlternativeExplanations('BRIDGE', {
      relatedEntityIds: [a, b],
      relatedObservationIds: params.evidenceBasis,
    }),
    provenance: {
      entries: requireProvenance(params.provenanceEntries),
      createdAt: nowObservedTime(),
    },
  };
}

// ----------------------------------------------------------------------------
// TEMPORAL BURST
// ----------------------------------------------------------------------------

export interface TemporalBurstLeadCandidateInput {
  readonly nodeId: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly eventCount: number;
  readonly baselineRate: number;
  readonly burstScore: number;
  readonly edgeIds: readonly string[];
}

export interface BuildTemporalBurstLeadDraftParams {
  readonly caseId: string;
  readonly candidate: TemporalBurstLeadCandidateInput;
  readonly evidenceBasis: readonly string[];
  readonly entityName: EntityNameLookup;
  readonly provenanceEntries: readonly Provenance[];
}

/**
 * confidence = a saturating transform of burstScore so an unbounded ratio
 * (eventCount / baselineRate) maps into [0,1) without a hard ceiling
 * discontinuity: confidence = burstScore / (1 + burstScore). burstScore = 1
 * (double the baseline) -> confidence 0.5; burstScore = 9 -> confidence 0.9;
 * approaches but never reaches 1.
 */
export async function buildTemporalBurstLeadDraft(
  params: BuildTemporalBurstLeadDraftParams,
): Promise<LeadDraft> {
  const { candidate } = params;
  const confidence = clamp01(candidate.burstScore / (1 + candidate.burstScore));
  const sourceCandidateKey = `${candidate.nodeId}|${candidate.windowStart}`;
  const identity = { caseId: params.caseId, sourceCandidateType: 'TEMPORAL_BURST' as const, sourceCandidateKey };
  const id = await deterministicLeadId(identity);

  const name = params.entityName(candidate.nodeId);

  return {
    id,
    caseId: params.caseId,
    title: `Activity burst around ${name}`,
    description:
      `${name} has ${candidate.eventCount} recorded relations in the window ${candidate.windowStart} to ` +
      `${candidate.windowEnd}, versus a baseline of ${candidate.baselineRate.toFixed(2)} per comparable window ` +
      `for this same entity. This is a temporal clustering signal only — see the attached alternative ` +
      `explanations before treating it as evidence of coordinated activity.`,
    priority: priorityFromConfidence(confidence),
    confidence,
    posture: 'T1_INVESTIGATIVE_LEAD',
    relatedEntityIds: [candidate.nodeId],
    supportingObservationIds: [...params.evidenceBasis],
    contradictingObservationIds: [],
    relatedEvidenceIds: [],
    sourceCandidateType: 'TEMPORAL_BURST',
    sourceCandidateKey,
    sourceCandidateSnapshot: { ...candidate },
    alternativeExplanations: generateAlternativeExplanations('TEMPORAL_BURST', {
      relatedEntityIds: [candidate.nodeId],
      relatedObservationIds: params.evidenceBasis,
    }),
    provenance: {
      entries: requireProvenance(params.provenanceEntries),
      createdAt: nowObservedTime(),
    },
  };
}

// ----------------------------------------------------------------------------
// COMMUNITY
// ----------------------------------------------------------------------------

export interface CommunityLeadCandidateInput {
  readonly communityId: number;
  readonly memberNodeIds: readonly string[];
  readonly size: number;
  readonly truncated: boolean;
  readonly cohesion: number;
  readonly internalEdgeCount: number;
}

export interface BuildCommunityLeadDraftParams {
  readonly caseId: string;
  readonly candidate: CommunityLeadCandidateInput;
  readonly evidenceBasis: readonly string[];
  readonly entityName: EntityNameLookup;
  readonly provenanceEntries: readonly Provenance[];
}

/** confidence = cohesion directly — already a bounded [0,1] density score. */
export async function buildCommunityLeadDraft(params: BuildCommunityLeadDraftParams): Promise<LeadDraft> {
  const { candidate } = params;
  const confidence = clamp01(candidate.cohesion);
  // Identity key is the sorted member set, NOT communityId — Louvain community
  // numbering is not guaranteed stable across recomputation even when
  // membership is unchanged, so keying on the numeric id would break
  // idempotent re-generation.
  const sourceCandidateKey = [...candidate.memberNodeIds].sort().join(',');
  const identity = { caseId: params.caseId, sourceCandidateType: 'COMMUNITY' as const, sourceCandidateKey };
  const id = await deterministicLeadId(identity);

  const sampleNames = candidate.memberNodeIds.slice(0, 3).map(params.entityName);
  const nameList = sampleNames.join(', ') + (candidate.size > sampleNames.length ? `, +${candidate.size - sampleNames.length} more` : '');

  return {
    id,
    caseId: params.caseId,
    title: `Densely connected group: ${nameList}`,
    description:
      `A group of ${candidate.size} entities (${nameList}) has ${candidate.internalEdgeCount} internal relations, ` +
      `a cohesion density of ${(candidate.cohesion * 100).toFixed(0)}%. Community membership is a structural ` +
      `clustering signal only — see the attached alternative explanations before treating it as coordinated ` +
      `activity.`,
    priority: priorityFromConfidence(confidence),
    confidence,
    posture: 'T1_INVESTIGATIVE_LEAD',
    relatedEntityIds: [...candidate.memberNodeIds],
    supportingObservationIds: [...params.evidenceBasis],
    contradictingObservationIds: [],
    relatedEvidenceIds: [],
    sourceCandidateType: 'COMMUNITY',
    sourceCandidateKey,
    sourceCandidateSnapshot: { ...candidate },
    alternativeExplanations: generateAlternativeExplanations('COMMUNITY', {
      relatedEntityIds: candidate.memberNodeIds,
      relatedObservationIds: params.evidenceBasis,
    }),
    provenance: {
      entries: requireProvenance(params.provenanceEntries),
      createdAt: nowObservedTime(),
    },
  };
}

// ----------------------------------------------------------------------------
// CROSS-CASE
// ----------------------------------------------------------------------------

export interface CrossCaseLeadCandidateInput {
  readonly sourceCaseId: string;
  readonly targetCaseId: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly matchScore: number;
  readonly sharedEvidenceTypes: readonly string[];
}

export interface BuildCrossCaseLeadDraftParams {
  readonly caseId: string; // the case this lead is filed under (= sourceCaseId, by convention)
  readonly candidate: CrossCaseLeadCandidateInput;
  readonly evidenceBasis: readonly string[];
  readonly entityName: EntityNameLookup;
  readonly provenanceEntries: readonly Provenance[];
}

/** confidence = matchScore directly — already a bounded [0,1] ranking signal. */
export async function buildCrossCaseLeadDraft(params: BuildCrossCaseLeadDraftParams): Promise<LeadDraft> {
  const { candidate } = params;
  const confidence = clamp01(candidate.matchScore);
  // Case-pair-and-entity-pair identity, order-independent so the same match
  // found by querying from either case direction yields the same lead.
  const casePair = [candidate.sourceCaseId, candidate.targetCaseId].sort();
  const entityPair = [candidate.sourceEntityId, candidate.targetEntityId].sort();
  const sourceCandidateKey = `${casePair.join(',')}|${entityPair.join(',')}`;
  const identity = { caseId: params.caseId, sourceCandidateType: 'CROSS_CASE' as const, sourceCandidateKey };
  const id = await deterministicLeadId(identity);

  const nameA = params.entityName(candidate.sourceEntityId);

  return {
    id,
    caseId: params.caseId,
    title: `Cross-case match: ${nameA}`,
    description:
      `${nameA} also appears in another case (shared evidence types: ${candidate.sharedEvidenceTypes.join(', ') || 'none recorded'}). ` +
      `This is an identity-match signal between cases, not a claim that the two cases are substantively related — ` +
      `see the attached alternative explanations.`,
    priority: priorityFromConfidence(confidence),
    confidence,
    posture: 'T1_INVESTIGATIVE_LEAD',
    relatedEntityIds: [candidate.sourceEntityId, candidate.targetEntityId],
    supportingObservationIds: [...params.evidenceBasis],
    contradictingObservationIds: [],
    relatedEvidenceIds: [],
    sourceCandidateType: 'CROSS_CASE',
    sourceCandidateKey,
    sourceCandidateSnapshot: { ...candidate },
    alternativeExplanations: generateAlternativeExplanations('CROSS_CASE', {
      relatedEntityIds: [candidate.sourceEntityId, candidate.targetEntityId],
      relatedObservationIds: params.evidenceBasis,
    }),
    provenance: {
      entries: requireProvenance(params.provenanceEntries),
      createdAt: nowObservedTime(),
    },
  };
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

function nowObservedTime() {
  const now = new Date().toISOString();
  return { value: now, precision: 'exact' as const };
}

/**
 * Every lead must trace back to real evidentiary provenance — this package
 * never fabricates a placeholder source. Every P4 candidate (bridge/burst/
 * community/cross-case) is itself built from canonical relations, which
 * always carry real provenance from their accepted hypothesis; the caller
 * (LeadRuntime) is expected to pass that through. An empty list here is a
 * caller bug, not a case to paper over with a synthetic entry.
 */
function requireProvenance(entries: readonly Provenance[]): Provenance[] {
  if (entries.length === 0) {
    throw new Error(
      'lead-generation: at least one real Provenance entry is required — refusing to fabricate a placeholder source',
    );
  }
  return [...entries];
}
