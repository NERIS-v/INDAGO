// ============================================================================
// Bounded candidate generation (Phase 5A-PR17, policy §3/§6/§9/§12)
//
// Builds a deterministic, bounded universe of candidate evidence requests from
// the GROUNDED PR15/PR16 explanations (policy §5), applies the existing-
// evidence exclusion (fail-closed), dedupes by the PR10 canonical identity,
// and enforces the frozen §3 caps — surfacing any bound hit as `truncated`,
// never a silent drop.
//
// Determinism: pairs are ordered by explanation rankingKey; ids are
// canonicalized (deduped + sorted) before identity/emission; NO wall clock.
// ============================================================================

import type { EvidenceType, TemporalInterval, ObservedTime } from '@indago/contracts';
import type { CompetingExplanation } from '@indago/contracts';
import type { ErSplitExplanation } from '@indago/entity-split-analysis';

import type { GroundedEvidence } from './grounding.js';
import {
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  EVIDENCE_TYPE_VECTORS,
  type DiscriminationKind,
} from './generation-policy.js';
import { canonicalRequestKey, hypothesisIdsFromDerivedIds } from './identity.js';
import { rationaleFor, descriptionFor } from './templates.js';

export interface ExistingEvidenceSummary {
  readonly evidenceType: EvidenceType;
  readonly hypothesisIds: readonly string[];
}

export interface CandidateEvidenceRequest {
  readonly canonicalRequestKey: string;
  readonly gapId: string;
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly rationale: string;
  readonly description: string;
  readonly discriminationKind: DiscriminationKind;
  readonly temporalScope: TemporalInterval | null;
  readonly sourceExplanationIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly structuralSignalIds: readonly string[];
}

export type TruncatedReason =
  | 'PER_EXPLANATION_PAIR_BOUND'
  | 'PER_GAP_BOUND'
  | 'PER_RUN_BOUND';

export interface GenerationAccounting {
  readonly pairsConsidered: number;
  readonly existingEvidenceExclusions: number;
  readonly deduplicatedCandidates: number;
  readonly candidatesGenerated: number;
}

export interface GenerationResult {
  readonly gapId: string;
  readonly graphHoleId: string;
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly candidateRequests: readonly CandidateEvidenceRequest[];
  readonly truncated: boolean;
  readonly truncatedReason: TruncatedReason | undefined;
  readonly accounting: GenerationAccounting;
  readonly generatedAt: ObservedTime;
}

interface Draft {
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly discriminationKind: DiscriminationKind;
  readonly temporalScope: TemporalInterval | null;
  readonly sourceExplanationIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly structuralSignalIds: readonly string[];
}

function isContradicted(e: CompetingExplanation): boolean {
  return e.supportLevel === 'CONTRADICTED';
}

function erContradicted(e: ErSplitExplanation): boolean {
  return e.explanationStatus === 'CONTRADICTED';
}

function pairTemporalScope(
  temporalScopes: readonly (TemporalInterval | null)[],
): TemporalInterval | null {
  for (const t of temporalScopes) if (t) return t;
  return null;
}

/** Fail-closed existing-evidence exclusion (mirrors PR10 §7 exactly). */
function isCoveredByExistingEvidence(
  evidenceType: EvidenceType,
  targetUuids: readonly string[],
  existingEvidence: readonly ExistingEvidenceSummary[] | undefined,
): boolean {
  if (existingEvidence === undefined || existingEvidence.length === 0) return false;
  if (targetUuids.length === 0) return false;
  for (const summary of existingEvidence) {
    if (summary.evidenceType !== evidenceType) continue;
    const coveredIds = new Set(summary.hypothesisIds);
    if (targetUuids.every((uuid) => coveredIds.has(uuid))) return true;
  }
  return false;
}

function buildDrafts(evidence: GroundedEvidence): Draft[] {
  const drafts: Draft[] = [];
  const pr15 = evidence.competingExplanationSet.explanations;
  const er = evidence.erSplit?.explanations ?? [];
  const sortedPr15 = [...pr15].sort((a, b) => (a.rankingKey < b.rankingKey ? -1 : 1));
  const sortedEr = [...er].sort((a, b) => (a.rankingKey < b.rankingKey ? -1 : 1));

  // COMPETING_PAIR: unordered pairs of PR15 explanations (i < j).
  for (let i = 0; i < sortedPr15.length; i++) {
    for (let j = i + 1; j < sortedPr15.length; j++) {
      const a = sortedPr15[i]!;
      const b = sortedPr15[j]!;
      const ids = sortedUnique([a.explanationId, b.explanationId]);
      const hypothesisIds = hypothesisIdsFromDerivedIds([
        ...a.supportingHypothesisIds,
        ...b.supportingHypothesisIds,
      ]);
      for (const evidenceType of EVIDENCE_TYPE_VECTORS.COMPETING_PAIR) {
        drafts.push({
          evidenceType,
          discriminatesAmongIds: ids,
          hypothesisIds,
          discriminationKind: 'COMPETING_PAIR',
          temporalScope: pairTemporalScope([a.temporalScope, b.temporalScope]),
          sourceExplanationIds: ids,
          supportingObservationIds: sortedUnique([
            ...a.supportingObservationIds,
            ...b.supportingObservationIds,
          ]),
          structuralSignalIds: sortedUnique([
            ...a.structuralSignalIds,
            ...b.structuralSignalIds,
          ]),
        });
      }
    }
  }

  // ER_SPLIT_CROSS: each non-contradicted ER-split explanation vs each PR15
  // explanation it competes with (policy §6 — never over-claimed).
  for (const e of sortedEr) {
    if (erContradicted(e)) continue;
    for (const p of sortedPr15) {
      if (isContradicted(p)) continue;
      const ids = sortedUnique([e.explanationId, p.explanationId]);
      const hypothesisIds = hypothesisIdsFromDerivedIds([
        ...e.hypothesisId ? [e.hypothesisId] : [],
        ...p.supportingHypothesisIds,
      ]);
      for (const evidenceType of EVIDENCE_TYPE_VECTORS.ER_SPLIT_CROSS) {
        drafts.push({
          evidenceType,
          discriminatesAmongIds: ids,
          hypothesisIds,
          discriminationKind: 'ER_SPLIT_CROSS',
          temporalScope: p.temporalScope,
          sourceExplanationIds: ids,
          supportingObservationIds: sortedUnique([
            ...e.supportingObservationIds,
            ...p.supportingObservationIds,
          ]),
          structuralSignalIds: [],
        });
      }
    }
  }

  // SINGLE_TARGET: a non-concealment, non-contradicted PR15 explanation alone
  // (policy §6 — "say more about the leading explanation").
  for (const p of sortedPr15) {
    if (p.type === 'CONCEALMENT_CONSISTENT_EXPLANATION') continue;
    if (isContradicted(p)) continue;
    const ids = [p.explanationId];
    const hypothesisIds = hypothesisIdsFromDerivedIds(p.supportingHypothesisIds);
    for (const evidenceType of EVIDENCE_TYPE_VECTORS.SINGLE_TARGET) {
      drafts.push({
        evidenceType,
        discriminatesAmongIds: ids,
        hypothesisIds,
        discriminationKind: 'SINGLE_TARGET',
        temporalScope: p.temporalScope,
        sourceExplanationIds: ids,
        supportingObservationIds: [...p.supportingObservationIds],
        structuralSignalIds: [...p.structuralSignalIds],
      });
    }
  }

  return drafts;
}

export function generateCandidates(input: {
  readonly gapId: string;
  readonly evidence: GroundedEvidence;
  readonly knownEvidence?: readonly ExistingEvidenceSummary[];
  readonly computedAt: ObservedTime;
}): GenerationResult {
  const { gapId, evidence, knownEvidence } = input;
  const caseId = evidence.context.caseId;
  const graphVersionId = evidence.context.graphVersionId;

  // INSUFFICIENT_CONTEXT is a VALID empty result, not an error (policy §10).
  const noQuestion = evidence.gapClassification.type === null;
  const noGroundingSignal =
    evidence.competingExplanationSet.explanations.length === 0 &&
    (evidence.erSplit === undefined || evidence.erSplit.explanations.length === 0);
  if (noQuestion || noGroundingSignal) {
    return {
      gapId,
      graphHoleId: evidence.gapClassification.graphHoleId,
      caseId,
      graphVersionId,
      candidateRequests: [],
      truncated: false,
      truncatedReason: undefined,
      accounting: {
        pairsConsidered: 0,
        existingEvidenceExclusions: 0,
        deduplicatedCandidates: 0,
        candidatesGenerated: 0,
      },
      generatedAt: input.computedAt,
    };
  }

  // Build the bounded draft universe, enforcing the §3 caps at construction.
  const drafts = buildDrafts(evidence);
  const bounded: Draft[] = [];
  let truncated = false;
  let truncatedReason: TruncatedReason | undefined;

  // Per-pair cap: group drafts by pair identity (kind + discriminatesAmongIds).
  const pairKey = (d: Draft) => `${d.discriminationKind}|${d.discriminatesAmongIds.join(',')}`;
  const pairCounts = new Map<string, number>();
  for (const d of drafts) {
    const key = pairKey(d);
    const count = pairCounts.get(key) ?? 0;
    if (count >= MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR) {
      truncated = true;
      truncatedReason = 'PER_EXPLANATION_PAIR_BOUND';
      continue;
    }
    pairCounts.set(key, count + 1);
    if (bounded.length >= MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP) {
      truncated = true;
      if (truncatedReason === undefined) truncatedReason = 'PER_GAP_BOUND';
      continue;
    }
    bounded.push(d);
  }
  if (bounded.length > MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN) {
    truncated = true;
    if (truncatedReason === undefined) truncatedReason = 'PER_RUN_BOUND';
    bounded.length = MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN;
  }

  // Exclusion (fail-closed) + dedup (PR10 identity) + emission.
  const results: CandidateEvidenceRequest[] = [];
  const seen = new Set<string>();
  let exclusions = 0;
  let deduped = 0;
  const pairsConsidered = new Set<string>();

  for (const d of bounded) {
    pairsConsidered.add(pairKey(d));
    const key = canonicalRequestKey({
      gapId,
      evidenceType: d.evidenceType,
      discriminatesAmongIds: d.discriminatesAmongIds,
      hypothesisIds: d.hypothesisIds,
    });
    if (seen.has(key)) {
      deduped += 1;
      continue;
    }
    if (isCoveredByExistingEvidence(d.evidenceType, d.hypothesisIds, knownEvidence)) {
      exclusions += 1;
      continue;
    }
    seen.add(key);
    results.push({
      canonicalRequestKey: key,
      gapId,
      evidenceType: d.evidenceType,
      discriminatesAmongIds: d.discriminatesAmongIds,
      hypothesisIds: d.hypothesisIds,
      rationale: rationaleFor({
        discriminationKind: d.discriminationKind,
        evidenceType: d.evidenceType,
        discriminatesAmongIds: d.discriminatesAmongIds,
      }),
      description: descriptionFor({
        discriminationKind: d.discriminationKind,
        evidenceType: d.evidenceType,
        discriminatesAmongIds: d.discriminatesAmongIds,
      }),
      discriminationKind: d.discriminationKind,
      temporalScope: d.temporalScope,
      sourceExplanationIds: d.sourceExplanationIds,
      supportingObservationIds: d.supportingObservationIds,
      structuralSignalIds: d.structuralSignalIds,
    });
  }

  return {
    gapId,
    graphHoleId: evidence.gapClassification.graphHoleId,
    caseId,
    graphVersionId,
    candidateRequests: results,
    truncated,
    truncatedReason,
    accounting: {
      pairsConsidered: pairsConsidered.size,
      existingEvidenceExclusions: exclusions,
      deduplicatedCandidates: deduped,
      candidatesGenerated: results.length,
    },
    generatedAt: input.computedAt,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}