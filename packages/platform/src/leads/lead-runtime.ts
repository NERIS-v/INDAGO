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
import { runStateMachine, type RunStateMachine } from "../execution/run-state-machine.js";
import { emitAnalysisProgress } from "../realtime/sse.js";

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

/**
 * The P4 lead is at the STRICT ProvenanceSchema boundary: lead provenance
 * entries are validated verbatim by LeadSchema, so a persisted relation/entity
 * provenance that carries an extra authority-linkage key (e.g. `hypothesisId`)
 * would render the lead unreadable. Copy ONLY the conformant keys — the
 * authority linkage itself stays durable in the relation/entity's own columns.
 */
const CONFORMANT_PROVENANCE_KEYS = [
  "sourceId",
  "artifactId",
  "documentRef",
  "pageRef",
  "spanRef",
  "rowRef",
  "extractor",
  "extractionMethod",
  "derivedFrom",
] as const;

export function toConformantProvenance(p: Provenance): Provenance {
  const out: Record<string, unknown> = {};
  for (const key of CONFORMANT_PROVENANCE_KEYS) {
    const value = (p as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as Provenance;
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
  /** True if a CRITICAL-priority lead successfully moved the run into REVIEW_REQUIRED. */
  readonly reviewTriggered: boolean;
}

/** Priority threshold at which a newly created lead triggers human review. */
const REVIEW_TRIGGER_PRIORITY = "CRITICAL";

export class LeadRuntime {
  constructor(
    private readonly graph: GraphAnalyticsService = graphRuntime,
    private readonly entities: EntityStore = new EntityStore(),
    private readonly relations: RelationStore = new RelationStore(),
    private readonly leads: LeadStore = leadStore,
    private readonly crossCase: CrossCaseDiscoveryService = crossCaseDiscoveryService,
    private readonly runState: RunStateMachine = runStateMachine,
  ) {}

  /**
   * Run bridge + temporal-burst + community candidate detection for one case
   * and persist any new leads. Idempotent: re-running over unchanged graph
   * state produces the same lead ids and creates nothing new (LeadStore
   * never overwrites an existing lead).
   *
   * `runId`, when supplied, enables two P4-PR3 behaviors: ANALYSIS_PROGRESS
   * SSE frames are emitted throughout, and a newly created CRITICAL lead
   * will (best-effort — never throws) attempt to move the run into
   * REVIEW_REQUIRED.
   */
  async generateStructuralLeads(
    scope: GraphScopeInput,
    params: { actor: string; runId?: string },
  ): Promise<GenerationResult> {
    emitAnalysisProgress({
      investigationId: scope.investigationId,
      caseId: scope.caseId,
      phase: "ANALYSIS_STARTED",
      message: "Starting structural candidate detection (bridges/bursts/communities)",
    });

    const [bridges, bursts, communities, entityRows, relationRows] = await Promise.all([
      this.graph.bridgeCandidates(scope),
      this.graph.temporalBurstCandidates(scope),
      this.graph.communityCandidates(scope),
      this.entities.listByCase(scope.caseId, { investigationId: scope.investigationId }),
      this.relations.listActiveByCase(scope.caseId, { investigationId: scope.investigationId }),
    ]);

    emitAnalysisProgress({
      investigationId: scope.investigationId,
      caseId: scope.caseId,
      phase: "CANDIDATES_DETECTED",
      message: `Detected ${bridges.length} bridge, ${bursts.length} burst, ${communities.length} community candidates`,
      detail: { bridges: bridges.length, bursts: bursts.length, communities: communities.length },
    });

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
          provenanceEntries: [toConformantProvenance(relation.provenance)],
        }),
      );
    }

    for (const burst of bursts) {
      const contributingRelations = burst.edgeIds
        .map((id) => relationById.get(id))
        .filter((r): r is DurableRelation => r !== undefined);
      const provenanceEntries = dedupeProvenance(
        contributingRelations
          .map((r) => r.provenance)
          .filter(isProvenance)
          .map(toConformantProvenance),
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
        internalRelations
          .map((r) => r.provenance)
          .filter(isProvenance)
          .map(toConformantProvenance),
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

    return this.persistDrafts({
      drafts,
      candidatesConsidered: bridges.length + bursts.length + communities.length,
      skipped,
      caseId: scope.caseId,
      investigationId: scope.investigationId,
      runId: params.runId,
      actor: params.actor,
    });
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
    params: { actor: string; runId?: string },
  ): Promise<GenerationResult> {
    emitAnalysisProgress({
      investigationId: source.investigationId,
      caseId: source.caseId,
      phase: "ANALYSIS_STARTED",
      message: `Starting cross-case discovery against case ${target.caseId}`,
    });

    const matches = await this.crossCase.findMatches(source, target);
    const entityRows = await this.entities.listByCase(source.caseId, { investigationId: source.investigationId });
    const targetEntityRows = await this.entities.listByCase(target.caseId, { investigationId: target.investigationId });
    const nameById = new Map([...entityRows, ...targetEntityRows].map((e) => [e.id, e.canonicalName]));
    const entityName = (id: string) => nameById.get(id) ?? id;
    const entityById = new Map([...entityRows, ...targetEntityRows].map((e) => [e.id, e]));

    emitAnalysisProgress({
      investigationId: source.investigationId,
      caseId: source.caseId,
      phase: "CANDIDATES_DETECTED",
      message: `Detected ${matches.length} cross-case identity matches`,
      detail: { matches: matches.length },
    });

    const drafts: LeadDraft[] = [];
    const skipped: SkippedCandidate[] = [];

    for (const match of matches as CrossCaseMatch[]) {
      const sourceEntity = entityById.get(match.sourceEntityId);
      const targetEntity = entityById.get(match.targetEntityId);
      const provenanceEntries = dedupeProvenance(
        [sourceEntity?.provenance, targetEntity?.provenance]
          .filter(isProvenance)
          .map(toConformantProvenance),
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

    return this.persistDrafts({
      drafts,
      candidatesConsidered: matches.length,
      skipped,
      caseId: source.caseId,
      investigationId: source.investigationId,
      runId: params.runId,
      actor: params.actor,
    });
  }

  private async persistDrafts(params: {
    drafts: readonly LeadDraft[];
    candidatesConsidered: number;
    skipped: readonly SkippedCandidate[];
    caseId: string;
    investigationId: string;
    runId?: string;
    actor: string;
  }): Promise<GenerationResult> {
    const leadsCreated: DurableLead[] = [];
    const leadsAlreadyExisted: DurableLead[] = [];
    for (const draft of params.drafts) {
      const { lead, created } = await this.leads.upsertDraft(draft, {
        investigationId: params.investigationId,
        actor: params.actor,
      });
      if (created) {
        leadsCreated.push(lead);
        emitAnalysisProgress({
          investigationId: params.investigationId,
          caseId: params.caseId,
          phase: "LEAD_CREATED",
          message: `Lead created: ${lead.title}`,
          detail: { leadId: lead.id, sourceCandidateType: lead.sourceCandidateType, priority: lead.priority },
        });
      } else {
        leadsAlreadyExisted.push(lead);
      }
    }

    let reviewTriggered = false;
    if (params.runId) {
      const criticalLead = leadsCreated.find((l) => l.priority === REVIEW_TRIGGER_PRIORITY);
      if (criticalLead) {
        const snapshot = await this.runState.tryEnterReviewRequired(params.runId, {
          actor: params.actor,
          reason: `CRITICAL lead requires review: ${criticalLead.title}`,
        });
        reviewTriggered = snapshot !== null;
      }
    }

    emitAnalysisProgress({
      investigationId: params.investigationId,
      caseId: params.caseId,
      phase: "ANALYSIS_COMPLETED",
      message: `Analysis complete: ${leadsCreated.length} new leads, ${leadsAlreadyExisted.length} already existed, ${params.skipped.length} skipped`,
      detail: {
        candidatesConsidered: params.candidatesConsidered,
        leadsCreated: leadsCreated.length,
        leadsAlreadyExisted: leadsAlreadyExisted.length,
        skipped: params.skipped.length,
        reviewTriggered: reviewTriggered ? "true" : "false",
      },
    });

    return {
      candidatesConsidered: params.candidatesConsidered,
      leadsCreated,
      leadsAlreadyExisted,
      skipped: params.skipped,
      reviewTriggered,
    };
  }
}

export const leadRuntime = new LeadRuntime();
