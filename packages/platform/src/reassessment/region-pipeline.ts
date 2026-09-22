// ============================================================================
// Reassessment Region Pipeline (Phase 5A-PR12 + Phase 5B-PR1)
//
// Deterministic region execution boundary:
//
//   EVIDENCE_AFFECTING:
//     - load the persisted region from the authoritative store;
//     - cheaply compare the bounded context digest first;
//     - recompute only when the context changed;
//     - derive the reassessment outcome from the frozen pure core;
//     - persist the new GraphHole assessment;
//     - materialize the qualified GraphHole as an InvestigativeGap through the
//       injected 5B gap runtime.
//
//   GRAPH_AFFECTING (recomputeIdentity=true):
//     - REBUILD the region on the NEW graph version from the SAME seeds /
//       temporal context (fresh content-addressed regionId + candidateIds);
//     - persist the rebuilt region + its new qualified candidates;
//     - each new candidate that matches a prior-version hole's logical gap is
//       wired as its SUPERSEDE target;
//     - materialize each persisted qualified GraphHole as an InvestigativeGap.
//
// RESOLVED / SUPERSEDED are ALWAYS derived deterministically (never from AI).
// The 5B runtime is an integration/enrichment boundary after GraphHole
// persistence; GraphHoleStore remains the lifecycle authority.
// ============================================================================

import type {
  GraphHoleAssessmentType,
  GraphHolePersistenceStatus,
  QualifiedGraphHoleCandidate,
  GraphVersionId,
  ReassessmentOutcome,
} from '@indago/contracts';
import { canonicalizeDeterministic } from '@indago/contracts';

import type {
  DeriveOutcomeInput,
  ReassessmentChangeReference,
} from '@indago/graph-hole-reassessment';
import { deriveReassessmentOutcome } from '@indago/graph-hole-reassessment';

import type { GraphHoleRegion } from '@indago/graph-hole-region';

import { GraphHoleStoreError } from '../persistence/graph-hole-errors.js';
import type {
  GraphHoleAssessmentRecord,
  GraphHoleRecord,
  GraphHoleStore,
} from '../persistence/graph-hole-store.js';
import type {
  GraphHoleRegionAnalysisStore,
  RegionAnalysisRecord,
} from '../persistence/graph-hole-region-analysis-store.js';
import type { GraphProjectionService } from '../relations/graph-version-service.js';

import {
  buildRegionRecomputeContext,
  type RegionContextDeps,
  type RegionRecomputeContext,
} from './region-context.js';
import { reconstructRegionFromRecord } from './reconstruct-region.js';
import { recomputeRegion } from './region-recompute.js';

// ============================================================================
// 5B-PR1 runtime boundary
// ============================================================================

export interface GraphHoleGapRuntimePort {
  readonly persistFromQualifiedGraphHole: (input: {
    readonly caseId: string;
    readonly investigationId: string;
    readonly context: RegionRecomputeContext;
    readonly qualification: QualifiedGraphHoleCandidate;
    readonly persistedGraphHole: GraphHoleRecord;
  }) => Promise<unknown>;
}
// ============================================================================
// Types
// ============================================================================

export interface RegionPipelineDeps {
  readonly contextDeps: RegionContextDeps;
  readonly graphHoles: GraphHoleStore;
  readonly regions: GraphHoleRegionAnalysisStore;
  readonly graphProjection: GraphProjectionService;

  /** Phase 5B-PR1: qualified GraphHole → InvestigativeGap lifecycle bridge. */
  readonly gapRuntime: GraphHoleGapRuntimePort;

  /** Region builder wired to the authoritative projection provider. */
  readonly buildRegion: (input: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly seedObservationIds: readonly string[];
    readonly temporalContext?: unknown;
  }) => Promise<GraphHoleRegion>;
}

export interface RegionPlanItem {
  readonly caseId: string;
  readonly investigationId: string;
  readonly graphVersionId: string;
  readonly computedAt: string;
  readonly regionId: string;
  readonly recomputeIdentity: boolean;
  readonly candidateIds: readonly string[];
}

export interface RegionExecutionResult {
  /** Persisted/new region id (may differ from the item region for rebuilds). */
  readonly regionId: string;
  readonly recomputeIdentity: boolean;
  readonly status:
    | 'RECOMPUTED'
    | 'SKIPPED_CONTEXT_UNCHANGED'
    | 'SKIPPED_NO_CHANGE'
    | 'FAILED';
  readonly outcome?: ReassessmentOutcome;
  readonly contextSha256?: string;
  readonly assessmentsAppended: number;
  readonly holesSuperseded: number;
  readonly failureReason?: string;
}

// ============================================================================
// Deterministic helpers
// ============================================================================

function orderedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function timestampOf(value: string): { value: string; precision: 'exact' } {
  return { value, precision: 'exact' };
}

function snapshotsEqual(a: unknown, b: unknown): boolean {
  return canonicalizeDeterministic(a) === canonicalizeDeterministic(b);
}

function toPriorSnapshot(
  record: GraphHoleAssessmentRecord,
): DeriveOutcomeInput['prior'] | null {
  const snapshot =
    record.snapshot as Partial<QualifiedGraphHoleCandidate> | null;

  if (!snapshot || typeof snapshot !== 'object') return null;

  const raw = snapshot.rawCandidate as
    | { contradictingObservationIds?: readonly string[] }
    | undefined;

  const prior: DeriveOutcomeInput['prior'] = {
    independentSupportUnitCount:
      typeof snapshot.independentSupportUnitIds === 'object' &&
      snapshot.independentSupportUnitIds !== null &&
      Array.isArray(snapshot.independentSupportUnitIds)
        ? snapshot.independentSupportUnitIds.length
        : 0,

    evidenceSupportScore:
      typeof snapshot.evidenceSupportScore === 'number'
        ? snapshot.evidenceSupportScore
        : 0,

    structuralScore:
      typeof snapshot.structuralScore === 'number'
        ? snapshot.structuralScore
        : 0,

    expectedInformationValue:
      typeof snapshot.expectedInformationValue === 'number'
        ? snapshot.expectedInformationValue
        : 0,

    contradictingObservationIds: raw?.contradictingObservationIds ?? [],
  };

  return prior;
}

function currentAssessmentOf(
  qualification: QualifiedGraphHoleCandidate,
): DeriveOutcomeInput['current'] {
  const raw = qualification.rawCandidate;

  return {
    independentSupportUnitCount:
      qualification.independentSupportUnitIds.length,

    evidenceSupportScore: qualification.evidenceSupportScore,

    structuralScore: qualification.structuralScore,

    expectedInformationValue:
      qualification.expectedInformationValue,

    contradictingObservationIds:
      raw.contradictingObservationIds ?? [],

    expectedRelationshipType:
      raw.expectedRelationshipType ?? null,

    canonicalNodeIds: [...raw.nodeIds],
  };
}

// ============================================================================
// Pipeline
// ============================================================================

export class RegionPipeline {
  constructor(private readonly deps: RegionPipelineDeps) {}

  async execute(item: RegionPlanItem): Promise<RegionExecutionResult> {
    try {
      if (item.recomputeIdentity) {
        return await this.executeGraphAffecting(item);
      }

      return await this.executeEvidenceAffecting(item);
    } catch (error) {
      return {
        regionId: item.regionId,
        recomputeIdentity: item.recomputeIdentity,
        status: 'FAILED',
        assessmentsAppended: 0,
        holesSuperseded: 0,
        failureReason:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  // --------------------------------------------------------------------------
  // EVIDENCE_AFFECTING
  // --------------------------------------------------------------------------

  private async executeEvidenceAffecting(
    item: RegionPlanItem,
  ): Promise<RegionExecutionResult> {
    const regionRecord = await this.regionRecordOf(item);

    if (regionRecord === null) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `No region analysis for ${item.regionId} in case ${item.caseId}`,
      );
    }

    const region = reconstructRegionFromRecord(regionRecord);

    // Load the persisted holes + their last assessment.
    const holes = await this.deps.graphHoles.listByRegionId({
      caseId: item.caseId,
      regionId: item.regionId,
      status: ['ACTIVE'],
    });

    const planned = orderedUnique(item.candidateIds);

    const targetHoles = holes
      .filter((h) => planned.includes(h.candidateId))
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? -1
          : a.createdAt > b.createdAt
            ? 1
            : a.id < b.id
              ? -1
              : 1,
      );

    if (targetHoles.length === 0) {
      return {
        regionId: item.regionId,
        recomputeIdentity: false,
        status: 'SKIPPED_NO_CHANGE',
        assessmentsAppended: 0,
        holesSuperseded: 0,
      };
    }

    const lastAssessmentById =
      new Map<string, GraphHoleAssessmentRecord>();

    for (const hole of targetHoles) {
      const assessments =
        await this.deps.graphHoles.listAssessments({
          caseId: item.caseId,
          identityKey: hole.identityKey,
        });

      const last = assessments[assessments.length - 1];

      if (last === undefined) {
        throw new GraphHoleStoreError(
          'NOT_FOUND',
          `No assessment for hole ${hole.identityKey}`,
        );
      }

      lastAssessmentById.set(hole.identityKey, last);
    }

    // Cheap context gate.
    const computedAt = timestampOf(item.computedAt);

    const context = await buildRegionRecomputeContext(
      {
        scope: {
          caseId: item.caseId,
          investigationId: item.investigationId,
          graphVersionId: item.graphVersionId,
          computedAt,
        },

        region,

        graph: await this.deps.graphProjection.projectGraphVersion(
          item.caseId,
          {
            graphVersionId: item.graphVersionId as GraphVersionId,
          },
        ),

        requiredHypothesisIds: [],
      },
      this.deps.contextDeps,
    );

    const anyContextChanged = targetHoles.some(
      (hole) =>
        lastAssessmentById.get(hole.identityKey)?.contextSha256 !==
        context.contextSha256,
    );

    if (!anyContextChanged) {
      return {
        regionId: item.regionId,
        recomputeIdentity: false,
        status: 'SKIPPED_CONTEXT_UNCHANGED',
        contextSha256: context.contextSha256,
        assessmentsAppended: 0,
        holesSuperseded: 0,
      };
    }

    const recompute = recomputeRegion(context);

    const presentRelations = context.presentRelations;

    let assessmentsAppended = 0;
    let holesResolved = 0;
    let holesStrengthened = 0;
    let holesWeakened = 0;
    let holesContradicted = 0;

    let strongest: ReassessmentOutcome | undefined;

    for (const hole of targetHoles) {
      const last = lastAssessmentById.get(hole.identityKey)!;

      const prior = toPriorSnapshot(last);

      if (prior === null) {
        throw new GraphHoleStoreError(
          'NOT_FOUND',
          `Unparseable prior snapshot for ${hole.identityKey}`,
        );
      }

      const qualified =
        recompute.qualifiedByCandidateId.get(hole.candidateId);

      let current: DeriveOutcomeInput['current'];

      if (qualified !== undefined && qualified.qualified) {
        current = currentAssessmentOf(qualified);
      } else {
        // Candidate no longer qualifies. Re-check the persisted record
        // conservatively without silently regressing lifecycle state.
        current = {
          independentSupportUnitCount:
            prior.independentSupportUnitCount,

          evidenceSupportScore:
            prior.evidenceSupportScore,

          structuralScore:
            prior.structuralScore,

          expectedInformationValue:
            prior.expectedInformationValue,

          contradictingObservationIds:
            prior.contradictingObservationIds,

          expectedRelationshipType:
            hole.expectedRelationshipType,

          canonicalNodeIds: [...hole.canonicalNodeIds],
        };
      }

      // Byte-level no-change short-circuit.
      if (
        qualified !== undefined &&
        snapshotsEqual(last.snapshot, qualified)
      ) {
        continue;
      }

      const input: DeriveOutcomeInput = {
        prior,
        current,
        presentRelations,
        replacementCreated: false,
        candidateReplaced: false,
      };

      const outcome = deriveReassessmentOutcome(input);

      if (outcome === null) {
        continue;
      }

      const qualification =
        qualified !== undefined && qualified.qualified
          ? qualified
          : await this.qualificationFromRecord(hole, context);

      const persisted = await this.deps.graphHoles.persistGraphHole({
        caseId: item.caseId,
        investigationId: item.investigationId || undefined,
        qualification,
        assessmentType: 'REASSESSMENT',
        contextSha256: context.contextSha256,
        reason: `reassessed:${outcome}`,
      });

      assessmentsAppended += 1;

      if (outcome === 'RESOLVED') {
        await this.deps.graphHoles.transitionStatus({
          caseId: item.caseId,
          candidateId: hole.candidateId,
          to: 'RESOLVED',
          reason: 'reassessed:RESOLVED',
        });

        holesResolved += 1;
      } else if (outcome === 'STRENGTHENED') {
        holesStrengthened += 1;
      } else if (outcome === 'WEAKENED') {
        holesWeakened += 1;
      } else if (outcome === 'CONTRADICTED') {
        holesContradicted += 1;
      }

      // ----------------------------------------------------------------------
      // Phase 5B-PR1
      //
      // GraphHole is already authoritative at this point. The gap runtime
      // consumes the persisted GraphHole + bounded region context and creates /
      // converges the corresponding InvestigativeGap.
      // ----------------------------------------------------------------------
      await this.persistInvestigativeGap({
        caseId: item.caseId,
        investigationId: item.investigationId,
        context,
        qualification,
        persistedGraphHole: persisted.record,
      });

      if (
        strongest === undefined ||
        outcomePrecedence(outcome) <
          outcomePrecedence(strongest)
      ) {
        strongest = outcome;
      }
    }

    if (assessmentsAppended === 0) {
      return {
        regionId: item.regionId,
        recomputeIdentity: false,
        status: 'SKIPPED_NO_CHANGE',
        contextSha256: context.contextSha256,
        assessmentsAppended: 0,
        holesSuperseded: 0,
      };
    }

    return {
      regionId: item.regionId,
      recomputeIdentity: false,
      status: 'RECOMPUTED',
      outcome: strongest,
      contextSha256: context.contextSha256,
      assessmentsAppended,
      holesSuperseded: 0,
    };
  }

  // --------------------------------------------------------------------------
  // GRAPH_AFFECTING
  // --------------------------------------------------------------------------

  private async executeGraphAffecting(
    item: RegionPlanItem,
  ): Promise<RegionExecutionResult> {
    // The plan region id is the PRIOR-version region to rebuild from.
    const priorRecord = await this.regionRecordOf(item);

    if (priorRecord === null) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `No prior region analysis for ${item.regionId} in case ${item.caseId}`,
      );
    }

    const rebuilt = await this.deps.buildRegion({
      caseId: item.caseId,
      graphVersionId: item.graphVersionId,
      seedObservationIds: priorRecord.seedObservationIds,
      temporalContext: priorRecord.temporalContext,
    });

    await this.deps.regions.persistRegionAnalysis({
      caseId: item.caseId,
      investigationId: item.investigationId || undefined,
      region: rebuilt,
    });

    const computedAt = timestampOf(item.computedAt);

    const context = await buildRegionRecomputeContext(
      {
        scope: {
          caseId: item.caseId,
          investigationId: item.investigationId,
          graphVersionId: item.graphVersionId,
          computedAt,
        },

        region: rebuilt,

        graph: await this.deps.graphProjection.projectGraphVersion(
          item.caseId,
          {
            graphVersionId: item.graphVersionId as GraphVersionId,
          },
        ),

        requiredHypothesisIds: [],
      },
      this.deps.contextDeps,
    );

    const recompute = recomputeRegion(context);

    const priorHoles =
      await this.deps.graphHoles.listByRegionId({
        caseId: item.caseId,
        regionId: item.regionId,
        status: ['ACTIVE'],
      });

    // Deterministic old → new logical-gap matching.
    const newCandidates = [
      ...recompute.qualification.qualifiedCandidates,
    ].sort((a, b) =>
      a.rawCandidate.candidateId <
      b.rawCandidate.candidateId
        ? -1
        : 1,
    );

    const assigned = new Set<string>();

    let holesSuperseded = 0;
    let assessmentsAppended = 0;

    // ------------------------------------------------------------------------
    // Existing logical gaps → superseding candidates
    // ------------------------------------------------------------------------

    for (
      const prior of [...priorHoles].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      )
    ) {
      const replacement = newCandidates.find(
        (candidate) =>
          !assigned.has(candidate.rawCandidate.candidateId) &&
          sameLogicalGap(prior, candidate),
      );

      if (replacement === undefined) continue;

      assigned.add(replacement.rawCandidate.candidateId);

      const persisted =
        await this.deps.graphHoles.persistGraphHole({
          caseId: item.caseId,
          investigationId: item.investigationId || undefined,
          qualification: replacement,
          assessmentType: 'QUALIFICATION',
          supersedesGraphHoleId: prior.id,
          contextSha256: context.contextSha256,
          reason: `supersedes:${prior.candidateId}`,
        });

      assessmentsAppended += 1;

      if (persisted.created) {
        holesSuperseded += 1;
      }

      // Phase 5B-PR1: materialize the newly persisted successor hole.
      await this.persistInvestigativeGap({
        caseId: item.caseId,
        investigationId: item.investigationId,
        context,
        qualification: replacement,
        persistedGraphHole: persisted.record,
      });
    }

    // ------------------------------------------------------------------------
    // Completely new candidates
    // ------------------------------------------------------------------------

    for (const candidate of newCandidates) {
      if (assigned.has(candidate.rawCandidate.candidateId)) {
        continue;
      }

      const persisted =
        await this.deps.graphHoles.persistGraphHole({
          caseId: item.caseId,
          investigationId: item.investigationId || undefined,
          qualification: candidate,
          assessmentType: 'QUALIFICATION',
          contextSha256: context.contextSha256,
        });

      if (persisted.created) {
        assessmentsAppended += 1;
      }

      // Phase 5B-PR1: every newly persisted qualified GraphHole gets an
      // actionable InvestigativeGap.
      await this.persistInvestigativeGap({
        caseId: item.caseId,
        investigationId: item.investigationId,
        context,
        qualification: candidate,
        persistedGraphHole: persisted.record,
      });
    }

    if (holesSuperseded === 0 && assessmentsAppended === 0) {
      return {
        regionId: rebuilt.regionId,
        recomputeIdentity: true,
        status: 'SKIPPED_NO_CHANGE',
        contextSha256: context.contextSha256,
        assessmentsAppended: 0,
        holesSuperseded: 0,
      };
    }

    return {
      regionId: rebuilt.regionId,
      recomputeIdentity: true,
      status: 'RECOMPUTED',
      outcome:
        holesSuperseded > 0 ? 'SUPERSEDED' : undefined,
      contextSha256: context.contextSha256,
      assessmentsAppended,
      holesSuperseded,
    };
  }

  // --------------------------------------------------------------------------
  // 5B-PR1 helper
  // --------------------------------------------------------------------------

  private async persistInvestigativeGap(input: {
    readonly caseId: string;
    readonly investigationId: string;
    readonly context: RegionRecomputeContext;
    readonly qualification: QualifiedGraphHoleCandidate;
    readonly persistedGraphHole: GraphHoleRecord;
  }): Promise<void> {
    await this.deps.gapRuntime.persistFromQualifiedGraphHole({
      caseId: input.caseId,
      investigationId: input.investigationId,
      context: input.context,
      qualification: input.qualification,
      persistedGraphHole: input.persistedGraphHole,
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async regionRecordOf(
    item: RegionPlanItem,
  ): Promise<RegionAnalysisRecord | null> {
    return this.deps.regions.findByRegionId({
      caseId: item.caseId,
      regionId: item.regionId,
    });
  }

  private async qualificationFromRecord(
    hole: { candidateId: string },
    context: RegionRecomputeContext,
  ): Promise<QualifiedGraphHoleCandidate> {
    const record =
      await this.deps.graphHoles.findByCandidateId({
        caseId: context.scope.caseId,
        candidateId: hole.candidateId,
      });

    const assessments = record
      ? await this.deps.graphHoles.listAssessments({
          caseId: context.scope.caseId,
          identityKey: record.identityKey,
        })
      : [];

    const last = assessments[assessments.length - 1];

    if (last === undefined) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `No qualification snapshot for ${hole.candidateId}`,
      );
    }

    return last.snapshot as QualifiedGraphHoleCandidate;
  }
}

// ============================================================================
// Logical-gap matching
// ============================================================================

export function sameLogicalGap(
  prior: {
    readonly canonicalNodeIds: readonly string[];
    readonly holeType: string;
    readonly expectedRelationshipType: string | null;
  },
  candidate: QualifiedGraphHoleCandidate,
): boolean {
  const raw = candidate.rawCandidate;

  return (
    prior.holeType === raw.detectorType &&
    prior.expectedRelationshipType ===
      (raw.expectedRelationshipType ?? null) &&
    sameSet(prior.canonicalNodeIds, raw.nodeIds)
  );
}

function sameSet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;

  const sortedA = orderedUnique(a);
  const sortedB = orderedUnique(b);

  return (
    sortedA.length === sortedB.length &&
    sortedA.every((id, i) => id === sortedB[i])
  );
}

function outcomePrecedence(
  outcome: ReassessmentOutcome,
): number {
  switch (outcome) {
    case 'SUPERSEDED':
      return 0;

    case 'RESOLVED':
      return 1;

    case 'CONTRADICTED':
      return 2;

    case 'STRENGTHENED':
    case 'WEAKENED':
      return 3;

    default:
      return 4;
  }
}

// ============================================================================
// Public type exports
// ============================================================================

export type { ReassessmentChangeReference };
export type {
  GraphHoleAssessmentType,
  GraphHolePersistenceStatus,
};