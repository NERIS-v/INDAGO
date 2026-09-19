// ============================================================================
// Phase 5B-PR1
//
// GraphHole -> InvestigativeGap runtime bridge.
//
// Lifecycle:
//   qualified GraphHole
//        -> classifyGap()
//        -> InvestigativeGap upsert
//        -> GraphHole.investigationGapId link
//        -> GRAPH_HOLE_DETECTED
//
// GraphHoleStore remains authoritative for GraphHole intelligence lifecycle.
// This runtime only materializes the investigation-facing gap and event.
// ============================================================================

import {
  classifyGap,
} from '@indago/gap-classification';

import type {
  QualifiedGraphHoleCandidate,
} from '@indago/contracts';

import type {
  RegionRecomputeContext,
} from '../reassessment/region-context.js';

import {
  investigativeGapStore,
} from '../persistence/investigative-gap-store.js';

import {
  graphHoleStore,
  type GraphHoleRecord,
} from '../persistence/graph-hole-store.js';

import {
  emitGraphHoleDetected,
} from '../realtime/graph-hole-events.js';

import { randomUUID } from 'node:crypto';

export interface PersistFromQualifiedGraphHoleInput {
  readonly caseId: string;

  /**
   * Must be the authoritative InvestigationId for the case.
   * The reassessment service resolves this before reaching this boundary.
   */
  readonly investigationId: string;

  readonly context: RegionRecomputeContext;

  readonly qualification: QualifiedGraphHoleCandidate;

  readonly persistedGraphHole: GraphHoleRecord;
}

export class GraphHoleGapRuntime {
  async persistFromQualifiedGraphHole(
    input: PersistFromQualifiedGraphHoleInput,
  ) {
    const {
      caseId,
      investigationId,
      context,
      qualification,
      persistedGraphHole,
    } = input;

    if (!investigationId) {
      throw new Error(
        `GraphHole gap lifecycle requires a valid investigationId for case ${caseId}`,
      );
    }

    // ------------------------------------------------------------------------
    // 1. Pure PR14 classification
    // ------------------------------------------------------------------------

    const classification = classifyGap({
      caseId,

      graphVersionId:
        persistedGraphHole.graphVersionId,

      qualifiedCandidate:
        qualification,

      region:
        context.region,

      nodes:
        context.nodes,

      edges:
        context.edges,

      observations:
        context.observations,

      hypothesisContext:
        context.hypothesisContext,

      classificationPolicyVersion:
        'v1',

      // PR14 requires caller-supplied deterministic provenance time.
      computedAt:
        context.scope.computedAt,
    });

    // ------------------------------------------------------------------------
    // 2. Classifier explicitly lacks enough bounded context.
    //    Do not invent a domain gap.
    // ------------------------------------------------------------------------

    if (
      classification.status ===
      'INSUFFICIENT_CONTEXT'
    ) {
      return {
        created: false,
        classification,
        gap: null,
        link: null,
      };
    }

    // ------------------------------------------------------------------------
    // 3. Materialize the investigation-facing gap.
    // ------------------------------------------------------------------------

    const {
      created,
      gap,
    } =
      await investigativeGapStore.upsertFromGraphHole({
        caseId,

        investigationId,

        graphHole: {
          id:
            persistedGraphHole.id,

          candidateId:
            persistedGraphHole.candidateId,

          holeType:
            persistedGraphHole.holeType,
        },

        classification,
      });

    // ------------------------------------------------------------------------
    // 4. Link the GraphHole to the persisted InvestigativeGap.
    //
    // attachInvestigationGap() is idempotent:
    //   attached=true  -> first successful linkage
    //   attached=false -> already linked to the same gap
    // ------------------------------------------------------------------------

    const link =
      await graphHoleStore.attachInvestigationGap({
        caseId,

        candidateId:
          persistedGraphHole.candidateId,

        investigationGapId:
          gap.id,
      });

    // ------------------------------------------------------------------------
    // 5. Emit only after successful first linkage.
    //
    // GraphHoleDetectedPayload.expectedEdgeType is REQUIRED by contract.
    // Structural hole types may legitimately have no expected relationship,
    // so they use the canonical RelationType "other".
    // ------------------------------------------------------------------------

    if (
      link.attached
    ) {
      emitGraphHoleDetected({
        investigationId,

        caseId,

        graphVersionId:
          persistedGraphHole.graphVersionId,

        holeId:
          persistedGraphHole.candidateId,

        holeType:
          persistedGraphHole.holeType,

        investigationGapId:
          gap.id,

        nodeIds:
          persistedGraphHole.canonicalNodeIds,

        expectedEdgeType:
          persistedGraphHole.expectedRelationshipType ??
          'other',

        significance:
          persistedGraphHole.significance,

        description:
          gap.description,

        operationId:
          randomUUID(),
      });
    }

    return {
      created,
      classification,
      gap,
      link,
    };
  }
}

export const graphHoleGapRuntime =
  new GraphHoleGapRuntime();