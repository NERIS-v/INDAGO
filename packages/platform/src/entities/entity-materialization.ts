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
  readonly entityStore: Pick<typeof entityStore, "materializeEntity">;
}

const DEFAULT_STORES: EntityMaterializationStores = {
  entityHypothesisStore,
  entityMentionStore,
  entityStore,
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

  // Durable-state-first: persist the authoritative decision THEN materialize.
  const updatedHypothesis = await hypStore.markAccepted(
    hypothesisId,
    { caseId },
    entityId,
  );
  if (!updatedHypothesis) {
    // The hypothesis passed the PROPOSED guard above, so this is an
    // unexpected invariant break (e.g. a concurrent authority transitioned it
    // between our read and write). Refuse rather than materialize an entity
    // for a hypothesis whose decision the durable store no longer honors.
    throw new EntityMaterializationError("HYPOTHESIS_NOT_PROPOSED", hypothesisId);
  }

  const result = await entStore.materializeEntity({
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
  });

  return {
    entityId,
    hypothesis: updatedHypothesis,
    materialized: true,
    reused: result.reusedExisting,
  };
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
