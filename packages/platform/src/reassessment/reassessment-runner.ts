// ============================================================================
// Reassessment Runner (Phase 5A-PR12)
//
// Bounded pull semantics, ONE case at a time:
//   1. serialize on pg_advisory_xact_lock(hashtextextended(caseId,0))
//   2. drain PENDING changes up to PR12_MAX_CHANGES_PER_RUN (25)
//   3. group by (effectClass, effective graphVersionId) and coalesce
//   4. per group: load the authoritative case context ONCE, resolve the union
//      affected set across the grouped changes (lazy, content-addressed, no
//      invalidation table), build the plan, and execute each region through the
//      deterministic RegionPipeline
//   5. record ONE ReassessmentRun envelope per change (deterministic runId),
//      mark each change COMPLETED (or PARTIAL when a region FAILED)
//   6. advance the per-case cursor past the last processed sequence
//
// The worker (orchestrator job) calls runBatch for the case id in the job. The
// runner returns empty when nothing is pending, and coalesces the tail of the
// drained batch as SKIPPED (they re-enter a future run).
//
// RESOLVED / SUPERSEDED are ALWAYS derived deterministically (never from AI).
// AI is an enrichment stage at the region pipeline boundary (not wired in V1).
// ============================================================================

import {
  PR12_MAX_CHANGES_PER_RUN,
  PR12_REASSESSMENT_POLICY_VERSION,
  type ReassessmentAffectedSet,
  type ReassessmentRegionResult,
  type ReassessmentTrigger,
} from '@indago/contracts';
import {
  buildReassessmentPlan,
  resolveAffectedSet,
} from '@indago/graph-hole-reassessment';
import type {
  ReassessmentChangeId,
} from '@indago/contracts';
import { ReassessmentAffectedSetPort } from './affected-set-port.js';
import { RegionPipeline, type RegionPlanItem, type RegionExecutionResult, type RegionPipelineDeps } from './region-pipeline.js';
import { deterministicRunId, sortedUnique } from './util.js';
import type {
  ReassessmentChangeRecord,
  ReassessmentChangeStatus,
} from './reassessment-change-store.js';
import { ReassessmentChangeStore } from './reassessment-change-store.js';
import { GraphHoleStore } from '../persistence/graph-hole-store.js';
import { GraphHoleRegionAnalysisStore } from '../persistence/graph-hole-region-analysis-store.js';
import { ObservationStore } from '../persistence/observation-store.js';
import { EntityHypothesisStore } from '../persistence/entity-hypothesis-store.js';
import { RelationHypothesisStore } from '../persistence/relation-hypothesis-store.js';
import { RelationStore } from '../persistence/relation-store.js';
import { GraphVersionStore } from '../persistence/graph-version-store.js';
import { GraphProjectionService } from '../relations/graph-version-service.js';
import { buildRegion, ProjectedGraphExpansionProvider } from '@indago/graph-hole-region';
import type { GraphHoleRegion, RegionBuildDependencies, SeedObservation } from '@indago/graph-hole-region';
import { GraphHoleStoreError } from '../persistence/graph-hole-errors.js';

// ============================================================================
// Types
// ============================================================================

export interface RunnerStores {
  readonly changeStore: ReassessmentChangeStore;
  readonly holes: GraphHoleStore;
  readonly regions: GraphHoleRegionAnalysisStore;
  readonly observations: ObservationStore;
  readonly entityHypotheses: EntityHypothesisStore;
  readonly relationHypotheses: RelationHypothesisStore;
  readonly relations: RelationStore;
  readonly graphVersions: GraphVersionStore;
}

export interface RunnerRuntimeDeps {
  readonly graphProjection: GraphProjectionService;
}

export interface ReassessmentBatchResult {
  readonly caseId: string;
  readonly changesProcessed: number;
  readonly headChangeIds: readonly string[];
  readonly tailChangesSkipped: number;
  readonly cursorAdvancedTo: number | null;
  readonly regionResults: readonly ReassessmentRegionResult[];
}

interface GroupedChange {
  readonly change: ReassessmentChangeRecord;
  readonly effectiveGraphVersionId: string;
}

// ============================================================================
// Runner
// ============================================================================

export class ReassessmentRunner {
  constructor(
    private readonly stores: RunnerStores,
    private readonly runtime: RunnerRuntimeDeps,
  ) {}

  /**
   * Execute the pull semantics for one case. Serializes on the per-case
   * advisory lock INSIDE a PostgreSQL advisory transaction, so concurrent
   * workers for the same case can never run two batches at once.
   */
  async runBatch(
    caseId: string,
    investigationId: string | null,
    limit: number = PR12_MAX_CHANGES_PER_RUN,
  ): Promise<ReassessmentBatchResult> {
    return this.stores.holes.transaction(async (tx) => {
      // Serialize ALL work for this case on the same transaction-scoped
      // per-case advisory lock the change store uses for sequence allocation.
      // A concurrent worker for the same case blocks here until the in-flight
      // batch commits, so it can never observe the same PENDING wall twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caseId}, 0))`;

      const cursor = await this.stores.changeStore.getCursor(caseId);
      const afterSequence = cursor?.lastProcessedSequence ?? 0;

      const allPending = await this.stores.changeStore.listPendingForCase(caseId, limit + 1);
      const pending = allPending.filter((c) => c.sequence > afterSequence);
      if (pending.length === 0) {
        return {
          caseId,
          changesProcessed: 0,
          headChangeIds: [],
          tailChangesSkipped: 0,
          cursorAdvancedTo: null,
          regionResults: [],
        };
      }

      const batch = pending.slice(0, limit);
      const tail = pending.slice(limit);
      for (const change of tail) {
        await this.stores.changeStore.recordOutcome(change.changeId, { status: 'SKIPPED' });
      }

      // Resolve the CURRENT version for evidence-affecting/manual scopes that
      // carry no graphVersionId of their own.
      const currentVersion = await this.currentGraphVersionId(caseId, investigationId);
      if (currentVersion === null) {
        throw new GraphHoleStoreError(
          'NOT_FOUND',
          `No GraphVersion exists for case ${caseId}; cannot compute a reassessment scope`,
        );
      }

      const groups = this.groupChanges(batch, currentVersion);
      const regionResults: ReassessmentRegionResult[] = [];
      let maxSequence = afterSequence;

      for (const [, grouped] of groups) {
        const head = grouped[0]!.change;
        const scopeVersion = grouped[0]!.effectiveGraphVersionId;

        const unionAffected = await this.buildUnionAffectedSet(caseId, investigationId, grouped);
        const candidateIdsByRegion = unionAffected.candidateIdsByRegion;
        const affectedSet: ReassessmentAffectedSet = {
          caseId,
          graphVersionId: scopeVersion,
          changeId: head.changeId,
          effectClass: head.effectClass,
          status: unionAffected.status,
          affectedObservationIds: unionAffected.affectedObservationIds,
          affectedEntityHypothesisIds: unionAffected.affectedEntityHypothesisIds,
          affectedRelationHypothesisIds: unionAffected.affectedRelationHypothesisIds,
          affectedGroupIds: unionAffected.affectedGroupIds,
          affectedRegionIds: unionAffected.affectedRegionIds,
          affectedCandidateIds: unionAffected.affectedCandidateIds,
          truncated: unionAffected.truncated,
          accounting: unionAffected.accounting,
        };

        const plan = buildReassessmentPlan(affectedSet, {
          recomputeIdentityRegionIds: head.effectClass === 'GRAPH_AFFECTING' ? undefined : undefined,
          candidatesByRegion: candidateIdsByRegion,
        });

        const pipeline = await this.buildPipeline(caseId, investigationId, scopeVersion);
        const executed: RegionExecutionResult[] = [];
        let anyFailed = false;

        for (const item of plan) {
          const planItem: RegionPlanItem = {
            caseId,
            investigationId: investigationId ?? '',
            graphVersionId: item.graphVersionId,
            computedAt: computedAtOf(head.trigger),
            regionId: item.regionId,
            recomputeIdentity: item.recomputeIdentity,
            candidateIds: item.candidateIds,
          };
          const result = await pipeline.execute(planItem);
          executed.push(result);
          if (result.status === 'FAILED') anyFailed = true;
          regionResults.push(toRegionResult(result));
        }

        const status: ReassessmentChangeStatus = anyFailed ? 'PARTIAL' : 'COMPLETED';
        const envelope = {
          runId: 'computed-per-change',
          caseId,
          graphVersionId: scopeVersion,
          policyVersion: PR12_REASSESSMENT_POLICY_VERSION,
          affectedSet,
          plan: plan.map((p) => ({ ...p })),
          regionResults: executed.map(toRegionResult),
          accounting: {
            changesCoalesced: grouped.length - 1,
            appliedChangeCount: grouped.length,
            pendingChangeCount: Math.max(0, pending.length - batch.length),
            affectedRegionCount: plan.length,
            ...accountingOf(executed),
          },
          status,
          computedAt: computedAtOf(head.trigger),
        };

        // One run envelope per change (deterministic runId per change+sequence).
        for (const { change } of grouped) {
          const runId = deterministicRunId(caseId, change.changeId, change.sequence);
          await this.stores.changeStore.insertRun({
            runId,
            caseId,
            investigationId,
            changeId: change.changeId,
            sequence: change.sequence,
            graphVersionId: scopeVersion,
            envelope: { ...envelope, runId },
            cursorBefore: afterSequence,
            cursorAfter: Math.max(maxSequence, change.sequence),
          });
          await this.stores.changeStore.recordOutcome(change.changeId, {
            status,
            failureReason: anyFailed ? 'one or more regions failed' : null,
          });
          if (change.sequence > maxSequence) maxSequence = change.sequence;
        }
      }

      if (maxSequence > afterSequence) {
        await this.stores.changeStore.advanceCursor(caseId, maxSequence);
      }

      return {
        caseId,
        changesProcessed: batch.length,
        headChangeIds: [...new Set(batch.map((c) => c.changeId))],
        tailChangesSkipped: tail.length,
        cursorAdvancedTo: maxSequence > afterSequence ? maxSequence : null,
        regionResults,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private async currentGraphVersionId(
    caseId: string,
    investigationId: string | null,
  ): Promise<string | null> {
    const latest = await this.stores.graphVersions.latestActiveByCase(caseId, {
      investigationId: investigationId ?? undefined,
    });
    return latest?.id ?? null;
  }

  private groupChanges(
    changes: readonly ReassessmentChangeRecord[],
    currentVersion: string,
  ): Map<string, readonly GroupedChange[]> {
    const groups = new Map<string, GroupedChange[]>();
    for (const change of changes) {
      const effective = change.graphVersionId ?? currentVersion;
      const key = `${change.effectClass}|${effective}`;
      const list = groups.get(key) ?? [];
      list.push({ change, effectiveGraphVersionId: effective });
      groups.set(key, list);
    }
    return groups;
  }

  private async buildUnionAffectedSet(
    caseId: string,
    investigationId: string | null,
    grouped: readonly GroupedChange[],
  ): Promise<ReassessmentAffectedSet & { candidateIdsByRegion: Readonly<Record<string, readonly string[]>> }> {
    const head = grouped[0]!;
    const scopeVersion = head.effectiveGraphVersionId;
    const scope = { caseId, investigationId: investigationId ?? '', graphVersionId: scopeVersion };

    const port = new ReassessmentAffectedSetPort({
      observations: this.stores.observations,
      entityHypotheses: this.stores.entityHypotheses,
      relationHypotheses: this.stores.relationHypotheses,
      relations: this.stores.relations,
      regions: this.stores.regions,
      holes: this.stores.holes,
    });

    let merged: ReassessmentAffectedSet | null = null;
    const candidateIdsByRegion: Record<string, string[]> = {};

    for (const { change } of grouped) {
      const loaded = await port.resolve({ scope, trigger: change.trigger, changeId: change.changeId });
      const affected = resolveAffectedSet(loaded.resolverInput);
      merged = merged === null ? affected : mergeAffectedSets(merged, affected);
      for (const regionId of affected.affectedRegionIds) {
        candidateIdsByRegion[regionId] = sortedUnique([
          ...(candidateIdsByRegion[regionId] ?? []),
          ...loaded.resolverInput.holes
            .filter((h) => h.regionId === regionId)
            .map((h) => h.candidateId),
        ]);
      }
    }

    if (merged === null) {
      throw new GraphHoleStoreError('NOT_FOUND', `No affected set resolved for case ${caseId}`);
    }
    return { ...merged, candidateIdsByRegion };
  }

  private async buildPipeline(
    caseId: string,
    investigationId: string | null,
    graphVersionId: string,
  ): Promise<RegionPipeline> {
    const built = await this.runtime.graphProjection.projectGraphVersion(caseId, {
      graphVersionId,
    });
    const provider = new ProjectedGraphExpansionProvider(built, graphVersionId);
    const regionDeps: RegionBuildDependencies = {
      context: provider,
      resolveObservations: async (ids) => {
        const obs = await this.stores.observations.listByIds(ids, {
          investigationId: investigationId ?? '',
          caseId,
        });
        return obs.map<SeedObservation>((o) => ({ id: o.id, entityIds: [...o.entityIds] }));
      },
    };

    const deps: RegionPipelineDeps = {
      contextDeps: {
        observations: this.stores.observations,
        entityHypotheses: this.stores.entityHypotheses,
        relationHypotheses: this.stores.relationHypotheses,
      },
      graphHoles: this.stores.holes,
      regions: this.stores.regions,
      graphProjection: this.runtime.graphProjection,
      buildRegion: async (input) => {
        const region = await buildRegion(
          {
            caseId: input.caseId,
            graphVersionId: input.graphVersionId,
            seedObservationIds: input.seedObservationIds,
            temporalContext: (input.temporalContext ?? null) as never,
          },
          regionDeps,
        );
        return region as GraphHoleRegion;
      },
    };
    return new RegionPipeline(deps);
  }
}

function sortedUniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function mergeAffectedSets(
  a: ReassessmentAffectedSet,
  b: ReassessmentAffectedSet,
): ReassessmentAffectedSet {
  const affectedRegionIds = sortedUniqueIds([...a.affectedRegionIds, ...b.affectedRegionIds]);
  const affectedCandidateIds = sortedUniqueIds([...a.affectedCandidateIds, ...b.affectedCandidateIds]);
  return {
    caseId: a.caseId,
    graphVersionId: a.graphVersionId,
    changeId: a.changeId,
    effectClass: a.effectClass,
    status: affectedRegionIds.length > 0 ? 'AFFECTED_COMPLETE' : 'NO_AFFECTED',
    affectedObservationIds: sortedUniqueIds([...a.affectedObservationIds, ...b.affectedObservationIds]),
    affectedEntityHypothesisIds: sortedUniqueIds([...a.affectedEntityHypothesisIds, ...b.affectedEntityHypothesisIds]),
    affectedRelationHypothesisIds: sortedUniqueIds([...a.affectedRelationHypothesisIds, ...b.affectedRelationHypothesisIds]),
    affectedGroupIds: sortedUniqueIds([...a.affectedGroupIds, ...b.affectedGroupIds]),
    affectedRegionIds,
    affectedCandidateIds,
    truncated: a.truncated || b.truncated,
    accounting: {
      observationUniverseCount: Math.max(a.accounting.observationUniverseCount, b.accounting.observationUniverseCount),
      hypothesisUniverseCount: Math.max(a.accounting.hypothesisUniverseCount, b.accounting.hypothesisUniverseCount),
      candidateUniverseCount: Math.max(a.accounting.candidateUniverseCount, b.accounting.candidateUniverseCount),
      groupUniverseCount: Math.max(a.accounting.groupUniverseCount, b.accounting.groupUniverseCount),
      regionUniverseCount: Math.max(a.accounting.regionUniverseCount, b.accounting.regionUniverseCount),
    },
  };
}

function toRegionResult(result: RegionExecutionResult): ReassessmentRegionResult {
  return {
    regionId: result.regionId,
    recomputeIdentity: result.recomputeIdentity,
    status: result.status,
    outcome: result.outcome,
    contextSha256: result.contextSha256,
    assessmentsAppended: result.assessmentsAppended,
    holesSuperseded: result.holesSuperseded,
  };
}

function accountingOf(executed: readonly RegionExecutionResult[]): {
  regionsReused: number;
  regionsRecomputed: number;
  regionsSkippedContextUnchanged: number;
  regionsSkippedNoChange: number;
  regionsFailed: number;
  assessmentsAppended: number;
  holesStrengthened: number;
  holesWeakened: number;
  holesResolved: number;
  holesContradicted: number;
  holesSuperseded: number;
} {
  return {
    regionsReused: 0,
    regionsRecomputed: executed.filter((r) => r.status === 'RECOMPUTED').length,
    regionsSkippedContextUnchanged: executed.filter((r) => r.status === 'SKIPPED_CONTEXT_UNCHANGED').length,
    regionsSkippedNoChange: executed.filter((r) => r.status === 'SKIPPED_NO_CHANGE').length,
    regionsFailed: executed.filter((r) => r.status === 'FAILED').length,
    assessmentsAppended: executed.reduce((sum, r) => sum + r.assessmentsAppended, 0),
    holesStrengthened: executed.filter((r) => r.outcome === 'STRENGTHENED').length,
    holesWeakened: executed.filter((r) => r.outcome === 'WEAKENED').length,
    holesResolved: executed.filter((r) => r.outcome === 'RESOLVED').length,
    holesContradicted: executed.filter((r) => r.outcome === 'CONTRADICTED').length,
    holesSuperseded: executed.reduce((sum, r) => sum + r.holesSuperseded, 0),
  };
}

function computedAtOf(trigger: ReassessmentTrigger): string {
  if ('computedAt' in trigger) {
    const value = trigger.computedAt;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'value' in value) {
      return String((value as { value: unknown }).value);
    }
  }
  return new Date().toISOString();
}

export type { ReassessmentChangeId };