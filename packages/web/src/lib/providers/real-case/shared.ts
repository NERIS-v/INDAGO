// ============================================================================
// Real-Case Shared Bridge Entities — PASS 1
//
// Canonical rows for the four families shared identically by both workspaces
// (Case A + Case B). Observation/evidence IDs are the UNION of both cases'
// references — the same row is served in both workspaces. Cross-case refs
// simply miss locally (documented quirk).
//
// Per-case observations/evidence are authored with per-case NS ids even when
// both cases reference the same fact.
// ============================================================================

import type { Entity } from "@indago/contracts";
import { ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON } from "./lookup";
import {
  OBS_A1,
  OBS_A2,
  OBS_A3,
  OBS_A4,
  OBS_A5,
  OBS_A6,
  OBS_B3,
  OBS_B4,
  OBS_B5,
  EVID_HR_CT,
  EVID_JAN76,
  EVID_SURV,
  EVID_HEARING,
  EVID_BAHAMAS,
  EVID_HR_TULSA,
  EVID_NEWS_TULSA,
  EVID_HR_WJA,
  CASE_A_ID,
  INVESTIGATION_A_ID,
} from "./lookup";
import { obs } from "./times";

// ============================================================================
// E1 — John "Jack" Callahan
// ============================================================================
// Former FBI agent; WJA security director; subject of CT SOCTF request.
// Case A observations: OBS_A1, OBS_A2, OBS_A3, OBS_A4, OBS_A5
// Case B observations: OBS_B5 (employment facts)
// Union = [OBS_A1, OBS_A2, OBS_A3, OBS_A4, OBS_A5, OBS_B5]
export const SHARED_CALLAHAN: Entity = {
  id: ENT_CALLAHAN,
  caseId: CASE_A_ID,
  investigationId: INVESTIGATION_A_ID,
  canonicalName: "John \"Jack\" Callahan",
  status: "ACTIVE",
  observationIds: [OBS_A1, OBS_A2, OBS_A3, OBS_A4, OBS_A5, OBS_B5],
  evidenceIds: [EVID_HR_CT, EVID_JAN76, EVID_SURV, EVID_HEARING, EVID_BAHAMAS],
  hypothesisIds: [],
  roleHypothesisIds: [],
  sourceIdentifiers: [
    { sourceId: EVID_HR_CT, identifier: "WJA-security-director" },
    { sourceId: EVID_JAN76, identifier: "ct-soctf-target" },
  ],
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
};

// ============================================================================
// E2 — H. Paul Rico
// ============================================================================
// Former FBI agent; WJA security consultant; entertained FBI SAs in Bahamas.
// Case A observations: OBS_A4, OBS_A5, OBS_A6
// Case B observations: OBS_B5 (employment facts)
// Union = [OBS_A4, OBS_A5, OBS_A6, OBS_B5]
export const SHARED_RICO: Entity = {
  id: ENT_RICO,
  caseId: CASE_A_ID,
  investigationId: INVESTIGATION_A_ID,
  canonicalName: "H. Paul Rico",
  status: "ACTIVE",
  observationIds: [OBS_A4, OBS_A5, OBS_A6, OBS_B5],
  evidenceIds: [EVID_HR_CT, EVID_BAHAMAS],
  hypothesisIds: [],
  roleHypothesisIds: [],
  sourceIdentifiers: [
    { sourceId: EVID_HR_CT, identifier: "WJA-security-consultant" },
  ],
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
};

// ============================================================================
// E4 — World Jai Alai
// ============================================================================
// The Connecticut / national jai-alai organization.
// Case A observations: OBS_A3, OBS_A4, OBS_A6
// Case B observations: OBS_B3, OBS_B4, OBS_B5
// Union = [OBS_A3, OBS_A4, OBS_A6, OBS_B3, OBS_B4, OBS_B5]
export const SHARED_WJA: Entity = {
  id: ENT_WJA,
  caseId: CASE_A_ID,
  investigationId: INVESTIGATION_A_ID,
  canonicalName: "World Jai Alai",
  status: "ACTIVE",
  observationIds: [OBS_A3, OBS_A4, OBS_A6, OBS_B3, OBS_B4, OBS_B5],
  evidenceIds: [EVID_HR_CT, EVID_BAHAMAS, EVID_HR_TULSA, EVID_NEWS_TULSA, EVID_HR_WJA],
  hypothesisIds: [],
  roleHypothesisIds: [],
  sourceIdentifiers: [
    { sourceId: EVID_HR_CT, identifier: "wja-org" },
  ],
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
};

// ============================================================================
// E9 — FBI Boston Field Office
// ============================================================================
// Case A observations: OBS_A5 (shared loan-shark info with Rico)
// Case B observations: none initially (isolated node in Case B graph)
// Union = [OBS_A5]
export const SHARED_FBIBOSTON: Entity = {
  id: ENT_FBIBOSTON,
  caseId: CASE_A_ID,
  investigationId: INVESTIGATION_A_ID,
  canonicalName: "FBI Boston Field Office",
  status: "ACTIVE",
  observationIds: [OBS_A5],
  evidenceIds: [EVID_HR_CT],
  hypothesisIds: [],
  roleHypothesisIds: [],
  sourceIdentifiers: [
    { sourceId: EVID_HR_CT, identifier: "fbi-boston" },
  ],
  createdAt: obs("2024-07-01"),
  updatedAt: obs("2024-07-01"),
};

export const SHARED_ENTITIES: Entity[] = [
  SHARED_CALLAHAN,
  SHARED_RICO,
  SHARED_WJA,
  SHARED_FBIBOSTON,
];
