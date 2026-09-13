// ============================================================================
// Case A — Connecticut / World Jai Alai Licensing & Regulatory Probe
//
// Assembles every canonical fixture for the CT SOCTF investigation into a
// DemoFixtureSet-compatible object. All observation content is drawn strictly
// from INDAGO_REAL_CASE_SOURCE_VERIFICATION.md §III.B.6 and the cited
// primary sources. No historical invention.
// ============================================================================

import {
  CaseSchema,
  InvestigationSchema,
  SourceSchema,
  ArtifactSchema,
  EvidenceSchema,
  ObservationSchema,
  RelationHypothesisSchema,
  HypothesisSchema,
  LeadSchema,
  InvestigativeGapSchema,
  EvidenceRequestSchema,
  ReviewTaskSchema,
  GraphVersionSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  RobustnessResultSchema,
  CrossCaseMatchSchema,
  EntityMentionCandidateSchema,
  CandidatePairSchema,
  CandidateResolutionSchema,
  EntityHypothesisSchema,
} from "@indago/contracts";
import type { DemoFixtureSet } from "../demo/demo-fixtures";
import type { GraphHole } from "@indago/contracts";
import type { InvestigationTimeline } from "../types";
import { SHARED_ENTITIES } from "./shared";
import {
  CASE_A_ID,
  INVESTIGATION_A_ID,
  SRC_HR_VOL1_A,
  SRC_SOCTF_A,
  SRC_JAN76_A,
  SRC_SURV_BOSTON_A,
  SRC_HEARING_76_A,
  SRC_BAHAMAS_A,
  ART_HR_CT,
  ART_JAN76,
  ART_SURV,
  ART_HEARING,
  ART_BAHAMAS,
  EVID_HR_CT,
  EVID_JAN76,
  EVID_SURV,
  EVID_HEARING,
  EVID_BAHAMAS,
  OBS_A1,
  OBS_A2,
  OBS_A3,
  OBS_A4,
  OBS_A5,
  OBS_A6,
  OBS_A8,
  OBS_A9,
  ENT_A_SOCTF,
  ENT_A_MCGUIGAN,
  ENT_CALLAHAN,
  ENT_RICO,
  ENT_WJA,
  ENT_FBIBOSTON,
  REL_A_WJA_CALLAHAN,
  REL_A_WJA_RICO,
  REL_A_CALLAHAN_RICO,
  REL_A_SOCTF_FBI,
  REL_A_MCGUIGAN_SOCTF,
  REL_A_FBI_RICO,
  REL_A_CALLAHAN_FBI,
  GRAPH_VERSION_A,
  GN_A_CALLAHAN,
  GN_A_RICO,
  GN_A_WJA,
  GN_A_FBI,
  GN_A_SOCTF,
  GN_A_MCGUIGAN,
  GE_A_WJA_CALLAHAN,
  GE_A_WJA_RICO,
  GE_A_CALLAHAN_RICO,
  GE_A_SOCTF_FBI,
  GE_A_MCGUIGAN_SOCTF,
  GE_A_FBI_RICO,
  GE_A_CALLAHAN_FBI,
  GAP_A1,
  GAP_A2,
  HOLE_A1,
  HOLE_A2,
  HYP_A1,
  LEAD_A1,
  LEAD_A2,
  EREQ_A1,
  EREQ_A2,
  REVIEW_A1,
  REVIEW_A2,
  EMC_A_JACK,
  EMC_A_JOHN,
  PAIR_A1,
  HYP_RES_A1,
  CASE_B_ID,
  INVESTIGATION_B_ID,
} from "./lookup";
import { obs, evt } from "./times";

// ── Case ────────────────────────────────────────────────────────────────────

const caseA = CaseSchema.parse({
  id: CASE_A_ID,
  title: "Connecticut Jai Alai",
  description:
    "Statewide Organized Crime Task Force review of organized-crime influence over Connecticut jai-alai licensing (1975-1976), centered on WJA-connected personnel Callahan and Rico.",
  status: "ACTIVE",
  assignedTo: "analyst.ctsoctf",
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
  incidentDateRange: {
    validFrom: { value: "1976-01-01T00:00:00.000Z", precision: "approximate" },
    validTo: { value: "1976-05-31T00:00:00.000Z", precision: "approximate" },
    precision: "range",
    semantics: "observed",
  },
  investigationIds: [INVESTIGATION_A_ID],
  sourceIds: [SRC_HR_VOL1_A, SRC_SOCTF_A, SRC_JAN76_A, SRC_SURV_BOSTON_A, SRC_HEARING_76_A, SRC_BAHAMAS_A],
  entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON, ENT_A_SOCTF, ENT_A_MCGUIGAN],
  evidenceIds: [EVID_HR_CT, EVID_JAN76, EVID_SURV, EVID_HEARING, EVID_BAHAMAS],
  jurisdiction: "Connecticut, United States",
});

// ── Investigation ───────────────────────────────────────────────────────────

const investigationA = InvestigationSchema.parse({
  id: INVESTIGATION_A_ID,
  caseId: CASE_A_ID,
  title: "SOCTF Licensing Review — World Jai Alai personnel",
  description:
    "Scope of Rico's and Callahan's roles in WJA security operations and the disposition of the January 1976 federal records request.",
  status: "ACTIVE",
  priority: "HIGH",
  owner: "analyst.ctsoctf",
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
  entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON, ENT_A_SOCTF, ENT_A_MCGUIGAN],
  evidenceIds: [EVID_HR_CT, EVID_JAN76, EVID_SURV, EVID_HEARING, EVID_BAHAMAS],
  hypothesisIds: [HYP_A1],
  leadIds: [LEAD_A1, LEAD_A2],
  confidence: 0.35,
  temporalScope: {
    validFrom: { value: "1976-01-01T00:00:00.000Z", precision: "approximate" },
    validTo: { value: "1976-05-31T00:00:00.000Z", precision: "approximate" },
    precision: "range",
    semantics: "observed",
  },
});

// ── Sources (6) ─────────────────────────────────────────────────────────────

const sourcesA = [
  SourceSchema.parse({
    id: SRC_HR_VOL1_A, caseId: CASE_A_ID,
    name: "HR108-414 Vol 1 — Connecticut Jai Alai",
    type: "EXTERNAL_SYSTEM", status: "ACTIVE", systemOrigin: "govinfo.extractor.v1",
    evidenceIds: [EVID_HR_CT, EVID_BAHAMAS],
    recordCount: 1,
    description: "Senate committee report §III.B.6 pp.96-98 on organized crime and jai alai (1983).",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_SOCTF_A, caseId: CASE_A_ID,
    name: "Connecticut SOCTF Case File",
    type: "MANUAL_ENTRY", status: "ACTIVE", systemOrigin: "registry.extractor.v1",
    evidenceIds: [],
    recordCount: 1,
    description: "Internal Connecticut Statewide Organized Crime Task Force records.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_JAN76_A, caseId: CASE_A_ID,
    name: "January 1976 Federal Records Request",
    type: "MANUAL_ENTRY", status: "ACTIVE", systemOrigin: "registry.extractor.v1",
    evidenceIds: [EVID_JAN76],
    recordCount: 1,
    description: "Federal records request by Austin McGuigan (CT SOCTF) for records on WJA security director Callahan.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_SURV_BOSTON_A, caseId: CASE_A_ID,
    name: "Surveillance Log — Boston Trip",
    type: "MANUAL_ENTRY", status: "ACTIVE", systemOrigin: "registry.extractor.v1",
    evidenceIds: [EVID_SURV],
    recordCount: 1,
    description: "Connecticut surveillance record of Callahan's trip to the Boston area.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_HEARING_76_A, caseId: CASE_A_ID,
    name: "Connecticut Hearing Record — May 3, 1976",
    type: "MANUAL_ENTRY", status: "ACTIVE", systemOrigin: "registry.extractor.v1",
    evidenceIds: [EVID_HEARING],
    recordCount: 1,
    description: "Scheduling and disposition records for the May 3, 1976 Connecticut hearing.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_BAHAMAS_A, caseId: CASE_A_ID,
    name: "Bahamas Hospitality Record",
    type: "MANUAL_ENTRY", status: "ACTIVE", systemOrigin: "registry.extractor.v1",
    evidenceIds: [EVID_BAHAMAS],
    recordCount: 1,
    description: "Record of FBI SAs Dowd and Forrester entertained in the Bahamas by Rico and WJA personnel.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Artifacts (5) ───────────────────────────────────────────────────────────

const artifactsA = [
  ArtifactSchema.parse({
    id: ART_HR_CT, evidenceId: EVID_HR_CT, sourceId: SRC_HR_VOL1_A,
    type: "DOCUMENT", filename: "hr108-414-vol1-ct-jai-alai-extract.pdf",
    mimeType: "application/pdf", sizeBytes: 24500,
    hash: "sha256:hr108-414-vol1-ct-extract",
    storagePath: "ingest/hr108-414/vol1-ct-extract.pdf",
    extractedText: "HR108-414 Vol 1, §III.B.6 pp.96-98 — Connecticut jai alai: organized-crime allegations, WJA security personnel.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_JAN76, evidenceId: EVID_JAN76, sourceId: SRC_JAN76_A,
    type: "DOCUMENT", filename: "jan-1976-request-note.txt",
    mimeType: "text/plain", sizeBytes: 1200,
    hash: "sha256:jan-1976-request-note",
    storagePath: "ingest/ct-soctf/jan-1976-request.txt",
    extractedText: "In January 1976, CT SOCTF (McGuigan) requested federal records on WJA security director Callahan. Request met with silence.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_SURV, evidenceId: EVID_SURV, sourceId: SRC_SURV_BOSTON_A,
    type: "DOCUMENT", filename: "surveillance-boston-trip-log.txt",
    mimeType: "text/plain", sizeBytes: 980,
    hash: "sha256:surveillance-boston-trip-log",
    storagePath: "ingest/ct-soctf/surv-boston-trip.txt",
    extractedText: "Surveillance log: Callahan drove to the Boston area; observed at Clark's Turn of the Century Cafe and a motel.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_HEARING, evidenceId: EVID_HEARING, sourceId: SRC_HEARING_76_A,
    type: "DOCUMENT", filename: "ct-hearing-1976-extract.txt",
    mimeType: "text/plain", sizeBytes: 1100,
    hash: "sha256:ct-hearing-1976-extract",
    storagePath: "ingest/ct-soctf/hearing-1976-extract.txt",
    extractedText: "CT hearing record: Callahan's WJA employment ended before the scheduled 1976-05-03 appearance.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_BAHAMAS, evidenceId: EVID_BAHAMAS, sourceId: SRC_BAHAMAS_A,
    type: "DOCUMENT", filename: "bahamas-hospitality-note.txt",
    mimeType: "text/plain", sizeBytes: 850,
    hash: "sha256:bahamas-hospitality-note",
    storagePath: "ingest/ct-soctf/bahamas-hospitality.txt",
    extractedText: "Rico and WJA personnel entertained FBI SAs Dowd and Forrester in the Bahamas; WJA-paid hospitality. Callahan's presence not verified.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
];

// ── Evidence (5) ────────────────────────────────────────────────────────────

const evidenceA = [
  EvidenceSchema.parse({
    id: EVID_HR_CT, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    sourceId: SRC_HR_VOL1_A, type: "DOCUMENT", status: "VERIFIED",
    title: "HR108-414 Vol 1 — Connecticut Jai Alai (§III.B.6)",
    description: "Senate committee report excerpt on organized crime and jai alai in Connecticut.",
    artifactIds: [ART_HR_CT], observationIds: [OBS_A4, OBS_A5],
    entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON],
    hypothesisIds: [HYP_A1], strength: 0.85,
    posture: "T3_EVIDENCE_PACKAGE_CANDIDATE",
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_JAN76, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    sourceId: SRC_JAN76_A, type: "RECORD", status: "UNDER_REVIEW",
    title: "January 1976 Federal Records Request (McGuigan)",
    description: "Record of CT SOCTF request for federal records on WJA security director Callahan.",
    artifactIds: [ART_JAN76], observationIds: [OBS_A1, OBS_A9],
    entityIds: [ENT_A_MCGUIGAN, ENT_A_SOCTF, ENT_CALLAHAN],
    hypothesisIds: [HYP_A1], strength: 0.75,
    posture: "T2_CORROBORATED_LEAD",
    provenance: { sourceId: SRC_JAN76_A, extractor: "registry.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1976-01-15", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_SURV, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    sourceId: SRC_SURV_BOSTON_A, type: "RECORD", status: "PROCESSED",
    title: "Surveillance Log — Callahan Boston Trip",
    description: "Connecticut surveillance record of Callahan's trip to the Boston area.",
    artifactIds: [ART_SURV], observationIds: [OBS_A2],
    entityIds: [ENT_CALLAHAN],
    hypothesisIds: [HYP_A1], strength: 0.7,
    posture: "T2_CORROBORATED_LEAD",
    provenance: { sourceId: SRC_SURV_BOSTON_A, extractor: "registry.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1976-02-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_HEARING, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    sourceId: SRC_HEARING_76_A, type: "RECORD", status: "PROCESSED",
    title: "Connecticut Hearing Record — May 3, 1976",
    description: "Scheduling and disposition records for the May 3, 1976 Connecticut hearing.",
    artifactIds: [ART_HEARING], observationIds: [OBS_A3],
    entityIds: [ENT_CALLAHAN, ENT_WJA],
    hypothesisIds: [HYP_A1], strength: 0.8,
    posture: "T2_CORROBORATED_LEAD",
    provenance: { sourceId: SRC_HEARING_76_A, extractor: "registry.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1976-05-03", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_BAHAMAS, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    sourceId: SRC_BAHAMAS_A, type: "RECORD", status: "PROCESSED",
    title: "Bahamas Hospitality Record — FBI SAs Dowd and Forrester",
    description: "Record of FBI SAs Dowd and Forrester entertained in the Bahamas by Rico and WJA personnel.",
    artifactIds: [ART_BAHAMAS], observationIds: [OBS_A6],
    entityIds: [ENT_RICO, ENT_WJA],
    hypothesisIds: [HYP_A1], strength: 0.65,
    posture: "T1_INVESTIGATIVE_LEAD",
    provenance: { sourceId: SRC_BAHAMAS_A, extractor: "registry.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1976-03-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Observations (8) ────────────────────────────────────────────────────────

const observationsA = [
  ObservationSchema.parse({
    id: OBS_A1, evidenceId: EVID_JAN76, sourceId: SRC_JAN76_A,
    type: "COMMUNICATION",
    content: "In January 1976 the Connecticut Statewide Organized Crime Task Force (requesting actor: Austin McGuigan) sought federal records concerning World Jai Alai security director John Callahan; the request was met with silence.",
    entityIds: [ENT_A_SOCTF, ENT_CALLAHAN],
    candidateMentions: [],
    strength: 0.75,
    provenance: { sourceId: SRC_JAN76_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-01-15", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A2, evidenceId: EVID_SURV, sourceId: SRC_SURV_BOSTON_A,
    type: "SPATIAL",
    content: "Surveillance recorded Callahan driving to the Boston area on a trip during the probe, where he was observed at a restaurant (identified in reports as Clark's Turn of the Century Cafe) and a motel.",
    entityIds: [ENT_CALLAHAN],
    candidateMentions: ["Clark's Turn of the Century Cafe"],
    strength: 0.7,
    provenance: { sourceId: SRC_SURV_BOSTON_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-02-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A3, evidenceId: EVID_HEARING, sourceId: SRC_HEARING_76_A,
    type: "TEMPORAL",
    content: "WJA and Connecticut scheduling records document that John 'Jack' Callahan's employment with WJA ended before the scheduled 1976-05-03 appearance before Connecticut authorities.",
    entityIds: [ENT_CALLAHAN, ENT_WJA],
    candidateMentions: ["John Callahan"],
    strength: 0.8,
    provenance: { sourceId: SRC_HEARING_76_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-05-03", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A4, evidenceId: EVID_HR_CT, sourceId: SRC_HR_VOL1_A,
    type: "FACTUAL",
    content: "The congressional review records that WJA employed John 'Jack' Callahan as its security director and H. Paul Rico as a security consultant; both men were former FBI agents.",
    entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA],
    candidateMentions: ["Jack Callahan", "H. Paul Rico"],
    strength: 0.85,
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A5, evidenceId: EVID_HR_CT, sourceId: SRC_HR_VOL1_A,
    type: "RELATIONAL",
    content: "Federal authorities became aware in January 1976 of allegations that Callahan engaged in loan sharking with Boston-area (Winter Hill) figures; the information was shared with H. Paul Rico while the Connecticut request was met with silence.",
    entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_FBIBOSTON],
    candidateMentions: ["Winter Hill"],
    strength: 0.8,
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A6, evidenceId: EVID_BAHAMAS, sourceId: SRC_BAHAMAS_A,
    type: "BEHAVIORAL",
    content: "Rico and WJA personnel entertained FBI Special Agents Tom Dowd and Jerry Forrester in the Bahamas with WJA-funded hospitality; Callahan's presence on the trip is not verified.",
    entityIds: [ENT_RICO, ENT_WJA],
    candidateMentions: ["Tom Dowd", "Jerry Forrester"],
    strength: 0.65,
    provenance: { sourceId: SRC_BAHAMAS_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-03-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A8, evidenceId: EVID_HR_CT, sourceId: SRC_SOCTF_A,
    type: "FACTUAL",
    content: "The Connecticut review examined organized-crime allegations in Connecticut, including jai-alai licensing and WJA-connected individuals.",
    entityIds: [ENT_A_SOCTF],
    candidateMentions: [],
    strength: 0.7,
    provenance: { sourceId: SRC_SOCTF_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-01-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_A9, evidenceId: EVID_JAN76, sourceId: SRC_JAN76_A,
    type: "COMMUNICATION",
    content: "McGuigan acted as the requesting actor for the Connecticut request concerning WJA security director Callahan (January 1976).",
    entityIds: [ENT_A_MCGUIGAN, ENT_A_SOCTF],
    candidateMentions: [],
    strength: 0.75,
    provenance: { sourceId: SRC_JAN76_A, extractor: "registry.extractor.v1" },
    observedAt: evt("1976-01-15", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Case-specific entities (2) ──────────────────────────────────────────────

const entitiesACaseSpecific = [
  {
    id: ENT_A_SOCTF, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    canonicalName: "Connecticut Statewide Organized Crime Task Force",
    status: "ACTIVE" as const,
    observationIds: [OBS_A1, OBS_A8, OBS_A9],
    evidenceIds: [EVID_JAN76],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
  {
    id: ENT_A_MCGUIGAN, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
    canonicalName: "Austin McGuigan",
    status: "ACTIVE" as const,
    observationIds: [OBS_A9],
    evidenceIds: [EVID_JAN76],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
];

const allEntitiesA = [...SHARED_ENTITIES, ...entitiesACaseSpecific];

// ── Relations (7) ───────────────────────────────────────────────────────────

const relationsA = [
  RelationHypothesisSchema.parse({
    id: REL_A_WJA_CALLAHAN, sourceEntityId: ENT_WJA, targetEntityId: ENT_CALLAHAN,
    relationType: "organizational", support: 0.85, evidenceBasis: [OBS_A4],
    directed: true, strength: 0.7, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_WJA_RICO, sourceEntityId: ENT_WJA, targetEntityId: ENT_RICO,
    relationType: "organizational", support: 0.8, evidenceBasis: [OBS_A4],
    directed: true, strength: 0.65, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_CALLAHAN_RICO, sourceEntityId: ENT_CALLAHAN, targetEntityId: ENT_RICO,
    relationType: "association", support: 0.6, evidenceBasis: [OBS_A5],
    directed: false, strength: 0.5, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_SOCTF_FBI, sourceEntityId: ENT_A_SOCTF, targetEntityId: ENT_FBIBOSTON,
    relationType: "communication", support: 0.7, evidenceBasis: [OBS_A1, OBS_A5],
    directed: true, strength: 0.55, status: "ACCEPTED",
    provenance: { sourceId: SRC_JAN76_A, extractor: "registry.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_MCGUIGAN_SOCTF, sourceEntityId: ENT_A_MCGUIGAN, targetEntityId: ENT_A_SOCTF,
    relationType: "organizational", support: 0.9, evidenceBasis: [OBS_A9],
    directed: true, strength: 0.75, status: "ACCEPTED",
    provenance: { sourceId: SRC_JAN76_A, extractor: "registry.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_FBI_RICO, sourceEntityId: ENT_FBIBOSTON, targetEntityId: ENT_RICO,
    relationType: "association", support: 0.6, evidenceBasis: [OBS_A5, OBS_A6],
    directed: false, strength: 0.5, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_A_CALLAHAN_FBI, sourceEntityId: ENT_CALLAHAN, targetEntityId: ENT_FBIBOSTON,
    relationType: "association", support: 0.5, evidenceBasis: [OBS_A2],
    directed: false, strength: 0.4, status: "ACCEPTED",
    provenance: { sourceId: SRC_SURV_BOSTON_A, extractor: "registry.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Graph ───────────────────────────────────────────────────────────────────

const graphVersionA = GraphVersionSchema.parse({
  id: GRAPH_VERSION_A, investigationId: INVESTIGATION_A_ID,
  versionNumber: 1, status: "ACTIVE", projectionStatus: "COMPLETE",
  nodeCount: 6, edgeCount: 7,
  createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
});

const graphNodesA = [
  GraphNodeSchema.parse({ id: GN_A_CALLAHAN, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_CALLAHAN, label: "John \"Jack\" Callahan", structuralImportance: 0.9, observationCount: 5, sourceCount: 4, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_A_RICO, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_RICO, label: "H. Paul Rico", structuralImportance: 0.72, observationCount: 3, sourceCount: 2, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_A_WJA, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_WJA, label: "World Jai Alai", structuralImportance: 0.95, observationCount: 4, sourceCount: 4, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_A_FBI, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_FBIBOSTON, label: "FBI Boston Field Office", structuralImportance: 0.75, observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_A_SOCTF, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_A_SOCTF, label: "CT SOCTF", structuralImportance: 0.7, observationCount: 2, sourceCount: 2, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_A_MCGUIGAN, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, type: "ENTITY", entityId: ENT_A_MCGUIGAN, label: "Austin McGuigan", structuralImportance: 0.3, observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
];

const graphEdgesA = [
  GraphEdgeSchema.parse({ id: GE_A_WJA_CALLAHAN, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_WJA, targetNodeId: GN_A_CALLAHAN, relationType: "organizational", relationHypothesisId: REL_A_WJA_CALLAHAN, support: 0.85, structuralImportance: 0.7, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_WJA_RICO, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_WJA, targetNodeId: GN_A_RICO, relationType: "organizational", relationHypothesisId: REL_A_WJA_RICO, support: 0.8, structuralImportance: 0.65, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_CALLAHAN_RICO, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_CALLAHAN, targetNodeId: GN_A_RICO, relationType: "association", relationHypothesisId: REL_A_CALLAHAN_RICO, support: 0.6, structuralImportance: 0.5, directed: false, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_SOCTF_FBI, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_SOCTF, targetNodeId: GN_A_FBI, relationType: "communication", relationHypothesisId: REL_A_SOCTF_FBI, support: 0.7, structuralImportance: 0.55, directed: true, status: "ACTIVE", observationCount: 2, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_MCGUIGAN_SOCTF, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_MCGUIGAN, targetNodeId: GN_A_SOCTF, relationType: "organizational", relationHypothesisId: REL_A_MCGUIGAN_SOCTF, support: 0.9, structuralImportance: 0.35, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_FBI_RICO, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_FBI, targetNodeId: GN_A_RICO, relationType: "association", relationHypothesisId: REL_A_FBI_RICO, support: 0.6, structuralImportance: 0.5, directed: false, status: "ACTIVE", observationCount: 2, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_A_CALLAHAN_FBI, investigationId: INVESTIGATION_A_ID, versionId: GRAPH_VERSION_A, sourceNodeId: GN_A_CALLAHAN, targetNodeId: GN_A_FBI, relationType: "association", relationHypothesisId: REL_A_CALLAHAN_FBI, support: 0.5, structuralImportance: 0.4, directed: false, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
];

// ── Gaps (2) ────────────────────────────────────────────────────────────────

const gapsA = [
  InvestigativeGapSchema.parse({
    id: GAP_A1, investigationId: INVESTIGATION_A_ID, caseId: CASE_A_ID,
    type: "MISSING_EVIDENCE",
    title: "Disposition of January 1976 request",
    description: "Response documents to the January 1976 CT SOCTF request are not located in the ingested corpus.",
    status: "IDENTIFIED", priority: "HIGH", impact: 0.6, expectedInformationValue: 0.7,
    relatedEntityIds: [ENT_A_SOCTF, ENT_CALLAHAN],
    evidenceRequestIds: [EREQ_A1],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  InvestigativeGapSchema.parse({
    id: GAP_A2, investigationId: INVESTIGATION_A_ID, caseId: CASE_A_ID,
    type: "UNRESOLVED_RELATION",
    title: "Scope of Rico's role in WJA (1975-76)",
    description: "The nature and duration of Rico's security consultancy for WJA, and the timing of his interactions with federal authorities, remain unresolved.",
    status: "IDENTIFIED", priority: "MEDIUM", impact: 0.55, expectedInformationValue: 0.6,
    relatedEntityIds: [ENT_RICO, ENT_WJA],
    evidenceRequestIds: [EREQ_A2],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Holes (2) ───────────────────────────────────────────────────────────────

const holesA: GraphHole[] = [
  {
    id: HOLE_A1,
    investigationId: INVESTIGATION_A_ID, caseId: CASE_A_ID, graphVersionId: GRAPH_VERSION_A,
    type: "MISSING_EDGE", investigationGapId: GAP_A1,
    nodeIds: [GN_A_SOCTF, GN_A_FBI], expectedEdgeType: "communication",
    significance: 0.65,
    description: "No edge documents the response (or non-response) to the January 1976 request between CT SOCTF and FBI Boston.",
    suggestedEvidenceTypes: ["federal response letter", "task force routing record"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_A2,
    investigationId: INVESTIGATION_A_ID, caseId: CASE_A_ID, graphVersionId: GRAPH_VERSION_A,
    type: "TEMPORAL_GAP", investigationGapId: GAP_A2,
    nodeIds: [GN_A_RICO, GN_A_WJA], expectedEdgeType: "organizational",
    significance: 0.6,
    description: "The temporal scope of Rico's WJA security consultancy is not bounded by the available evidence.",
    suggestedEvidenceTypes: ["WJA employment records", "contract or payroll document"],
    detectedAt: obs("2024-07-01"),
  },
];

// ── Hypothesis (1) ──────────────────────────────────────────────────────────

const hypothesesA = [
  HypothesisSchema.parse({
    id: HYP_A1, investigationId: INVESTIGATION_A_ID,
    title: "WJA security leadership as organized-crime channel",
    statement: "WJA security leadership in the mid-1970s was a channel by which Boston organized-crime figures could exercise influence over Connecticut jai alai interests.",
    status: "ACTIVE", confidence: 0.38,
    supportingObservationIds: [OBS_A4, OBS_A5],
    contradictingObservationIds: [],
    supportingEvidenceIds: [EVID_HR_CT],
    contradictingEvidenceIds: [],
    relatedEntityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA],
    provenance: {
      entries: [{ sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1", derivedFrom: [OBS_A4, OBS_A5] }],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Leads (2) ───────────────────────────────────────────────────────────────

const leadsA = [
  LeadSchema.parse({
    id: LEAD_A1,
    investigationId: INVESTIGATION_A_ID,
    caseId: CASE_A_ID,
    title: "Pursue disposition of January 1976 request",
    description: "Determine whether the CT SOCTF received any response to the January 1976 federal records request concerning Callahan.",
    status: "NEW",
    priority: "HIGH",
    confidence: 0.5,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [ENT_A_SOCTF, ENT_CALLAHAN],
    supportingObservationIds: [OBS_A1],
    relatedEvidenceIds: [EVID_JAN76],
    gapIds: [GAP_A1],
    provenance: {
      entries: [
        {
          sourceId: SRC_JAN76_A,
          extractor: "registry.extractor.v1",
          derivedFrom: [OBS_A1],
        },
      ],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-07-01"),
    updatedAt: obs("2024-07-01"),
    sourceCandidateType: "MANUAL",
    sourceCandidateKey: "legacy-mock-key",
    sourceCandidateSnapshot: {},
    alternativeExplanations: [],
  }),
  LeadSchema.parse({
    id: LEAD_A2,
    investigationId: INVESTIGATION_A_ID,
    caseId: CASE_A_ID,
    title: "Document scope of Rico's WJA role (1975-76)",
    description: "Establish the nature, timing, and duration of Rico's security consultancy for WJA and his interactions with federal authorities.",
    status: "NEW",
    priority: "MEDIUM",
    confidence: 0.45,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [ENT_RICO, ENT_WJA, ENT_FBIBOSTON],
    supportingObservationIds: [OBS_A4, OBS_A5, OBS_A6],
    relatedEvidenceIds: [EVID_HR_CT, EVID_BAHAMAS],
    gapIds: [GAP_A2],
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_VOL1_A,
          extractor: "govinfo.extractor.v1",
          derivedFrom: [OBS_A4, OBS_A5, OBS_A6],
        },
      ],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-09-01"),
    updatedAt: obs("2024-09-01"),
    sourceCandidateType: "MANUAL",
    sourceCandidateKey: "legacy-mock-key2",
    sourceCandidateSnapshot: {},
    alternativeExplanations: [],
  }),
];

// ── Evidence Requests (2) ───────────────────────────────────────────────────

const evidenceRequestsA = [
  EvidenceRequestSchema.parse({
    id: EREQ_A1, gapId: GAP_A1, hypothesisIds: [HYP_A1],
    evidenceType: "DOCUMENT",
    description: "Request federal response records for the January 1976 CT SOCTF request concerning Callahan.",
    utility: { expectedInformationGain: 0.7, eig: 0.7, relevance: 0.85, feasibility: 0.6, cost: 0.3, score: 0.72 },
    rationale: "Disposition of the request directly addresses the MISSING_EVIDENCE gap.",
    status: "SUBMITTED", resultingEvidenceIds: [],
    createdBy: "analyst.ctsoctf",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceRequestSchema.parse({
    id: EREQ_A2, gapId: GAP_A2, hypothesisIds: [HYP_A1],
    evidenceType: "RECORD",
    description: "Request WJA employment and security records (1975-76) to document Rico's role.",
    utility: { expectedInformationGain: 0.6, eig: 0.6, relevance: 0.75, feasibility: 0.5, cost: 0.4, score: 0.6 },
    rationale: "Employment records would resolve the temporal scope and nature of Rico's consultancy.",
    status: "SUBMITTED", resultingEvidenceIds: [],
    createdBy: "analyst.ctsoctf",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Review Tasks (2) ────────────────────────────────────────────────────────

const reviewTasksA = [
  ReviewTaskSchema.parse({
    id: REVIEW_A1, investigationId: INVESTIGATION_A_ID,
    type: "ENTITY_RESOLUTION_REVIEW", status: "IN_PROGRESS",
    title: "Review Callahan identity resolution (Jack / John)",
    description: "Confirm that 'Jack Callahan' (HR source) and 'John Callahan' (regulatory source) resolve to the same canonical entity.",
    assignedTo: "analyst.ctsoctf",
    relatedEntityIds: [ENT_CALLAHAN],
    relatedEvidenceIds: [EVID_HR_CT, EVID_HEARING],
    reviewComments: [{
      author: "analyst.ctsoctf",
      content: "HR source uses 'Jack'; regulatory filing uses 'John'. Both refer to WJA security director. Recommend ACCEPTED resolution.",
      timestamp: obs("2024-07-01", "14:00"),
      decision: "NEEDS_MORE_INFO",
    }],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ReviewTaskSchema.parse({
    id: REVIEW_A2, investigationId: INVESTIGATION_A_ID,
    type: "QUALITY_ASSURANCE", status: "PENDING",
    title: "QA: January 1976 request evidence",
    description: "Verify provenance chain for the January 1976 request evidence and observation content.",
    relatedEvidenceIds: [EVID_JAN76],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── ER (Entity Resolution) — Jack / John Callahan ───────────────────────────

const emcJack = EntityMentionCandidateSchema.parse({
  id: EMC_A_JACK, observationId: OBS_A4,
  text: "Jack Callahan", start: 53, end: 65,
  entityType: "PERSON", extractionMethod: "PATTERN_MATCH",
  canonicalMatchValue: "jack-callahan",
  provenance: { sourceId: SRC_HR_VOL1_A, extractor: "govinfo.extractor.v1" },
  createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
});

const emcJohn = EntityMentionCandidateSchema.parse({
  id: EMC_A_JOHN, observationId: OBS_A3,
  text: "John Callahan", start: 14, end: 27,
  entityType: "PERSON", extractionMethod: "PATTERN_MATCH",
  canonicalMatchValue: "john-callahan",
  provenance: { sourceId: SRC_HEARING_76_A, extractor: "registry.extractor.v1" },
  createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
});

const pairA1 = CandidatePairSchema.parse({
  id: PAIR_A1, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
  leftCandidateId: EMC_A_JACK, rightCandidateId: EMC_A_JOHN,
  blockingPasses: ["NAME_INITIAL_BLOCK"],
  createdAt: obs("2024-07-01"),
});

const resolutionA1 = CandidateResolutionSchema.parse({
  candidatePairId: PAIR_A1,
  leftCandidateId: EMC_A_JACK, rightCandidateId: EMC_A_JOHN,
  score: 0.82,
  comparisonEvidence: [
    { feature: "NAME", leftValue: "Jack Callahan", rightValue: "John Callahan", relation: "INITIAL_MATCH", weight: 0.6, reason: "Jack is a common diminutive of John; surname identical." },
    { feature: "ROLE", leftValue: "WJA security director", rightValue: "WJA security director", relation: "EXACT_MATCH", weight: 0.7, reason: "Both mentions refer to the WJA security director role." },
    { feature: "TYPE", leftValue: "person", rightValue: "person", relation: "TYPE_COMPATIBLE", weight: 0.1, reason: "Both mentions are typed PERSON." },
  ],
  supportingObservationIds: [OBS_A4, OBS_A3],
  contradictingObservationIds: [],
  comparisonStatus: "RESOLVED_MATCH",
  status: "ACCEPTED",
  scoreModelVersion: "indago:resolution-score:v1",
});

const hypResA1 = EntityHypothesisSchema.parse({
  id: HYP_RES_A1, caseId: CASE_A_ID, investigationId: INVESTIGATION_A_ID,
  candidatePairId: PAIR_A1,
  supportingCandidateIds: [EMC_A_JACK, EMC_A_JOHN],
  comparisonStatus: "RESOLVED_MATCH",
  score: 0.82, scoreModelVersion: "indago:resolution-score:v1",
  supportingObservationIds: [OBS_A4, OBS_A3],
  contradictingObservationIds: [],
  status: "ACCEPTED",
  provenance: { sourceId: SRC_HR_VOL1_A, extractor: "eresolve.comparison.v1" },
  createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
});

export const ENTITY_LINK_BY_CANDIDATE_A: Record<string, string> = {
  [EMC_A_JOHN]: ENT_CALLAHAN,
  [EMC_A_JACK]: ENT_CALLAHAN,
};

// ── Robustness ──────────────────────────────────────────────────────────────

const robustnessA = RobustnessResultSchema.parse({
  hypothesisId: HYP_A1, robustnessScore: 40, confidence: 0.32,
  perturbationCount: 10, stableIterations: 6, unstableIterations: 4,
  sensitiveObservations: [OBS_A4, OBS_A5],
  stableObservations: [OBS_A1, OBS_A2, OBS_A3],
  computedAt: obs("2024-07-01"), computationTimeMs: 850,
});

// ── Cross-Case ──────────────────────────────────────────────────────────────

const crossCaseA = [
  CrossCaseMatchSchema.parse({
    sourceCaseId: CASE_A_ID, targetCaseId: CASE_B_ID,
    sourceEntityId: ENT_CALLAHAN, targetEntityId: ENT_CALLAHAN,
    matchScore: 0.9, sharedEvidenceTypes: ["DOCUMENT", "RECORD", "TESTIMONY"],
    sharedEntityCount: 4,
    investigationIds: [INVESTIGATION_A_ID, INVESTIGATION_B_ID],
    confidence: 0.88, computedAt: obs("2024-07-01"),
  }),
];

// ── Timeline ────────────────────────────────────────────────────────────────

const BAND_OBS = "observations";
const BAND_EVID = "evidence";
const BAND_MILE = "milestones";

function bandItem(bandId: string, id: string, time: string, label: string, opts: { observationId?: string; evidenceId?: string; entityIds?: string[] } = {}) {
  return { id, time, precision: "day" as const, label, bandId, ...opts };
}

const timelineA: InvestigationTimeline = {
  investigationId: INVESTIGATION_A_ID,
  bands: [
    { id: BAND_OBS, label: "Observations", kind: "observation" },
    { id: BAND_EVID, label: "Evidence", kind: "evidence" },
    { id: BAND_MILE, label: "Milestones", kind: "milestone" },
  ],
  items: [
    bandItem(BAND_OBS, "tl-ob-a1", "1976-01-15T12:00:00.000Z", "CT SOCTF requests federal records on Callahan", { observationId: OBS_A1, entityIds: [ENT_A_SOCTF, ENT_CALLAHAN] }),
    bandItem(BAND_OBS, "tl-ob-a9", "1976-01-15T12:00:00.000Z", "McGuigan identified as requesting actor", { observationId: OBS_A9, entityIds: [ENT_A_MCGUIGAN] }),
    bandItem(BAND_OBS, "tl-ob-a2", "1976-02-01T12:00:00.000Z", "Surveillance: Callahan drives to Boston area", { observationId: OBS_A2, entityIds: [ENT_CALLAHAN] }),
    bandItem(BAND_OBS, "tl-ob-a6", "1976-03-01T12:00:00.000Z", "Rico entertains FBI SAs in Bahamas", { observationId: OBS_A6, entityIds: [ENT_RICO, ENT_WJA] }),
    bandItem(BAND_OBS, "tl-ob-a3", "1976-05-03T12:00:00.000Z", "Callahan's WJA employment ends before hearing", { observationId: OBS_A3, entityIds: [ENT_CALLAHAN, ENT_WJA] }),
    bandItem(BAND_OBS, "tl-ob-a4", "1983-01-01T12:00:00.000Z", "HR108-414 documents WJA employment of Callahan and Rico", { observationId: OBS_A4, entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_WJA] }),
    bandItem(BAND_OBS, "tl-ob-a5", "1983-01-01T12:00:00.000Z", "Loan-shark allegations shared with Rico", { observationId: OBS_A5, entityIds: [ENT_CALLAHAN, ENT_RICO, ENT_FBIBOSTON] }),
    bandItem(BAND_EVID, "tl-ev-a1", "1983-01-01T12:00:00.000Z", "HR108-414 Vol 1 extract", { evidenceId: EVID_HR_CT }),
    bandItem(BAND_EVID, "tl-ev-a2", "1976-01-15T12:00:00.000Z", "January 1976 request record", { evidenceId: EVID_JAN76 }),
    bandItem(BAND_MILE, "tl-ms-a1", "2024-07-01T12:00:00.000Z", "Investigation opened", {}),
  ],
};

// ── Foreign Overlay (Tulsa as foreign island) ───────────────────────────────

const foreignOverlaysA: Record<string, { id: string; title: string; summary: string; localTargetMatch: string; bridgeSupport: number; nodes: any[]; edges: any[] }> = {
  "tulsa": {
    id: CASE_B_ID,
    title: "Tulsa — Wheeler (P2 boundary)",
    summary: "Roger Wheeler homicide probe, Tulsa, Oklahoma. Visibility restricted to shared entity bridge.",
    localTargetMatch: "WJA",
    bridgeSupport: 0.9,
    nodes: [
      { id: ENT_CALLAHAN, type: "ENTITY", label: "John \"Jack\" Callahan", isForeign: true, structuralImportance: 0.5 },
      { id: ENT_RICO, type: "ENTITY", label: "H. Paul Rico", isForeign: true, structuralImportance: 0.45 },
      { id: ENT_WJA, type: "ENTITY", label: "World Jai Alai", isForeign: true, structuralImportance: 0.9 },
    ],
    edges: [],
  },
};

// ── Foreign Entity DB ───────────────────────────────────────────────────────

const foreignEntityDbA: Record<string, any> = {};

// ── Assembled Fixture Set ───────────────────────────────────────────────────

export const caseAFixtureSet: DemoFixtureSet = {
  case: caseA,
  investigation: investigationA,
  sources: sourcesA,
  artifacts: artifactsA,
  evidence: evidenceA,
  observations: observationsA,
  entities: allEntitiesA,
  relations: relationsA,
  hypotheses: hypothesesA,
  leads: leadsA,
  gaps: gapsA,
  evidenceRequests: evidenceRequestsA,
  reviewTasks: reviewTasksA,
  graphVersion: graphVersionA,
  graphVersions: [graphVersionA],
  graphNodes: graphNodesA,
  graphEdges: graphEdgesA,
  timeline: timelineA,
  crossCase: crossCaseA,
  robustness: robustnessA,
  events: [],
  candidates: [emcJack, emcJohn],
  candidatePairs: [pairA1],
  resolutions: [resolutionA1],
  entityHypotheses: [hypResA1],
  contradictions: [],
  discoveryCandidates: [],
  graphHoles: holesA,
  foreignCaseOverlays: Object.entries(foreignOverlaysA).map(([ref, m]) => ({
    ref,
    caseId: m.id,
    title: m.title,
    summary: m.summary,
    localTargetMatch: m.localTargetMatch,
    bridgeSupport: m.bridgeSupport,
    nodes: m.nodes as any[],
    edges: m.edges as any[],
  })),
  foreignEntityDb: foreignEntityDbA,
  entityLinkByCandidate: ENTITY_LINK_BY_CANDIDATE_A,
};

export const caseAGraphHoles: GraphHole[] = holesA;
export const caseAForeignOverlays = foreignOverlaysA;
export const caseAForeignEntityDb = foreignEntityDbA;
