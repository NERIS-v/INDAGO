// ============================================================================
// PR-5 — Context Narrative (pure)
//
// Turns a RESOLVED context-details bundle into a deterministic stat grid and
// a set of grounded plain-language clauses. Every number is a provider-owned
// count or a documented threshold — nothing is scored, weighted, or invented.
//
// Slice semantics: a slice whose data source is unavailable is null; the
// narrative then either omits the claim or states the absence explicitly.
// ============================================================================

import type { ResolvedContextDetails } from "./context-details";

export interface ContextStat {
  readonly label: string;
  readonly value: string;
}

function countOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? "--" : String(value);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ----------------------------------------------------------------------------
// Per-kind stat grids
// ----------------------------------------------------------------------------

function entityStats(d: Extract<ResolvedContextDetails, { kind: "entity" }>): ContextStat[] {
  return [
    { label: "Observations", value: countOrDash(d.observations?.length) },
    { label: "Relations", value: countOrDash(d.relations?.length) },
    { label: "Evidence", value: countOrDash(d.evidence?.length) },
    { label: "Hypotheses", value: countOrDash(d.hypotheses?.length) },
    { label: "Open gaps", value: countOrDash(d.openGaps?.length) },
    { label: "Active leads", value: countOrDash(d.activeLeads?.length) },
    { label: "Contradictions", value: countOrDash(d.contradictions?.length) },
    { label: "Foreign overlays", value: countOrDash(d.foreignOverlays?.length) },
  ];
}

function relationStats(d: Extract<ResolvedContextDetails, { kind: "relation" }>): ContextStat[] {
  return [
    { label: "Type", value: d.relation.relationType.toUpperCase() },
    { label: "Support", value: pct(d.relation.support) },
    { label: "Status", value: d.relation.status },
    { label: "Basis observations", value: countOrDash(d.linkedObservations?.length) },
    { label: "Linked hypotheses", value: countOrDash(d.linkedHypotheses?.length) },
  ];
}

function evidenceStats(d: Extract<ResolvedContextDetails, { kind: "evidence" }>): ContextStat[] {
  return [
    { label: "Type", value: d.item.type },
    { label: "Status", value: d.item.status },
    { label: "Source group", value: countOrDash(d.sameSourceEvidence?.length !== undefined ? d.sameSourceEvidence.length + 1 : undefined) },
    { label: "Independent sources", value: countOrDash(d.investigationSourceCount) },
    { label: "Supports", value: countOrDash(d.supportingHypotheses?.length) },
    { label: "Contradicts", value: countOrDash(d.contradictingHypotheses?.length) },
    { label: "Related leads", value: countOrDash(d.relatedLeads?.length) },
  ];
}

function observationStats(d: Extract<ResolvedContextDetails, { kind: "observation" }>): ContextStat[] {
  return [
    { label: "Type", value: d.observation.type },
    { label: "Contradiction pairs", value: countOrDash(d.contradictions?.length) },
    { label: "Supports", value: countOrDash(d.supportingHypotheses?.length) },
    { label: "Contradicts", value: countOrDash(d.contradictingHypotheses?.length) },
    { label: "Gave rise to leads", value: countOrDash(d.supportingLeads?.length) },
  ];
}

function leadStats(d: Extract<ResolvedContextDetails, { kind: "lead" }>): ContextStat[] {
  return [
    { label: "Status", value: d.lead.status },
    { label: "Priority", value: d.lead.priority },
    { label: "Confidence", value: pct(d.lead.confidence) },
    { label: "Entities", value: countOrDash(d.relatedEntities?.length) },
    { label: "Evidence", value: countOrDash(d.relatedEvidence?.length) },
    { label: "Open gaps", value: countOrDash(d.openGaps?.length) },
  ];
}

function hypothesisStats(d: Extract<ResolvedContextDetails, { kind: "hypothesis" }>): ContextStat[] {
  return [
    { label: "Status", value: d.hypothesis.status },
    { label: "Confidence", value: pct(d.hypothesis.confidence) },
    { label: "Supporting evidence", value: countOrDash(d.supportingEvidence?.length) },
    { label: "Contradicting evidence", value: countOrDash(d.contradictingEvidence?.length) },
    { label: "Supporting observations", value: countOrDash(d.supportingObservations?.length) },
    { label: "Contradicting observations", value: countOrDash(d.contradictingObservations?.length) },
    { label: "Related entities", value: countOrDash(d.relatedEntities?.length) },
  ];
}

function gapStats(d: Extract<ResolvedContextDetails, { kind: "gap" }>): ContextStat[] {
  return [
    { label: "Type", value: d.gap.type },
    { label: "Status", value: d.gap.status },
    { label: "Priority", value: d.gap.priority },
    { label: "Impact", value: pct(d.gap.impact) },
    { label: "Entities", value: countOrDash(d.relatedEntities?.length) },
    { label: "Leads", value: countOrDash(d.relatedLeads?.length) },
    { label: "Evidence requests", value: countOrDash(d.evidenceRequests?.length) },
  ];
}

function crossCaseStats(d: Extract<ResolvedContextDetails, { kind: "cross-case" }>): ContextStat[] {
  return [
    { label: "Bridge support", value: pct(d.overlay.bridgeSupport) },
    { label: "Foreign nodes", value: String(d.overlay.nodes.length) },
    { label: "Foreign edges", value: String(d.overlay.edges.length) },
    { label: "Matched local entities", value: countOrDash(d.matchedEntities?.length) },
  ];
}

export function buildResolvedStats(details: ResolvedContextDetails): ContextStat[] {
  switch (details.kind) {
    case "entity":
      return entityStats(details);
    case "relation":
      return relationStats(details);
    case "evidence":
      return evidenceStats(details);
    case "observation":
      return observationStats(details);
    case "lead":
      return leadStats(details);
    case "hypothesis":
      return hypothesisStats(details);
    case "gap":
      return gapStats(details);
    case "cross-case":
      return crossCaseStats(details);
  }
}

// ----------------------------------------------------------------------------
// Per-kind grounded narratives (deterministic template sentences, counts only)
// ----------------------------------------------------------------------------

function clauses(...items: (string | null)[]): string[] {
  return items.filter((i): i is string => i !== null && i.length > 0);
}

function entityNarrative(d: Extract<ResolvedContextDetails, { kind: "entity" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    n(d.observations) !== null
      ? `${n(d.observations)} observations and ${n(d.relations) ?? "—"} relations trace this entity.`
      : "Observation links are unavailable in this data mode.",
    n(d.hypotheses) !== null ? `Part of ${n(d.hypotheses)} working hypotheses.` : null,
    n(d.evidence) !== null ? `Referenced by ${n(d.evidence)} evidence packages.` : null,
    n(d.openGaps) !== null
      ? `${n(d.openGaps)} open gaps constrain certainty about this entity.`
      : null,
    n(d.activeLeads) !== null ? `${n(d.activeLeads)} active leads pursue lines involving it.` : null,
    n(d.contradictions) !== null
      ? `${n(d.contradictions)} contradictions touch its observations.`
      : null,
    n(d.foreignOverlays) !== null
      ? `Appears in ${n(d.foreignOverlays)} foreign-case overlays.`
      : null,
  );
}

function relationNarrative(d: Extract<ResolvedContextDetails, { kind: "relation" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  const axis = [d.sourceName ?? "—", "→", d.targetName ?? "—"].join(" ");
  return clauses(
    `Proposes a ${d.relation.relationType} relationship: ${axis}.`,
    n(d.linkedHypotheses) !== null
      ? `${n(d.linkedHypotheses)} working hypotheses involve its endpoints.`
      : "Hypothesis links are unavailable in this data mode.",
    n(d.linkedObservations) !== null
      ? `Supported by ${n(d.linkedObservations)} basis observations.`
      : null,
  );
}

function evidenceNarrative(d: Extract<ResolvedContextDetails, { kind: "evidence" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    `${d.item.type} evidence package with ${d.item.observationCount} extracted observations.`,
    n(d.supportingHypotheses) !== null
      ? `Supports ${n(d.supportingHypotheses)} hypotheses.`
      : "Hypothesis supports are unavailable in this data mode.",
    n(d.contradictingHypotheses) !== null
      ? `Contradicts ${n(d.contradictingHypotheses)} hypotheses.`
      : null,
    n(d.relatedLeads) !== null ? `Linked to ${n(d.relatedLeads)} leads.` : null,
    d.investigationSourceCount !== null
      ? `Shares its source identity with ${n(d.sameSourceEvidence) ?? 0} other evidence packages (${d.investigationSourceCount} distinct sources in the investigation).`
      : null,
  );
}

function observationNarrative(d: Extract<ResolvedContextDetails, { kind: "observation" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    `Assertion extracted as a ${d.observation.type}.`,
    n(d.contradictions) !== null
      ? `Directly paired with ${n(d.contradictions)} contradiction(s).`
      : "Contradiction detection is unavailable in this data mode.",
    n(d.supportingHypotheses) !== null
      ? `Supports ${n(d.supportingHypotheses)} hypotheses.`
      : null,
    n(d.contradictingHypotheses) !== null
      ? `Contradicts ${n(d.contradictingHypotheses)} hypotheses.`
      : null,
    n(d.supportingLeads) !== null ? `Gave rise to ${n(d.supportingLeads)} lead(s).` : null,
  );
}

function leadNarrative(d: Extract<ResolvedContextDetails, { kind: "lead" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    `${d.lead.priority} priority lead (${d.lead.status}).`,
    n(d.relatedEntities) !== null ? `Concerns ${n(d.relatedEntities)} canonical entities.` : null,
    n(d.relatedEvidence) !== null ? `Built on ${n(d.relatedEvidence)} evidence packages.` : null,
    n(d.openGaps) !== null
      ? `Directs ${n(d.openGaps)} open gap(s) toward resolution.`
      : "Gap links are unavailable in this data mode.",
  );
}

function hypothesisNarrative(d: Extract<ResolvedContextDetails, { kind: "hypothesis" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  const support = d.supportingEvidence !== null ? n(d.supportingEvidence) : null;
  const contra = d.contradictingEvidence !== null ? n(d.contradictingEvidence) : null;
  return clauses(
    `${d.hypothesis.status} hypothesis with ${pct(d.hypothesis.confidence)} stated confidence.`,
    support !== null && contra !== null
      ? `Grounded in ${support} supporting and ${contra} contradicting evidence packages.`
      : "Evidence grounding is unavailable in this data mode.",
    n(d.supportingObservations) !== null
      ? `${n(d.supportingObservations)} observations support; ${n(d.contradictingObservations) ?? 0} contradict.`
      : null,
    n(d.relatedEntities) !== null ? `Involves ${n(d.relatedEntities)} entities.` : null,
    d.robustness !== null
      ? `Robustness ${d.robustness.robustnessScore}/100 — perturbation stability, not a truth probability.`
      : null,
  );
}

function gapNarrative(d: Extract<ResolvedContextDetails, { kind: "gap" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    `${d.gap.type} gap (${d.gap.status}) with ${pct(d.gap.impact)} impact on confidence.`,
    n(d.relatedEntities) !== null ? `Affects ${n(d.relatedEntities)} entities.` : null,
    n(d.relatedLeads) !== null ? `${n(d.relatedLeads)} lead(s) address this gap.` : null,
    n(d.evidenceRequests) !== null
      ? `${n(d.evidenceRequests)} evidence request(s) raised.`
      : "Evidence requests are unavailable in this data mode.",
  );
}

function crossCaseNarrative(d: Extract<ResolvedContextDetails, { kind: "cross-case" }>): string[] {
  const n = (list: readonly unknown[] | null) => (list === null ? null : list.length);
  return clauses(
    `Bridge into foreign case ${d.overlay.caseId} with ${pct(d.overlay.bridgeSupport)} match support for "${d.overlay.localTargetMatch}".`,
    n(d.matchedEntities) !== null
      ? `${n(d.matchedEntities)} local canonical entit${n(d.matchedEntities) === 1 ? "y" : "ies"} ${n(d.matchedEntities) === 1 ? "matches" : "match"} this overlay by label.`
      : "Local entity links are unavailable in this data mode.",
  );
}

export function buildResolvedNarrative(details: ResolvedContextDetails): string[] {
  switch (details.kind) {
    case "entity":
      return entityNarrative(details);
    case "relation":
      return relationNarrative(details);
    case "evidence":
      return evidenceNarrative(details);
    case "observation":
      return observationNarrative(details);
    case "lead":
      return leadNarrative(details);
    case "hypothesis":
      return hypothesisNarrative(details);
    case "gap":
      return gapNarrative(details);
    case "cross-case":
      return crossCaseNarrative(details);
  }
}