// ============================================================================
// publishCaseChange (Phase 5A-PR12)
//
// The single authorizing seam through which an authoritative change enters the
// incremental graph-hole reassessment pipeline. Producers (observation/evidence
// ingestion, entity/relation resolution) MUST NOT touch the ledger directly —
// they call this function, which:
//
//   1. zod-validates the ReassessmentTrigger (server-side recomputation, never
//      blind trust),
//   2. derives the effect class via deriveReassessmentEffectClass (contracts,
//      PR12_REASSESSMENT_POLICY_VERSION-frozen),
//   3. builds the deterministic changeId via buildReassessmentChangeId
//      (SHA-256 of the canonical change identity — computedAt EXCLUDED so
//      crash-then-rerun and duplicate publication converge to one changeId),
//   4. persists ledger row (changeId @unique = dedup guard, advisory-locked
//      per-case sequence) via ReassessmentChangeStore.
//
// The worker (Phase 5) drains PENDING rows in sequence order, so callers never
// await the actual reassessment — publication is fire-and-forget durable
// intent. `graphVersionId` must name the ACTIVE version the change is evaluated
// against (snapshotted by the producer at publish time).
// ============================================================================

import {
  ReassessmentTriggerSchema,
  deriveReassessmentEffectClass,
  type ReassessmentTrigger,
} from '@indago/contracts';
import { buildReassessmentChangeId } from '@indago/graph-hole-reassessment';
import { ReassessmentChangeStore, type PublishCaseChangeResult } from './reassessment-change-store.js';

export interface PublishCaseChangeInput {
  readonly caseId: string;
  /** ACTIVE graph version the change is evaluated against (snapshotted now). */
  readonly graphVersionId: string;
  readonly trigger: ReassessmentTrigger;
}

export interface PublishedCaseChange {
  readonly caseId: string;
  readonly changeId: string;
  readonly sequence: number;
  readonly effectClass: string;
  readonly deduplicated: boolean;
}

/**
 * Enqueue strategy: invoked for each FRESH change (never on a deduped
 * re-publication) so the worker can dip the runner for the case. Defaults to
 * the shared investigation queue; tests inject a no-op to stay Redis-free.
 */
export type ReassessmentEnqueue = (published: PublishedCaseChange) => Promise<void>;

/**
 * Validate, identity, and persist an authoritative change into the PR12 ledger.
 * Returns the deterministic changeId + assigned sequence (+ dedup flag).
 *
 * A fresh (non-deduplicated) change enqueues ONE graph-hole-reassessment job
 * for the case. A deduplicated re-publication (crash-then-rerun, concurrent
 * duplicate) never enqueues — the change was already enqueued, and the runner
 * is idempotent.
 *
 * Throws ReassessmentPublishError with a code when the trigger is invalid.
 */
export async function publishCaseChange(
  input: PublishCaseChangeInput,
  store: ReassessmentChangeStore = new ReassessmentChangeStore(),
  enqueue: ReassessmentEnqueue = defaultEnqueue,
): Promise<PublishedCaseChange> {
  const trigger = ReassessmentTriggerSchema.parse(input.trigger);
  const effectClass = deriveReassessmentEffectClass(trigger);
  const changeId = buildReassessmentChangeId(trigger);

  const result: PublishCaseChangeResult = await store.publish({
    caseId: input.caseId,
    trigger,
    graphVersionId: input.graphVersionId,
    changeId,
  });

  const published: PublishedCaseChange = {
    caseId: input.caseId,
    changeId: result.changeId,
    sequence: result.sequence,
    effectClass,
    deduplicated: result.deduplicated,
  };

  if (!result.deduplicated) {
    await enqueue(published);
  }

  return published;
}

/**
 * Production enqueue: add one graph-hole-reassessment job to the shared
 * investigation queue. Loaded lazily via dynamic import so reassessment never
 * participates in the orchestrator import graph at module load (no cycles:
 * orchestrator → ingest-evidence → publish-case-change → orchestrator would be
 * a static cycle; this stays call-time).
 */
async function defaultEnqueue(published: PublishedCaseChange): Promise<void> {
  const { investigationQueue } = await import('../queue/orchestrator.js');
  await investigationQueue.add('graph-hole-reassessment', {
    caseId: published.caseId,
  });
}

// ============================================================================
// Typed producer helpers — build an appropriately-shaped trigger per surface.
// ============================================================================

export interface NewObservationTriggerInput {
  readonly caseId: string;
  readonly observationId: string;
  readonly observedAt: { value: string; precision: 'exact' };
}

/** Producer helper for a NEW_OBSERVATION trigger (EVIDENCE_AFFECTING). */
export function newObservationTrigger(input: NewObservationTriggerInput): ReassessmentTrigger {
  return {
    triggerType: 'NEW_OBSERVATION',
    caseId: input.caseId,
    observationId: input.observationId,
    computedAt: input.observedAt,
  };
}

export interface NewEvidenceTriggerInput {
  readonly caseId: string;
  readonly evidenceId: string;
  readonly computedAt: { value: string; precision: 'exact' };
}

/** Producer helper for a NEW_EVIDENCE trigger (EVIDENCE_AFFECTING). */
export function newEvidenceTrigger(input: NewEvidenceTriggerInput): ReassessmentTrigger {
  return {
    triggerType: 'NEW_EVIDENCE',
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    computedAt: input.computedAt,
  };
}

export interface EntityResolutionAcceptedTriggerInput {
  readonly caseId: string;
  readonly entityHypothesisId: string;
  readonly entityId: string;
  readonly graphVersionId: string;
  readonly computedAt: { value: string; precision: 'exact' };
}

/** Producer helper for an ENTITY_RESOLUTION_ACCEPTED trigger (GRAPH_AFFECTING). */
export function entityResolutionAcceptedTrigger(input: EntityResolutionAcceptedTriggerInput): ReassessmentTrigger {
  return {
    triggerType: 'ENTITY_RESOLUTION_ACCEPTED',
    caseId: input.caseId,
    entityHypothesisId: input.entityHypothesisId,
    entityId: input.entityId,
    graphVersionId: input.graphVersionId,
    computedAt: input.computedAt,
  };
}

export interface RelationAcceptedTriggerInput {
  readonly caseId: string;
  readonly relationHypothesisId: string;
  readonly relationId: string;
  readonly graphVersionId: string;
  readonly computedAt: { value: string; precision: 'exact' };
}

/** Producer helper for a RELATION_ACCEPTED trigger (EFFECT_AFFECTING). */
export function relationAcceptedTrigger(input: RelationAcceptedTriggerInput): ReassessmentTrigger {
  return {
    triggerType: 'RELATION_ACCEPTED',
    caseId: input.caseId,
    relationHypothesisId: input.relationHypothesisId,
    relationId: input.relationId,
    graphVersionId: input.graphVersionId,
    computedAt: input.computedAt,
  };
}

// ============================================================================
// ReassessmentPublishError
// ============================================================================

export class ReassessmentPublishError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_TRIGGER' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ReassessmentPublishError';
  }
}