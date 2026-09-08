// ============================================================================
// Real-Case Boundary Validation — PASS 1
//
// 12+ deterministic assertions that enforce the hard rules from the extraction
// spec and the verification doc. Run at import time in development; exported
// as a function for test suites.
//
// Assertions:
//  1. No OFS demo IDs collide with real-case IDs
//  2. Every observation has a provenance entry
//  3. No observation references a fenced record ID
//  4. Every initial-graph edge is backed by a relation hypothesis
//  5. Shared entities carry union of observation/evidence IDs from both cases
//  6. No entity has entityType or aliases fields (strict schema)
//  7. Case B graph: FBI Boston is isolated (no edges)
//  8. No Martorano material in initial fixture sets
//  9. No Bulger/Flemmi/Connolly entities in initial fixture sets
// 10. No "guilty/proven" statuses on any hypothesis or entity
// 11. Fenced package IDs match lookup.ts exports
// 12. Every graph node references a valid entity
// ============================================================================

import { deterministicUuid } from "../demo/submit";
import {
  CASE_A_ID, CASE_B_ID,
  ART_EXHIBIT_719, REC_MARTORANO, REC_RICO_NOTE, ART_WJA_AUDIT,
  ART_TULSA_FILE, ART_CONNOLLY_TRIAL, REC_HALLORAN_DONAHUE,
  REC_CALLAHAN_BODY, REC_CONNOLLY_2002, REC_RICO_2003,
  REC_CONNOLLY_2008, REC_BULGER_2013, CNTR_C1, CNTR_C2, CNTR_C3, CNTR_C4,
  GN_B_FBI,
  ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON,
} from "./lookup";
import { caseAFixtureSet } from "./case-a";
import { caseBFixtureSet } from "./case-b";
import { ALL_FENCED_RECORD_IDS } from "./fenced";

// ── Helpers ─────────────────────────────────────────────────────────────────

const OFS_NS = "b1e0c9a6-0000-4000-8000-000000000000";

interface ValidationResult {
  readonly assertion: number;
  readonly name: string;
  readonly passed: boolean;
  readonly detail?: string;
}

function check(assertion: number, name: string, passed: boolean, detail?: string): ValidationResult {
  return { assertion, name, passed, detail };
}

// ── Assertions ──────────────────────────────────────────────────────────────

export function validateRealCaseBoundaries(): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. No OFS demo IDs collide with real-case IDs
  const ofsCaseId = deterministicUuid(`${OFS_NS}:case:operation-financial-shadow`);
  results.push(check(
    1,
    "No OFS ID collision",
    ofsCaseId !== CASE_A_ID && ofsCaseId !== CASE_B_ID,
    `OFS case ID: ${ofsCaseId}, Case A: ${CASE_A_ID}, Case B: ${CASE_B_ID}`,
  ));

  // 2. Every observation has a provenance entry
  const allObsA = caseAFixtureSet.observations;
  const allObsB = caseBFixtureSet.observations;
  const missingProvenance = [...allObsA, ...allObsB].filter(
    (o) => !o.provenance || !o.provenance.sourceId,
  );
  results.push(check(
    2,
    "Observation provenance",
    missingProvenance.length === 0,
    missingProvenance.length > 0
      ? `Observations missing provenance: ${missingProvenance.map((o) => o.id).join(", ")}`
      : undefined,
  ));

  // 3. No observation references a fenced record ID
  const fencedSet = new Set(ALL_FENCED_RECORD_IDS);
  const leakedFenced = [...allObsA, ...allObsB].filter(
    (o) => fencedSet.has(o.id) || fencedSet.has(o.evidenceId),
  );
  results.push(check(
    3,
    "No fenced ID leakage into observations",
    leakedFenced.length === 0,
    leakedFenced.length > 0
      ? `Observations referencing fenced IDs: ${leakedFenced.map((o) => o.id).join(", ")}`
      : undefined,
  ));

  // 4. Every initial-graph edge is backed by a relation hypothesis
  const relIdsA = new Set(caseAFixtureSet.relations.map((r) => r.id));
  const relIdsB = new Set(caseBFixtureSet.relations.map((r) => r.id));
  const orphanEdgesA = caseAFixtureSet.graphEdges.filter(
    (e) => e.relationHypothesisId && !relIdsA.has(e.relationHypothesisId),
  );
  const orphanEdgesB = caseBFixtureSet.graphEdges.filter(
    (e) => e.relationHypothesisId && !relIdsB.has(e.relationHypothesisId),
  );
  results.push(check(
    4,
    "Graph edges backed by relations",
    orphanEdgesA.length === 0 && orphanEdgesB.length === 0,
    [...orphanEdgesA, ...orphanEdgesB].length > 0
      ? `Orphan edges: ${[...orphanEdgesA, ...orphanEdgesB].map((e) => e.id).join(", ")}`
      : undefined,
  ));

  // 5. Shared entities carry union of observation/evidence IDs
  const sharedA = caseAFixtureSet.entities.filter((e) =>
    [ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON].includes(e.id),
  );
  const sharedB = caseBFixtureSet.entities.filter((e) =>
    [ENT_CALLAHAN, ENT_RICO, ENT_WJA, ENT_FBIBOSTON].includes(e.id),
  );
  const sharedMismatch = sharedA.some((ea) => {
    const eb = sharedB.find((b) => b.id === ea.id);
    if (!eb) return true;
    // Observation IDs should be identical (union baked into shared.ts)
    const obsA = new Set(ea.observationIds);
    const obsB = new Set(eb.observationIds);
    if (obsA.size !== obsB.size) return true;
    for (const id of obsA) {
      if (!obsB.has(id)) return true;
    }
    return false;
  });
  results.push(check(
    5,
    "Shared entities carry identical observation sets",
    !sharedMismatch,
    sharedMismatch ? "Shared entity observation sets differ between Case A and Case B" : undefined,
  ));

  // 6. No entity has entityType or aliases fields (strict schema compliance)
  const invalidEntities = [...allEntities(caseAFixtureSet), ...allEntities(caseBFixtureSet)].filter(
    (e: any) => "entityType" in e || "aliases" in e,
  );
  results.push(check(
    6,
    "No entityType/aliases on entities",
    invalidEntities.length === 0,
    invalidEntities.length > 0
      ? `Invalid entities: ${invalidEntities.map((e: any) => e.id).join(", ")}`
      : undefined,
  ));

  // 7. Case B graph: FBI Boston node has no edges
  const fbiEdgesB = caseBFixtureSet.graphEdges.filter(
    (e) => e.sourceNodeId === GN_B_FBI || e.targetNodeId === GN_B_FBI,
  );
  results.push(check(
    7,
    "Case B: FBI Boston is isolated",
    fbiEdgesB.length === 0,
    fbiEdgesB.length > 0
      ? `FBI Boston has ${fbiEdgesB.length} edges in Case B graph`
      : undefined,
  ));

  // 8. No Martorano material in initial fixture sets
  const martoranoIds = new Set([REC_MARTORANO, REC_RICO_NOTE]);
  const allEvidenceIds = new Set([
    ...caseAFixtureSet.evidence.map((e) => e.id),
    ...caseBFixtureSet.evidence.map((e) => e.id),
  ]);
  const allArtifactIds = new Set([
    ...caseAFixtureSet.artifacts.map((a) => a.id),
    ...caseBFixtureSet.artifacts.map((a) => a.id),
  ]);
  const martoranoLeaked = [...martoranoIds].some(
    (id) => allEvidenceIds.has(id) || allArtifactIds.has(id),
  );
  results.push(check(
    8,
    "No Martorano material in initial crowd",
    !martoranoLeaked,
    martoranoLeaked ? "Martorano hearsay chain found in initial fixture set" : undefined,
  ));

  // 9. No Bulger/Flemmi/Connolly entities in initial fixture sets
  const forbiddenNames = ["bulger", "flemmi", "connolly"];
  const forbiddenEntities = [...allEntities(caseAFixtureSet), ...allEntities(caseBFixtureSet)].filter(
    (e) => forbiddenNames.some((n) => e.canonicalName.toLowerCase().includes(n)),
  );
  results.push(check(
    9,
    "No Bulger/Flemmi/Connolly in initial entities",
    forbiddenEntities.length === 0,
    forbiddenEntities.length > 0
      ? `Forbidden entities: ${forbiddenEntities.map((e) => e.canonicalName).join(", ")}`
      : undefined,
  ));

  // 10. No "guilty/proven" statuses
  const guiltyStatuses = ["PROVEN", "GUILTY", "CONFIRMED_CONSPIRATOR"];
  const guiltyHyps = [
    ...caseAFixtureSet.hypotheses,
    ...caseBFixtureSet.hypotheses,
  ].filter((h) => guiltyStatuses.includes(h.status));
  const guiltyEntities = [...allEntities(caseAFixtureSet), ...allEntities(caseBFixtureSet)].filter(
    (e: any) => guiltyStatuses.includes(e.status),
  );
  results.push(check(
    10,
    "No guilty/proven statuses",
    guiltyHyps.length === 0 && guiltyEntities.length === 0,
    `Guilty statuses found: hypotheses=${guiltyHyps.length}, entities=${guiltyEntities.length}`,
  ));

  // 11. Fenced package IDs match lookup.ts exports
  const expectedFencedIds = new Set([
    ART_EXHIBIT_719, REC_MARTORANO, REC_RICO_NOTE, ART_WJA_AUDIT,
    ART_TULSA_FILE, ART_CONNOLLY_TRIAL, REC_HALLORAN_DONAHUE,
    REC_CALLAHAN_BODY, REC_CONNOLLY_2002, REC_RICO_2003,
    REC_CONNOLLY_2008, REC_BULGER_2013, CNTR_C1, CNTR_C2, CNTR_C3, CNTR_C4,
  ]);
  const actualFencedIds = new Set(ALL_FENCED_RECORD_IDS);
  const missingFenced = [...expectedFencedIds].filter((id) => !actualFencedIds.has(id));
  const extraFenced = [...actualFencedIds].filter((id) => !expectedFencedIds.has(id));
  results.push(check(
    11,
    "Fenced IDs match lookup exports",
    missingFenced.length === 0 && extraFenced.length === 0,
    missingFenced.length > 0
      ? `Missing fenced IDs: ${missingFenced.join(", ")}`
      : extraFenced.length > 0
        ? `Extra fenced IDs: ${extraFenced.join(", ")}`
        : undefined,
  ));

  // 12. Every graph node references a valid entity
  const entityIdsA = new Set(caseAFixtureSet.entities.map((e) => e.id));
  const entityIdsB = new Set(caseBFixtureSet.entities.map((e) => e.id));
  const orphanNodesA = caseAFixtureSet.graphNodes.filter(
    (n) => n.entityId && !entityIdsA.has(n.entityId),
  );
  const orphanNodesB = caseBFixtureSet.graphNodes.filter(
    (n) => n.entityId && !entityIdsB.has(n.entityId),
  );
  results.push(check(
    12,
    "Graph nodes reference valid entities",
    orphanNodesA.length === 0 && orphanNodesB.length === 0,
    [...orphanNodesA, ...orphanNodesB].length > 0
      ? `Orphan graph nodes: ${[...orphanNodesA, ...orphanNodesB].map((n) => `${n.id}→${n.entityId}`).join(", ")}`
      : undefined,
  ));

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function allEntities(fixtureSet: { entities: any[] }): any[] {
  return fixtureSet.entities;
}

// ── Development-time assertion ──────────────────────────────────────────────

if (process.env.NODE_ENV === "development") {
  const results = validateRealCaseBoundaries();
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.error(
      "[real-case/validate] BOUNDARY VIOLATIONS:\n",
      failures.map((f) => `  #${f.assertion} ${f.name}: ${f.detail}`).join("\n"),
    );
  }
}

export default validateRealCaseBoundaries;
