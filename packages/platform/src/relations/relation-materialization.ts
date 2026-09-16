// ============================================================================
// M-A10 Canonical Relation Materialization Authority
//
// The smallest explicit authority/decision boundary that turns an ACCEPTED
// RelationHypothesis into a durable Canonical Relation — the prerequisite the
// Graphology projection demands (the graph consumes canonical Relations, never
// PROPOSED hypotheses).
//
// Identity boundary (locked):
//   - A canonical Relation is created ONLY through this explicit ACCEPT decision.
//   - It is NEVER fabricated from a pair score, a resolution score, graph
//     proximity, or automated scoring alone.
//   - The canonical RelationId is derived deterministically from (source, target,
//     relationType, directed, scoreModelVersion) under the canonical namespace —
//     distinct from the hypothesis id that produced it.
//
// Lifecycle (locked):
//   RelationHypothesis:  PROPOSED → ACCEPTED (materialize canonical Relation)
//                        PROPOSED → REJECTED (no canonical relation)
//                        ACCEPTED → REVERSED (canonical relation marked REVERSED)
//                        REJECTED → REVERSED
//   Transitions are validated by RelationHypothesisStore.updateStatus; repeat
//   / terminal authority decisions are refused (never clobbered).
//
// This module owns ONLY the decision semantics. All persistence is delegated to
// the existing RelationHypothesisStore / RelationStore boundaries (which own
// idempotency, P2002 races, and lifecycle preservation).
// ============================================================================

import type { DurableRelationHypothesis } from "../persistence/relation-hypothesis-store.js";
import { relationHypothesisStore } from "../persistence/relation-hypothesis-store.js";
import {
  buildRelationKey,
  deterministicRelationId,
  relationStore,
  parseTemporalAssertions,
} from "../persistence/relation-store.js";
import {
  graphVersionStore,
  type GraphVersionStore,
} from "../persistence/graph-version-store.js";
import {
  temporalStateChangeStore,
  type TemporalStateChangeStore,
} from "../persistence/temporal-state-change-store.js";
import {
  relationAcceptedTrigger,
  publishCaseChange,
} from "../reassessment/publish-case-change.js";
import { assertValidTemporalInterval } from "../temporal/interval-validation.js";
import {
  GRAPH_CHANGE_ACCEPTED,
  GRAPH_CHANGE_REVERSED,
  GRAPH_CHANGE_AMENDED,
  type GraphRevisionEvent,
  toGraphRevisionMetadata,
} from "./graph-version-service.js";

/**
 * Injectable store boundaries (same seam used by entity-materialization) so the
 * real-Postgres integration suite can point the authority at TEST_DATABASE_URL.
 */
export interface RelationMaterializationStores {
  readonly relationHypothesisStore: Pick<
    typeof relationHypothesisStore,
    "transaction" | "findById" | "acceptHypothesis" | "rejectHypothesis" | "reverseHypothesis"
  >;
  readonly relationStore: Pick<
    typeof relationStore,
    "transaction" | "materializeRelation" | "markReversed" | "findById" | "seedOriginalAssertion" | "amendValidity"
  >;
  /**
   * Optional — when supplied, a graph version is created (atomically, in the
   * same transaction) whenever a genuinely graph-affecting canonical change
   * occurs (new ACTIVE relation accepted, ACTIVE relation reversed). The
   * production default (DEFAULT_STORES) always supplies it, so production
   * coupling is authoritative. Tests that target the M-A10 authority in
   * isolation (asserting relation materialization, not versioning) may omit it
   * to keep the seam version-agnostic.
   */
  readonly graphVersionStore?: GraphVersionStore;
  /**
   * Optional — when supplied, the authoritative RELATION_ACCEPTED /
   * RELATION_REVERSED canonical transition is appended to the TemporalStateChange
   * history in the SAME transaction as the canonical change (M-A12-D6). The
   * production default (DEFAULT_STORES) always supplies it; tests that target
   * the authority in isolation may omit it.
   */
  readonly temporalStateChange?: Pick<TemporalStateChangeStore, "recordChange">;
}

const DEFAULT_STORES: RelationMaterializationStores = {
  relationHypothesisStore,
  relationStore,
  graphVersionStore,
  temporalStateChange: temporalStateChangeStore,
};

export interface AcceptRelationResult {
  readonly hypothesis: DurableRelationHypothesis;
  readonly relationId: string;
  readonly materialized: boolean;
  readonly reused: boolean;
}

export class RelationMaterializationError extends Error {
  constructor(
    public readonly code:
      | "HYPOTHESIS_NOT_FOUND"
      | "HYPOTHESIS_NOT_PROPOSED"
      | "RELATION_NOT_FOUND"
      | "RELATION_NOT_ACTIVE"
      | "HYPOTHESIS_NOT_REVERSIBLE",
    public readonly id: string,
  ) {
    super(`Relation authority refused (${code}) for ${id}`);
    this.name = "RelationMaterializationError";
  }
}

/**
 * Accept a PROPOSED RelationHypothesis and materialize its canonical Relation —
 * the explicit relation-decision boundary the Graphology projection consumes.
 *
 * 1. Loads the durable hypothesis (case-scoped).
 * 2. Guards: exists, in the current case, PROPOSED (ACCEPTED/REJECTED/REVERSED
 *    decisions are never clobbered).
 * 3. Derives the deterministic canonical RelationId + relationKey.
 * 4. Marks the hypothesis ACCEPTED (transition-guarded), then materializes the
 *    canonical Relation (idempotent on relationKey).
 *
 * Returns the post-decision hypothesis + materialized relation id. The caller
 * emits the authority audit event with the ACTUAL RelationId.
 */
export async function materializeCanonicalRelationFromAcceptedHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
    actor: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<AcceptRelationResult> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore, relationStore: relStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }
  if (hypothesis.status !== "PROPOSED") {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
  }

  // M-A12 WS-2 hardening: a malformed proposed interval must never reach a
  // canonical relation. Fail loudly (refuse the accept) rather than persist a
  // temporal contradiction.
  if (hypothesis.validityInterval !== undefined && hypothesis.validityInterval !== null) {
    assertValidTemporalInterval(hypothesis.validityInterval);
  }

  const relationKey = buildRelationKey({
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    scoreModelVersion: hypothesis.scoreModelVersion,
  });
  const relationId = await deterministicRelationId({
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    scoreModelVersion: hypothesis.scoreModelVersion,
  });

  const provenance = {
    ...(hypothesis.provenance !== undefined &&
    typeof hypothesis.provenance === "object" &&
    hypothesis.provenance !== null &&
    "sourceId" in hypothesis.provenance &&
    hypothesis.provenance.sourceId !== undefined
      ? { sourceId: hypothesis.provenance.sourceId as string }
      : {}),
    derivedFrom: hypothesis.evidenceBasis,
    extractor: "indago:relation-materialization:authority",
    extractionMethod: params.actor,
    hypothesisId,
  };

  // ONE atomic boundary: the hypothesis ACCEPT decision AND the canonical
  // relation materialization commit together or not at all. No partial accept,
  // no canonical relation without an accepted hypothesis, no accepted state
  // without its canonical relation. The audit event is emitted by the caller
  // AFTER this transaction commits (so no audit claims success on rollback).
  let createdGraphVersionId: string | undefined;
  const materialization = await relStore.transaction<AcceptRelationResult>(async (tx) => {
    const updatedHypothesis = await hypStore.acceptHypothesis(
      hypothesisId,
      { caseId },
      tx,
    );
    if (!updatedHypothesis) {
      // The hypothesis passed the PROPOSED guard above, so this is an
      // invariant break (e.g. a concurrent authority transitioned it between
      // our read and write). Refuse rather than materialize a relation for a
      // hypothesis the durable store no longer honors.
      throw new RelationMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
    }

    const result = await relStore.materializeRelation(
      {
        id: relationId,
        relationKey,
        caseId,
        investigationId: hypothesis.investigationId ?? undefined,
        sourceEntityId: hypothesis.sourceEntityId,
        targetEntityId: hypothesis.targetEntityId,
        relationType: hypothesis.relationType,
        directed: hypothesis.directed,
        support: hypothesis.support,
        evidenceBasis: hypothesis.evidenceBasis,
        contradictions: hypothesis.contradictions,
        scoreModelVersion: hypothesis.scoreModelVersion,
        evidenceCount: hypothesis.evidenceCount,
        provenance,
        hypothesisId,
        validityInterval: hypothesis.validityInterval,
      },
      tx,
    );

    // M-A12-PR2 (D6): a genuinely NEW canonical ACTIVE relation is a
    // graph-affecting canonical change ⇒ create a graph version in the SAME
    // transaction (atomicity: "canonical changed but no version" is
    // impossible, and a rolled-back mutation cannot leave a version behind —
    // the version commits only with the mutation). An idempotent reuse of an
    // already-materialized relation (reusedExisting=true) changes no canonical
    // state ⇒ no duplicate version (L. retry idempotency).
    let createdVersionNumber: number | undefined;
    if (!result.reusedExisting && stores.graphVersionStore) {
      const createdVersion = await stores.graphVersionStore.createVersion(
        {
          caseId,
          investigationId: hypothesis.investigationId ?? undefined,
          status: "DRAFT",
          reason: `RELATION_ACCEPTED:${relationId}`,
          metadata: {
            ...toGraphRevisionMetadata({
              type: GRAPH_CHANGE_ACCEPTED,
              relationId,
            } satisfies GraphRevisionEvent),
            hypothesisId,
            relationType: hypothesis.relationType,
            sourceEntityId: hypothesis.sourceEntityId,
            targetEntityId: hypothesis.targetEntityId,
          },
        },
        tx,
      );
      createdVersionNumber = createdVersion.versionNumber;
      createdGraphVersionId = createdVersion.id;
    }

    // Seed the ORIGINAL temporal assertion with the actual version number
    // (M-A12 item A). Idempotent on reused relations. The assertion's
    // revisionAtVersionNumber anchors the amendment family to the revision
    // chain — historical projection reads it to compute the correct
    // validityInterval at any given version N.
    if (
      !result.reusedExisting &&
      createdVersionNumber !== undefined &&
      hypothesis.validityInterval !== null &&
      hypothesis.validityInterval !== undefined &&
      stores.relationStore.seedOriginalAssertion
    ) {
      await stores.relationStore.seedOriginalAssertion(
        relationId,
        { caseId },
        hypothesis.validityInterval as import("@indago/contracts").TemporalInterval,
        { revisionAtVersionNumber: createdVersionNumber },
        tx,
      );
    }

    // M-A12-D6: append the authoritative RELATION_ACCEPTED canonical transition
    // in the SAME transaction (atomic with the canonical change). Idempotent
    // via the deterministic id + logicalKey; only a genuinely fresh canonical
    // relation is recorded (reusedExisting → no new canonical state).
    if (!result.reusedExisting && stores.temporalStateChange) {
      await stores.temporalStateChange.recordChange(
        {
          caseId,
          investigationId: hypothesis.investigationId ?? undefined,
          entityType: "RELATION",
          entityId: relationId,
          stateType: "ACCEPTED",
          ...(hypothesis.validityInterval !== undefined && hypothesis.validityInterval !== null
            ? { validityInterval: hypothesis.validityInterval }
            : {}),
          provenance,
          note: `relation authority accepted hypothesis ${hypothesisId}`,
        },
        tx,
      );
    }

    return {
      hypothesis: updatedHypothesis,
      relationId,
      materialized: true,
      reused: result.reusedExisting,
    };
  });

  // PR12 producer (GRAPH_AFFECTING): a genuinely new canonical ACTIVE relation
  // is anchored at the NEW graph version committed above. Publish only AFTER
  // the authority transaction commits (publishCaseChange opens its own
  // transaction on the shared client — never nest). Production swallow: a lost
  // change is recovered by the cursor's tail recording.
  if (createdGraphVersionId !== undefined) {
    try {
      await publishCaseChange({
        caseId,
        graphVersionId: createdGraphVersionId,
        trigger: relationAcceptedTrigger({
          caseId,
          relationHypothesisId: hypothesisId,
          relationId,
          graphVersionId: createdGraphVersionId,
          computedAt: { value: new Date().toISOString(), precision: "exact" },
        }),
      });
    } catch (error) {
      console.error("PR12 publishCaseChange failed", error);
    }
  }

  return materialization;
}

/**
 * Reject a PROPOSED RelationHypothesis. No canonical relation is created. Falls
 * through to the transition-guarded store — an already-resolved hypothesis is
 * refused. Runs atomically so no partial state can be observed.
 */
export async function rejectRelationHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<DurableRelationHypothesis> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }

  return hypStore.transaction<DurableRelationHypothesis>(async (tx) => {
    const updated = await hypStore.rejectHypothesis(hypothesisId, { caseId }, tx);
    if (!updated) {
      throw new RelationMaterializationError("HYPOTHESIS_NOT_REVERSIBLE", hypothesisId);
    }
    return updated;
  });
}

/**
 * Reverse an ACCEPTED (or REJECTED) RelationHypothesis. If a canonical relation
 * exists and is ACTIVE, it is marked REVERSED (REVERSED != MERGED; history kept).
 *
 * Runs atomically: the hypothesis REVERSE decision AND the canonical-relation
 * reversal commit together or not at all — the canonical relation can never be
 * left ACTIVE while its accepted hypothesis is REVERSED (and vice-versa).
 */
export interface ReverseRelationResult {
  readonly hypothesis: DurableRelationHypothesis;
  /** Canonical relation id, present only when an ACTIVE canonical existed. */
  readonly canonicalRelationId: string | null;
  /** True when an ACTIVE canonical relation was actually flipped to REVERSED. */
  readonly canonicalReversed: boolean;
}

export async function reverseRelationHypothesis(
  params: {
    caseId: string;
    hypothesisId: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<ReverseRelationResult> {
  const { caseId, hypothesisId } = params;
  const { relationHypothesisStore: hypStore, relationStore: relStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, { caseId });
  if (!hypothesis) {
    throw new RelationMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }

  // Idempotent: a second reverse of an already-REVERSED hypothesis is a no-op
  // (returns the existing state, no duplicate writes or versions).
  if (hypothesis.status === "REVERSED") {
    return {
      hypothesis,
      canonicalRelationId: null,
      canonicalReversed: false,
    };
  }

  const canonicalRelationId = await deterministicRelationId({
    sourceEntityId: hypothesis.sourceEntityId,
    targetEntityId: hypothesis.targetEntityId,
    relationType: hypothesis.relationType,
    directed: hypothesis.directed,
    scoreModelVersion: hypothesis.scoreModelVersion,
  });

  return relStore.transaction<ReverseRelationResult>(async (tx) => {
    const updated = await hypStore.reverseHypothesis(hypothesisId, { caseId }, tx);
    if (!updated) {
      throw new RelationMaterializationError("HYPOTHESIS_NOT_REVERSIBLE", hypothesisId);
    }

    // Flip the ACTIVE canonical relation to REVERSED in the same transaction.
    const canonical = await relStore.markReversed(
      canonicalRelationId,
      { caseId },
      tx,
    );

    // M-A12 WS-2 hardening: the interval the REVERSED transition carries (the
    // one inherited at accept) must remain valid before it is appended to the
    // temporal history — fail loudly on a contradiction.
    if (
      canonical &&
      canonical.validityInterval !== null &&
      canonical.validityInterval !== undefined
    ) {
      assertValidTemporalInterval(canonical.validityInterval);
    }

    // M-A12-PR2 (D6): only when an ACTIVE canonical relation actually flipped
    // to REVERSED is there a graph-affecting canonical change ⇒ create a graph
    // version in the SAME transaction. If the canonical was already REVERSED
    // (or no canonical existed), no canonical change occurred ⇒ no new version
    // (retry/idempotency / non-duplication).
    if (canonical !== null && stores.graphVersionStore) {
      await stores.graphVersionStore.createVersion(
        {
          caseId,
          investigationId: hypothesis.investigationId ?? undefined,
          status: "DRAFT",
          reason: `RELATION_REVERSED:${canonicalRelationId}`,
          metadata: {
            ...toGraphRevisionMetadata({
              type: GRAPH_CHANGE_REVERSED,
              relationId: canonicalRelationId,
            } satisfies GraphRevisionEvent),
            hypothesisId,
          },
        },
        tx,
      );
    }

    // M-A12-D6: append the authoritative RELATION_REVERSED canonical transition
    // in the SAME transaction — only when an ACTIVE canonical actually flipped.
    if (canonical !== null && stores.temporalStateChange) {
      await stores.temporalStateChange.recordChange(
        {
          caseId,
          investigationId: hypothesis.investigationId ?? undefined,
          entityType: "RELATION",
          entityId: canonicalRelationId,
          stateType: "REVERSED",
          ...(canonical.validityInterval !== null && canonical.validityInterval !== undefined
            ? { validityInterval: canonical.validityInterval }
            : {}),
          provenance: canonical.provenance,
          note: `relation authority reversed hypothesis ${hypothesisId}`,
        },
        tx,
      );
    }

    return {
      hypothesis: updated,
      canonicalRelationId: canonical ? canonicalRelationId : null,
      canonicalReversed: canonical !== null,
    };
  });
}

// ============================================================================
// M-A12 Item A: Amended-validity authority
//
// The explicit authority boundary that corrects a canonical relation's
// domain-validity interval. The correction is append-only: a new AMENDMENT
// assertion is recorded (never overwrites or deletes the original); the
// persisted `validityInterval` column is overwritten with the correction so
// active consumers don't need to compute it; a RELATION_AMENDED graph version
// + RELATION:AMENDED TSC are recorded atomically (same tx).
//
// DESIGN (items A + D5):
//   - NEW interval must pass assertValidTemporalInterval (D5 — no contradiction).
//   - Supersedes the ORIGINAL or prior AMENDMENT assertion by id.
//   - Caller provides supersedesAssertionId (boundary does NOT scan the
//     assertion array to pick the latest — that logic lives in projection).
//   - Caller provides revisionAtVersionNumber (same tx as createVersion).
//   - Idempotent: second amend with the same interval changes no state (no
//     duplicate version/TSC/assertion).
// ============================================================================

export interface AmendRelationResult {
  readonly relationId: string;
  readonly versionCreated: boolean;
}

/**
 * Amend a canonical relation's domain-validity interval (M-A12 item A).
 *
 * Pre-conditions:
 *   - Canonical relation exists and is ACTIVE (REVERSED/missing → refused).
 *   - New interval passes D5 validation (no temporal contradiction).
 *
 * Same-transaction atomicity:
 *   1. RelationStore.amendValidity — appends AMENDMENT assertion + overwrites
 *      persisted validityInterval.
 *   2. GraphVersionStore.createVersion — RELATION_AMENDED revision.
 *   3. TemporalStateChangeStore.recordChange — RELATION:AMENDED TSC entry.
 *
 * Idempotency: if the relation already carries an AMENDMENT whose
 * validityInterval equals `newInterval`, no version/TSC is created (caller
 * receives `versionCreated: false`).
 */
export async function amendRelationValidity(
  params: {
    caseId: string;
    relationId: string;
    newInterval: import("@indago/contracts").TemporalInterval;
    supersedesAssertionId: string;
    provenance?: Record<string, unknown>;
    actor: string;
    investigationId?: string;
  },
  stores: RelationMaterializationStores = DEFAULT_STORES,
): Promise<AmendRelationResult> {
  const { caseId, relationId, newInterval, supersedesAssertionId, provenance, actor, investigationId } = params;
  const { relationStore: relStore } = stores;

  // D5: reject malformed intervals at the boundary — never persist a contradiction.
  assertValidTemporalInterval(newInterval);

  return relStore.transaction<AmendRelationResult>(async (tx) => {
    // 1. Read current relation for idempotency check (ACTIVE guard + interval comparison).
    const current = await relStore.findById(relationId, { caseId });
    if (!current || current.status !== "ACTIVE") {
      throw new RelationMaterializationError(
        current ? "RELATION_NOT_ACTIVE" : "RELATION_NOT_FOUND",
        relationId,
      );
    }

    // Idempotency: if the latest assertion already carries the same interval,
    // this amend is a no-op (no duplicate version/TSC).
    const assertions = parseTemporalAssertions(current.temporalAssertions);
    const latest = assertions[assertions.length - 1];
    const alreadyApplied =
      latest &&
      latest.kind === "AMENDMENT" &&
      JSON.stringify(latest.validityInterval) === JSON.stringify(newInterval);
    if (alreadyApplied) {
      return { relationId, versionCreated: false };
    }

    // 2. Graph version + TSC must be created BEFORE amendValidity reads the
    //    current assertion array, so the version number is known and atomic.
    //    Create the version first, then amend (which appends the assertion
    //    tagged with the version number).
    if (stores.graphVersionStore) {
      const createdVersion = await stores.graphVersionStore.createVersion(
        {
          caseId,
          investigationId: investigationId ?? current.investigationId ?? undefined,
          status: "DRAFT",
          reason: `RELATION_AMENDED:${relationId}`,
          metadata: {
            ...toGraphRevisionMetadata({
              type: GRAPH_CHANGE_AMENDED,
              relationId,
            } satisfies GraphRevisionEvent),
            supersedesAssertionId,
          },
        },
        tx,
      );

      // 3. Append the AMENDMENT assertion (atomic with the version + interval update).
      const amended = await relStore.amendValidity(
        relationId,
        { caseId },
        newInterval,
        {
          revisionAtVersionNumber: createdVersion.versionNumber,
          supersedesAssertionId,
          provenance: {
            ...(provenance ?? {}),
            extractor: "indago:amend-validity:authority",
            extractionMethod: actor,
          },
        },
        tx,
      );
      if (!amended) {
        throw new RelationMaterializationError("RELATION_NOT_ACTIVE", relationId);
      }

      // 4. TSC: same-tx canonical transition (M-A12-D6).
      if (stores.temporalStateChange) {
        await stores.temporalStateChange.recordChange(
          {
            caseId,
            investigationId: investigationId ?? current.investigationId ?? undefined,
            entityType: "RELATION",
            entityId: relationId,
            stateType: "AMENDED",
            validityInterval: newInterval,
            provenance: amended.provenance,
            note: `relation authority amended validity (supersedes ${supersedesAssertionId})`,
          },
          tx,
        );
      }

      return { relationId, versionCreated: true };
    }

    // No graphVersionStore supplied (test seam) — amend validity only.
    await relStore.amendValidity(
      relationId,
      { caseId },
      newInterval,
      {
        revisionAtVersionNumber: 1,
        supersedesAssertionId,
        provenance: {
          ...(provenance ?? {}),
          extractor: "indago:amend-validity:authority",
          extractionMethod: actor,
        },
      },
      tx,
    );
    return { relationId, versionCreated: false };
  });
}