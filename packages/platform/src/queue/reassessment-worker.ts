// ============================================================================
// graph-hole-reassessment worker job (Phase 5A-PR12)
//
// BullMQ handler for the "graph-hole-reassessment" job family. Producers never
// await reassessment work — they publish a durable PENDING change into the
// ledger and enqueue ONE job per fresh change. This handler dips the runner on
// that case (bounded, lock-serialized, idempotent).
// ============================================================================

import { UnrecoverableError, type Job } from "bullmq";
import { runGraphHoleReassessment } from "../reassessment/reassessment-service.js";

export interface GraphHoleReassessmentJobPayload {
  readonly caseId: string;
}

/**
 * Drain one bounded PR12 reassessment batch for the job's case. The runner is
 * case-scoped (investigationId null → case-wide authoritative version/region
 * resolution). Idempotent: a duplicate job simply finds nothing pending.
 */
export async function handleGraphHoleReassessmentJob(job: Job): Promise<void> {
  const data = job.data as Partial<GraphHoleReassessmentJobPayload>;
  if (typeof data.caseId !== "string" || data.caseId.length === 0) {
    throw new UnrecoverableError(
      "graph-hole-reassessment job payload is missing a valid caseId",
    );
  }
  await runGraphHoleReassessment(data.caseId, null);
}