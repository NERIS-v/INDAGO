// ============================================================================
// PR-20 — canonical Lead → Pursuit-queue display adapter
//
// Maps a canonical Lead (LeadProvider.listByInvestigation / get) into the
// LeadMock display shape the LeadsList and LeadDrawer render. Smallest adapter
// at the provider/application boundary: the pursuit queue stays provider-driven
// and never imports fixture leads directly.
//
// Mapping discipline (display terms deliberately NOT conflated with data):
//   - claim:             lead.title                         — verbatim
//   - confidence:        lead.confidence                    — verbatim
//   - supportCount:      supportingObservationIds.length    — verbatim
//   - againstCount:      contradictingObservationIds.length — verbatim
//
// The following are DISPLAY DERIVED — the platform does not serialize these
// exact labels, so they are deterministic renderings of real canonical fields,
// never fabricated values:
//   - structuralSignal:  render of lead.sourceCandidateType
//   - relevance:         render of lead.priority
//   - coverage:          support / (support + against); 0 when both are 0
//   - status:            render of lead.status (canonical lifecycle folded into
//                        the 3-state display)
// ============================================================================

import type { Lead } from "@indago/contracts";
import type { LeadMock } from "@/components/intel/leads-list";

function renderStructuralSignal(type: Lead["sourceCandidateType"]): LeadMock["structuralSignal"] {
  switch (type) {
    case "BRIDGE":
      return "HIGH";
    case "TEMPORAL_BURST":
      return "MODERATE";
    case "COMMUNITY":
      return "MODERATE";
    case "CROSS_CASE":
      return "MODERATE";
    case "MANUAL":
      return "LOW";
    default:
      return "LOW";
  }
}

function renderRelevance(priority: Lead["priority"]): LeadMock["relevance"] {
  switch (priority) {
    case "CRITICAL":
      return "HIGH";
    case "HIGH":
      return "HIGH";
    case "MEDIUM":
      return "MODERATE";
    default:
      return "LOW";
  }
}

function renderStatus(status: Lead["status"]): LeadMock["status"] {
  switch (status) {
    case "ACTIVE":
    case "PROMOTED":
      return "AUTHORIZED";
    case "REJECTED":
    case "STALE":
      return "REJECTED";
    default:
      return "REVIEW";
  }
}

export function mapLeadToLeadMock(lead: Lead): LeadMock {
  const support = lead.supportingObservationIds.length;
  const against = lead.contradictingObservationIds.length;
  const total = support + against;

  return {
    id: lead.id,
    claim: lead.title,
    structuralSignal: renderStructuralSignal(lead.sourceCandidateType),
    relevance: renderRelevance(lead.priority),
    confidence: lead.confidence,
    coverage: total === 0 ? 0 : support / total,
    supportCount: support,
    againstCount: against,
    status: renderStatus(lead.status),
  };
}

/** Extract the display badges a LeadDrawer needs from a canonical Lead. */
export function toLeadDrawerFields(lead: Lead) {
  return {
    confidence: lead.confidence,
    structuralSignal: renderStructuralSignal(lead.sourceCandidateType),
    posture: lead.posture,
    priority: lead.priority,
    sourceCandidateType: lead.sourceCandidateType,
    supportCount: lead.supportingObservationIds.length,
    againstCount: lead.contradictingObservationIds.length,
    alternatives: lead.alternativeExplanations.map((a) => ({
      kind: a.kind,
      statement: a.statement,
      plausibility: a.plausibility,
      requiresAdditionalEvidence: a.requiresAdditionalEvidence,
    })),
    gapCount: (lead.gapIds ?? []).length,
    provenance: lead.provenance
      ? {
          entries: lead.provenance.entries.map((e) => ({
            sourceId: e.sourceId,
            artifactId: e.artifactId,
            documentRef: e.documentRef,
            pageRef: e.pageRef,
            extractor: e.extractor,
            derivedFrom: e.derivedFrom,
          })),
          createdAt: lead.provenance.createdAt.value,
        }
      : null,
  };
}