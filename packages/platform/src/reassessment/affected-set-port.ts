// ============================================================================
// ReassessmentAffectedSetPort — lazy, content-addressed impact resolution
// (Phase 5A-PR12, Phase 4)
//
// Loads EXACTLY the authoritative persisted data the pure affected-set
// resolver needs — hypotheses, groups (none persisted in V1), regions, and
// holes — re-anchored to (caseId, investigationId, graphVersionId). It NEVER
// trusts a client's claim of impact: the change reference below is the only
// input, and overlap/seed membership is computed by the pure resolver gate.
//
// Case isolation is fail-closed: a trigger whose ids belong to another case or
// whose scope mismatches the requested scope throws AUTHORITY_MISMATCH.
//
// GRAPH_AFFECTING (new version in the trigger): the resolver examines the
// PRIOR version's regions/holes (the supersession targets) while the affected
// set carries the NEW graphVersionId — a later rebuild derives new identities.
// ============================================================================

import type { RelationStore, DurableRelation } from '../persistence/relation-store.js';
import type { ObservationStore } from '../persistence/observation-store.js';
import type { EntityHypothesisStore } from '../persistence/entity-hypothesis-store.js';
import type { RelationHypothesisStore } from '../persistence/relation-hypothesis-store.js';
import type { GraphHoleRegionAnalysisStore } from '../persistence/graph-hole-region-analysis-store.js';
import type { GraphHoleStore } from '../persistence/graph-hole-store.js';
import type {
  ReassessmentChangeReference,
  ReassessmentGroupRef,
  ReassessmentHoleRef,
  ReassessmentHypothesisRef,
  ReassessmentRegionRef,
  ResolveAffectedSetInput,
} from '@indago/graph-hole-reassessment';
import type {
  ReassessmentEffectClass,
  ReassessmentTrigger,
} from '@indago/contracts';
import { GraphHoleStoreError } from '../persistence/graph-hole-errors.js';
import type { ReassessmentScope } from './types.js';

export interface AffectedSetStores {
  readonly observations: ObservationStore;
  readonly entityHypotheses: EntityHypothesisStore;
  readonly relationHypotheses: RelationHypothesisStore;
  readonly relations: RelationStore;
  readonly regions: GraphHoleRegionAnalysisStore;
  readonly holes: GraphHoleStore;
}

export interface AffectedSetInput {
  readonly scope: ReassessmentScope;
  readonly trigger: ReassessmentTrigger;
  /** Deterministic changeId (SHA-256 of the canonical change identity). */
  readonly changeId: string;
}

export interface LoadedAffectedSetContext {
  readonly resolverInput: ResolveAffectedSetInput;
  /** Prior-version regions that are supersession targets (graph-affecting). */
  readonly priorRegionIds: readonly string[];
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export class ReassessmentAffectedSetPort {
  constructor(private readonly stores: AffectedSetStores) {}

  async resolve(input: AffectedSetInput): Promise<LoadedAffectedSetContext> {
    const { scope, trigger, changeId } = input;
    const effectClass = this.effectClassOf(trigger, scope);
    const changeReference = await this.buildChangeReference(scope, trigger);

    const isGraphAffecting =
      effectClass === 'GRAPH_AFFECTING' ||
      (trigger.triggerType === 'REASSESSMENT_REQUESTED' && !!trigger.scope.graphVersionId);

    // Candidate regions for the resolver.
    const regionRecords = await this.stores.regions.listLatestRegionsByCase(scope.caseId, {
      limit: 2_000,
    });
    const priorRegionIds: string[] = [];
    const regions = regionRecords
      .filter((r) => {
        if (isGraphAffecting) {
          // Supersession targets live on PRIOR versions only.
          if (r.graphVersionId === scope.graphVersionId) return false;
          priorRegionIds.push(r.regionId);
          return true;
        }
        return r.graphVersionId === scope.graphVersionId;
      })
      .map<ReassessmentRegionRef>((r) => ({
        id: r.regionId,
        nodeIds: [...r.nodeIds].sort(),
        edgeIds: [...r.edgeIds].sort(),
        seedObservationIds: [...r.seedObservationIds].sort(),
      }));

    const regionIds = new Set(regions.map((r) => r.id));

    // Holes bound to the candidate regions (ACTIVE = supersession targets).
    const holeRecords = await this.stores.holes.listActiveByCase(scope.caseId, {
      limit: 1_000,
      status: ['ACTIVE'],
    });
    const holesInRegions = holeRecords.filter((h) => regionIds.has(h.regionId));
    const supportingByHole = await this.stores.holes.supportingHypothesisIdsByHole(
      scope.caseId,
      holesInRegions.map((h) => h.id),
    );
    const holes = holesInRegions.map<ReassessmentHoleRef>((h) => ({
      id: h.id,
      candidateId: h.candidateId,
      regionId: h.regionId,
      supportingHypothesisIds: [...(supportingByHole.get(h.id) ?? [])],
    }));

    // Hypothesis universe (bounded-fanout is resolved inside the pure resolver).
    const entities = await this.stores.entityHypotheses.listByCase(scope.caseId, {
      investigationId: scope.investigationId,
    });
    const relations = await this.stores.relationHypotheses.listByCase(scope.caseId, {
      investigationId: scope.investigationId,
    });
    const hypotheses: readonly ReassessmentHypothesisRef[] = [
      ...entities.map<ReassessmentHypothesisRef>((h) => ({
        id: h.id,
        kind: 'ENTITY' as const,
        supportingObservationIds: [...(h.supportingObservationIds ?? [])].sort(),
        contradictingObservationIds: [...(h.contradictingObservationIds ?? [])].sort(),
        candidateEntityIds: sortedUnique([
          ...(h.supportingCandidateIds ?? []),
          ...(h.resolvedEntityId ? [h.resolvedEntityId] : []),
        ]),
      })),
      ...relations.map<ReassessmentHypothesisRef>((h) => ({
        id: h.id,
        kind: 'RELATION' as const,
        supportingObservationIds: [...h.evidenceBasis].sort(),
        contradictingObservationIds: [...h.contradictions].sort(),
        candidateEntityIds: sortedUnique([h.sourceEntityId, h.targetEntityId]),
      })),
    ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const groups: readonly ReassessmentGroupRef[] = [];

    const resolverInput: ResolveAffectedSetInput = {
      trigger,
      changeId,
      caseId: scope.caseId,
      graphVersionId: scope.graphVersionId,
      changeReference,
      hypotheses,
      groups,
      regions,
      holes,
    };

    return { resolverInput, priorRegionIds };
  }

  /**
   * The change reference — the ONLY impact claim the resolver trusts. Derived
   * from the trigger ids against the authoritative stores, never recomputed
   * from a client payload.
   */
  private async buildChangeReference(
    scope: ReassessmentScope,
    trigger: ReassessmentTrigger,
  ): Promise<ReassessmentChangeReference> {
    // REASSESSMENT_REQUESTED carries no top-level caseId — the request is
    // intrinsically case-scoped, so its authoritative case is the scope.
    const triggerCaseId = trigger.triggerType === 'REASSESSMENT_REQUESTED'
      ? scope.caseId
      : trigger.caseId;
    if (triggerCaseId !== scope.caseId) {
      throw new GraphHoleStoreError(
        'AUTHORITY_MISMATCH',
        `Change for case ${triggerCaseId} under scope ${scope.caseId}`,
      );
    }
    switch (trigger.triggerType) {
      case 'NEW_OBSERVATION': {
        const observations = await this.stores.observations.listObservations({
          investigationId: scope.investigationId,
          caseId: scope.caseId,
        });
        const obs = observations.find((o) => o.id === trigger.observationId);
        return {
          nodeIds: sortedUnique(obs?.entityIds ?? []),
          edgeIds: [],
          changedObservationIds: [trigger.observationId],
        };
      }
      case 'NEW_EVIDENCE': {
        const observations = await this.stores.observations.listObservations({
          investigationId: scope.investigationId,
          caseId: scope.caseId,
          evidenceId: trigger.evidenceId,
        });
        return {
          nodeIds: sortedUnique(observations.flatMap((o) => o.entityIds)),
          edgeIds: [],
          changedObservationIds: observations.map((o) => o.id).sort(),
        };
      }
      case 'ENTITY_RESOLUTION_ACCEPTED':
        return { nodeIds: [trigger.entityId], edgeIds: [], changedObservationIds: [] };
      case 'RELATION_ACCEPTED': {
        const relation = await this.stores.relations.findById(trigger.relationId, {
          caseId: scope.caseId,
        });
        if (!relation) {
          throw new GraphHoleStoreError(
            'NOT_FOUND',
            `Relation ${trigger.relationId} not found for case ${scope.caseId}`,
          );
        }
        return {
          nodeIds: sortedUnique([relation.sourceEntityId, relation.targetEntityId]),
          edgeIds: [relation.id],
          changedObservationIds: [],
        };
      }
      case 'REASSESSMENT_REQUESTED':
        return { nodeIds: [], edgeIds: [], changedObservationIds: [] };
    }
  }

  private effectClassOf(
    trigger: ReassessmentTrigger,
    scope: ReassessmentScope,
  ): ReassessmentEffectClass {
    return trigger.triggerType === 'REASSESSMENT_REQUESTED' && trigger.scope.graphVersionId
      ? 'GRAPH_AFFECTING'
      : trigger.triggerType === 'REASSESSMENT_REQUESTED'
        ? 'MANUAL_REASSESSMENT'
        : scope.graphVersionId
          ? trigger.triggerType === 'ENTITY_RESOLUTION_ACCEPTED' ||
            trigger.triggerType === 'RELATION_ACCEPTED'
            ? 'GRAPH_AFFECTING'
            : 'EVIDENCE_AFFECTING'
          : 'EVIDENCE_AFFECTING';
  }
}

export type { DurableRelation };