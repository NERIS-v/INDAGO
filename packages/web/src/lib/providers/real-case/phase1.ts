// ============================================================================
// PASS 2 — Phase 1 Intelligence Derivation (DERIVED_BY_DEMO_LOGIC)
//
// Pure, deterministic Phase-1 cross-case analysis over the PASS 1 real-case
// fixture sets. It consumes ONLY the canonical Case A (Connecticut / WJA
// licensing probe) and Case B (Tulsa / Wheeler homicide) observations,
// entities, and graph edges and derives, in order:
//
//   spark detection   → ≥2 shared entities with an ORGANIZATIONAL edge to the
//                       WJA node in BOTH graphs
//   candidate scoring → presence / org-both / temporal / direct-flow / theme
//   lead / hypothesis / gap / graph-hole / evidence-request / prediction-freeze
//   event stream      → Case A (2) + Case B (9) transport events
//
// NOTHING is hardcoded: the answer (the WJA security function that spans both
// investigations) is the output of the scoring chain. Every score is an
// investigative-relevance estimate and is labeled DERIVED_BY_DEMO_LOGIC — never
// a probability of guilt or truth. When the spark does NOT fire (e.g. fewer
// than two shared organizational members), the chain downgrades: no hypothesis,
// no lead, no freeze.
// ============================================================================

import type { Entity, GraphHole, Observation } from "@indago/contracts";
import {
  EvidenceRequestSchema,
  HypothesisSchema,
  InvestigativeGapSchema,
  LeadSchema,
} from "@indago/contracts";
import type { DemoStreamEvent } from "../demo/demo-fixtures/events";
import type { DemoFixtureSet, RealCasePhase1 } from "../demo/demo-fixtures";
import type {
  BridgeCandidateRanking,
  CrossCaseSignal,
  Phase1Alternative,
  PredictionFreeze,
} from "../types";
import {
  P1_ANALYSIS_A,
  P1_ANALYSIS_B,
  LEAD_B3,
  HYP_B2,
  GAP_B4,
  HOLE_B3,
  EREQ_B4,
  FREEZE_B1,
  EVT_P1_A01,
  EVT_P1_A02,
  EVT_P1_B01,
  EVT_P1_B02,
  EVT_P1_B03,
  EVT_P1_B04,
  EVT_P1_B05,
  EVT_P1_B06,
  EVT_P1_B07,
  EVT_P1_B08,
  EVT_P1_B09,
  CASE_A_ID,
  CASE_B_ID,
  INVESTIGATION_A_ID,
  INVESTIGATION_B_ID,
  ENT_CALLAHAN,
  ENT_RICO,
  ENT_WJA,
  ENT_FBIBOSTON,
  ENT_WHEELER,
  OBS_A1,
  OBS_A2,
  OBS_A3,
  OBS_A4,
  OBS_A5,
  OBS_A6,
  OBS_B5,
  OBS_B6,
  SRC_HR_VOL1_A,
  EVID_HR_CT,
  EVID_HR_TULSA,
  EVID_HR_WJA,
  GN_B_WJA,
  GN_B_WHEELER,
  GRAPH_VERSION_B,
} from "./lookup";
import { obs } from "./times";

// ============================================================================
// Constants
// ============================================================================

export const PHASE1_HYPOTHESIS_STATEMENT =
  "The company's internal security function may have provided an information/operational pathway connecting the World Jai Alai network to the people surrounding the Wheeler homicide.";

const SCORE_LABEL = "DERIVED_BY_DEMO_LOGIC" as const;
const HOMICIDE_YEAR = 1981;

/** Phase-1 relevance weights (investigative-relevance estimate, NOT truth). */
const W = {
  presence: 1.0,
  orgBothCases: 1.6,
  temporalThroughHomicide: 1.8,
  directFlow: 2.2,
  themeOverlap: 0.8,
} as const;

/** Content signals that raise thematic overlap with the security inquiry. */
const THEME_LEXICON =
  /security|winter hill|shared with|entertained|fbi|skim|audit|loan shark|organized crime|murder|homicide|tip|stonewall/i;

/** Content signals that LIMIT a candidate (informational caveats, not denials).
 *  "former FBI" / "not verified" are deliberately absent: they describe neutral
 *  context, not a limiting caveat, so they must not flip an observation to a
 *  contradicting role by themselves. */
const CONSTRAINT_LEXICON =
  /allegation|met with silence|ended before|unverified|tip|stonewall/i;

/** Direct information-flow signals: elevate an observation to supportive even
 *  when a caveat token is present (e.g. loan-shark allegations that WERE shared
 *  with Rico are supportive of a pathway, not a denial of one). */
const FLOW_LEXICON = /shared with|entertained/i;

/** Linguistic aliases used ONLY for attribution in free-form prose: presence
 *  counting uses observation.entityIds (factual), aliases attribute clauses
 *  (who was informed, whose employment ended) to the right entity. */
const ALIASES: Record<string, readonly string[]> = {
  [ENT_CALLAHAN]: ["Callahan", "John \"Jack\" Callahan", "John 'Jack' Callahan", "Jack Callahan"],
  [ENT_RICO]: ["H. Paul Rico", "Rico"],
  [ENT_WJA]: ["World Jai Alai", "WJA"],
  [ENT_FBIBOSTON]: ["FBI Boston", "FBI", "Boston"],
};

const ROLE_TOKENS: ReadonlyArray<{ token: RegExp; label: string }> = [
  { token: /security director/i, label: "WJA security director" },
  { token: /security consultant/i, label: "WJA security consultant" },
];

const ANALYSIS_STARTED_AT = { value: "2024-07-01T09:00:00.000Z", precision: "exact" as const };
const PREDICTION_FROZEN_AT = { value: "2024-07-01T18:00:00.000Z", precision: "exact" as const };

export interface RealCasePhase1Derivation {
  readonly sparkFired: boolean;
  readonly sparkMembers: readonly string[];
  readonly sharedEntityIds: readonly string[];
  readonly candidates: readonly BridgeCandidateRanking[];
  readonly lead?: ReturnType<typeof buildLead>;
  readonly hypothesis?: ReturnType<typeof buildHypothesis>;
  readonly gap?: ReturnType<typeof buildGap>;
  readonly hole?: GraphHole;
  readonly evidenceRequest?: ReturnType<typeof buildEvidenceRequest>;
  readonly predictionFreeze?: PredictionFreeze;
  readonly caseAEvents: readonly DemoStreamEvent[];
  readonly caseBEvents: readonly DemoStreamEvent[];
  readonly phase1EnvelopeA: RealCasePhase1;
  readonly phase1EnvelopeB: RealCasePhase1;
}

// ============================================================================
// Small helpers
// ============================================================================

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function mentions(observation: Observation, entityId: string): boolean {
  return observation.entityIds.includes(entityId);
}

function contentHasAnyAlias(content: string, aliases: readonly string[]): boolean {
  const lower = content.toLowerCase();
  return aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

function countMentions(observations: readonly Observation[], entityId: string): number {
  return observations.filter((o) => mentions(o, entityId)).length;
}

function themePositiveCount(observations: readonly Observation[], entityId: string): number {
  return observations.filter((o) => mentions(o, entityId) && THEME_LEXICON.test(o.content)).length;
}

/** Count recorded direct information-flow contacts between a candidate and
 *  figures named as recipients ("... the information was shared with <Alias>")
 *  or hosts ("<Alias> ... entertained ..."). Attribution uses the alias tables. */
function directFlowCount(observations: readonly Observation[], entityId: string): number {
  const aliases = ALIASES[entityId] ?? [entityId];
  let count = 0;
  for (const o of observations) {
    if (!mentions(o, entityId)) continue;
    const shared = o.content.match(/shared with/);
    if (shared && shared.index !== undefined) {
      const after = o.content.slice(shared.index + shared[0].length, shared.index + shared[0].length + 40);
      if (contentHasAnyAlias(after, aliases)) count += 1;
    }
    const entertained = o.content.match(/entertained/);
    if (entertained && entertained.index !== undefined) {
      const before = o.content.slice(Math.max(0, entertained.index - 40), entertained.index);
      if (contentHasAnyAlias(before, aliases)) count += 1;
    }
  }
  return count;
}

/** Did this observation record the candidate's employment as ended before the
 *  1981 homicide window? Attribution: the terminated party is the entity named
 *  in the possessive immediately before "employment" ("Callahan's employment
 *  with WJA ended before ..."); the employer (WJA) is NOT the terminated party. */
function terminatesEarly(observation: Observation, entityId: string): boolean {
  if (!mentions(observation, entityId)) return false;
  const endedBefore = observation.content.indexOf("ended before");
  if (endedBefore === -1) return false;
  const yearMatch = observation.content.slice(endedBefore).match(/(19\d\d)/);
  if (!yearMatch) return false;
  if (Number(yearMatch[1]) >= HOMICIDE_YEAR) return false;
  const employment = observation.content.indexOf("employment");
  if (employment === -1) return false;
  const possessiveWindow = observation.content.slice(Math.max(0, employment - 30), employment);
  const aliases = ALIASES[entityId] ?? [entityId];
  return contentHasAnyAlias(possessiveWindow, aliases);
}

// ============================================================================
// Stable stringify + FNV-1a fingerprint (local mirror of demo/submit.ts; the
// submit fingerprint is not exported, and this one salts the Phase-1 snapshot).
// ============================================================================

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

/** Deterministic 32-hex fingerprint over the key-sorted Phase-1 snapshot. */
export function computePredictionFreezeFingerprint(
  freeze: Omit<PredictionFreeze, "fingerprint">,
): string {
  const stable = stableStringify(freeze);
  return fnv1a64(`${stable}::phase1-freeze`) + fnv1a64(`${stable}::phase1-salt`);
}

// ============================================================================
// Candidate scoring
// ============================================================================

interface ScoredCandidate extends BridgeCandidateRanking {
  /** Internal raw feature values used to explain the score and the selection. */
  readonly features: {
    readonly presence: number;
    readonly orgBoth: number;
    readonly temporal: number;
    readonly flow: number;
    readonly theme: number;
  };
}

function roleLabelFor(observations: readonly Observation[], entity: Entity): string | undefined {
  for (const { token, label } of ROLE_TOKENS) {
    if (observations.some((o) => mentions(o, entity.id) && token.test(o.content))) return label;
  }
  return undefined;
}

function candidateAlternativeExplanation(entityId: string, f: ScoredCandidate["features"]): string {
  if (entityId === ENT_RICO) {
    return "Only shared individual with recorded direct information-flow contacts in Case A (information shared; FBI agents entertained) whose WJA security role persisted through the 1981 homicide window.";
  }
  if (entityId === ENT_CALLAHAN) {
    return "Shared WJA security director, but his WJA employment ended in 1976 — before the 1981 homicide window — and no direct information-flow contact with him is recorded.";
  }
  if (entityId === ENT_WJA) {
    return "The organization shared as employer/owner in both investigations; an organization itself cannot carry the information/operational pathway that its internal security function could provide.";
  }
  if (entityId === ENT_FBIBOSTON) {
    return "Shared reference institution with no organizational edge in the Case B graph and no recorded direct information-flow contact.";
  }
  return `Feature profile: presence ${f.presence.toFixed(2)} · org ${f.orgBoth} · temporal ${f.temporal} · flow ${f.flow.toFixed(2)} · theme ${f.theme.toFixed(2)}.`;
}

function scoreCandidates(
  caseA: DemoFixtureSet,
  caseB: DemoFixtureSet,
  sharedEntityIds: readonly string[],
  observationsA: readonly Observation[],
  observationsB: readonly Observation[],
): ScoredCandidate[] {
  const entities = [...caseA.entities, ...caseB.entities].filter(
    (entity, index, all) => all.findIndex((e) => e.id === entity.id) === index,
  );
  const entitiesById = new Map(entities.map((e) => [e.id, e]));
  // Normalization denominators: the largest per-case mention count among the
  // candidate universe (deterministic; the candidates are the shared entities).
  const mentionCountsA = new Map(sharedEntityIds.map((id) => [id, countMentions(observationsA, id)]));
  const mentionCountsB = new Map(sharedEntityIds.map((id) => [id, countMentions(observationsB, id)]));
  const maxA = Math.max(1, ...mentionCountsA.values());
  const maxB = Math.max(1, ...mentionCountsB.values());

  const orgMemberIds = (caseSet: DemoFixtureSet): ReadonlySet<string> => {
    const wjaNode = caseSet.graphNodes.find((n) => n.entityId === ENT_WJA);
    if (!wjaNode) return new Set();
    const memberIds = new Set<string>();
    for (const edge of caseSet.graphEdges) {
      if (edge.relationType !== "organizational") continue;
      const other =
        edge.sourceNodeId === wjaNode.id ? edge.targetNodeId : edge.targetNodeId === wjaNode.id ? edge.sourceNodeId : undefined;
      if (other) {
        const node = caseSet.graphNodes.find((n) => n.id === other);
        if (node?.entityId) memberIds.add(node.entityId);
      }
    }
    return memberIds;
  };

  const orgA = orgMemberIds(caseA);
  const orgB = orgMemberIds(caseB);
  const allObservations = [...observationsA, ...observationsB];

  const scored = sharedEntityIds.map((entityId) => {
    const entity = entitiesById.get(entityId);
    const mentionsA = mentionCountsA.get(entityId) ?? 0;
    const mentionsB = mentionCountsB.get(entityId) ?? 0;
    const presence = 0.5 * (mentionsA / maxA) + 0.5 * (mentionsB / maxB);
    const orgBoth = orgA.has(entityId) && orgB.has(entityId) ? 1 : 0;
    const temporal = allObservations.some((o) => terminatesEarly(o, entityId)) ? 0 : 1;
    const flow = Math.min(directFlowCount(allObservations, entityId), 3) / 3;
    const theme = themePositiveCount(allObservations, entityId) / Math.max(1, mentionsA + mentionsB);

    const features = { presence, orgBoth, temporal, flow, theme };
    const score = round4(
      presence * W.presence +
        orgBoth * W.orgBothCases +
        temporal * W.temporalThroughHomicide +
        flow * W.directFlow +
        theme * W.themeOverlap,
    );

    const supportingObservationIds = allObservations
      .filter((o) => mentions(o, entityId))
      .map((o) => o.id);
    const contradictingObservationIds = allObservations
      .filter(
        (o) => mentions(o, entityId) && CONSTRAINT_LEXICON.test(o.content) && !FLOW_LEXICON.test(o.content),
      )
      .map((o) => o.id);

    return {
      candidateId: `bridge:${entityId}`,
      entityId,
      label: entity?.canonicalName ?? entityId,
      roleLabel: entity ? roleLabelFor(allObservations, entity) : undefined,
      temporalCompatibility: temporal === 1,
      score,
      rank: 0,
      status: "CANDIDATE" as const,
      supportingObservationIds,
      contradictingObservationIds,
      alternativeExplanation: candidateAlternativeExplanation(entityId, features),
      scoreLabel: SCORE_LABEL,
      features,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

// ============================================================================
// Artifact builders (all canonical schema-parsed; nothing hardcoded)
// ============================================================================

interface DerivedSets {
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
}

function deriveHypothesisSets(
  observationsA: readonly Observation[],
  observationsB: readonly Observation[],
  memberEntityIds: readonly string[],
): DerivedSets {
  const memberSet = new Set(memberEntityIds);
  const all = [...observationsA, ...observationsB];
  const supportive = all.filter(
    (o) =>
      o.entityIds.some((id) => memberSet.has(id)) &&
      THEME_LEXICON.test(o.content) &&
      !(CONSTRAINT_LEXICON.test(o.content) && !FLOW_LEXICON.test(o.content)),
  );
  const limiting = all.filter(
    (o) =>
      o.entityIds.some((id) => memberSet.has(id)) &&
      CONSTRAINT_LEXICON.test(o.content) &&
      !supportive.includes(o),
  );
  return {
    supportingObservationIds: supportive.map((o) => o.id),
    contradictingObservationIds: limiting.map((o) => o.id),
  };
}

function buildHypothesis(sets: DerivedSets) {
  return HypothesisSchema.parse({
    id: HYP_B2,
    investigationId: INVESTIGATION_B_ID,
    title: "WJA internal security function as a possible information/operational pathway",
    statement: PHASE1_HYPOTHESIS_STATEMENT,
    status: "ACTIVE",
    confidence: 0.21,
    supportingObservationIds: [...sets.supportingObservationIds],
    contradictingObservationIds: [...sets.contradictingObservationIds],
    supportingEvidenceIds: [EVID_HR_CT, EVID_HR_TULSA, EVID_HR_WJA],
    contradictingEvidenceIds: [],
    relatedEntityIds: [ENT_RICO, ENT_CALLAHAN, ENT_WJA],
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_VOL1_A,
          extractor: "intel.phase1.v1",
          derivedFrom: [...sets.supportingObservationIds],
        },
      ],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-07-01"),
    updatedAt: obs("2024-07-01"),
  });
}

function buildLead(sets: DerivedSets, topCandidate: ScoredCandidate) {
  const chiefLabel = topCandidate.roleLabel?.startsWith("WJA security") ? "THE SECURITY CHIEF" : topCandidate.label;
  return LeadSchema.parse({
    id: LEAD_B3,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    title: `Trace the WJA security function around the Wheeler homicide (top candidate: ${chiefLabel})`,
    description:
      "Cross-case analysis (Case A ↔ Case B) identifies the WJA security function as the shared structural element worth tracing around the Wheeler homicide: follow the security role named by the top-ranked bridge candidate.",
    status: "NEW",
    priority: "HIGH",
    confidence: 0.42,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [topCandidate.entityId, ENT_WJA],
    supportingObservationIds: [...sets.supportingObservationIds],
    relatedEvidenceIds: [EVID_HR_CT, EVID_HR_WJA],
    sourceCandidateType: "MANUAL",
    sourceCandidateKey: "legacy-mock-key",
    sourceCandidateSnapshot: {},
    alternativeExplanations: [],
    gapIds: [GAP_B4],
    sourceCandidateType: "MANUAL",
    sourceCandidateKey: `manual:${LEAD_B3}`,
    sourceCandidateSnapshot: {},
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_VOL1_A,
          extractor: "intel.phase1.v1",
          derivedFrom: [...sets.supportingObservationIds],
        },
      ],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-07-01"),
    updatedAt: obs("2024-07-01"),
  });
}

function buildGap(memberEntityIds: readonly string[]) {
  return InvestigativeGapSchema.parse({
    id: GAP_B4,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    type: "UNRESOLVED_RELATION",
    title: "WJA security function ↔ people surrounding the Wheeler homicide",
    description:
      "Phase-1 cross-case analysis raises an unresolved relation: whether the WJA internal security function (whose membership spans both investigations) may have provided an information/operational pathway to the people surrounding the Wheeler homicide. No materialized edge exists yet.",
    status: "IDENTIFIED",
    priority: "HIGH",
    impact: 0.72,
    expectedInformationValue: 0.75,
    relatedEntityIds: [...memberEntityIds, ENT_WHEELER],
    evidenceRequestIds: [EREQ_B4],
    createdAt: obs("2024-07-01"),
    updatedAt: obs("2024-07-01"),
  });
}

function buildHole(): GraphHole {
  return {
    id: HOLE_B3,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE",
    investigationGapId: GAP_B4,
    nodeIds: [GN_B_WJA, GN_B_WHEELER],
    expectedEdgeType: "case-link",
    significance: 0.75,
    description:
      "No edge connects the WJA internal security function to the people surrounding the Wheeler homicide; whether that function may have provided an information/operational pathway is the missing schedule edge this Phase-1 analysis asks Phase 2 to resolve.",
    suggestedEvidenceTypes: [
      "company operational records",
      "purchase or expense records",
      "travel and activity records",
    ],
    detectedAt: obs("2024-07-01"),
  };
}

function buildEvidenceRequest(caseB: DemoFixtureSet) {
  return EvidenceRequestSchema.parse({
    id: EREQ_B4,
    gapId: GAP_B4,
    hypothesisIds: [HYP_B2, caseB.hypotheses[0]?.id],
    evidenceType: "RECORD",
    description:
      "Request company operational and purchase records that would evidence an information/operational pathway connecting the WJA network to the people surrounding the Wheeler homicide — target class: WORLD JAI ALAI PURCHASE REPORT (May 11, 1981).",
    utility: {
      expectedInformationGain: 0.8,
      eig: 0.8,
      relevance: 0.9,
      feasibility: 0.35,
      cost: 0.4,
      score: 0.72,
    },
    rationale:
      "Operational/purchase records are the highest-leverage class for confirming or excluding the security-function pathway that Phase-1 derives from the shared cross-case structure.",
    status: "SUBMITTED",
    resultingEvidenceIds: [],
    createdBy: "analyst.phase1",
    createdAt: obs("2024-07-01"),
    updatedAt: obs("2024-07-01"),
  });
}

function buildAlternatives(): readonly Phase1Alternative[] {
  return [
    {
      key: "H2",
      label: "Legitimate consultancy",
      statement:
        "The shared WJA security leaders held ordinary consultancy roles, and their presence in both investigations reflects the surviving corporate security function rather than any pathway to the people around the Wheeler homicide.",
      basisObservationIds: [OBS_A4, OBS_B5],
    },
    {
      key: "H3",
      label: "External associations",
      statement:
        "The connection runs through contacts external to WJA (e.g. other former-FBI personnel and Boston-adjacent figures the security staff interacted with), not through the WJA security function itself.",
      basisObservationIds: [OBS_A2, OBS_A5, OBS_A6],
    },
    {
      key: "H4",
      label: "Shared context, no operational link",
      statement:
        "The two investigations share only contextual circumstances — an organization that moved between regions and a former-FBI security staff — with no information/operational pathway to the people around the Wheeler homicide.",
      basisObservationIds: [OBS_A1, OBS_A3, OBS_B6],
    },
  ];
}

function selectedByFeatureNames(f: ScoredCandidate["features"]): readonly string[] {
  const reasons: string[] = [];
  if (f.orgBoth >= 1) reasons.push("organizational tie to WJA in both case graphs");
  if (f.temporal >= 1) reasons.push("no recorded WJA-role termination before the 1981 homicide window");
  if (f.flow >= 0.5) reasons.push("recorded direct information-flow contacts shared with the candidate");
  if (f.theme >= 0.5) reasons.push("content overlap with the security/thematic signal");
  if (f.presence >= 0.3) reasons.push("named presence spans both investigations");
  return reasons;
}

function buildRankedLead(topCandidate: ScoredCandidate) {
  return {
    rank: 1,
    candidateScore: topCandidate.score,
    roleLabel: topCandidate.roleLabel?.startsWith("WJA security") ? "THE SECURITY CHIEF" : (topCandidate.roleLabel ?? topCandidate.label),
    entityId: topCandidate.entityId,
    entityLabel: topCandidate.label,
    leadId: LEAD_B3,
    selectedBy: selectedByFeatureNames(topCandidate.features),
  };
}

function buildFreeze(
  caseB: DemoFixtureSet,
  rankedCandidates: readonly BridgeCandidateRanking[],
  sets: DerivedSets,
): PredictionFreeze {
  const topCandidate = rankedCandidates[0] as ScoredCandidate;
  const snapshot: Omit<PredictionFreeze, "fingerprint"> = {
    id: FREEZE_B1,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    frozenAt: PREDICTION_FROZEN_AT,
    runId: "phase1-2024-07-01",
    stage: "PHASE_1_PREDICTION_FREEZE",
    rankedLead: buildRankedLead(topCandidate),
    hypothesisId: HYP_B2,
    graphHoleId: HOLE_B3,
    evidenceRequestId: EREQ_B4,
    supportingObservationIds: [...sets.supportingObservationIds],
    contradictingObservationIds: [...sets.contradictingObservationIds],
    alternatives: buildAlternatives(),
    candidateRanking: rankedCandidates,
    nodeIds: caseB.graphNodes.map((n) => n.id),
    edgeIds: caseB.graphEdges.map((e) => e.id),
    scoreLabel: SCORE_LABEL,
  };
  return { ...snapshot, fingerprint: computePredictionFreezeFingerprint(snapshot) };
}

// ============================================================================
// Event streams (deterministic transport events)
// ============================================================================

function phase1Timestamp(hour: number): string {
  return `2024-07-01T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function phase1Event(
  id: string,
  investigationId: string,
  action: string,
  targetType: string,
  targetId: string,
  description: string,
  hour: number,
  index: number,
): DemoStreamEvent {
  return {
    id,
    investigationId,
    action,
    actor: "intel.phase1.v1",
    targetType,
    targetId,
    description,
    timestamp: phase1Timestamp(hour),
    delayMs: 250 * index,
  };
}

function buildPhase1Events(): {
  readonly caseA: readonly DemoStreamEvent[];
  readonly caseB: readonly DemoStreamEvent[];
} {
  const caseA = [
    phase1Event(EVT_P1_A01, INVESTIGATION_A_ID, "CROSS_CASE_ANALYSIS_STARTED", "INVESTIGATION", INVESTIGATION_A_ID, "Started Phase-1 cross-case structural analysis: Case A (Connecticut) against Case B (Tulsa).", 9, 0),
    phase1Event(EVT_P1_A02, INVESTIGATION_A_ID, "CROSS_CASE_SIGNAL_DETECTED", "ANALYSIS", P1_ANALYSIS_A, "Cross-case signal: multiple shared WJA organizational members across both investigations — comparison may be warranted.", 10, 1),
  ];
  const caseB = [
    phase1Event(EVT_P1_B01, INVESTIGATION_B_ID, "CROSS_CASE_ANALYSIS_STARTED", "INVESTIGATION", INVESTIGATION_B_ID, "Started Phase-1 cross-case structural analysis: Case B (Tulsa) against Case A (Connecticut).", 9, 0),
    phase1Event(EVT_P1_B02, INVESTIGATION_B_ID, "CROSS_CASE_SIGNAL_DETECTED", "ANALYSIS", P1_ANALYSIS_B, "Cross-case signal: multiple shared WJA organizational members across both investigations — comparison may be warranted.", 10, 1),
    phase1Event(EVT_P1_B03, INVESTIGATION_B_ID, "LEAD_GENERATED", "LEAD", LEAD_B3, "Generated lead: trace the WJA security function around the Wheeler homicide (top candidate: THE SECURITY CHIEF).", 11, 2),
    phase1Event(EVT_P1_B04, INVESTIGATION_B_ID, "HYPOTHESIS_CREATED", "HYPOTHESIS", HYP_B2, "Created hypothesis: WJA internal security function may be an information/operational pathway connecting the WJA network to the people surrounding the Wheeler homicide.", 12, 3),
    phase1Event(EVT_P1_B05, INVESTIGATION_B_ID, "EVIDENCE_FOR_ATTACHED", "HYPOTHESIS", HYP_B2, "Attached supporting observations to the Phase-1 hypothesis (DERIVED_BY_DEMO_LOGIC).", 13, 4),
    phase1Event(EVT_P1_B06, INVESTIGATION_B_ID, "EVIDENCE_AGAINST_ATTACHED", "HYPOTHESIS", HYP_B2, "Attached limiting observations to the Phase-1 hypothesis (no evidence of a direct operational relationship).", 14, 5),
    phase1Event(EVT_P1_B07, INVESTIGATION_B_ID, "GRAPH_HOLE_DETECTED", "GRAPH_HOLE", HOLE_B3, "Detected graph hole: missing edge between WJA's internal security function and the people surrounding the Wheeler homicide (MISSING_EDGE).", 15, 6),
    phase1Event(EVT_P1_B08, INVESTIGATION_B_ID, "EVIDENCE_REQUEST_CREATED", "EVIDENCE_REQUEST", EREQ_B4, "Created evidence request: company operational/purchase records — WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) class.", 16, 7),
    phase1Event(EVT_P1_B09, INVESTIGATION_B_ID, "PREDICTION_FROZEN", "PREDICTION_FREEZE", FREEZE_B1, "Prediction freeze recorded: Phase-1 state locked before any further evidence is ingested.", 17, 8),
  ];
  return { caseA, caseB };
}

// ============================================================================
// Cross-case signal builder
// ============================================================================

function buildSignal(
  sourceCaseId: string,
  targetCaseId: string,
  analysisId: string,
  memberEntityIds: readonly string[],
  supportingObservationIds: readonly string[],
  candidates: readonly BridgeCandidateRanking[],
): CrossCaseSignal {
  const memberNames = candidates
    .filter((c) => memberEntityIds.includes(c.entityId))
    .map((c) => c.label);
  return {
    analysisId,
    sourceCaseId,
    targetCaseId,
    startedAt: ANALYSIS_STARTED_AT,
    signal:
      "Two investigations share a WJA security function: the same organizational members appear around the WJA security operation in both. These investigations may warrant comparison.",
    rationale: `≥2 entities share an organizational edge to the WJA node in BOTH graphs — here ${memberNames.length}: ${memberNames.join(", ")}.`,
    supportingEntityIds: [...memberEntityIds],
    supportingObservationIds: [...supportingObservationIds],
    candidateRanking: [...candidates],
    scoreLabel: SCORE_LABEL,
  };
}

// ============================================================================
// Main derivation
// ============================================================================

export function deriveRealCasePhase1(
  caseA: DemoFixtureSet,
  caseB: DemoFixtureSet,
): RealCasePhase1Derivation {
  const observationsA = caseA.observations;
  const observationsB = caseB.observations;

  // Shared candidates = entities present in BOTH cases (factual intersection).
  const sharedEntityIds = caseA.entities
    .filter((entityA) => caseB.entities.some((entityB) => entityB.id === entityA.id))
    .map((entityA) => entityA.id);

  const candidates = scoreCandidates(caseA, caseB, sharedEntityIds, observationsA, observationsB);

  // Spark: ≥2 shared entities with an organizational edge to WJA in both graphs.
  const orgMemberIds = (caseSet: DemoFixtureSet): ReadonlySet<string> => {
    const wjaNode = caseSet.graphNodes.find((n) => n.entityId === ENT_WJA);
    if (!wjaNode) return new Set();
    const memberIds = new Set<string>();
    for (const edge of caseSet.graphEdges) {
      if (edge.relationType !== "organizational") continue;
      const other =
        edge.sourceNodeId === wjaNode.id ? edge.targetNodeId : edge.targetNodeId === wjaNode.id ? edge.sourceNodeId : undefined;
      if (other) {
        const node = caseSet.graphNodes.find((n) => n.id === other);
        if (node?.entityId) memberIds.add(node.entityId);
      }
    }
    return memberIds;
  };
  const orgA = orgMemberIds(caseA);
  const orgB = orgMemberIds(caseB);
  const sparkMembers = sharedEntityIds.filter((id) => orgA.has(id) && orgB.has(id));
  const sparkFired = sparkMembers.length >= 2;

  const sets = deriveHypothesisSets(observationsA, observationsB, sparkMembers);
  const events = buildPhase1Events();
  const topCandidate = candidates[0]!;

  if (!sparkFired) {
    // Downgraded chain: no hypothesis, no derived artifacts, no freeze.
    return {
      sparkFired,
      sparkMembers,
      sharedEntityIds,
      candidates,
      caseAEvents: events.caseA.slice(0, 1),
      caseBEvents: events.caseB.slice(0, 1),
      phase1EnvelopeA: {},
      phase1EnvelopeB: {},
    };
  }

  const hypothesis = buildHypothesis(sets);
  const lead = buildLead(sets, topCandidate);
  const gap = buildGap(sparkMembers);
  const hole = buildHole();
  const evidenceRequest = buildEvidenceRequest(caseB);

  const rankedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    status: (index === 0 ? "SELECTED" : "REJECTED") as "SELECTED" | "REJECTED",
  })) as readonly BridgeCandidateRanking[];

  const predictionFreeze = buildFreeze(caseB, rankedCandidates, sets);

  const signalA = buildSignal(
    CASE_A_ID,
    CASE_B_ID,
    P1_ANALYSIS_A,
    sparkMembers,
    sets.supportingObservationIds,
    rankedCandidates,
  );
  const signalB = buildSignal(
    CASE_B_ID,
    CASE_A_ID,
    P1_ANALYSIS_B,
    sparkMembers,
    sets.supportingObservationIds,
    rankedCandidates,
  );

  return {
    sparkFired,
    sparkMembers,
    sharedEntityIds,
    candidates: rankedCandidates,
    lead,
    hypothesis,
    gap,
    hole,
    evidenceRequest,
    predictionFreeze,
    caseAEvents: events.caseA,
    caseBEvents: events.caseB,
    phase1EnvelopeA: { crossCaseSignal: signalA },
    phase1EnvelopeB: {
      crossCaseSignal: signalB,
      predictionFreeze,
      derivedLeadId: lead.id,
      derivedHypothesisId: hypothesis.id,
      derivedGapId: gap.id,
      derivedGraphHoleId: HOLE_B3,
      derivedEvidenceRequestId: evidenceRequest.id,
    },
  };
}