// ============================================================================
// Reassessment service (Phase 5A-PR12)
// //
// Thin assembly seam: builds a ReassessmentRunner from the platform's module-
// level persistence singletons and pulls one bounded batch for a case.
//
// Phase 5B-PR1:
// The queue worker supplies only caseId. Before the runner is invoked, resolve
// the authoritative investigationId from the latest InvestigationRun for that
// case so the downstream gap lifecycle always receives a real InvestigationId.
// ============================================================================

import { ReassessmentChangeStore } from './reassessment-change-store.js';
import {
  ReassessmentRunner,
  type ReassessmentBatchResult,
} from './reassessment-runner.js';

import { graphHoleStore } from '../persistence/graph-hole-store.js';
import {
  graphHoleRegionAnalysisStore,
} from '../persistence/graph-hole-region-analysis-store.js';
import { observationStore } from '../persistence/observation-store.js';
import {
  entityHypothesisStore,
} from '../persistence/entity-hypothesis-store.js';
import {
  relationHypothesisStore,
} from '../persistence/relation-hypothesis-store.js';
import { relationStore } from '../persistence/relation-store.js';
import { graphVersionStore } from '../persistence/graph-version-store.js';
import {
  graphProjectionService,
} from '../relations/graph-version-service.js';

import { db } from '../db/prisma.js';

/**
 * Resolve the latest authoritative InvestigationRun for a case.
 *
 * A case may have multiple historical runs; the newest persisted run is the
 * investigation context used by the current platform paths elsewhere.
 */
export async function resolveInvestigationIdForCase(
  caseId: string,
): Promise<string> {
  const run = await db.investigationRun.findFirst({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
  });

  if (!run) {
    throw new Error(
      `No InvestigationRun found for case ${caseId}; cannot run graph-hole reassessment`,
    );
  }

  if (!run.investigationId) {
    throw new Error(
      `InvestigationRun for case ${caseId} has no investigationId`,
    );
  }

  return run.investigationId;
}

export async function runGraphHoleReassessment(
  caseId: string,
  investigationId: string | null,
): Promise<ReassessmentBatchResult> {
  const effectiveInvestigationId =
    investigationId ??
    await resolveInvestigationIdForCase(caseId);

  const runner = new ReassessmentRunner(
    {
      changeStore: new ReassessmentChangeStore(),
      holes: graphHoleStore,
      regions: graphHoleRegionAnalysisStore,
      observations: observationStore,
      entityHypotheses: entityHypothesisStore,
      relationHypotheses: relationHypothesisStore,
      relations: relationStore,
      graphVersions: graphVersionStore,
    },
    {
      graphProjection: graphProjectionService,
    },
  );

  return runner.runBatch(
    caseId,
    effectiveInvestigationId,
  );
}