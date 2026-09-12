// ============================================================================
// P4 — Cross-case shared-entity/infrastructure discovery
//
// Deterministic, read-only discovery of entities that appear in TWO DIFFERENT
// cases under the SAME normalized identity (canonicalName + entityType).
// This is a legitimate deterministic signal — an exact string match on a
// phone number, email, or account identifier is an objective fact, not a
// semantic guess — and is intentionally the ONLY matching strategy here:
// fuzzy/semantic cross-case matching is explicitly future work gated behind
// a benchmark (dev-plan §23.8), never adopted ahead of one.
//
// matchScore is therefore always exactly 1.0 for every match this service
// returns (an exact identity match), never a fabricated intermediate value —
// CrossCaseMatchSchema's ResolutionScoreSchema range is preserved for a
// future fuzzy matcher to populate with a genuine graded score.
//
// Case-scope discipline: this is the ONE analytics surface in P4 that
// necessarily reads across two case boundaries. The caller (HTTP route) MUST
// verify the requesting principal has access to BOTH caseIds before calling
// — this service does not and cannot know the caller's authorization context.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";
import { EntityStore, type CanonicalEntity } from "../persistence/entity-store.js";
import type { CrossCaseMatch } from "@indago/contracts";

export const CROSS_CASE_BOUNDS = {
  maxResults: 200,
} as const;

function normalizeIdentity(entityType: string | null, canonicalName: string): string {
  return `${entityType ?? "\u0000"}::${canonicalName.trim().toLowerCase()}`;
}

export interface CrossCaseScope {
  readonly caseId: string;
  readonly investigationId: string;
}

export class CrossCaseDiscoveryService {
  constructor(
    private readonly entities: EntityStore = new EntityStore(),
    private readonly prisma: PrismaClient = db,
  ) {}

  /**
   * Find exact-identity entity matches between two cases. Returns [] (never
   * throws) for a self-comparison (sourceCaseId === targetCaseId) — that is
   * a caller bug, not a "case linked to itself" signal.
   */
  async findMatches(
    source: CrossCaseScope,
    target: CrossCaseScope,
    options: { maxResults?: number } = {},
  ): Promise<CrossCaseMatch[]> {
    if (source.caseId === target.caseId) return [];
    const maxResults = options.maxResults ?? CROSS_CASE_BOUNDS.maxResults;

    const [sourceEntities, targetEntities] = await Promise.all([
      this.entities.listByCase(source.caseId, { investigationId: source.investigationId }),
      this.entities.listByCase(target.caseId, { investigationId: target.investigationId }),
    ]);

    const targetByIdentity = new Map<string, CanonicalEntity[]>();
    for (const e of targetEntities) {
      if (e.status !== "ACTIVE") continue;
      const key = normalizeIdentity(e.entityType, e.canonicalName);
      const bucket = targetByIdentity.get(key);
      if (bucket) bucket.push(e);
      else targetByIdentity.set(key, [e]);
    }

    type RawMatch = { sourceEntity: CanonicalEntity; targetEntity: CanonicalEntity };
    const rawMatches: RawMatch[] = [];
    for (const e of sourceEntities) {
      if (e.status !== "ACTIVE") continue;
      const key = normalizeIdentity(e.entityType, e.canonicalName);
      const candidates = targetByIdentity.get(key);
      if (!candidates) continue;
      for (const t of candidates) {
        rawMatches.push({ sourceEntity: e, targetEntity: t });
      }
    }

    // Deterministic ordering before bounding: sourceEntityId, then targetEntityId.
    rawMatches.sort((a, b) => {
      if (a.sourceEntity.id !== b.sourceEntity.id) {
        return a.sourceEntity.id < b.sourceEntity.id ? -1 : 1;
      }
      return a.targetEntity.id < b.targetEntity.id ? -1 : 1;
    });
    const bounded = rawMatches.slice(0, maxResults);

    const sharedEvidenceTypesByPair = await this.computeSharedEvidenceTypes(bounded);

    const now = new Date().toISOString();
    return bounded.map(({ sourceEntity, targetEntity }) => ({
      sourceCaseId: source.caseId,
      targetCaseId: target.caseId,
      sourceEntityId: sourceEntity.id,
      targetEntityId: targetEntity.id,
      matchScore: 1.0,
      sharedEvidenceTypes: sharedEvidenceTypesByPair.get(`${sourceEntity.id}|${targetEntity.id}`) ?? [],
      sharedEntityCount: bounded.length,
      investigationIds: [source.investigationId, target.investigationId],
      confidence: 1.0,
      computedAt: { value: now, precision: "exact" as const },
    }));
  }

  /**
   * For each matched pair, the intersection of the two entities' incident
   * Observation.type values — a truthful "what kinds of evidence exist on
   * both sides" signal, never fabricated when no observations are linked.
   */
  private async computeSharedEvidenceTypes(
    pairs: readonly { sourceEntity: CanonicalEntity; targetEntity: CanonicalEntity }[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (pairs.length === 0) return result;

    const allObservationIds = [
      ...new Set(pairs.flatMap((p) => [...p.sourceEntity.observationIds, ...p.targetEntity.observationIds])),
    ];
    if (allObservationIds.length === 0) return result;

    const rows = await this.prisma.observation.findMany({
      where: { id: { in: allObservationIds } },
      select: { id: true, type: true },
    });
    const typeById = new Map(rows.map((r: { id: string; type: string }) => [r.id, r.type] as const));

    for (const { sourceEntity, targetEntity } of pairs) {
      const sourceTypes = new Set(sourceEntity.observationIds.map((id) => typeById.get(id)).filter((t): t is string => !!t));
      const targetTypes = new Set(targetEntity.observationIds.map((id) => typeById.get(id)).filter((t): t is string => !!t));
      const shared = [...sourceTypes].filter((t) => targetTypes.has(t)).sort();
      result.set(`${sourceEntity.id}|${targetEntity.id}`, shared);
    }
    return result;
  }
}

export const crossCaseDiscoveryService = new CrossCaseDiscoveryService();
