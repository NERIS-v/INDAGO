// ============================================================================
// Reassessment service (Phase 5A-PR12)
//
// Thin assembly seam: builds a ReassessmentRunner from the platform's module-
// level persistence singletons (the codebase's DI convention) and pulls one
// bounded batch for a case. Invoked by the queue worker
// (queue/reassessment-worker.ts) on a graph-hole-reassessment job, and by
// integration tests directly.
// ============================================================================

import { ReassessmentChangeStore } from './reassessment-change-store.js';
import { ReassessmentRunner, type ReassessmentBatchResult } from './reassessment-runner.js';
import { graphHoleStore } from '../persistence/graph-hole-store.js';
import { graphHoleRegionAnalysisStore } from '../persistence/graph-hole-region-analysis-store.js';
import { observationStore } from '../persistence/observation-store.js';
import { entityHypothesisStore } from '../persistence/entity-hypothesis-store.js';
import { relationHypothesisStore } from '../persistence/relation-hypothesis-store.js';
import { relationStore } from '../persistence/relation-store.js';
import { graphVersionStore } from '../persistence/graph-version-store.js';
import { graphProjectionService } from '../relations/graph-version-service.js';

/**
 * Run one bounded PR12 reassessment batch for a case. `investigationId` scopes
 * the authoritative graph-version lookup and region analysis reads (null → the
 * runner resolves case-wide). Returns the batch result envelope.
 */
export async function runGraphHoleReassessment(
  caseId: string,
  investigationId: string | null,
): Promise<ReassessmentBatchResult> {
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
    { graphProjection: graphProjectionService },
  );
  return runner.runBatch(caseId, investigationId);
}