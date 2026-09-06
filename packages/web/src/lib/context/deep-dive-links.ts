// ============================================================================
// PR-8 — Deep-Dive Bridges (pure link composition)
//
// Turns a resolved relation/entity context into REAL deep links into the
// workspace surfaces. Every href is built through the central URL helpers
// (investigationUrl + the network/entity query params) so ?caseId= is always
// preserved and no dead/placeholder route is ever produced.
//
// Availability is driven by the RESOLVED CONTEXT DATA (aggregated provider
// slices), never by fabrication: a bridge whose underlying slice is `null`
// (data source unsupported in this mode) reports `available: false` with an
// honest note. Page-level bridges (Timeline, Review, Ledger, Robustness,
// Cross-Case, ...) are real investigated-workspace routes and are always valid
// destinations.
// ============================================================================

import { investigationUrl, NETWORK_ENTITY_PARAM, NETWORK_FOCUS_PARAM } from "@/lib/workspace/url";
import type {
  EntityContextDetails,
  RelationContextDetails,
} from "./context-details";

export interface DeepDiveLink {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  /** Whether the target surface can be driven by data for THIS object. */
  readonly available: boolean;
  /** Honest explanation when unavailable. */
  readonly note?: string;
}

export interface DeepDiveSource {
  readonly investigationId: string;
  readonly caseId: string;
}

function entityObservationsHref(
  source: DeepDiveSource,
  entityId: string,
): string {
  const base = investigationUrl(source.investigationId, source.caseId, "observations");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${NETWORK_ENTITY_PARAM}=${encodeURIComponent(entityId)}`;
}

function graphFocusHref(source: DeepDiveSource, entityId: string): string {
  const base = investigationUrl(source.investigationId, source.caseId, "graph");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${NETWORK_FOCUS_PARAM}=${encodeURIComponent(entityId)}`;
}

/** Deep-dive bridges for a resolved RELATION context. */
export function relationDeepDiveLinks(
  source: DeepDiveSource,
  details: RelationContextDetails,
): DeepDiveLink[] {
  const entityId = details.relation.sourceEntityId;
  return [
    {
      id: "network",
      label: "Network",
      hint: "Focus the endpoints in the canonical graph",
      href: graphFocusHref(source, entityId),
      available: true,
    },
    {
      id: "observations",
      label: "Observations",
      hint: "Basis observations involving this relation",
      href: entityObservationsHref(source, entityId),
      available: details.linkedObservations !== null,
      ...(details.linkedObservations === null
        ? { note: "Observations are not exposed in this data mode." }
        : {}),
    },
    {
      id: "evidence",
      label: "Evidence",
      hint: "Evidence across the investigation",
      href: investigationUrl(source.investigationId, source.caseId, "evidence"),
      available: true,
    },
    {
      id: "hypotheses",
      label: "Hypotheses",
      hint: "Hypotheses touching this relation's endpoints",
      href: investigationUrl(source.investigationId, source.caseId, "hypothesis"),
      available: details.linkedHypotheses !== null,
      ...(details.linkedHypotheses === null
        ? { note: "Hypotheses are not exposed in this data mode." }
        : {}),
    },
    {
      id: "leads",
      label: "Leads",
      hint: "Active leads in this investigation",
      href: investigationUrl(source.investigationId, source.caseId, "leads"),
      available: true,
    },
    {
      id: "gaps",
      label: "Gaps",
      hint: "Open investigative gaps",
      href: investigationUrl(source.investigationId, source.caseId, "gaps"),
      available: true,
    },
    {
      id: "review",
      label: "Review",
      hint: "Review tasks for this case",
      href: investigationUrl(source.investigationId, source.caseId, "review"),
      available: true,
    },
    {
      id: "robustness",
      label: "Robustness",
      hint: "Robustness assessments",
      href: investigationUrl(source.investigationId, source.caseId, "robustness"),
      available: true,
    },
    {
      id: "ledger",
      label: "Ledger",
      hint: "The case activity ledger",
      href: investigationUrl(source.investigationId, source.caseId, "ledger"),
      available: true,
    },
    {
      id: "cross-case",
      label: "Cross-Case",
      hint: "Cross-case matches and foreign overlays",
      href: investigationUrl(source.investigationId, source.caseId, "cross-case"),
      available: true,
    },
  ];
}

/** Deep-dive bridges for a resolved ENTITY context. */
export function entityDeepDiveLinks(
  source: DeepDiveSource,
  details: EntityContextDetails,
): DeepDiveLink[] {
  const entityId = details.id;
  return [
    {
      id: "network",
      label: "Network",
      hint: "Focus this entity in the canonical graph",
      href: graphFocusHref(source, entityId),
      available: true,
    },
    {
      id: "observations",
      label: "Observations",
      hint: "Observations involving this entity",
      href: entityObservationsHref(source, entityId),
      available: details.observations !== null,
      ...(details.observations === null
        ? { note: "Observations are not exposed in this data mode." }
        : {}),
    },
    {
      id: "evidence",
      label: "Evidence",
      hint: "Evidence records involving this entity",
      href: investigationUrl(source.investigationId, source.caseId, "evidence"),
      available: details.evidence !== null,
      ...(details.evidence === null
        ? { note: "Evidence is not exposed in this data mode." }
        : {}),
    },
    {
      id: "hypotheses",
      label: "Hypotheses",
      hint: "Hypotheses involving this entity",
      href: investigationUrl(source.investigationId, source.caseId, "hypothesis"),
      available: details.hypotheses !== null,
      ...(details.hypotheses === null
        ? { note: "Hypotheses are not exposed in this data mode." }
        : {}),
    },
    {
      id: "leads",
      label: "Leads",
      hint: "Active leads involving this entity",
      href: investigationUrl(source.investigationId, source.caseId, "leads"),
      available: details.activeLeads !== null,
      ...(details.activeLeads === null
        ? { note: "Leads are not exposed in this data mode." }
        : {}),
    },
    {
      id: "gaps",
      label: "Gaps",
      hint: "Open gaps involving this entity",
      href: investigationUrl(source.investigationId, source.caseId, "gaps"),
      available: details.openGaps !== null,
      ...(details.openGaps === null
        ? { note: "Gaps are not exposed in this data mode." }
        : {}),
    },
    {
      id: "review",
      label: "Review",
      hint: "Review tasks for this case",
      href: investigationUrl(source.investigationId, source.caseId, "review"),
      available: true,
    },
    {
      id: "robustness",
      label: "Robustness",
      hint: "Robustness assessments",
      href: investigationUrl(source.investigationId, source.caseId, "robustness"),
      available: true,
    },
    {
      id: "ledger",
      label: "Ledger",
      hint: "The case activity ledger",
      href: investigationUrl(source.investigationId, source.caseId, "ledger"),
      available: true,
    },
    {
      id: "cross-case",
      label: "Cross-Case",
      hint: "Cross-case matches and foreign overlays",
      href: investigationUrl(source.investigationId, source.caseId, "cross-case"),
      available: details.foreignOverlays !== null,
      ...(details.foreignOverlays === null
        ? { note: "Cross-case data is not exposed in this data mode." }
        : {}),
    },
  ];
}