// ============================================================================
// M-A09.5 Canonical Entity Materialization Authority
//
// This is the SMALLEST explicit authority/decision boundary that turns an
// ACCEPTED EntityHypothesis into a durable Canonical Entity — the prerequisite
// M-A10 relation resolution demands (M-A10 consumes canonical EntityIds, never
// mention/pair ids).
//
// Identity boundary (locked):
//   - A canonical Entity is created ONLY through this explicit ACCEPT decision.
//   - It is NEVER fabricated from a candidate pair score, a resolution score,
//     graph proximity, or automated scoring alone.
//   - EntityId is derived deterministically from (caseId, canonicalName,
//     entityType) via @indago/entity-resolution deterministicEntityId — the
//     exact identity primitive that EntityStore.materializeEntity persists.
//
// Lifecycle (locked):
//   EntityHypothesis PROPOSED → explicit ACCEPT → canonical Entity is
//   materialized. ACCEPTED/REJECTED/REVERSED hypotheses are left untouched.
//
// This module owns ONLY the decision semantics. All persistence is delegated to
// the existing EntityStore / EntityHypothesisStore boundaries (which own
// idempotency, P2002 races, and lifecycle preservation).
// ============================================================================

import type { EntityMentionCandidate, EntityHypothesis } from "@indago/contracts";
import {
  buildEntityIdentityKey,
  deterministicEntityId,
} from "@indago/entity-resolution";
import { entityStore } from "../persistence/entity-store.js";
import { entityHypothesisStore } from "../persistence/entity-hypothesis-store.js";
import { entityMentionStore } from "../persistence/entity-mention-store.js";
import {
  temporalStateChangeStore,
  type TemporalStateChangeStore,
} from "../persistence/temporal-state-change-store.js";
import {
  graphVersionStore,
  type GraphVersionStore,
} from "../persistence/graph-version-store.js";
import {
  GRAPH_CHANGE_ENTITY_CREATED,
  GRAPH_CHANGE_ENTITY_ARCHIVED,
  type GraphRevisionEvent,
  toGraphRevisionMetadata,
} from "../relations/graph-version-service.js";

/**
 * Entity types that carry a canonical name usable as the Entity.canonicalName.
 * Untyped / non-name candidates (PHONE, EMAIL, ...) fall back to using their
 * normalized canonical value as the display name.
 */
const NAME_BEARING_TYPES = new Set([
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "VEHICLE",
  "DEVICE",
  "ACCOUNT",
  "OTHER",
]);

/**
 * Derive a deterministic canonical name + entity type from the supporting
 * candidates of an accepted hypothesis. Prefers an explicit typed candidate's
 * canonicalMatchValue/text; falls back to the first available candidate value.
 * Pure, deterministic, never fabricated from a score.
 */
export function deriveCanonicalEntityProfile(
  candidates: readonly EntityMentionCandidate[],
): { canonicalName: string; entityType?: string } {
  const ordered = [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1));

  // 1. Prefer a candidate carrying a NAME-bearing entity type with a usable value.
  for (const c of ordered) {
    const type = c.entityType;
    if (type !== undefined && NAME_BEARING_TYPES.has(type)) {
      const value =
        c.canonicalMatchValue !== undefined && c.canonicalMatchValue.length > 0
          ? c.canonicalMatchValue
          : c.text;
      if (value.length > 0) return { canonicalName: value, entityType: type };
    }
  }

  // 2. Fall back to the first non-empty candidate value, untyped if needed.
  for (const c of ordered) {
    const value =
      c.canonicalMatchValue !== undefined && c.canonicalMatchValue.length > 0
        ? c.canonicalMatchValue
        : c.text;
    if (value.length > 0) {
      return {
        canonicalName: value,
        ...(c.entityType !== undefined ? { entityType: c.entityType } : {}),
      };
    }
  }

  // 3. Defensive floor (should be unreachable given a valid hypothesis with
  //    supporting candidates). Never a fabricated identity.
  throw new Error(
    "deriveCanonicalEntityProfile: no usable supporting candidate value to materialize a canonical Entity",
  );
}

export interface MaterializeFromAcceptedHypothesisResult {
  readonly entityId: string;
  readonly hypothesis: EntityHypothesis;
  readonly materialized: boolean;
  readonly reused: boolean;
}

/**
 * Injectable store boundaries (default to the process singletons). Supplied so
 * the real-Postgres integration suite can point the materialization authority
 * at TEST_DATABASE_URL instead of the production `db`.
 */
export interface EntityMaterializationStores {
  readonly entityHypothesisStore: Pick<
    typeof entityHypothesisStore,
    "findById" | "markAccepted"
  >;
  readonly entityMentionStore: Pick<typeof entityMentionStore, "findByIds">;
  readonly entityStore: Pick<
    typeof entityStore,
    "transaction" | "materializeEntity" | "updateStatus" | "findById"
  >;
  /**
   * Optional — when supplied, an ENTITY_CREATED graph version is created
   * (atomically, in the same transaction) whenever a genuinely fresh canonical
   * entity is materialized (M-A12 entity versioning / item B). The production
   * default always supplies it; tests that target the authority in isolation
   * may omit it to keep the seam version-agnostic.
   */
  readonly graphVersionStore?: GraphVersionStore;
  /**
   * Optional — when supplied, the authoritative ENTITY_CREATED canonical
   * transition is appended to the TemporalStateChange history in the SAME
   * transaction as the canonical entity creation (M-A12-D6). The production
   * default (DEFAULT_STORES) always supplies it; tests that target the
   * authority in isolation may omit it.
   */
  readonly temporalStateChange?: Pick<TemporalStateChangeStore, "recordChange">;
}

const DEFAULT_STORES: EntityMaterializationStores = {
  entityHypothesisStore,
  entityMentionStore,
  entityStore,
  graphVersionStore,
  temporalStateChange: temporalStateChangeStore,
};

/**
 * Accept a PROPOSED EntityHypothesis and materialize its canonical Entity —
 * the explicit identity-decision boundary.
 *
 * 1. Loads the durable hypothesis (case-scoped).
 * 2. Guards: the hypothesis MUST exist, be in the current case, and carry a
 *    PROPOSED status (an existing ACCEPTED/REJECTED/REVERSED decision is never
 *    clobbered).
 * 3. Loads the SUPPORTING candidates and derives the canonical profile.
 * 4. Computes the deterministic canonical EntityId + identityKey.
 * 5. Marks the hypothesis ACCEPTED, then materializes the Entity (which merges
 *    observationIds/hypothesisIds — a retry never loses linked data).
 *
 * Returns true only when a fresh canonical Entity (or updated row) was
 * materialized, plus the durable hypothesis state. Caller emits the authority
 * audit event with the ACTUAL EntityId / hypothesis id.
 */
export async function materializeCanonicalEntityFromAcceptedHypothesis(
  params: {
    caseId: string;
    investigationId: string;
    hypothesisId: string;
    actor: string;
  },
  stores: EntityMaterializationStores = DEFAULT_STORES,
): Promise<MaterializeFromAcceptedHypothesisResult> {
  const { caseId, investigationId, hypothesisId, actor } = params;
  const { entityHypothesisStore: hypStore, entityMentionStore: mentionStore, entityStore: entStore } = stores;

  const hypothesis = await hypStore.findById(hypothesisId, {
    caseId,
  });
  if (!hypothesis) {
    throw new EntityMaterializationError("HYPOTHESIS_NOT_FOUND", hypothesisId);
  }
  if (hypothesis.status !== "PROPOSED") {
    throw new EntityMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
  }

  const supportingCandidateIds = hypothesis.supportingCandidateIds ?? [];
  const candidates = await mentionStore.findByIds(supportingCandidateIds, {
    investigationId,
    caseId,
  });
  if (candidates.length === 0) {
    throw new EntityMaterializationError("NO_SUPPORTING_CANDIDATES", hypothesisId);
  }

  const { canonicalName, entityType } = deriveCanonicalEntityProfile(candidates);

  const identityKey = buildEntityIdentityKey({ caseId, canonicalName, entityType });
  const entityId = await deterministicEntityId({ caseId, canonicalName, entityType });

  const supportingObservations = hypothesis.supportingObservationIds ?? [];
  const observationIds = Array.from(
    new Set([...supportingObservations, ...candidates.map((c) => c.observationId)]),
  ).slice(0, 500);

  const provenance = {
    sourceId: candidates[0]?.provenance?.sourceId,
    ...(candidates[0]?.provenance?.artifactId !== undefined
      ? { artifactId: candidates[0].provenance.artifactId }
      : {}),
    derivedFrom: supportingObservations,
    extractor: "indago:entity-materialization:authority",
    extractionMethod: actor,
  };

  // ONE atomic boundary (M-A12-D6): the hypothesis ACCEPT decision, the
  // canonical entity materialization, AND the ENTITY_CREATED temporal record
  // commit together or not at all. No partial accept, no canonical entity
  // without an accepted hypothesis, no temporal history claiming an entity
  // that does not exist. The audit event is emitted by the caller AFTER this
  // transaction commits.
  return entStore.transaction<MaterializeFromAcceptedHypothesisResult>(
    async (tx) => {
      const updatedHypothesis = await hypStore.markAccepted(
        hypothesisId,
        { caseId },
        entityId,
        tx,
      );
      if (!updatedHypothesis) {
        // The hypothesis passed the PROPOSED guard above, so this is an
        // unexpected invariant break (e.g. a concurrent authority transitioned
        // it between our read and write). Refuse rather than materialize an
        // entity for a hypothesis whose decision the durable store no longer
        // honors.
        throw new EntityMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
      }

      const result = await entStore.materializeEntity(
        {
          identityKey,
          entity: {
            id: entityId,
            caseId,
            investigationId,
            canonicalName,
            ...(entityType !== undefined ? { entityType } : {}),
            status: "ACTIVE",
            observationIds,
            hypothesisIds: [hypothesisId],
            provenance,
          },
        },
        tx,
      );

      // Append the authoritative ENTITY_CREATED canonical transition in the
      // SAME transaction. Idempotent via the deterministic id + logicalKey;
      // only a genuinely fresh canonical entity creation is recorded
      // (reusedExisting → no new canonical state).
      if (!result.reusedExisting && stores.temporalStateChange) {
        await stores.temporalStateChange.recordChange(
          {
            caseId,
            investigationId,
            entityType: "ENTITY",
            entityId: result.entity.id,
            stateType: "CREATED",
            provenance,
            note: `entity authority materialized canonical entity ${entityId} from hypothesis ${hypothesisId}`,
          },
          tx,
        );
      }

      // M-A12 entity versioning (item B): a genuinely fresh canonical entity
      // materialization is a graph-affecting event — record an ENTITY_CREATED
      // graph version in the SAME transaction (atomic with the canonical write).
      // The graph-projection service replays these to filter the entity universe
      // at any historical version.
      if (!result.reusedExisting && stores.graphVersionStore) {
        await stores.graphVersionStore.createVersion(
          {
            caseId,
            investigationId,
            status: "DRAFT",
            reason: `ENTITY_CREATED:${entityId}`,
            metadata: {
              ...toGraphRevisionMetadata({
                type: GRAPH_CHANGE_ENTITY_CREATED,
                entityId,
              } satisfies GraphRevisionEvent),
            },
          },
          tx,
        );
      }

      return {
        entityId,
        hypothesis: updatedHypothesis,
        materialized: true,
        reused: result.reusedExisting,
      };
    },
  );
}

export class EntityMaterializationError extends Error {
  constructor(
    public readonly code: string,
    public readonly hypothesisId: string,
  ) {
    super(`Entity materialization refused (${code}) for hypothesis ${hypothesisId}`);
    this.name = "EntityMaterializationError";
  }
}

// ============================================================================
// M-A12 Item B: Entity status transition authority
//
// The explicit authority boundary that changes a canonical entity's status.
// Currently only ARCHIVED is supported (the other transitions are deferred
// pending clearer operational requirements — MERGED/SPLIT need authority
// semantics that don't yet exist).
//
// Same-transaction atomicity:
//   1. EntityStore.updateStatus — flips the durable status.
//   2. GraphVersionStore.createVersion — ENTITY_ARCHIVED revision.
//   3. TemporalStateChangeStore.recordChange — ENTITY:ARCHIVED TSC entry.
//
// Idempotent: second ARCHIVED on an already-ARCHIVED entity → no-op.
// ============================================================================

export interface TransitionEntityResult {
  readonly entityId: string;
  readonly previousStatus: string;
  readonly versionCreated: boolean;
}

/**
 * Seam for `transitionEntityStatus` — narrower than EntityMaterializationStores
 * because a status transition needs no hypothesis/mention boundaries.
 */
export interface TransitionEntityStores {
  readonly entityStore: Pick<
    typeof entityStore,
    "transaction" | "findById" | "updateStatus"
  >;
  readonly graphVersionStore?: GraphVersionStore;
  readonly temporalStateChange?: Pick<TemporalStateChangeStore, "recordChange">;
}

/**
 * Transition a canonical entity's status (M-A12 item B). Currently only
 * ACTIVE → ARCHIVED is supported.
 *
 * Pre-conditions:
 *   - Entity exists, is in the given case, and is in a transitable status
 *     (currently only ACTIVE → ARCHIVED).
 */
export async function transitionEntityStatus(
  params: {
    caseId: string;
    entityId: string;
    newStatus: string;
    actor: string;
    investigationId?: string;
  },
  stores: TransitionEntityStores = DEFAULT_STORES,
): Promise<TransitionEntityResult> {
  const { caseId, entityId, newStatus, actor, investigationId } = params;
  const { entityStore: entStore } = stores;

  return entStore.transaction<TransitionEntityResult>(async (tx) => {
    const current = await entStore.findById(entityId, { caseId });
    if (!current) {
      throw new EntityMaterializationError("ENTITY_NOT_FOUND", entityId);
    }

    // Idempotency: already in target status → no-op.
    if (current.status === newStatus) {
      return { entityId, previousStatus: current.status, versionCreated: false };
    }

    // Guard: only ACTIVE → ARCHIVED is legal (other transitions deferred).
    if (current.status !== "ACTIVE" || newStatus !== "ARCHIVED") {
      throw new EntityMaterializationError(
        `INVALID_TRANSITION:${current.status}→${newStatus}`,
        entityId,
      );
    }

    const updated = await entStore.updateStatus(entityId, { caseId }, newStatus, tx);
    if (!updated) {
      throw new EntityMaterializationError("ENTITY_NOT_FOUND", entityId);
    }

    // Graph version: ENTITY_ARCHIVED revision (same tx — atomic with the status flip).
    let versionCreated = false;
    if (stores.graphVersionStore) {
      await stores.graphVersionStore.createVersion(
        {
          caseId,
          investigationId: investigationId ?? current.investigationId ?? undefined,
          status: "DRAFT",
          reason: `ENTITY_ARCHIVED:${entityId}`,
          metadata: {
            ...toGraphRevisionMetadata({
              type: GRAPH_CHANGE_ENTITY_ARCHIVED,
              entityId,
            } satisfies GraphRevisionEvent),
          },
        },
        tx,
      );
      versionCreated = true;
    }

    // TSC: same-tx canonical transition (M-A12-D6).
    if (stores.temporalStateChange) {
      await stores.temporalStateChange.recordChange(
        {
          caseId,
          investigationId: investigationId ?? current.investigationId ?? undefined,
          entityType: "ENTITY",
          entityId,
          stateType: "ARCHIVED",
          provenance: current.provenance,
          note: `entity authority ${actor} transitioned ${entityId} to ${newStatus}`,
        },
        tx,
      );
    }

    return { entityId, previousStatus: current.status, versionCreated };
  });
}
