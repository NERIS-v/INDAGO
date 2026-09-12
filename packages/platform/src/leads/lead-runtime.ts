// ============================================================================
// P4 — LeadRuntime
//
// Orchestrates the full P4 pipeline: pull structural candidates from
// GraphRuntime (bridges / temporal bursts / community candidates —
// @indago/graphology-projection, wired in P4-PR1) and from
// CrossCaseDiscoveryService, gather the real entity/relation context each
// candidate needs, hand it to @indago/lead-generation's pure draft builders,
// and persist the result via LeadStore (idempotent — see LeadStore.upsertDraft).
//
// This module owns ORCHESTRATION ONLY: it does not implement any detection
// algorithm (that is graphology-projection's job) and does not implement any
// generation/templating logic (that is lead-generation's job) — matching the
// "platform never invents evidence semantics" discipline from the dev plan.
// ============================================================================

import type {
  BridgeCandidateDTO,
  TemporalBurstCandidateDTO,
  CommunityCandidateDTO,
  CrossCaseMatch,
  Provenance,
  LeadDraft,
} from "@indago/contracts";
import {
  buildBridgeLeadDraft,
  buildTemporalBurstLeadDraft,
  buildCommunityLeadDraft,
  buildCrossCaseLeadDraft,
} from "@indago/lead-generation";
import { graphRuntime, type GraphAnalyticsService, type GraphScopeInput } from "../relations/graph-runtime.js";
import { EntityStore, type CanonicalEntity } from "../persistence/entity-store.js";
import { RelationStore, type DurableRelation } from "../persistence/relation-store.js";
import { leadStore, type LeadStore, type DurableLead } from "./lead-store.js";
import {
  crossCaseDiscoveryService,
  type CrossCaseDiscoveryService,
  type CrossCaseScope,
} from "./cross-case-discovery.js";

/** Bound on how many internal edges' evidence we union for a single community lead. */
const COMMUNITY_EVIDENCE_UNION_CAP = 200;
/** Bound on how many observation ids we carry from either entity into a cross-case lead. */
const CROSS_CASE_OBSERVATION_CAP = 50;

function isProvenance(value: unknown): value is Provenance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sourceId?: unknown }).sourceId === "string" &&
    typeof (value as { extractor?: unknown }).extractor === "string"
  );
}

function dedupeProvenance(entries: readonly Provenance[]): Provenance[] {
  const seen = new Set<string>();
  const out: Provenance[] = [];
  for (const p of entries) {
    const key = `${p.sourceId}|${p.extractor}|${p.documentRef ?? ""}|${p.spanRef ?? ""}|${p.rowRef ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export interface SkippedCandidate {
  readonly reason: string;
  readonly sourceCandidateType: string;
  readonly sourceCandidateKey: string;
}

export interface GenerationResult {
  readonly candidatesConsidered: number;
  readonly leadsCreated: DurableLead[];
  readonly leadsAlreadyExisted: DurableLead[];
  readonly skipped: readonly SkippedCandidate[];
}

export class LeadRuntime {
  constructor(
    private readonly graph: GraphAnalyticsService = graphRuntime,
    private readonly entities: EntityStore = new EntityStore(),
    private readonly relations: RelationStore = new RelationStore(),
    private readonly leads: LeadStore = leadStore,
    private readonly crossCase: CrossCaseDiscoveryService = crossCaseDiscoveryService,
  ) {}

  /**
   * Run bridge + temporal-burst + community candidate detection for one case
   * and persist any new leads. Idempotent: re-running over unchanged graph
   * state produces the same lead ids and creates nothing new (LeadStore
   * never overwrites an existing lead).
   */
  async generateStructuralLeads(
    scope: GraphScopeInput,
    params: { actor: string },
  ): Promise<GenerationResult> {
    const [bridges, bursts, communities, entityRows, relationRows] = await Promise.all([
      this.graph.bridgeCandidates(scope),
      this.graph.temporalBurstCandidates(scope),
      this.graph.communityCandidates(scope),
      this.entities.listByCase(scope.caseId, { investigationId: scope.investigationId }),
      this.relations.listActiveByCase(scope.caseId, { investigationId: scope.investigationId }),
    ]);

    const nameById = new Map(entityRows.map((e: CanonicalEntity) => [e.id, e.canonicalName]));
    const entityName = (id: string) => nameById.get(id) ?? id;
    const relationById = new Map(relationRows.map((r: DurableRelation) => [r.id, r]));

    const drafts: LeadDraft[] = [];
    const skipped: SkippedCandidate[] = [];

    for (const bridge of bridges) {
      const relation = relationById.get(bridge.edgeId);
      if (!relation || !isProvenance(relation.provenance)) {
        skipped.push({ reason: "no resolvable provenance for bridge edge", sourceCandidateType: "BRIDGE", sourceCandidateKey: bridge.edgeId });
        continue;
      }
      drafts.push(
        await buildBridgeLeadDraft({
          caseId: scope.caseId,
          candidate: bridge as BridgeCandidateDTO,
          evidenceBasis: relation.evidenceBasis,
          contradictions: relation.contradictions,
          entityName,
          provenanceEntries: [relation.provenance],
        }),
      );
    }

    for (const burst of bursts) {
      const contributingRelations = burst.edgeIds
        .map((id) => relationById.get(id))
        .filter((r): r is DurableRelation => r !== undefined);
      const provenanceEntries = dedupeProvenance(
        contributingRelations.map((r) => r.provenance).filter(isProvenance),
      );
      if (provenanceEntries.length === 0) {
        skipped.push({ reason: "no resolvable provenance for burst edges", sourceCandidateType: "TEMPORAL_BURST", sourceCandidateKey: `${burst.nodeId}|${burst.windowStart}` });
        continue;
      }
      const evidenceBasis = [...new Set(contributingRelations.flatMap((r) => r.evidenceBasis))];
      drafts.push(
        await buildTemporalBurstLeadDraft({
          caseId: scope.caseId,
          candidate: burst as TemporalBurstCandidateDTO,
          evidenceBasis,
          entityName,
          provenanceEntries,
        }),
      );
    }

    for (const community of communities) {
      const memberSet = new Set(community.memberNodeIds);
      const internalRelations = relationRows.filter(
        (r) => memberSet.has(r.sourceEntityId) && memberSet.has(r.targetEntityId),
      );
      const provenanceEntries = dedupeProvenance(
        internalRelations.map((r) => r.provenance).filter(isProvenance),
      ).slice(0, COMMUNITY_EVIDENCE_UNION_CAP);
      if (provenanceEntries.length === 0) {
        skipped.push({
          reason: "no resolvable provenance for community internal edges",
          sourceCandidateType: "COMMUNITY",
          sourceCandidateKey: [...community.memberNodeIds].sort().join(","),
        });
        continue;
      }
      const evidenceBasis = [
        ...new Set(internalRelations.flatMap((r) => r.evidenceBasis)),
      ].slice(0, COMMUNITY_EVIDENCE_UNION_CAP);
      drafts.push(
        await buildCommunityLeadDraft({
          caseId: scope.caseId,
          candidate: community as CommunityCandidateDTO,
          evidenceBasis,
          entityName,
          provenanceEntries,
        }),
      );
    }

    return this.persistDrafts(drafts, bridges.length + bursts.length + communities.length, skipped, scope.investigationId, params.actor);
  }

  /**
   * Run cross-case shared-entity discovery between `source` and `target` and
   * persist any new leads under `source.caseId`. Caller MUST have already
   * verified the requesting principal has access to BOTH cases — this
   * method does not perform authorization.
   */
  async generateCrossCaseLeads(
    source: CrossCaseScope,
    target: CrossCaseScope,
    params: { actor: string },
  ): Promise<GenerationResult> {
    const matches = await this.crossCase.findMatches(source, target);
    const entityRows = await this.entities.listByCase(source.caseId, { investigationId: source.investigationId });
    const targetEntityRows = await this.entities.listByCase(target.caseId, { investigationId: target.investigationId });
    const nameById = new Map([...entityRows, ...targetEntityRows].map((e) => [e.id, e.canonicalName]));
    const entityName = (id: string) => nameById.get(id) ?? id;
    const entityById = new Map([...entityRows, ...targetEntityRows].map((e) => [e.id, e]));

    const drafts: LeadDraft[] = [];
    const skipped: SkippedCandidate[] = [];

    for (const match of matches as CrossCaseMatch[]) {
      const sourceEntity = entityById.get(match.sourceEntityId);
      const targetEntity = entityById.get(match.targetEntityId);
      const provenanceEntries = dedupeProvenance(
        [sourceEntity?.provenance, targetEntity?.provenance].filter(isProvenance),
      );
      if (provenanceEntries.length === 0) {
        skipped.push({
          reason: "no resolvable provenance for cross-case matched entities",
          sourceCandidateType: "CROSS_CASE",
          sourceCandidateKey: `${match.sourceEntityId}|${match.targetEntityId}`,
        });
        continue;
      }
      const evidenceBasis = [
        ...new Set([
          ...(sourceEntity?.observationIds ?? []),
          ...(targetEntity?.observationIds ?? []),
        ]),
      ].slice(0, CROSS_CASE_OBSERVATION_CAP);

      drafts.push(
        await buildCrossCaseLeadDraft({
          caseId: source.caseId,
          candidate: match,
          evidenceBasis,
          entityName,
          provenanceEntries,
        }),
      );
    }

    return this.persistDrafts(drafts, matches.length, skipped, source.investigationId, params.actor);
  }

  private async persistDrafts(
    drafts: readonly LeadDraft[],
    candidatesConsidered: number,
    skipped: readonly SkippedCandidate[],
    investigationId: string | null,
    actor: string,
  ): Promise<GenerationResult> {
    const leadsCreated: DurableLead[] = [];
    const leadsAlreadyExisted: DurableLead[] = [];
    for (const draft of drafts) {
      const { lead, created } = await this.leads.upsertDraft(draft, { investigationId, actor });
      if (created) leadsCreated.push(lead);
      else leadsAlreadyExisted.push(lead);
    }
    return { candidatesConsidered, leadsCreated, leadsAlreadyExisted, skipped };
  }
}

export const leadRuntime = new LeadRuntime();
