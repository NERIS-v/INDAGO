// ============================================================================
// PASS 3 — Live Breakthrough Ingestion (DERIVED_ON_INGEST)
//
// Deterministic builders for the Exhibit-719 live ingestion:
//
//   trigger  → the demo directive lets ANY Case B document upload fire this
//              package (a submission carrying the EREQ_P2 class routes instead
//              to the Phase-2 second-evidence flow)
//   ingest   → source → artifact → evidence → 4 observations → mention
//              resolution (agents align to the EXISTING FBI Boston entity — no
//              new entities) → relation hypothesis (WJA ↔ FBI Boston,
//              financial) → graph edge (GN_B_WJA → GN_B_FBI, financial) →
//              hypothesis refinement (HYP_B3 child of HYP_B2) → gap
//              reassessment (GAP_B4 → PARTIALLY_ADDRESSED) → evidence-request
//              completion (EREQ_B4 → COMPLETED) → post-freeze comparison
//   reveal   → the Case-A (CT) network materializes at ingest as a realtime
//              overlay on the Tulsa graph: CT nodes (SOCTF, McGuigan) + overlay
//              edges (SOCTF→FBI Boston, McGuigan→SOCTF) are catalog-only; the
//              Tulsa-side bridge edges (Rico→Hitman, Hitman→Winter Hill Gang)
//              persist as real Case-B graph rows (PROPOSED case-links).
//   stream   → 16 deterministic breakthrough events driven by the existing
//              "upload"-triggered named sequence; the graph overlay catalog
//              materializes the new nodes, edges + hole-resolve deltas.
//
// NOTHING here is hardcoded into the initial fixture sets: every record is
// produced ONLY by an actual ingestion run and NEVER by the PASS 1 / PASS 2
// fixtures. Support values follow the documented deterministic formula; scores
// are investigative-relevance estimates labeled DERIVED_BY_DEMO_LOGIC — never
// guilt/conspiracy statements. Exhibit 719 is rendered faithfully as the WJA
// CORPORATE PURCHASE/EXPENSE report (NOT an internal-security/personnel
// ledger), and the ingested material deliberately does not fingerprint
// Martorano / Bulger / Flemmi / Connolly hearsay (that fence stays closed in
// this pass).
// ============================================================================

import type {
  Artifact,
  Evidence,
  EvidenceRequest,
  GraphEdge,
  GraphNode,
  Hypothesis,
  InvestigativeGap,
  Observation,
  RelationHypothesis,
  Source,
} from "@indago/contracts";
import {
  ArtifactSchema,
  EvidenceRequestSchema,
  EvidenceSchema,
  GraphEdgeSchema,
  HypothesisSchema,
  InvestigativeGapSchema,
  ObservationSchema,
  RelationHypothesisSchema,
  SourceSchema,
} from "@indago/contracts";
import type { DemoStreamEvent } from "../demo/demo-fixtures/events";
import type { DemoWorkspaceState } from "../demo/state";
import { demoContentHash } from "../demo/submit";
import { evt, obs } from "../demo/demo-fixtures/times";
import type {
  BreakthroughRecord,
  BreakthroughRunResult,
  GraphRealtimeCatalog,
  Phase1PostFreezeDelta,
  PredictionFreeze,
} from "../types";
import { catalogKey } from "../types";
import { caseAFixtureSet } from "./case-a";
import { caseBFixtureSet } from "./case-b";
import type { RealCasePhase1Derivation } from "./phase1";
import { computePredictionFreezeFingerprint, deriveRealCasePhase1 } from "./phase1";
import {
  ART_EXHIBIT_719,
  CASE_B_ID,
  ENT_FBIBOSTON,
  ENT_HITMAN,
  ENT_RICO,
  ENT_WINTER_HILL,
  ENT_WJA,
  EREQ_B4,
  EVID_EXHIBIT_719,
  EVT_BT_01,
  EVT_BT_02,
  EVT_BT_03,
  EVT_BT_04,
  EVT_BT_05,
  EVT_BT_06,
  EVT_BT_07,
  EVT_BT_08,
  EVT_BT_09,
  EVT_BT_10,
  EVT_BT_11,
  EVT_BT_12,
  EVT_BT_13,
  EVT_BT_14,
  EVT_BT_15,
  EVT_BT_16,
  FREEZE_B1,
  GAP_B4,
  GE_B_HITMAN_WINTER_HILL,
  GE_B_MCGUIGAN_SOCTF,
  GE_B_RICO_HITMAN,
  GE_B_SOCTF_FBI,
  GE_B_WJA_FBI,
  GN_A_MCGUIGAN,
  GN_A_SOCTF,
  GN_B_FBI,
  GN_B_HITMAN,
  GN_B_RICO,
  GN_B_WINTER_HILL,
  GN_B_WJA,
  GRAPH_VERSION_B,
  HOLE_B3,
  HYP_B2,
  HYP_B3,
  INVESTIGATION_B_ID,
  OBS_B7,
  OBS_B8,
  OBS_B9,
  OBS_B10,
  REL_A_MCGUIGAN_SOCTF,
  REL_A_SOCTF_FBI,
  REL_B_HITMAN_WINTER_HILL,
  REL_B_RICO_HITMAN,
  REL_B_WJA_FBI,
  SRC_EXHIBIT_719,
} from "./lookup";

// ============================================================================
// Constants
// ============================================================================

/** Canonical target class named by evidence request EREQ_B4. */
export const BREAKTHROUGH_CLASS = "WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)";

const EXTRACTOR = "intel.breakthrough.v1";
const INGEST_AT = obs("2024-07-02", "09:00:00");
const CORP_RECORD_EVENT_AT = evt("1981-05-11", "day", "12:00:00");

/** Deterministic strengths (documented in the p3 report). */
export const BREAKTHROUGH_STRENGTH = {
  evidence: 0.7,
  obsHospitality: 0.7,
  obsRole: 0.7,
  obsScope: 0.6,
  obsBridge: 0.72,
  structuralImportance: 0.55,
} as const;

/** Documented deterministic weights of the WJA↔FBI financial support score. */
export const BREAKTHROUGH_SUPPORT_WEIGHTS = {
  directHospitalityRecord: 0.5,
  financialContext: 0.3,
  institutionalFit: 0.2,
} as const;

/**
 * Deterministic supports for the ingest-derived Case-A network reveal edges
 * (both PROPOSED): the WJA security function's institutional record grounds the
 * bridge from H. Paul Rico to the hitman (0.72) and from the hitman to the
 * Winter Hill Gang (0.70). These are investigative-relevance estimates
 * (DERIVED_BY_DEMO_LOGIC) — NOT guilt/conspiracy statements.
 */
export const REVEAL_STRENGTH = {
  ricoHitman: 0.72,
  hitmanWinterHill: 0.7,
} as const;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Deterministic support for the WJA ↔ FBI Boston financial relationship:
 *   0.5 · (hospitality record strength) + 0.3 · (financial-context strength)
 *   + 0.2 · institutional fit (1 = organizational security function).
 * Defaults yield 0.5·0.7 + 0.3·0.7 + 0.2·1.0 = 0.76.
 */
export function deriveBreakthroughSupport(input: {
  readonly hospitalityStrength?: number;
  readonly contextStrength?: number;
  readonly institutionalFit?: number;
}): number {
  return round4(
    BREAKTHROUGH_SUPPORT_WEIGHTS.directHospitalityRecord *
      (input.hospitalityStrength ?? BREAKTHROUGH_STRENGTH.obsHospitality) +
      BREAKTHROUGH_SUPPORT_WEIGHTS.financialContext *
        (input.contextStrength ?? BREAKTHROUGH_STRENGTH.obsRole) +
      BREAKTHROUGH_SUPPORT_WEIGHTS.institutionalFit *
        (input.institutionalFit ?? 1),
  );
}

// ============================================================================
// Match gate — the analyst's submission must carry the target class
// ============================================================================

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when the submission title or any file name contains the canonical
 *  EREQ_B4 target class (normalized). Anything else does NOT trigger ingest. */
export function matchesBreakthroughClass(
  title: string,
  fileNames: readonly string[],
): boolean {
  const needle = normalize(BREAKTHROUGH_CLASS);
  const haystack = normalize([title, ...fileNames].join(" "));
  return haystack.includes(needle);
}

// ============================================================================
// Record builders — canonical, parsed, deterministic
// ============================================================================

function buildSource(): Source {
  return SourceSchema.parse({
    id: SRC_EXHIBIT_719,
    caseId: CASE_B_ID,
    name: BREAKTHROUGH_CLASS,
    type: "FILE_UPLOAD",
    status: "ACTIVE",
    systemOrigin: "frontend.demo.v1",
    evidenceIds: [EVID_EXHIBIT_719],
    description:
      "World Jai Alai corporate purchase/expense report dated May 11, 1981 (fenced Exhibit 719). " +
      "Financial record of WJA-funded hospitality extended to FBI Special Agents during a Bahamas trip.",
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildArtifact(): Artifact {
  return ArtifactSchema.parse({
    id: ART_EXHIBIT_719,
    evidenceId: EVID_EXHIBIT_719,
    sourceId: SRC_EXHIBIT_719,
    type: "DOCUMENT",
    filename: "wja-purchase-report-may-11-1981.pdf",
    mimeType: "application/pdf",
    sizeBytes: 14200,
    hash: demoContentHash("exhibit-719:wja-purchase-report"),
    storagePath: "ingest/breakthrough/exhibit-719-wja-purchase-report.pdf",
    extractedText:
      "WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) — WJA corporate purchase/expense report. " +
      "Records WJA-funded hospitality extended to FBI Special Agents Tom Dowd and Jerry Forrester in the Bahamas.",
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildEvidence(observationIds: readonly string[]): Evidence {
  return EvidenceSchema.parse({
    id: EVID_EXHIBIT_719,
    caseId: CASE_B_ID,
    investigationId: INVESTIGATION_B_ID,
    sourceId: SRC_EXHIBIT_719,
    type: "RECORD",
    status: "PROCESSED",
    title: BREAKTHROUGH_CLASS,
    description:
      "World Jai Alai corporate purchase/expense report (Exhibit 719). Documents that H. Paul Rico — " +
      "WJA vice president and director of security — and WJA personnel extended WJA-funded hospitality " +
      "to FBI Special Agents Tom Dowd and Jerry Forrester. Financial/institutional context; it does NOT " +
      "establish who killed Roger Wheeler.",
    artifactIds: [ART_EXHIBIT_719],
    observationIds: [...observationIds],
    entityIds: [ENT_RICO, ENT_WJA, ENT_FBIBOSTON],
    hypothesisIds: [HYP_B2, HYP_B3],
    strength: BREAKTHROUGH_STRENGTH.evidence,
    posture: "T1_INVESTIGATIVE_LEAD",
    provenance: {
      sourceId: SRC_EXHIBIT_719,
      artifactId: ART_EXHIBIT_719,
      documentRef: "Exhibit 719",
      extractor: EXTRACTOR,
    },
    ingestionTime: INGEST_AT,
    observedAt: CORP_RECORD_EVENT_AT,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function provenanceForBreakthrough(derivedFrom: readonly string[] = []): {
  sourceId: string;
  artifactId: string;
  documentRef: string;
  extractor: string;
  derivedFrom?: readonly string[];
} {
  return {
    sourceId: SRC_EXHIBIT_719,
    artifactId: ART_EXHIBIT_719,
    documentRef: "Exhibit 719",
    extractor: EXTRACTOR,
    ...(derivedFrom.length > 0 ? { derivedFrom: [...derivedFrom] } : {}),
  };
}

function buildObservationB7(): Observation {
  return ObservationSchema.parse({
    id: OBS_B7,
    evidenceId: EVID_EXHIBIT_719,
    sourceId: SRC_EXHIBIT_719,
    type: "FINANCIAL",
    content:
      "EXHIBIT 719 — WORLD JAI ALAI PURCHASE REPORT (May 11, 1981): a corporate purchase/expense record " +
      "showing H. Paul Rico in his World Jai Alai capacity (vice president and director of security) present " +
      "with WJA-funded hospitality, placing the WJA internal security function within the institutional " +
      "financial arrangement.",
    entityIds: [ENT_RICO, ENT_WJA],
    candidateMentions: [],
    hypothesisIds: [HYP_B2, HYP_B3],
    strength: BREAKTHROUGH_STRENGTH.obsRole,
    provenance: provenanceForBreakthrough(),
    observedAt: CORP_RECORD_EVENT_AT,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildObservationB8(): Observation {
  return ObservationSchema.parse({
    id: OBS_B8,
    evidenceId: EVID_EXHIBIT_719,
    sourceId: SRC_EXHIBIT_719,
    type: "FINANCIAL",
    content:
      "EXHIBIT 719 — WORLD JAI ALAI PURCHASE REPORT (May 11, 1981): records WJA-funded hospitality extended " +
      "to FBI Special Agents Tom Dowd and Jerry Forrester in the Bahamas; the agents resolve to the FBI " +
      "Boston Field Office (existing entity, no new entities required).",
    entityIds: [ENT_WJA, ENT_FBIBOSTON],
    candidateMentions: ["FBI Special Agents", "Dowd", "Forrester"],
    hypothesisIds: [HYP_B2, HYP_B3],
    strength: BREAKTHROUGH_STRENGTH.obsHospitality,
    provenance: provenanceForBreakthrough(),
    observedAt: CORP_RECORD_EVENT_AT,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildObservationB9(): Observation {
  return ObservationSchema.parse({
    id: OBS_B9,
    evidenceId: EVID_EXHIBIT_719,
    sourceId: SRC_EXHIBIT_719,
    type: "FINANCIAL",
    content:
      "EXHIBIT 719 — WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) is a corporate financial/expense record: " +
      "its language documents spending and a security function's institutional relationships, and nothing in the report " +
      "connects that function to the people around the Wheeler homicide.",
    entityIds: [ENT_RICO, ENT_WJA, ENT_FBIBOSTON],
    candidateMentions: [],
    hypothesisIds: [HYP_B2, HYP_B3],
    strength: BREAKTHROUGH_STRENGTH.obsScope,
    provenance: provenanceForBreakthrough(),
    observedAt: CORP_RECORD_EVENT_AT,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildObservationB10(): Observation {
  return ObservationSchema.parse({
    id: OBS_B10,
    evidenceId: EVID_EXHIBIT_719,
    sourceId: SRC_EXHIBIT_719,
    type: "RELATIONAL",
    content:
      "Exhibit-719 pathway — reading the purchase report against the Case-A network file: the report places H. Paul Rico " +
      "inside the company's security function, and the Case-A file routes the shooter's circle through the same " +
      "occupational pairing the report documents. That pairing is the cross-case reading used to tie the shooter to " +
      "H. Paul Rico. The link is investigative relevance only; the report itself never names the shooter.",
    entityIds: [ENT_RICO, ENT_HITMAN, ENT_WINTER_HILL],
    candidateMentions: [],
    hypothesisIds: [HYP_B2, HYP_B3],
    strength: BREAKTHROUGH_STRENGTH.obsBridge,
    provenance: provenanceForBreakthrough([OBS_B7, OBS_B9]),
    observedAt: CORP_RECORD_EVENT_AT,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildRelation(support: number): RelationHypothesis {
  return RelationHypothesisSchema.parse({
    id: REL_B_WJA_FBI,
    sourceEntityId: ENT_WJA,
    targetEntityId: ENT_FBIBOSTON,
    relationType: "financial",
    support,
    evidenceBasis: [OBS_B7, OBS_B8],
    contradictions: [OBS_B9],
    temporalInterval: {
      validFrom: CORP_RECORD_EVENT_AT,
      precision: "range",
      semantics: "observed",
    },
    directed: true,
    strength: BREAKTHROUGH_STRENGTH.obsRole,
    status: "PROPOSED",
    provenance: provenanceForBreakthrough([OBS_B7, OBS_B8]),
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function buildEdge(support: number): GraphEdge {
  return GraphEdgeSchema.parse({
    id: GE_B_WJA_FBI,
    investigationId: INVESTIGATION_B_ID,
    versionId: GRAPH_VERSION_B,
    sourceNodeId: GN_B_WJA,
    targetNodeId: GN_B_FBI,
    relationType: "financial",
    relationHypothesisId: REL_B_WJA_FBI,
    support,
    structuralImportance: BREAKTHROUGH_STRENGTH.structuralImportance,
    directed: true,
    temporalRange: {
      validFrom: CORP_RECORD_EVENT_AT,
      precision: "range",
      semantics: "observed",
    },
    status: "ACTIVE",
    observationCount: 2,
    sourceCount: 1,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

/**
 * Bridge relations derived at ingest for the Case-A network reveal: Rico →
 * hitman and hitman → Winter Hill Gang (both PROPOSED case-links). They are the
 * case-link continuation the fenced report itself cannot document; the evidence
 * basis stays the institutional record while OBS_B9 (report does not itself
 * connect to homicide persons) is carried as the contradiction.
 */
function buildRevealRelations(): readonly RelationHypothesis[] {
  return [
    RelationHypothesisSchema.parse({
      id: REL_B_RICO_HITMAN,
      sourceEntityId: ENT_RICO,
      targetEntityId: ENT_HITMAN,
      relationType: "case-link",
      support: REVEAL_STRENGTH.ricoHitman,
      evidenceBasis: [OBS_B7, OBS_B8, OBS_B10],
      contradictions: [OBS_B9],
      temporalInterval: {
        validFrom: INGEST_AT,
        precision: "range",
        semantics: "inferred",
      },
      directed: true,
      strength: BREAKTHROUGH_STRENGTH.obsRole,
      status: "PROPOSED",
      provenance: provenanceForBreakthrough([OBS_B7, OBS_B8, OBS_B10]),
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
    RelationHypothesisSchema.parse({
      id: REL_B_HITMAN_WINTER_HILL,
      sourceEntityId: ENT_HITMAN,
      targetEntityId: ENT_WINTER_HILL,
      relationType: "case-link",
      support: REVEAL_STRENGTH.hitmanWinterHill,
      evidenceBasis: [OBS_B7, OBS_B10],
      contradictions: [OBS_B9],
      temporalInterval: {
        validFrom: INGEST_AT,
        precision: "range",
        semantics: "inferred",
      },
      directed: true,
      strength: BREAKTHROUGH_STRENGTH.obsRole,
      status: "PROPOSED",
      provenance: provenanceForBreakthrough([OBS_B7, OBS_B10]),
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
  ];
}

/**
 * Tulsa-side bridge edges derived at ingest (persisted in the Case B graph
 * state): Rico → hitman and hitman → Winter Hill Gang. Both endpoints are
 * existing Case B nodes, so these edges are real post-ingest graph rows (and
 * therefore count toward the post-freeze fingerprint).
 */
function buildBridgeEdges(): readonly GraphEdge[] {
  return [
    GraphEdgeSchema.parse({
      id: GE_B_RICO_HITMAN,
      investigationId: INVESTIGATION_B_ID,
      versionId: GRAPH_VERSION_B,
      sourceNodeId: GN_B_RICO,
      targetNodeId: GN_B_HITMAN,
      relationType: "case-link",
relationHypothesisId: REL_B_RICO_HITMAN,
      support: REVEAL_STRENGTH.ricoHitman,
      structuralImportance: BREAKTHROUGH_STRENGTH.structuralImportance,
      directed: true,
      temporalRange: {
        validFrom: INGEST_AT,
        precision: "range",
        semantics: "inferred",
      },
      status: "ACTIVE",
      observationCount: 2,
      sourceCount: 1,
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
    GraphEdgeSchema.parse({
      id: GE_B_HITMAN_WINTER_HILL,
      investigationId: INVESTIGATION_B_ID,
      versionId: GRAPH_VERSION_B,
      sourceNodeId: GN_B_HITMAN,
      targetNodeId: GN_B_WINTER_HILL,
      relationType: "case-link",
      relationHypothesisId: REL_B_HITMAN_WINTER_HILL,
      support: REVEAL_STRENGTH.hitmanWinterHill,
      structuralImportance: BREAKTHROUGH_STRENGTH.structuralImportance,
      directed: true,
      temporalRange: {
        validFrom: INGEST_AT,
        precision: "range",
        semantics: "inferred",
      },
      status: "ACTIVE",
      observationCount: 2,
      sourceCount: 1,
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
  ];
}

/**
 * Connecticut-network overlay edges (catalog-only, NEVER Case B graph rows):
 * SOCTF → FBI Boston and McGuigan → SOCTF. They reference the CT overlay nodes
 * (GN_A_SOCTF / GN_A_MCGUIGAN), which never enter the Case B graph state, so
 * they are materialized purely as realtime overlay deltas anchored on the shared
 * FBI Boston bridge.
 */
function buildCtOverlayEdges(): readonly GraphEdge[] {
  return [
    GraphEdgeSchema.parse({
      id: GE_B_SOCTF_FBI,
      investigationId: INVESTIGATION_B_ID,
      versionId: GRAPH_VERSION_B,
      sourceNodeId: GN_A_SOCTF,
      targetNodeId: GN_B_FBI,
      relationType: "communication",
      relationHypothesisId: REL_A_SOCTF_FBI,
      support: 0.7,
      structuralImportance: 0.55,
      directed: true,
      temporalRange: {
        validFrom: CORP_RECORD_EVENT_AT,
        precision: "range",
        semantics: "observed",
      },
      status: "ACTIVE",
      observationCount: 2,
      sourceCount: 1,
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
    GraphEdgeSchema.parse({
      id: GE_B_MCGUIGAN_SOCTF,
      investigationId: INVESTIGATION_B_ID,
      versionId: GRAPH_VERSION_B,
      sourceNodeId: GN_A_MCGUIGAN,
      targetNodeId: GN_A_SOCTF,
      relationType: "organizational",
      relationHypothesisId: REL_A_MCGUIGAN_SOCTF,
      support: 0.9,
      structuralImportance: 0.35,
directed: true,
      temporalRange: {
        validFrom: INGEST_AT,
        precision: "range",
        semantics: "inferred",
      },
      status: "ACTIVE",
      observationCount: 1,
      sourceCount: 1,
      createdAt: INGEST_AT,
      updatedAt: INGEST_AT,
    }),
  ];
}

function buildRefinement(parent: Hypothesis): Hypothesis {
  const supporting = dedupe([...parent.supportingObservationIds, OBS_B7, OBS_B8]);
  const contradicting = dedupe([...parent.contradictingObservationIds, OBS_B9]);
  const related = dedupe([...(parent.relatedEntityIds ?? []), ENT_FBIBOSTON]);
  const parentEntries = parent.provenance.entries ?? [];
  const chain = {
    entries: [
      ...parentEntries.map((entry) => ({ ...entry })),
      provenanceForBreakthrough([OBS_B7, OBS_B8, OBS_B9]),
    ],
    currentHypothesisId: HYP_B3,
    createdAt: INGEST_AT,
  };
  return HypothesisSchema.parse({
    id: HYP_B3,
    investigationId: INVESTIGATION_B_ID,
    title:
      "WJA internal security function — institutional financial relationship (refined post-Ingest)",
    statement:
      "The company's internal security function MAY have provided an information/operational pathway " +
      "connecting the World Jai Alai network to the people surrounding the Wheeler homicide. " +
      "Post-Ingest refinement: the WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) establishes an " +
      "institutional financial relationship between the WJA security function's organization and the " +
      "FBI Boston circle — a structural condition, NOT evidence of who killed Wheeler.",
    status: "SUPPORTED",
    confidence: round4(parent.confidence + 0.1),
    supportingObservationIds: supporting,
    contradictingObservationIds: contradicting,
    supportingEvidenceIds: dedupe([...(parent.supportingEvidenceIds ?? []), EVID_EXHIBIT_719]),
    contradictingEvidenceIds: parent.contradictingEvidenceIds ?? [],
    relatedEntityIds: related,
    parentHypothesisId: parent.id,
    claimIds: parent.claimIds,
    provenance: chain,
    createdAt: INGEST_AT,
    updatedAt: INGEST_AT,
  });
}

function reassessGap(gap: InvestigativeGap): InvestigativeGap {
  if (gap.status === "PARTIALLY_ADDRESSED") return gap;
  return InvestigativeGapSchema.parse({
    ...gap,
    status: "PARTIALLY_ADDRESSED",
    resolution:
      "PARTIAL: ingestion of the WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) establishes the WJA " +
      "security function's institutional financial relationship with the FBI Boston circle (a financial " +
      "edge materialized and the Phase-1 graph hole is partially resolved). NOT resolved: the case-link " +
      "to the people around the Wheeler homicide remains unestablished.",
    updatedAt: INGEST_AT,
  });
}

function completeEvidenceRequest(
  evidenceRequest: EvidenceRequest,
  evidenceId: string,
): EvidenceRequest {
  if (evidenceRequest.status === "COMPLETED") return evidenceRequest;
  return EvidenceRequestSchema.parse({
    ...evidenceRequest,
    status: "COMPLETED",
    resultingEvidenceIds: dedupe([
      ...(evidenceRequest.resultingEvidenceIds ?? []),
      evidenceId,
    ]),
    updatedAt: INGEST_AT,
  });
}

// ============================================================================
// Post-freeze fingerprint comparison
// ============================================================================

/** Fingerprint of the SAME Phase-1 snapshot with the breakthrough edges added. */
export function computePostFreezeFingerprintAfter(
  freeze: PredictionFreeze,
  edgeIdsAfter: readonly string[],
): string {
  const { fingerprint: _drop, ...snapshot } = freeze;
  const after: Omit<PredictionFreeze, "fingerprint"> = {
    ...snapshot,
    edgeIds: [...snapshot.edgeIds, ...edgeIdsAfter],
  };
  return computePredictionFreezeFingerprint(after);
}

function buildDelta(
  phase1: RealCasePhase1Derivation,
  edgeIdsAfter: readonly string[],
): Phase1PostFreezeDelta {
  const freeze = phase1.predictionFreeze!;
  return {
    caseId: CASE_B_ID,
    investigationId: INVESTIGATION_B_ID,
    appliedAt: INGEST_AT,
    evidenceIngestedIds: [EVID_EXHIBIT_719],
    observationExtractedIds: [OBS_B7, OBS_B8, OBS_B9, OBS_B10],
    entityResolvedIds: [ENT_FBIBOSTON, ENT_RICO, ENT_WJA, ENT_HITMAN, ENT_WINTER_HILL],
    relationCreatedIds: [REL_B_WJA_FBI, REL_B_RICO_HITMAN, REL_B_HITMAN_WINTER_HILL],
    graphEdgesAdded: [...edgeIdsAfter],
    graphHolesResolved: [
      {
        graphHoleId: HOLE_B3,
        status: "PARTIALLY_RESOLVED",
        derivedFromEvidenceIds: [EVID_EXHIBIT_719],
      },
    ],
    hypothesisRefinement: HYP_B3,
    evidenceRequestIdsCompleted: [EREQ_B4],
    gapStatusChanges: [{ gapId: GAP_B4, from: "IDENTIFIED", to: "PARTIALLY_ADDRESSED" }],
    freezeFingerprintBefore: freeze.fingerprint,
    freezeFingerprintAfter: computePostFreezeFingerprintAfter(freeze, edgeIdsAfter),
    leakSafeClass: BREAKTHROUGH_CLASS,
  };
}

function buildRecord(delta: Phase1PostFreezeDelta): BreakthroughRecord {
  return {
    determinismLabel: "indago-exhibit-719",
    ingestedAt: INGEST_AT,
    evidenceId: EVID_EXHIBIT_719,
    evidenceClass: BREAKTHROUGH_CLASS,
    evidenceStatus: "PROCESSED",
    extractedObservationIds: [OBS_B7, OBS_B8, OBS_B9, OBS_B10],
    resolvedEntityIds: [ENT_FBIBOSTON, ENT_RICO, ENT_WJA, ENT_HITMAN, ENT_WINTER_HILL],
    relationId: REL_B_WJA_FBI,
    edgeId: GE_B_WJA_FBI,
    hypothesisId: HYP_B3,
    gapId: GAP_B4,
    gapStatus: "PARTIALLY_ADDRESSED",
    evidenceRequestId: EREQ_B4,
    evidenceRequestStatus: "COMPLETED",
    freezeFingerprintBefore: delta.freezeFingerprintBefore,
    freezeFingerprintAfter: delta.freezeFingerprintAfter,
    summary:
      "The WJA purchase/expense report (May 11, 1981) was ingested: it establishes WJA-funded " +
      "hospitality toward FBI Special Agents, materializing a financial edge to the FBI Boston circle, " +
      "partially addressing the Phase-1 security-pathway gap, and revealing the Connecticut network " +
      "(SOCTF, McGuigan) as an overlay on the Tulsa graph with H. Paul Rico as the bridge to the hitman " +
      "and the Winter Hill Gang (all case-link hypotheses PROPOSED). It does NOT establish who killed " +
      "Roger Wheeler.",
  };
}

// ============================================================================
// Breakthrough event stream (10 deterministic transport events)
// ============================================================================

function breakthroughTimestamp(minute: number): string {
  return `2024-07-02T09:${String(minute).padStart(2, "0")}:00.000Z`;
}

function breakthroughEvent(
  id: string,
  action: string,
  targetType: string,
  targetId: string,
  description: string,
  minute: number,
  index: number,
): DemoStreamEvent {
  return {
    id,
    investigationId: INVESTIGATION_B_ID,
    action,
    actor: EXTRACTOR,
    targetType,
    targetId,
    description,
    timestamp: breakthroughTimestamp(minute),
    delayMs: 240 * index,
  };
}

export function buildBreakthroughEvents(): readonly DemoStreamEvent[] {
  return [
    breakthroughEvent(EVT_BT_01, "EVIDENCE_INGESTED", "EVIDENCE", EVID_EXHIBIT_719, "Ingested evidence: WORLD JAI ALAI PURCHASE REPORT (May 11, 1981).", 0, 0),
    breakthroughEvent(EVT_BT_02, "OBSERVATION_EXTRACTED", "OBSERVATION", OBS_B7, "Extracted observation: the report documents H. Paul Rico in his World Jai Alai role within a corporate financial/expense record.", 1, 1),
    breakthroughEvent(EVT_BT_03, "OBSERVATION_EXTRACTED", "OBSERVATION", OBS_B8, "Extracted observation: WJA-funded hospitality extended to FBI Special Agents Dowd and Forrester in the Bahamas.", 2, 2),
    breakthroughEvent(EVT_BT_04, "ENTITY_HYPOTHESIS_RESOLVED", "ENTITY", ENT_FBIBOSTON, "Mention-resolution: the named agents align to the existing FBI Boston Field Office; no new entities required.", 3, 3),
    breakthroughEvent(EVT_BT_05, "RELATION_CREATED", "RELATION", REL_B_WJA_FBI, "Created relation hypothesis: WJA ↔ FBI Boston (financial, institutional).", 4, 4),
    breakthroughEvent(EVT_BT_06, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_WJA_FBI, "Materialized graph edge: WJA → FBI Boston Field Office.", 5, 5),
    breakthroughEvent(EVT_BT_07, "GRAPH_HOLE_RESOLVED", "GRAPH_HOLE", HOLE_B3, "Graph hole partially resolved: the WJA security-function node is no longer isolated from the FBI circle (the case-link to the homicide persons remains open).", 6, 6),
    breakthroughEvent(EVT_BT_08, "HYPOTHESIS_PROMOTED", "HYPOTHESIS", HYP_B3, "Promoted refinement hypothesis HYP_B3 (child of HYP_B2) with new institutional financial grounding.", 7, 7),
    breakthroughEvent(EVT_BT_09, "GAP_ADDRESSED", "GAP", GAP_B4, "Gap updated: PARTIALLY_ADDRESSED — progress recorded; the residual case-link question remains open.", 8, 8),
    breakthroughEvent(EVT_BT_10, "FREEZE_COMPARED", "PREDICTION_FREEZE", FREEZE_B1, "Post-ingest state compared to the Phase-1 prediction freeze: fingerprint changed by the new edge.", 9, 9),
    breakthroughEvent(EVT_BT_11, "GRAPH_NODE_ADDED", "GRAPH_NODE", GN_A_SOCTF, "Case-A network reveal: the CT State Police Organized Crime Task Force (SOCTF) materializes as an overlay node on the Tulsa graph.", 10, 10),
    breakthroughEvent(EVT_BT_12, "GRAPH_NODE_ADDED", "GRAPH_NODE", GN_A_MCGUIGAN, "Case-A network reveal: Assistant State's Attorney Austin McGuigan materializes as an overlay node on the Tulsa graph.", 11, 11),
    breakthroughEvent(EVT_BT_13, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_SOCTF_FBI, "Overlay edge materialized: CT SOCTF ↔ FBI Boston Field Office (shared bridge).", 12, 12),
    breakthroughEvent(EVT_BT_14, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_MCGUIGAN_SOCTF, "Overlay edge materialized: Austin McGuigan → CT SOCTF.", 13, 13),
    breakthroughEvent(EVT_BT_15, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_RICO_HITMAN, "Bridge edge materialized: H. Paul Rico → The Hitman (case-link).", 14, 14),
    breakthroughEvent(EVT_BT_16, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_HITMAN_WINTER_HILL, "Bridge edge materialized: The Hitman → Winter Hill Gang (case-link).", 15, 15),
  ];
}

// ============================================================================
// Graph overlay catalog (drives the realtime graph deltas with no UI change)
// ============================================================================

export function buildBreakthroughCatalog(
  edge: GraphEdge,
  overrides?: {
    readonly bridgeEdges?: readonly GraphEdge[];
    readonly ctEdges?: readonly GraphEdge[];
    readonly ctNodesById?: ReadonlyMap<string, GraphNode>;
  },
): GraphRealtimeCatalog {
  const bridgeEdges = overrides?.bridgeEdges ?? [];
  const ctEdges = overrides?.ctEdges ?? [];
  const ctNodesById = overrides?.ctNodesById;
  const catalog: GraphRealtimeCatalog = {
    [catalogKey("GRAPH_EDGE_ADDED", GE_B_WJA_FBI)]: { kind: "edge", edge },
    [catalogKey("GRAPH_HOLE_RESOLVED", HOLE_B3)]: {
      kind: "hole-resolve",
      resolvesHoleId: GAP_B4,
      edge,
    },
  };
  for (const bridge of bridgeEdges) {
    catalog[catalogKey("GRAPH_EDGE_ADDED", bridge.id)] = { kind: "edge", edge: bridge };
  }
  for (const ctEdge of ctEdges) {
    catalog[catalogKey("GRAPH_EDGE_ADDED", ctEdge.id)] = { kind: "edge", edge: ctEdge };
  }
  if (ctNodesById) {
    const soctfNode = ctNodesById.get(GN_A_SOCTF);
    const mcguiganNode = ctNodesById.get(GN_A_MCGUIGAN);
    if (soctfNode) {
      catalog[catalogKey("GRAPH_NODE_ADDED", GN_A_SOCTF)] = { kind: "node", node: soctfNode };
    }
    if (mcguiganNode) {
      catalog[catalogKey("GRAPH_NODE_ADDED", GN_A_MCGUIGAN)] = { kind: "node", node: mcguiganNode };
    }
  }
  return catalog;
}

// ============================================================================
// Package assembly
// ============================================================================

export interface BreakthroughPackage {
  readonly source: Source;
  readonly artifact: Artifact;
  readonly evidence: Evidence;
  readonly observations: readonly Observation[];
  readonly relation: RelationHypothesis;
  readonly edge: GraphEdge;
  readonly refinementHypothesis: Hypothesis;
  readonly gapReassessment: InvestigativeGap;
  readonly evidenceRequestCompletion: EvidenceRequest;
  readonly delta: Phase1PostFreezeDelta;
  readonly record: BreakthroughRecord;
  readonly events: readonly DemoStreamEvent[];
  readonly catalog: GraphRealtimeCatalog;
  readonly support: number;
  readonly run: BreakthroughRunResult;
}

/**
 * Build the full Exhibit-719 breakthrough package. Deterministic: the same
 * inputs always yield the same canonical records. `phase1` defaults to the
 * Phase-1 derivation over the PASS 1 fixture sets (before-fingerprint); it is
 * passed explicitly by callers that already hold a derivation.
 */
export function buildBreakthroughPackage(
  phase1: RealCasePhase1Derivation = deriveRealCasePhase1(
    caseAFixtureSet,
    caseBFixtureSet,
  ),
): BreakthroughPackage {
  const support = deriveBreakthroughSupport({});
  const observations = [
    buildObservationB7(),
    buildObservationB8(),
    buildObservationB9(),
    buildObservationB10(),
  ];
  const evidence = buildEvidence(observations.map((o) => o.id));
  const source = buildSource();
  const artifact = buildArtifact();
  const relation = buildRelation(support);
  const edge = buildEdge(support);
  const revealRelations = buildRevealRelations();
  const bridgeEdges = buildBridgeEdges();
  const ctEdges = buildCtOverlayEdges();
  const ctNodesById = new Map(caseAFixtureSet.graphNodes.map((n) => [n.id, n]));
  const refinementHypothesis = buildRefinement(phase1.hypothesis!);
  const gapReassessment = reassessGap(phase1.gap!);
  const evidenceRequestCompletion = completeEvidenceRequest(
    phase1.evidenceRequest!,
    evidence.id,
  );
  const events = buildBreakthroughEvents();
  const catalog = buildBreakthroughCatalog(edge, {
    bridgeEdges,
    ctEdges,
    ctNodesById,
  });
  const edgeIdsAfter = [edge.id, ...bridgeEdges.map((e) => e.id)];
  const delta = buildDelta(phase1, edgeIdsAfter);
  const record = buildRecord(delta);
  const patch: BreakthroughRunResult["patch"] = {
    sources: [source],
    artifacts: [artifact],
    evidence: [evidence],
    observations: [...observations],
    relations: [relation, ...revealRelations],
    graphEdges: [edge, ...bridgeEdges],
    hypotheses: [refinementHypothesis],
    gapReassessments: [{ id: gapReassessment.id, record: gapReassessment }],
    evidenceRequestCompletions: [
      { id: evidenceRequestCompletion.id, record: evidenceRequestCompletion },
    ],
  };
  const run: BreakthroughRunResult = { patch, record, delta };
  return {
    source,
    artifact,
    evidence,
    observations,
    relation,
    edge,
    refinementHypothesis,
    gapReassessment,
    evidenceRequestCompletion,
    delta,
    record,
    events,
    catalog,
    support,
    run,
  };
}

/**
 * Idempotently insert/reassess the breakthrough patch into a demo workspace
 * state. Records already present are left untouched; reassessment setters
 * short-circuit when the target status is already reached.
 */
export function applyBreakthroughRunToState(
  state: DemoWorkspaceState,
  run: BreakthroughRunResult,
): void {
  const p = run.patch;
  for (const record of p.sources) {
    if (!state.sourceById.has(record.id)) state.sourceById.set(record.id, record);
  }
  for (const record of p.artifacts) {
    if (!state.artifactById.has(record.id)) state.artifactById.set(record.id, record);
  }
  for (const record of p.evidence) {
    if (!state.evidenceById.has(record.id)) state.evidenceById.set(record.id, record);
  }
  for (const record of p.observations) {
    if (!state.observationById.has(record.id)) state.observationById.set(record.id, record);
  }
  for (const record of p.relations) {
    if (!state.relationById.has(record.id)) state.relationById.set(record.id, record);
  }
  for (const record of p.graphEdges) {
    if (!state.graphEdgeById.has(record.id)) state.graphEdgeById.set(record.id, record);
  }
  for (const record of p.hypotheses) {
    if (!state.hypothesisById.has(record.id)) state.hypothesisById.set(record.id, record);
  }
  for (const { id, record } of p.gapReassessments) {
    state.gapById.set(id, record);
  }
  for (const { id, record } of p.evidenceRequestCompletions) {
    state.evidenceRequestById.set(id, record);
  }
}

/** Build (from the default derivation) and apply a breakthrough run. */
export function runBreakthroughIngestion(
  state: DemoWorkspaceState,
  phase1: RealCasePhase1Derivation = deriveRealCasePhase1(
    caseAFixtureSet,
    caseBFixtureSet,
  ),
): BreakthroughRunResult {
  const run = buildBreakthroughPackage(phase1).run;
  applyBreakthroughRunToState(state, run);
  return run;
}