// ============================================================================
// PR-5 — Composible Investigative Context Details (*context-details.ts*)
//
// The THIN composition contract below the contextual panel and the
// "Investigative Intelligence" tabs. It turns ONE canonical InvestigativeContext
// into a discriminated bundle of REAL, provider-owned domain objects plus the
// deterministic links between them (hypotheses ↔ evidence ↔ observations ↔
// entities ↔ gaps ↔ leads ↔ foreign overlays).
//
// Rules:
//   - Aggregation ONLY. Nothing here derives new claims, scores, or rankings.
//     Every field is either a canonical domain object, a provider-owned count,
//     or the result of filtering provider-owned lists by canonical IDs.
//   - It reads through the SAME WorkspaceProviders seam the rest of the app
//     uses. No Demo/Live imports, no fixtures, no construction.
//   - A secondary data source that is unavailable (UNSUPPORTED / fails) yields
//     `null` for that ONE slice — the slice renders "unavailable" and never
//     fails the whole selection. The PRIMARY object lookup still produces the
//     full resolved/unsupported/not-found/error state.
//   - The canonical Hypothesis model is the ONLY hypothesis shape. No second
//     hypothesis/report model is introduced anywhere.
// ============================================================================

import type { WorkspaceProviders, Paginated, ProviderQuery } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import type {
  Entity,
  Observation,
  RelationHypothesis,
  Hypothesis,
  Lead,
  InvestigativeGap,
  EvidenceRequest,
  RobustnessResult,
} from "@indago/contracts";
import type { EvidenceListItem } from "@/lib/api/types";
import type {
  ForeignCaseOverlay,
  ObservationContradiction,
} from "@/lib/providers/types";
import type { InvestigativeContext, ContextKind } from "./investigative-context";

const BIG_PAGE: ProviderQuery = { pageSize: 200 };

// ----------------------------------------------------------------------------
// Discriminated result model
// ----------------------------------------------------------------------------

interface ResolvedBase {
  readonly status: "resolved";
  readonly kind: ContextKind;
  readonly id: string;
}

export interface EntityContextDetails extends ResolvedBase {
  readonly kind: "entity";
  readonly entity: Entity;
  readonly observations: readonly Observation[] | null;
  readonly relations: readonly RelationHypothesis[] | null;
  readonly evidence: readonly EvidenceListItem[] | null;
  readonly hypotheses: readonly Hypothesis[] | null;
  readonly openGaps: readonly InvestigativeGap[] | null;
  readonly activeLeads: readonly Lead[] | null;
  readonly contradictions: readonly ObservationContradiction[] | null;
  readonly foreignOverlays: readonly ForeignCaseOverlay[] | null;
}

export interface RelationContextDetails extends ResolvedBase {
  readonly kind: "relation";
  readonly relation: RelationHypothesis;
  readonly sourceName: string | null;
  readonly targetName: string | null;
  readonly linkedObservations: readonly Observation[] | null;
  readonly linkedHypotheses: readonly Hypothesis[] | null;
}

export interface EvidenceContextDetails extends ResolvedBase {
  readonly kind: "evidence";
  readonly item: EvidenceListItem;
  /** Distinct source identifiers across ALL investigation evidence (real
   *  source-independence surface, NOT a computed "independent sources" claim). */
  readonly investigationSourceCount: number | null;
  /** Other evidence sharing this item's sourceRef (same provenance group). */
  readonly sameSourceEvidence: readonly EvidenceListItem[] | null;
  readonly supportingHypotheses: readonly Hypothesis[] | null;
  readonly contradictingHypotheses: readonly Hypothesis[] | null;
  readonly relatedLeads: readonly Lead[] | null;
  readonly contradictions: readonly ObservationContradiction[] | null;
}

export interface ObservationContextDetails extends ResolvedBase {
  readonly kind: "observation";
  readonly observation: Observation;
  readonly contradictions: readonly ObservationContradiction[] | null;
  readonly supportingHypotheses: readonly Hypothesis[] | null;
  readonly contradictingHypotheses: readonly Hypothesis[] | null;
  readonly supportingLeads: readonly Lead[] | null;
}

export interface LeadContextDetails extends ResolvedBase {
  readonly kind: "lead";
  readonly lead: Lead;
  readonly relatedEntities: readonly Entity[] | null;
  readonly relatedEvidence: readonly EvidenceListItem[] | null;
  readonly openGaps: readonly InvestigativeGap[] | null;
}

export interface HypothesisContextDetails extends ResolvedBase {
  readonly kind: "hypothesis";
  readonly hypothesis: Hypothesis;
  readonly supportingEvidence: readonly EvidenceListItem[] | null;
  readonly contradictingEvidence: readonly EvidenceListItem[] | null;
  readonly supportingObservations: readonly Observation[] | null;
  readonly contradictingObservations: readonly Observation[] | null;
  readonly relatedEntities: readonly Entity[] | null;
  /** Robustness result when the data mode actually exposes one for this
   *  hypothesis; otherwise null (never fabricated). */
  readonly robustness: RobustnessResult | null;
}

export interface GapContextDetails extends ResolvedBase {
  readonly kind: "gap";
  readonly gap: InvestigativeGap;
  readonly relatedEntities: readonly Entity[] | null;
  readonly relatedLeads: readonly Lead[] | null;
  readonly evidenceRequests: readonly EvidenceRequest[] | null;
}

export interface CrossCaseContextDetails extends ResolvedBase {
  readonly kind: "cross-case";
  readonly overlay: ForeignCaseOverlay;
  /** Local canonical entities matched to the foreign overlay target by a
   *  documented label heuristic (canonicalName ↔ localTargetMatch). */
  readonly matchedEntities: readonly Entity[] | null;
}

export type ResolvedContextDetails =
  | EntityContextDetails
  | RelationContextDetails
  | EvidenceContextDetails
  | ObservationContextDetails
  | LeadContextDetails
  | HypothesisContextDetails
  | GapContextDetails
  | CrossCaseContextDetails;

export type ContextDetailsResult =
  | ResolvedContextDetails
  | {
      readonly status: "unsupported";
      readonly kind: ContextKind;
      readonly id: string;
      readonly reason: string;
    }
  | {
      readonly status: "not-found";
      readonly kind: ContextKind;
      readonly id: string;
    }
  | {
      readonly status: "error";
      readonly kind: ContextKind;
      readonly id: string;
      readonly message: string;
    };

export function isContextDetailsResolved(
  result: ContextDetailsResult | null,
): result is ResolvedContextDetails {
  return result !== null && result.status === "resolved";
}

export function isOpenGap(gap: InvestigativeGap): boolean {
  return gap.status !== "ADDRESSED" && gap.status !== "WONFIX";
}

export function isActiveLead(lead: Lead): boolean {
  return lead.status === "ACTIVE" || lead.status === "UNDER_REVIEW";
}

/** Label-match heuristic used to associate local entities with a foreign-case
 *  overlay target. Both sides are normalized; either may contain the other. */
export function labelMatchesOverlay(
  canonicalName: string,
  localTargetMatch: string,
): boolean {
  const a = canonicalName.toUpperCase().trim();
  const b = localTargetMatch.toUpperCase().trim();
  if (a.length === 0 || b.length === 0) return false;
  return a.includes(b) || b.includes(a);
}

// ----------------------------------------------------------------------------
// Slice-safe helpers
// ----------------------------------------------------------------------------

/** Load a provider list; `null` means the source is unavailable (never fails
 *  the whole resolution). */
async function sliceList<T>(
  call: () => Promise<Paginated<T>>,
): Promise<readonly T[] | null> {
  try {
    const page = await call();
    return page.items;
  } catch {
    return null;
  }
}

/** Load a provider list into a Map keyed by id for O(1) lookups. */
async function sliceMap<T extends { id: string }>(
  call: () => Promise<Paginated<T>>,
): Promise<Map<string, T> | null> {
  const items = await sliceList(call);
  if (items === null) return null;
  return new Map(items.map((i) => [i.id, i]));
}

/** Load a single object; `null` when unavailable or not found. */
async function sliceGet<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Failure mapping (mirrors context-resolver, kept local so details resolve
// independently from the display-only resolution)
// ----------------------------------------------------------------------------

function toDetailsFailure(
  context: InvestigativeContext,
  err: unknown,
): Extract<ContextDetailsResult, { status: "unsupported" | "not-found" | "error" }> {
  if (err instanceof ProviderError) {
    if (err.code === "NOT_FOUND") {
      return { status: "not-found", kind: context.kind, id: context.id };
    }
    if (err.code === "UNSUPPORTED") {
      return {
        status: "unsupported",
        kind: context.kind,
        id: context.id,
        reason: "This selection is not supported in the current data mode.",
      };
    }
    return { status: "error", kind: context.kind, id: context.id, message: err.message };
  }
  return {
    status: "error",
    kind: context.kind,
    id: context.id,
    message: err instanceof Error ? err.message : "An unexpected error occurred.",
  };
}

// ----------------------------------------------------------------------------
// Per-kind resolvers
// ----------------------------------------------------------------------------

async function resolveEntity(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const entity = await ws.entities.get(context.id);
    const [obsForEntity, relations, evidence, hypotheses, leads, gaps, contradictions, overlays] =
      await Promise.all([
        sliceList(() => ws.observations.listByEntity(context.id, BIG_PAGE)),
        sliceList(() => ws.relations.listByInvestigation(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.evidence.listByInvestigation(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.hypotheses.listByInvestigation(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.leads.listByInvestigation(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.gaps.listByInvestigation(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.intelligence.listContradictions(ws.investigationId, BIG_PAGE)),
        sliceList(() => ws.crossCase.listForeignOverlays(ws.caseId, BIG_PAGE)),
      ]);

    const allObservations = obsForEntity ?? null;
    const relatedRelations =
      relations?.filter(
        (r) => r.sourceEntityId === context.id || r.targetEntityId === context.id,
      ) ?? null;
    const entityEvidence =
      evidence?.filter((e) => entity.evidenceIds.includes(e.id)) ?? null;
    const relatedHypotheses =
      hypotheses?.filter((h) => h.relatedEntityIds.includes(context.id)) ?? null;
    const openGaps =
      gaps?.filter(
        (g) => (g.relatedEntityIds ?? []).includes(context.id) && isOpenGap(g),
      ) ?? null;
    const activeLeads =
      leads?.filter(
        (l) => l.relatedEntityIds.includes(context.id) && isActiveLead(l),
      ) ?? null;
    const touchingContradictions =
      contradictions?.filter(
        (c) =>
          (obsForEntity ?? []).some(
            (o) => o.id === c.leftObservationId || o.id === c.rightObservationId,
          ),
      ) ?? null;

    return {
      status: "resolved",
      kind: "entity",
      id: context.id,
      entity,
      observations: allObservations,
      relations: relatedRelations,
      evidence: entityEvidence,
      hypotheses: relatedHypotheses,
      openGaps,
      activeLeads,
      contradictions: touchingContradictions,
      foreignOverlays: overlays,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveRelation(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const relation = await ws.relations.get(context.id);
    const [sourceName, targetName, observations, hypotheses] = await Promise.all([
      sliceGet(() => ws.entities.get(relation.sourceEntityId).then((e) => e.canonicalName)),
      sliceGet(() => ws.entities.get(relation.targetEntityId).then((e) => e.canonicalName)),
      sliceMap(() => ws.observations.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.hypotheses.listByInvestigation(ws.investigationId, BIG_PAGE)),
    ]);

    const basis = relation.evidenceBasis ?? [];
    const linkedObservations =
      observations === null
        ? null
        : basis.map((id) => observations.get(id)).filter((o): o is Observation => o !== undefined);

    const linkedHypotheses =
      hypotheses?.filter(
        (h) =>
          h.relatedEntityIds.includes(relation.sourceEntityId) ||
          h.relatedEntityIds.includes(relation.targetEntityId),
      ) ?? null;

    return {
      status: "resolved",
      kind: "relation",
      id: context.id,
      relation,
      sourceName,
      targetName,
      linkedObservations,
      linkedHypotheses,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveEvidence(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const item = await ws.evidence.get(context.id);
    const [allEvidence, hypotheses, leads, contradictions] = await Promise.all([
      sliceList(() => ws.evidence.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.hypotheses.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.leads.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.intelligence.listContradictions(ws.investigationId, BIG_PAGE)),
    ]);

    const investigationSourceCount =
      allEvidence === null
        ? null
        : new Set(allEvidence.map((e) => e.sourceRef).filter(Boolean)).size;
    const sameSourceEvidence =
      allEvidence?.filter((e) => e.id !== context.id && e.sourceRef === item.sourceRef) ?? null;
    const supportingHypotheses =
      hypotheses?.filter((h) => h.supportingEvidenceIds.includes(context.id)) ?? null;
    const contradictingHypotheses =
      hypotheses?.filter((h) => h.contradictingEvidenceIds.includes(context.id)) ?? null;
    const relatedLeads =
      leads?.filter((l) => l.relatedEvidenceIds.includes(context.id)) ?? null;
    const relatedContradictions =
      contradictions?.filter(
        (c) =>
          c.evidenceIds[0] === context.id || c.evidenceIds[1] === context.id,
      ) ?? null;

    return {
      status: "resolved",
      kind: "evidence",
      id: context.id,
      item,
      investigationSourceCount,
      sameSourceEvidence,
      supportingHypotheses,
      contradictingHypotheses,
      relatedLeads,
      contradictions: relatedContradictions,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveObservation(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const observations = await ws.observations.listByInvestigation(ws.investigationId, BIG_PAGE);
    const observation = observations.items.find((o) => o.id === context.id);
    if (!observation) return { status: "not-found", kind: context.kind, id: context.id };

    const [contradictions, hypotheses, leads] = await Promise.all([
      sliceList(() => ws.intelligence.listContradictions(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.hypotheses.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.leads.listByInvestigation(ws.investigationId, BIG_PAGE)),
    ]);

    return {
      status: "resolved",
      kind: "observation",
      id: context.id,
      observation,
      contradictions:
        contradictions?.filter(
          (c) => c.leftObservationId === context.id || c.rightObservationId === context.id,
        ) ?? null,
      supportingHypotheses:
        hypotheses?.filter((h) => h.supportingObservationIds.includes(context.id)) ?? null,
      contradictingHypotheses:
        hypotheses?.filter((h) => h.contradictingObservationIds.includes(context.id)) ?? null,
      supportingLeads:
        leads?.filter((l) => l.supportingObservationIds.includes(context.id)) ?? null,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveLead(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const lead = await ws.leads.get(context.id);
    const [entities, evidence, gaps] = await Promise.all([
      sliceList(() => ws.entities.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.evidence.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.gaps.listByInvestigation(ws.investigationId, BIG_PAGE)),
    ]);

    const entityById = new Map((entities ?? []).map((e) => [e.id, e]));
    const relatedEntities =
      entities === null ? null : lead.relatedEntityIds.map((id) => entityById.get(id)).filter((e): e is Entity => e !== undefined);
    const relatedEvidence =
      evidence?.filter((e) => lead.relatedEvidenceIds.includes(e.id)) ?? null;
    const openGaps =
      gaps?.filter(
        (g) => (lead.gapIds ?? []).includes(g.id) && isOpenGap(g),
      ) ?? null;

    return {
      status: "resolved",
      kind: "lead",
      id: context.id,
      lead,
      relatedEntities,
      relatedEvidence,
      openGaps,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveHypothesis(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const hypothesis = await ws.hypotheses.get(context.id);
    const [allEvidence, observations, entities, robustness] = await Promise.all([
      sliceList(() => ws.evidence.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceMap(() => ws.observations.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.entities.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceGet(() => ws.robustness.getResult(ws.investigationId, context.id)),
    ]);

    const byEvidenceId = new Map((allEvidence ?? []).map((e) => [e.id, e]));
    const resolveEvidence = (ids: readonly string[]): readonly EvidenceListItem[] | null =>
      allEvidence === null
        ? null
        : ids.map((id) => byEvidenceId.get(id)).filter((e): e is EvidenceListItem => e !== undefined);

    const resolveObservations = (ids: readonly string[]): readonly Observation[] | null =>
      observations === null
        ? null
        : ids.map((id) => observations.get(id)).filter((o): o is Observation => o !== undefined);

    const entityById = new Map((entities ?? []).map((e) => [e.id, e]));
    const relatedEntities =
      entities === null
        ? null
        : hypothesis.relatedEntityIds
            .map((id) => entityById.get(id))
            .filter((e): e is Entity => e !== undefined);

    return {
      status: "resolved",
      kind: "hypothesis",
      id: context.id,
      hypothesis,
      supportingEvidence: resolveEvidence(hypothesis.supportingEvidenceIds),
      contradictingEvidence: resolveEvidence(hypothesis.contradictingEvidenceIds),
      supportingObservations: resolveObservations(hypothesis.supportingObservationIds),
      contradictingObservations: resolveObservations(hypothesis.contradictingObservationIds),
      relatedEntities,
      robustness,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

async function resolveGap(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const gap = await ws.gaps.get(context.id);
    const [entities, leads, requests] = await Promise.all([
      sliceList(() => ws.entities.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.leads.listByInvestigation(ws.investigationId, BIG_PAGE)),
      sliceList(() => ws.gaps.evidenceRequests(ws.investigationId, BIG_PAGE)),
    ]);

    const entityById = new Map((entities ?? []).map((e) => [e.id, e]));
    const relatedEntities =
      entities === null
        ? null
        : (gap.relatedEntityIds ?? [])
            .map((id) => entityById.get(id))
            .filter((e): e is Entity => e !== undefined);
    const relatedLeads =
      leads?.filter((l) => leadLinkedToGap(l, context.id)) ?? null;
    const evidenceRequests =
      requests?.filter((r) => (gap.evidenceRequestIds ?? []).includes(r.id)) ?? null;

    return {
      status: "resolved",
      kind: "gap",
      id: context.id,
      gap,
      relatedEntities,
      relatedLeads,
      evidenceRequests,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

function leadLinkedToGap(lead: Lead, gapId: string): boolean {
  return (lead.gapIds ?? []).includes(gapId);
}

async function resolveCrossCase(
  ws: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  try {
    const page = await ws.crossCase.listForeignOverlays(ws.caseId, BIG_PAGE);
    const overlay = page.items.find((o) => o.ref === context.id);
    if (!overlay) return { status: "not-found", kind: context.kind, id: context.id };

    const entities = await sliceList(() =>
      ws.entities.listByInvestigation(ws.investigationId, BIG_PAGE),
    );
    const matchedEntities =
      entities?.filter((e) => labelMatchesOverlay(e.canonicalName, overlay.localTargetMatch)) ??
      null;

    return {
      status: "resolved",
      kind: "cross-case",
      id: context.id,
      overlay,
      matchedEntities,
    };
  } catch (err) {
    return toDetailsFailure(context, err);
  }
}

// ----------------------------------------------------------------------------
// Registry + entry point
// ----------------------------------------------------------------------------

const DETAIL_RESOLVERS: Partial<Record<ContextKind, (ws: WorkspaceProviders, ctx: InvestigativeContext) => Promise<ContextDetailsResult>>> = {
  entity: resolveEntity,
  relation: resolveRelation,
  evidence: resolveEvidence,
  observation: resolveObservation,
  lead: resolveLead,
  hypothesis: resolveHypothesis,
  gap: resolveGap,
  "cross-case": resolveCrossCase,
  // anomaly has no provider seam — the registry intentionally omits it so the
  // fallback yields a deterministic `unsupported` resolution.
};

/** Resolve a selection into a composable bundle of current provider-owned
 *  domain objects. Never throws; every failure collapses into a discriminated
 *  result state. */
export async function resolveContextDetails(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextDetailsResult> {
  const resolver = DETAIL_RESOLVERS[context.kind];
  if (!resolver) {
    return {
      status: "unsupported",
      kind: context.kind,
      id: context.id,
      reason: "No detail compositor exists for this object kind yet.",
    };
  }
  return resolver(workspace, context);
}