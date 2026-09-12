// ============================================================================
// Case B — Tulsa / Roger Wheeler Homicide
//
// Assembles every canonical fixture for the Tulsa PD homicide investigation
// into a DemoFixtureSet-compatible object. All observation content is drawn
// strictly from INDAGO_REAL_CASE_SOURCE_VERIFICATION.md §5 and the cited
// primary sources. No historical invention.
//
// INITIAL_CASE_B vantage: 1981. The crowd sees:
//   • Roger Wheeler Sr. murdered 5/27/1981 at Southern Hills CC, Tulsa
//   • Wheeler = owner of WJA, chairman of Telex Corp.
//   • WJA ownership chain documented in congressional report
//   • Wheeler suspected skimming, fired WJA president, began audit (§III.B.5)
//   • WJA security leadership: Callahan (security director), Rico (consultant)
//   • July 1981 tip to Tulsa/CT re Winter Hill/WJA matter
//   • Boston silo referenced as known-missing (never ingested)
//
// DO_NOT_ENCODE in initial crowd:
//   • Martorano testimony, Bulger/Flemmi/Connolly as entities
//   • Rico→hit-team edge as FACT, motive-as-fact
//   • Any "guilty/proven" statuses
//
// HITMAN convention (later projection): the unidentified gunman is modeled as
//   a node ("The Hitman") with a materialized case-link homicide edge to the
//   victim (Wheeler was shot; the shooter is the established killer) and a
//   MISSING_EDGE gap-hole between Rico and the hitman — the hit-team
//   coordination is explicitly a gap, never an asserted fact.
//
// DENSIFICATION convention: fact-backed actor nodes are added as nodes with
//   materialized edges ONLY where the initial record establishes the fact —
//   WJA→Winter Hill Gang (skim payouts, OBS_B4). Everything the record leaves
//   open stays a GAP-HOLE, never an edge: security↔shooter (HOLE_B4), Winter
//   Hill↔shooter (HOLE_B5), club schedule↔shooter (HOLE_B6), plus the existing
//   Rico↔shooter hole.
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
} from "@indago/contracts";
import type { DemoFixtureSet } from "../demo/demo-fixtures";
import type { GraphHole } from "@indago/contracts";
import type { InvestigationTimeline } from "../types";
import { SHARED_ENTITIES } from "./shared";
import {
  CASE_A_ID,
  CASE_B_ID,
  INVESTIGATION_B_ID,
  SRC_HR_TULSA_B,
  SRC_NEWS_TULSA_B,
  SRC_HR_WJA_B,
  ART_HR_TULSA,
  ART_NEWS_TULSA,
  ART_HR_WJA,
  EVID_HR_TULSA,
  EVID_NEWS_TULSA,
  EVID_HR_WJA,
  OBS_B1,
  OBS_B2,
  OBS_B3,
  OBS_B4,
  OBS_B5,
  OBS_B6,
  OBS_B11,
  OBS_B12,
  ENT_WHEELER,
  ENT_SOUTHERN_HILLS,
  ENT_CALLAHAN,
  ENT_RICO,
  ENT_WJA,
  ENT_FBIBOSTON,
  ENT_HITMAN,
  ENT_WINTER_HILL,
  REL_B_WJA_WHEELER,
  REL_B_WHEELER_SHC,
  REL_B_WJA_CALLAHAN,
  REL_B_WJA_RICO,
  REL_B_HITMAN_WHEELER,
  REL_B_WJA_WINTER_HILL,
  GRAPH_VERSION_B,
  GN_B_CALLAHAN,
  GN_B_RICO,
  GN_B_WJA,
  GN_B_FBI,
  GN_B_WHEELER,
  GN_B_SHC,
  GN_B_HITMAN,
  GN_B_WINTER_HILL,
  GE_B_WJA_CALLAHAN,
  GE_B_WJA_RICO,
  GE_B_WJA_WHEELER,
  GE_B_WHEELER_SHC,
  GE_B_HITMAN_WHEELER,
  GE_B_WJA_WINTER_HILL,
  GAP_B1,
  GAP_B2,
  GAP_B3,
  GAP_B5,
  GAP_B6,
  HOLE_B1,
  HOLE_B2,
  HOLE_B4,
  HOLE_B5,
  HOLE_B6,
  HOLE_B7,
  HYP_B1,
  LEAD_B1,
  LEAD_B2,
  EREQ_B1,
  EREQ_B2,
  EREQ_B3,
  REVIEW_B1,
  REVIEW_B2,
  INVESTIGATION_A_ID,
} from "./lookup";
import { obs, evt } from "./times";

// ── Case ────────────────────────────────────────────────────────────────────

const caseB = CaseSchema.parse({
  id: CASE_B_ID,
  title: "Tulsa Wheeler",
  description:
    "Homicide of Roger Wheeler Sr. at Southern Hills Country Club, Tulsa, Oklahoma, May 27, 1981. Wheeler was owner of World Jai Alai and chairman of Telex Corp.",
  status: "ACTIVE",
  assignedTo: "analyst.tulsa-homicide",
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
  incidentDateRange: {
    validFrom: { value: "1981-05-27T00:00:00.000Z", precision: "day" },
    validTo: { value: "1981-07-31T00:00:00.000Z", precision: "approximate" },
    precision: "range",
    semantics: "observed",
  },
  investigationIds: [INVESTIGATION_B_ID],
  sourceIds: [SRC_HR_TULSA_B, SRC_NEWS_TULSA_B, SRC_HR_WJA_B],
  entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS, ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON, ENT_HITMAN, ENT_WINTER_HILL],
  evidenceIds: [EVID_HR_TULSA, EVID_NEWS_TULSA, EVID_HR_WJA],
  jurisdiction: "Tulsa, Oklahoma, United States",
});

// ── Investigation ───────────────────────────────────────────────────────────

const investigationB = InvestigationSchema.parse({
  id: INVESTIGATION_B_ID,
  caseId: CASE_B_ID,
  title: "Tulsa PD Homicide — Roger Wheeler",
  description:
    "Homicide investigation of Roger Wheeler Sr. at Southern Hills Country Club. Congressional review notes a July 1981 tip linking the murder to Winter Hill / WJA matters; FBI circle stonewalled rather than assisted.",
  status: "ACTIVE",
  priority: "HIGH",
  owner: "analyst.tulsa-homicide",
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
  entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS, ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON, ENT_HITMAN, ENT_WINTER_HILL],
  evidenceIds: [EVID_HR_TULSA, EVID_NEWS_TULSA, EVID_HR_WJA],
  hypothesisIds: [HYP_B1],
  leadIds: [LEAD_B1, LEAD_B2],
  confidence: 0.3,
  temporalScope: {
    validFrom: { value: "1981-05-27T00:00:00.000Z", precision: "day" },
    validTo: { value: "1981-07-31T00:00:00.000Z", precision: "approximate" },
    precision: "range",
    semantics: "observed",
  },
});

// ── Sources (3) ─────────────────────────────────────────────────────────────

const sourcesB = [
  SourceSchema.parse({
    id: SRC_HR_TULSA_B, caseId: CASE_B_ID,
    name: "HR108-414 Vol 1 — Tulsa / Wheeler Homicide",
    type: "EXTERNAL_SYSTEM", status: "ACTIVE", systemOrigin: "govinfo.extractor.v1",
    evidenceIds: [EVID_HR_TULSA],
    recordCount: 2,
    description: "Senate committee report §III.B.5 pp.93-94 and Investigative Chronology entries (1981-82) on Wheeler murder and aftermath.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_NEWS_TULSA_B, caseId: CASE_B_ID,
    name: "Tulsa World / Local News Coverage — Wheeler Murder (1981)",
    type: "EXTERNAL_SYSTEM", status: "ACTIVE", systemOrigin: "news.extractor.v1",
    evidenceIds: [EVID_NEWS_TULSA],
    recordCount: 3,
    description: "Local Tulsa news coverage of the Wheeler homicide at Southern Hills Country Club.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  SourceSchema.parse({
    id: SRC_HR_WJA_B, caseId: CASE_B_ID,
    name: "HR108-414 Vol 1 — WJA Ownership & Structure",
    type: "EXTERNAL_SYSTEM", status: "ACTIVE", systemOrigin: "govinfo.extractor.v1",
    evidenceIds: [EVID_HR_WJA],
    recordCount: 2,
    description: "Senate committee report on World Jai Alai ownership chain and Wheeler's role.",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Artifacts (3) ───────────────────────────────────────────────────────────

const artifactsB = [
  ArtifactSchema.parse({
    id: ART_HR_TULSA, evidenceId: EVID_HR_TULSA, sourceId: SRC_HR_TULSA_B,
    type: "DOCUMENT", filename: "hr108-414-vol1-tulsa-wheeler-extract.pdf",
    mimeType: "application/pdf", sizeBytes: 18200,
    hash: "sha256:hr108-414-vol1-tulsa-extract",
    storagePath: "ingest/hr108-414/vol1-tulsa-extract.pdf",
    extractedText: "HR108-414 Vol 1, §III.B.5 pp.93-94 — Wheeler murder at Southern Hills CC, Tulsa, 5/27/1981. Chronology entries 5-27-81, 7-81.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_NEWS_TULSA, evidenceId: EVID_NEWS_TULSA, sourceId: SRC_NEWS_TULSA_B,
    type: "DOCUMENT", filename: "tulsa-news-1981-wheeler-murder-extract.txt",
    mimeType: "text/plain", sizeBytes: 2400,
    hash: "sha256:tulsa-news-1981-extract",
    storagePath: "ingest/tulsa-news/wheeler-murder-1981.txt",
    extractedText: "Tulsa news reports: Roger Wheeler Sr., 55, chairman of Telex Corp. and owner of World Jai Alai, shot point-blank in the head at Southern Hills Country Club after a round of golf, May 27, 1981.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
  ArtifactSchema.parse({
    id: ART_HR_WJA, evidenceId: EVID_HR_WJA, sourceId: SRC_HR_WJA_B,
    type: "DOCUMENT", filename: "hr108-414-vol1-wja-ownership-extract.pdf",
    mimeType: "application/pdf", sizeBytes: 15800,
    hash: "sha256:hr108-414-vol1-wja-ownership",
    storagePath: "ingest/hr108-414/vol1-wja-ownership-extract.pdf",
    extractedText: "HR108-414 Vol 1 — WJA ownership: Wheeler = owner of World Jai Alai, chairman of Telex Corp.",
    createdAt: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    updatedAt: obs("2024-07-01"),
  }),
];

// ── Evidence (3) ────────────────────────────────────────────────────────────

const evidenceB = [
  EvidenceSchema.parse({
    id: EVID_HR_TULSA, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    sourceId: SRC_HR_TULSA_B, type: "DOCUMENT", status: "VERIFIED",
    title: "HR108-414 Vol 1 — Wheeler Homicide (§III.B.5)",
    description: "Senate committee report excerpt documenting the Wheeler murder and related chronology entries.",
    artifactIds: [ART_HR_TULSA], observationIds: [OBS_B1, OBS_B4, OBS_B6],
    entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    hypothesisIds: [HYP_B1], strength: 0.85,
    posture: "T3_EVIDENCE_PACKAGE_CANDIDATE",
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1981-05-27", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_NEWS_TULSA, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    sourceId: SRC_NEWS_TULSA_B, type: "RECORD", status: "PROCESSED",
    title: "Tulsa News Coverage — Wheeler Murder (May 1981)",
    description: "Local Tulsa news reports on the homicide of Roger Wheeler at Southern Hills Country Club.",
    artifactIds: [ART_NEWS_TULSA], observationIds: [OBS_B2],
    entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    hypothesisIds: [], strength: 0.75,
    posture: "T2_CORROBORATED_LEAD",
    provenance: { sourceId: SRC_NEWS_TULSA_B, extractor: "news.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1981-05-27", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceSchema.parse({
    id: EVID_HR_WJA, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    sourceId: SRC_HR_WJA_B, type: "DOCUMENT", status: "VERIFIED",
    title: "HR108-414 Vol 1 — WJA Ownership Chain",
    description: "Senate committee report documenting World Jai Alai ownership: Wheeler = owner, Telex Corp. chairman.",
    artifactIds: [ART_HR_WJA], observationIds: [OBS_B3],
    entityIds: [ENT_WHEELER, ENT_WJA],
    hypothesisIds: [], strength: 0.8,
    posture: "T2_CORROBORATED_LEAD",
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    ingestionTime: { value: "2024-07-01T09:00:00.000Z", precision: "exact" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Observations (8) ────────────────────────────────────────────────────────

const observationsB = [
  ObservationSchema.parse({
    id: OBS_B1, evidenceId: EVID_HR_TULSA, sourceId: SRC_HR_TULSA_B,
    type: "FACTUAL",
    content: "Roger Wheeler, Sr., owner of World Jai Alai, is shot dead at Southern Hills Country Club in Tulsa, Oklahoma on May 27, 1981.",
    entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    candidateMentions: [],
    strength: 0.85,
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1981-05-27", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B2, evidenceId: EVID_NEWS_TULSA, sourceId: SRC_NEWS_TULSA_B,
    type: "FACTUAL",
    content: "Roger Wheeler, Sr., 55, chairman of Telex Corp. and owner of World Jai Alai, shot point-blank in the head as he got in his car after a round of golf at Southern Hills Country Club.",
    entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    candidateMentions: [],
    strength: 0.75,
    provenance: { sourceId: SRC_NEWS_TULSA_B, extractor: "news.extractor.v1" },
    observedAt: evt("1981-05-28", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B3, evidenceId: EVID_HR_WJA, sourceId: SRC_HR_WJA_B,
    type: "RELATIONAL",
    content: "The congressional report documents Roger Wheeler as the owner of World Jai Alai and chairman of Telex Corp.",
    entityIds: [ENT_WHEELER, ENT_WJA],
    candidateMentions: ["World Jai Alai", "Telex Corp."],
    strength: 0.8,
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B4, evidenceId: EVID_HR_TULSA, sourceId: SRC_HR_TULSA_B,
    type: "BEHAVIORAL",
    content: "The congressional report states that Wheeler came to suspect the president of World Jai Alai of skimming money from the company for Winter Hill Gang members; Wheeler fired the president and began a company-wide audit. Shortly thereafter, Wheeler was murdered.",
    entityIds: [ENT_WHEELER, ENT_WJA],
    candidateMentions: ["Winter Hill Gang"],
    strength: 0.7,
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B5, evidenceId: EVID_HR_WJA, sourceId: SRC_HR_WJA_B,
    type: "RELATIONAL",
    content: "The congressional review records that WJA employed John 'Jack' Callahan as its security director and H. Paul Rico as a security consultant; both men were former FBI agents.",
    entityIds: [ENT_WJA, ENT_CALLAHAN, ENT_RICO],
    candidateMentions: ["Jack Callahan", "H. Paul Rico"],
    strength: 0.8,
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B6, evidenceId: EVID_HR_TULSA, sourceId: SRC_HR_TULSA_B,
    type: "FACTUAL",
    content: "In July 1981 a tip reached Tulsa and Connecticut investigators that the Wheeler murder was a Winter Hill / WJA matter, and the FBI circle stonewalled rather than assisted.",
    entityIds: [ENT_WJA, ENT_FBIBOSTON],
    candidateMentions: [],
    strength: 0.65,
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1981-07-01", "approximate"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B11, evidenceId: EVID_HR_WJA, sourceId: SRC_HR_WJA_B,
    type: "COMMUNICATION",
    content: "The congressional review records H. Paul Rico coordinating World Jai Alai protection coverage with John 'Jack' Callahan, the consultant and the function's director operating on the same scope.",
    entityIds: [ENT_RICO, ENT_CALLAHAN],
    candidateMentions: ["H. Paul Rico", "Jack Callahan"],
    strength: 0.6,
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ObservationSchema.parse({
    id: OBS_B12, evidenceId: EVID_HR_WJA, sourceId: SRC_HR_WJA_B,
    type: "FINANCIAL",
    content: "The congressional review records the World Jai Alai consulting retainer for H. Paul Rico in its internal payroll — compensation tied to his retained consultant role.",
    entityIds: [ENT_RICO],
    candidateMentions: [],
    strength: 0.6,
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    observedAt: evt("1983-01-01", "day"),
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Case-specific entities (6) ──────────────────────────────────────────────

const entitiesBCaseSpecific = [
  {
    id: ENT_WHEELER, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    canonicalName: "Roger Wheeler, Sr.",
    status: "ACTIVE" as const,
    observationIds: [OBS_B1, OBS_B2, OBS_B3, OBS_B4],
    evidenceIds: [EVID_HR_TULSA, EVID_NEWS_TULSA, EVID_HR_WJA],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
  {
    id: ENT_SOUTHERN_HILLS, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    canonicalName: "Southern Hills Country Club",
    status: "ACTIVE" as const,
    observationIds: [OBS_B1, OBS_B2],
    evidenceIds: [EVID_HR_TULSA, EVID_NEWS_TULSA],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
  {
    id: ENT_HITMAN, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    canonicalName: "The Hitman",
    status: "ACTIVE" as const,
    observationIds: [], evidenceIds: [],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
  {
    id: ENT_WINTER_HILL, caseId: CASE_B_ID, investigationId: INVESTIGATION_B_ID,
    canonicalName: "Winter Hill Gang",
    status: "ACTIVE" as const,
    observationIds: [], evidenceIds: [],
    hypothesisIds: [], roleHypothesisIds: [],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  },
];

const allEntitiesB = [...SHARED_ENTITIES, ...entitiesBCaseSpecific];

// ── Relations (6) ───────────────────────────────────────────────────────────

const relationsB = [
  RelationHypothesisSchema.parse({
    id: REL_B_WJA_WHEELER, sourceEntityId: ENT_WHEELER, targetEntityId: ENT_WJA,
    relationType: "ownership", support: 0.85, evidenceBasis: [OBS_B3],
    directed: true, strength: 0.8, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_B_WHEELER_SHC, sourceEntityId: ENT_WHEELER, targetEntityId: ENT_SOUTHERN_HILLS,
    relationType: "co-location", support: 0.9, evidenceBasis: [OBS_B1, OBS_B2],
    directed: false, strength: 0.85, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_B_WJA_CALLAHAN, sourceEntityId: ENT_WJA, targetEntityId: ENT_CALLAHAN,
    relationType: "organizational", support: 0.8, evidenceBasis: [OBS_B5],
    directed: true, strength: 0.7, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_B_WJA_RICO, sourceEntityId: ENT_WJA, targetEntityId: ENT_RICO,
    relationType: "organizational", support: 0.75, evidenceBasis: [OBS_B5],
    directed: true, strength: 0.65, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_WJA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_B_HITMAN_WHEELER, sourceEntityId: ENT_HITMAN, targetEntityId: ENT_WHEELER,
    relationType: "case-link", support: 0.9, evidenceBasis: [OBS_B1, OBS_B2],
    directed: true, strength: 0.95, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  RelationHypothesisSchema.parse({
    id: REL_B_WJA_WINTER_HILL, sourceEntityId: ENT_WJA, targetEntityId: ENT_WINTER_HILL,
    relationType: "financial", support: 0.7, evidenceBasis: [OBS_B4],
    directed: true, strength: 0.6, status: "ACCEPTED",
    provenance: { sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1" },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Graph ───────────────────────────────────────────────────────────────────

const graphVersionB = GraphVersionSchema.parse({
  id: GRAPH_VERSION_B, investigationId: INVESTIGATION_B_ID,
  versionNumber: 1, status: "ACTIVE", projectionStatus: "COMPLETE",
  nodeCount: 8, edgeCount: 6,
  createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
});

// FBI Boston is ISOLATED — no edges. This reflects the known-missing Boston
// silo: the congressional report references FBI stonewalling but provides no
// direct structural link to the Tulsa graph beyond the reference.
const graphNodesB = [
  GraphNodeSchema.parse({ id: GN_B_CALLAHAN, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_CALLAHAN, label: "John \"Jack\" Callahan", structuralImportance: 0.7, observationCount: 2, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_RICO, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_RICO, label: "H. Paul Rico", structuralImportance: 0.65, observationCount: 3, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_WJA, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_WJA, label: "World Jai Alai", structuralImportance: 0.9, observationCount: 3, sourceCount: 2, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_FBI, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_FBIBOSTON, label: "FBI Boston Field Office", structuralImportance: 0.5, observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_WHEELER, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_WHEELER, label: "Roger Wheeler, Sr.", structuralImportance: 0.85, observationCount: 4, sourceCount: 3, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_SHC, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_SOUTHERN_HILLS, label: "Southern Hills Country Club", structuralImportance: 0.4, observationCount: 2, sourceCount: 2, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_HITMAN, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_HITMAN, label: "The Hitman", structuralImportance: 0.6, observationCount: 0, sourceCount: 0, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphNodeSchema.parse({ id: GN_B_WINTER_HILL, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, type: "ENTITY", entityId: ENT_WINTER_HILL, label: "Winter Hill Gang", structuralImportance: 0.5, observationCount: 0, sourceCount: 0, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
];

const graphEdgesB = [
  GraphEdgeSchema.parse({ id: GE_B_WJA_CALLAHAN, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_WJA, targetNodeId: GN_B_CALLAHAN, relationType: "organizational", relationHypothesisId: REL_B_WJA_CALLAHAN, support: 0.8, structuralImportance: 0.6, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_B_WJA_RICO, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_WJA, targetNodeId: GN_B_RICO, relationType: "organizational", relationHypothesisId: REL_B_WJA_RICO, support: 0.75, structuralImportance: 0.55, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_B_WJA_WHEELER, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_WJA, targetNodeId: GN_B_WHEELER, relationType: "ownership", relationHypothesisId: REL_B_WJA_WHEELER, support: 0.85, structuralImportance: 0.7, directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_B_WHEELER_SHC, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_WHEELER, targetNodeId: GN_B_SHC, relationType: "co-location", relationHypothesisId: REL_B_WHEELER_SHC, support: 0.9, structuralImportance: 0.4, directed: false, status: "ACTIVE", observationCount: 2, sourceCount: 2, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_B_HITMAN_WHEELER, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_HITMAN, targetNodeId: GN_B_WHEELER, relationType: "case-link", relationHypothesisId: REL_B_HITMAN_WHEELER, support: 0.9, structuralImportance: 0.75, directed: true, status: "ACTIVE", observationCount: 0, sourceCount: 0, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
  GraphEdgeSchema.parse({ id: GE_B_WJA_WINTER_HILL, investigationId: INVESTIGATION_B_ID, versionId: GRAPH_VERSION_B, sourceNodeId: GN_B_WJA, targetNodeId: GN_B_WINTER_HILL, relationType: "financial", relationHypothesisId: REL_B_WJA_WINTER_HILL, support: 0.7, structuralImportance: 0.6, directed: true, status: "ACTIVE", observationCount: 0, sourceCount: 0, createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01") }),
];

// ── Gaps (3) ────────────────────────────────────────────────────────────────

const gapsB = [
  InvestigativeGapSchema.parse({
    id: GAP_B1, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    type: "MISSING_EVIDENCE",
    title: "Responsible party for Wheeler murder",
    description: "The identity of the person(s) who carried out the Wheeler murder is not established by the initial evidence. The July 1981 tip references a Winter Hill / WJA connection but names no responsible party.",
    status: "IDENTIFIED", priority: "HIGH", impact: 0.7, expectedInformationValue: 0.8,
    relatedEntityIds: [ENT_WHEELER, ENT_WJA],
    evidenceRequestIds: [EREQ_B1],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  InvestigativeGapSchema.parse({
    id: GAP_B2, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    type: "UNRESOLVED_RELATION",
    title: "Schedule knowledge — who knew Wheeler's golf schedule",
    description: "Wheeler was shot as he got in his car after golf, implying the assailant knew his schedule. The source of that knowledge is unresolved.",
    status: "IDENTIFIED", priority: "HIGH", impact: 0.65, expectedInformationValue: 0.7,
    relatedEntityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    evidenceRequestIds: [EREQ_B2],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  InvestigativeGapSchema.parse({
    id: GAP_B3, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    type: "MISSING_EVIDENCE",
    title: "WJA audit / financial records",
    description: "The congressional report states Wheeler began a company-wide audit of WJA before his murder. The audit documents themselves are not publicly available and remain a research requirement.",
    status: "IDENTIFIED", priority: "MEDIUM", impact: 0.6, expectedInformationValue: 0.65,
    relatedEntityIds: [ENT_WHEELER, ENT_WJA],
    evidenceRequestIds: [EREQ_B3],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  InvestigativeGapSchema.parse({
    id: GAP_B5, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    type: "UNRESOLVED_RELATION",
    title: "Suspected link between WJA security and the murder",
    description: "Callahan was the security director and Rico the retained security consultant, the two men who ran the security function inside the organization Wheeler owned. It is hypothesized — not established — that one or both were connected to the people who killed Wheeler: sourced, scheduled, or shielded the shooter. No record yet links them to the murder, and this gap demands more evidence to confirm or rule out that hidden security-to-shooter connection.",
    status: "IDENTIFIED", priority: "HIGH", impact: 0.75, expectedInformationValue: 0.8,
    relatedEntityIds: [ENT_CALLAHAN, ENT_RICO, ENT_HITMAN, ENT_WHEELER],
    evidenceRequestIds: [EREQ_B1],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  InvestigativeGapSchema.parse({
    id: GAP_B6, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    type: "UNRESOLVED_RELATION",
    title: "Winter Hill Gang and the gunman",
    description: "The July 1981 tip ties the murder to a Winter Hill / WJA matter and OBS_B4 documents skim payouts to Winter Hill members, but no link between the gang and the unidentified shooter is established.",
    status: "IDENTIFIED", priority: "HIGH", impact: 0.7, expectedInformationValue: 0.75,
    relatedEntityIds: [ENT_WINTER_HILL, ENT_HITMAN],
    evidenceRequestIds: [EREQ_B1],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Holes (5) ───────────────────────────────────────────────────────────────

const holesB: GraphHole[] = [
  {
    id: HOLE_B1,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE", investigationGapId: GAP_B1,
    nodeIds: [GN_B_WHEELER], expectedEdgeType: "case-link",
    significance: 0.8,
    description: "No edge connects Wheeler to a responsible party. The graph shows the victim and organizational context but no assailant.",
    suggestedEvidenceTypes: ["surveillance testimony", "confession", "forensic linkage"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_B2,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "TEMPORAL_GAP", investigationGapId: GAP_B2,
    nodeIds: [GN_B_FBI], expectedEdgeType: "communication",
    significance: 0.6,
    description: "FBI Boston is an isolated node with no edges. The congressional report references FBI stonewalling but provides no structural link to the Tulsa investigation.",
    suggestedEvidenceTypes: ["FBI cooperation records", "inter-agency communication"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_B7,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE", investigationGapId: GAP_B1,
    nodeIds: [GN_B_RICO, GN_B_HITMAN], expectedEdgeType: "case-link",
    significance: 0.7,
    description: "No edge connects H. Paul Rico to the unidentified hitman. Whether Rico arranged or coordinated the gunman who killed Wheeler is the unestablished link between the operation and the shooter.",
    suggestedEvidenceTypes: ["homicide investigation records", "witness testimony", "confession"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_B4,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE", investigationGapId: GAP_B5,
    nodeIds: [GN_B_CALLAHAN, GN_B_HITMAN], expectedEdgeType: "case-link",
    significance: 0.72,
    description: "No edge connects WJA security director Jack Callahan to the unidentified hitman — the security-and-murder link the demo narrative raises: whether the security apparatus sourced, scheduled, or shielded the people who killed Wheeler.",
    suggestedEvidenceTypes: ["employment records", "travel and activity records", "witness testimony"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_B5,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE", investigationGapId: GAP_B6,
    nodeIds: [GN_B_WINTER_HILL, GN_B_HITMAN], expectedEdgeType: "case-link",
    significance: 0.68,
    description: "No edge connects Winter Hill Gang to the unidentified hitman. The July 1981 tip ties the murder to a Winter Hill / WJA matter, but the gang↔shooter link is unestablished.",
    suggestedEvidenceTypes: ["homicide investigation records", "confession", "witness testimony"],
    detectedAt: obs("2024-07-01"),
  },
  {
    id: HOLE_B6,
    investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE", investigationGapId: GAP_B2,
    nodeIds: [GN_B_SHC, GN_B_HITMAN], expectedEdgeType: "case-link",
    significance: 0.66,
    description: "No edge connects Southern Hills Country Club (the scheduling context) to the shooter. Who at the club or in the security orbit knew Wheeler's golf schedule the gunman relied on is unresolved.",
    suggestedEvidenceTypes: ["membership and schedule records", "witness testimony"],
    detectedAt: obs("2024-07-01"),
  },
];

// ── Hypothesis (1) ──────────────────────────────────────────────────────────

const hypothesesB = [
  HypothesisSchema.parse({
    id: HYP_B1, investigationId: INVESTIGATION_B_ID,
    title: "Insider schedule knowledge",
    statement: "The precision of the attack (Wheeler shot as he entered his car after golf) implies that the assailant had advance knowledge of Wheeler's schedule, likely from inside the WJA organization.",
    status: "DRAFT", confidence: 0.3,
    supportingObservationIds: [OBS_B1, OBS_B2, OBS_B4],
    contradictingObservationIds: [],
    supportingEvidenceIds: [EVID_HR_TULSA],
    contradictingEvidenceIds: [],
    relatedEntityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS, ENT_WJA],
    provenance: {
      entries: [{ sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1", derivedFrom: [OBS_B1, OBS_B2] }],
      createdAt: obs("2024-07-01"),
    },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Leads (2) ───────────────────────────────────────────────────────────────

const leadsB = [
  LeadSchema.parse({
    id: LEAD_B1, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    title: "Investigate schedule knowledge source",
    description: "Determine who had access to Wheeler's golf schedule at Southern Hills CC, focusing on WJA personnel and club staff.",
    status: "NEW", priority: "HIGH", confidence: 0.4,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS, ENT_WJA],
    supportingObservationIds: [OBS_B1, OBS_B2],
    relatedEvidenceIds: [EVID_HR_TULSA],
    gapIds: [GAP_B2],
    provenance: { entries: [{ sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1", derivedFrom: [OBS_B1, OBS_B2] }], createdAt: obs("2024-07-01") },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  LeadSchema.parse({
    id: LEAD_B2, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID,
    title: "Obtain WJA audit / financial records",
    description: "Locate the WJA company-wide audit documents referenced in the congressional report. Wheeler initiated the audit before his murder.",
    status: "NEW", priority: "MEDIUM", confidence: 0.35,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [ENT_WHEELER, ENT_WJA],
    supportingObservationIds: [OBS_B4],
    relatedEvidenceIds: [EVID_HR_TULSA],
    gapIds: [GAP_B3],
    provenance: { entries: [{ sourceId: SRC_HR_TULSA_B, extractor: "govinfo.extractor.v1", derivedFrom: [OBS_B4] }], createdAt: obs("2024-07-01") },
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Evidence Requests (3) ───────────────────────────────────────────────────

const evidenceRequestsB = [
  EvidenceRequestSchema.parse({
    id: EREQ_B1, gapId: GAP_B1, hypothesisIds: [HYP_B1],
    evidenceType: "TESTIMONY",
    description: "Request witness testimony or forensic evidence linking a responsible party to the Wheeler murder.",
    utility: { expectedInformationGain: 0.8, eig: 0.8, relevance: 0.9, feasibility: 0.4, cost: 0.5, score: 0.7 },
    rationale: "Direct identification of the responsible party would resolve the primary investigative gap.",
    status: "SUBMITTED", resultingEvidenceIds: [],
    createdBy: "analyst.tulsa-homicide",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceRequestSchema.parse({
    id: EREQ_B2, gapId: GAP_B2, hypothesisIds: [HYP_B1],
    evidenceType: "RECORD",
    description: "Request WJA personnel records and Southern Hills CC membership/schedule records to identify who had knowledge of Wheeler's golf schedule.",
    utility: { expectedInformationGain: 0.65, eig: 0.65, relevance: 0.75, feasibility: 0.5, cost: 0.3, score: 0.6 },
    rationale: "Schedule knowledge is a prerequisite for the precision of the attack.",
    status: "SUBMITTED", resultingEvidenceIds: [],
    createdBy: "analyst.tulsa-homicide",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  EvidenceRequestSchema.parse({
    id: EREQ_B3, gapId: GAP_B3, hypothesisIds: [],
    evidenceType: "DOCUMENT",
    description: "Request WJA audit and financial records from corporate archives or CT Special Revenue files.",
    utility: { expectedInformationGain: 0.55, eig: 0.55, relevance: 0.6, feasibility: 0.35, cost: 0.4, score: 0.5 },
    rationale: "The audit records may provide context for the skimming allegations and motive.",
    status: "SUBMITTED", resultingEvidenceIds: [],
    createdBy: "analyst.tulsa-homicide",
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Review Tasks (2) ────────────────────────────────────────────────────────

const reviewTasksB = [
  ReviewTaskSchema.parse({
    id: REVIEW_B1, investigationId: INVESTIGATION_B_ID,
    type: "QUALITY_ASSURANCE", status: "IN_PROGRESS",
    title: "QA: Wheeler murder evidence chain",
    description: "Verify provenance chain for the Wheeler murder observation content and ensure no post-1981 information has leaked into the initial crowd.",
    relatedEvidenceIds: [EVID_HR_TULSA, EVID_NEWS_TULSA],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
  ReviewTaskSchema.parse({
    id: REVIEW_B2, investigationId: INVESTIGATION_B_ID,
    type: "HYPOTHESIS_REVIEW", status: "PENDING",
    title: "Review: insider schedule knowledge hypothesis",
    description: "Assess whether the insider schedule knowledge hypothesis is sufficiently grounded in the initial evidence or requires additional corroboration.",
    relatedEntityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS],
    createdAt: obs("2024-07-01"), updatedAt: obs("2024-07-01"),
  }),
];

// ── Robustness ──────────────────────────────────────────────────────────────

const robustnessB = RobustnessResultSchema.parse({
  hypothesisId: HYP_B1, robustnessScore: 35, confidence: 0.25,
  perturbationCount: 8, stableIterations: 3, unstableIterations: 5,
  sensitiveObservations: [OBS_B1, OBS_B2],
  stableObservations: [OBS_B3, OBS_B5],
  computedAt: obs("2024-07-01"), computationTimeMs: 720,
});

// ── Cross-Case ──────────────────────────────────────────────────────────────

const crossCaseB = [
  CrossCaseMatchSchema.parse({
    sourceCaseId: CASE_B_ID, targetCaseId: CASE_A_ID,
    sourceEntityId: ENT_CALLAHAN, targetEntityId: ENT_CALLAHAN,
    matchScore: 0.9, sharedEvidenceTypes: ["DOCUMENT", "RECORD"],
    sharedEntityCount: 4,
    investigationIds: [INVESTIGATION_B_ID, INVESTIGATION_A_ID],
    confidence: 0.88, computedAt: obs("2024-07-01"),
  }),
];

// ── Timeline ────────────────────────────────────────────────────────────────

const BAND_OBS = "observations";
const BAND_EVID = "evidence";
const BAND_MILE = "milestones";

function bandItem(bandId: string, id: string, time: string, label: string, opts: { observationId?: string; evidenceId?: string; entityIds?: string[]; precision?: "exact" | "day" | "month" | "unknown" } = {}) {
  const { precision, ...rest } = opts;
  return { id, time, precision: precision ?? ("day" as const), label, bandId, ...rest };
}

const timelineB: InvestigationTimeline = {
  investigationId: INVESTIGATION_B_ID,
  bands: [
    { id: BAND_OBS, label: "Observations", kind: "observation" },
    { id: BAND_EVID, label: "Evidence", kind: "evidence" },
    { id: BAND_MILE, label: "Milestones", kind: "milestone" },
  ],
  items: [
    bandItem(BAND_OBS, "tl-ob-b1", "1981-05-27T12:00:00.000Z", "Wheeler murdered at Southern Hills CC, Tulsa", { observationId: OBS_B1, entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS] }),
    bandItem(BAND_OBS, "tl-ob-b2", "1981-05-28T12:00:00.000Z", "Tulsa news: Wheeler shot in head after golf", { observationId: OBS_B2, entityIds: [ENT_WHEELER, ENT_SOUTHERN_HILLS] }),
    bandItem(BAND_OBS, "tl-ob-b6", "1981-07-01T12:00:00.000Z", "Tip to Tulsa/CT: Winter Hill / WJA matter", { observationId: OBS_B6, entityIds: [ENT_WJA, ENT_FBIBOSTON] }),
    bandItem(BAND_OBS, "tl-ob-b3", "1983-01-01T12:00:00.000Z", "HR documents Wheeler as WJA owner / Telex chairman", { observationId: OBS_B3, entityIds: [ENT_WHEELER, ENT_WJA] }),
    bandItem(BAND_OBS, "tl-ob-b4", "1983-01-01T12:00:00.000Z", "HR: Wheeler suspected skimming, fired president, began audit", { observationId: OBS_B4, entityIds: [ENT_WHEELER, ENT_WJA] }),
    bandItem(BAND_OBS, "tl-ob-b5", "1983-01-01T12:00:00.000Z", "HR: Callahan = WJA security director, Rico = consultant", { observationId: OBS_B5, entityIds: [ENT_WJA, ENT_CALLAHAN, ENT_RICO] }),
    bandItem(BAND_OBS, "tl-ob-b11", "1983-01-01T12:00:00.000Z", "HR: Rico coordinating WJA protection coverage with Callahan", { observationId: OBS_B11, entityIds: [ENT_RICO, ENT_CALLAHAN] }),
    bandItem(BAND_OBS, "tl-ob-b12", "1983-01-01T12:00:00.000Z", "HR: WJA consulting retainer for Rico in internal payroll", { observationId: OBS_B12, entityIds: [ENT_RICO] }),
    bandItem(BAND_EVID, "tl-ev-b1", "1983-01-01T12:00:00.000Z", "HR108-414 Vol 1 extract (Tulsa)", { evidenceId: EVID_HR_TULSA }),
    bandItem(BAND_EVID, "tl-ev-b2", "1981-05-28T12:00:00.000Z", "Tulsa news extract", { evidenceId: EVID_NEWS_TULSA }),
    bandItem(BAND_EVID, "tl-ev-b3", "1983-01-01T12:00:00.000Z", "HR108-414 Vol 1 extract (WJA ownership)", { evidenceId: EVID_HR_WJA }),
    bandItem(BAND_MILE, "tl-ms-b2", "1980-06-01T12:00:00.000Z", "Wheeler suspected WJA skimming: fired WJA president, began company-wide audit", { precision: "month", entityIds: [ENT_WHEELER, ENT_WJA] }),
    bandItem(BAND_MILE, "tl-ms-b3", "1981-03-01T12:00:00.000Z", "Wheeler moves to sell the Hartford fronton", { precision: "month", entityIds: [ENT_WHEELER, ENT_WJA] }),
    bandItem(BAND_MILE, "tl-ms-b6", "1978-01-01T12:00:00.000Z", "Wheeler (as Telex Corp. chairman) acquires World Jai Alai", { precision: "month", entityIds: [ENT_WHEELER, ENT_WJA] }),
    bandItem(BAND_MILE, "tl-ms-b7", "1979-06-01T12:00:00.000Z", "Rico retained as WJA security consultant (former FBI agent)", { precision: "month", entityIds: [ENT_RICO, ENT_WJA] }),
    bandItem(BAND_MILE, "tl-ms-b8", "1981-05-28T12:00:00.000Z", "WJA security team (Rico, Callahan) recalled after the Wheeler killing", { entityIds: [ENT_RICO, ENT_CALLAHAN, ENT_WJA] }),
    bandItem(BAND_MILE, "tl-ms-b9", "1981-07-01T12:00:00.000Z", "Rico surfaces to Tulsa/CT investigators — WJA security consultant in the Winter Hill / WJA tip scope", { precision: "month", entityIds: [ENT_RICO, ENT_WJA, ENT_WINTER_HILL] }),
    bandItem(BAND_MILE, "tl-ms-b10", "1983-01-01T12:00:00.000Z", "HR records Rico as WJA security consultant (former FBI agent)", { entityIds: [ENT_RICO, ENT_WJA, ENT_CALLAHAN] }),
    bandItem(BAND_MILE, "tl-ms-b4", "2024-07-01T09:00:00.000Z", "Phase-1 cross-case analysis started (CT ↔ Tulsa)", { precision: "exact", entityIds: [ENT_WJA, ENT_FBIBOSTON] }),
    bandItem(BAND_MILE, "tl-ms-b1", "2024-07-01T12:00:00.000Z", "Investigation opened", {}),
    bandItem(BAND_MILE, "tl-ms-b5", "2024-07-01T18:00:00.000Z", "Phase-1 prediction frozen", { precision: "exact", entityIds: [ENT_WJA, ENT_FBIBOSTON] }),
  ],
};

// ── Foreign Overlay (CT as foreign island) ──────────────────────────────────

const foreignOverlaysB: Record<string, { id: string; title: string; summary: string; localTargetMatch: string; bridgeSupport: number; nodes: any[]; edges: any[] }> = {
  "ct": {
    id: CASE_A_ID,
    title: "Connecticut — Jai Alai Licensing (P2 boundary)",
    summary: "CT SOCTF review of organized-crime influence over jai-alai licensing. Visibility restricted to shared entity bridge.",
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

const foreignEntityDbB: Record<string, any> = {};

// ── Assembled Fixture Set ───────────────────────────────────────────────────

export const caseBFixtureSet: DemoFixtureSet = {
  case: caseB,
  investigation: investigationB,
  sources: sourcesB,
  artifacts: artifactsB,
  evidence: evidenceB,
  observations: observationsB,
  entities: allEntitiesB,
  relations: relationsB,
  hypotheses: hypothesesB,
  leads: leadsB,
  gaps: gapsB,
  evidenceRequests: evidenceRequestsB,
  reviewTasks: reviewTasksB,
  graphVersion: graphVersionB,
  graphVersions: [graphVersionB],
  graphNodes: graphNodesB,
  graphEdges: graphEdgesB,
  timeline: timelineB,
  crossCase: crossCaseB,
  robustness: robustnessB,
  events: [],
  candidates: [],
  candidatePairs: [],
  resolutions: [],
  entityHypotheses: [],
  contradictions: [],
  discoveryCandidates: [],
  graphHoles: holesB,
  foreignCaseOverlays: Object.entries(foreignOverlaysB).map(([ref, m]) => ({
    ref,
    caseId: m.id,
    title: m.title,
    summary: m.summary,
    localTargetMatch: m.localTargetMatch,
    bridgeSupport: m.bridgeSupport,
    nodes: m.nodes as any[],
    edges: m.edges as any[],
  })),
  foreignEntityDb: foreignEntityDbB,
  entityLinkByCandidate: {},
};

export const caseBGraphHoles: GraphHole[] = holesB;
export const caseBForeignOverlays = foreignOverlaysB;
export const caseBForeignEntityDb = foreignEntityDbB;
