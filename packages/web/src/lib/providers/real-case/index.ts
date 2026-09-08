// ============================================================================
// Real-Case Fixture Assembly — PASS 1 (+ PASS 2 Phase-1 enrichment)
//
// Assembles both Case A and Case B into DemoFixtureSet-compatible objects.
// PASS 2 runs the pure Phase-1 derivation over the PASS 1 sets and ENRICHES a
// copy of each fixture set with the derived artifacts, event stream, and the
// optional Phase-1 intelligence envelope (crossCaseSignal / predictionFreeze).
// The raw case-a/case-b exports stay untouched so validate.ts keeps validating
// the pre-derivation PASS 1 corpus.
// ============================================================================

import type { DemoFixtureSet, RealCasePhase1, RealCasePhase2 } from "../demo/demo-fixtures";
import type { GraphHole } from "@indago/contracts";

import { caseAFixtureSet, caseAGraphHoles, caseAForeignOverlays, caseAForeignEntityDb } from "./case-a";
import { caseBFixtureSet, caseBGraphHoles, caseBForeignOverlays, caseBForeignEntityDb } from "./case-b";
import { ENTITY_LINK_BY_CANDIDATE_A } from "./case-a";
import { deriveRealCaseDiscoveryCandidates } from "./discovery";
import { deriveRealCasePhase1, type RealCasePhase1Derivation } from "./phase1";
import { buildBreakthroughPackage } from "./breakthrough";
import { buildPhase2S1Package, buildPhase2HistoricalValidation, buildPhase2EvidenceReadout, buildPhase2ConnectionEvidence, derivePhase2 } from "./phase2";
import { CASE_A_ID, CASE_B_ID, HOLE_P2_MOTIVE, ENT_RICO } from "./lookup";

// ============================================================================
// PASS 2 — Phase-1 derivation (deterministic, pure)
// ============================================================================

/** Deterministic Phase-1 derivation over the PASS 1 fixture sets. */
export const REAL_CASE_PHASE1: RealCasePhase1Derivation = deriveRealCasePhase1(
  caseAFixtureSet,
  caseBFixtureSet,
);

/**
 * PASS 3 — deterministic Exhibit-719 breakthrough package built over the SAME
 * Phase-1 derivation (so the post-freeze fingerprint comparison is exact). The
 * package is DATA carried by the enriched Case-B envelope only: its events feed
 * the "upload"-triggered choreography, its catalog drives the graph overlay,
 * and its delta/record project the post-ingest change — none of it exists in
 * any initial fixture set.
 */
export const REAL_CASE_BREAKTHROUGH = buildBreakthroughPackage(REAL_CASE_PHASE1);

/**
 * PASS 4 — deterministic Phase-2 motive-investigation derivation + its S1
 * package, both built over the SAME canonical Case-B observations. The
 * derivation (H1/H2/H3 comparison, lead/gap/hole/ER, freeze, ledger) is the
 * pre-evidence motive analysis; the S1 package is the post-ingest projection of
 * the WJA audit account. The S1 package is DATA carried by the enriched Case-B
 * envelope only: it is produced live by the EREQ_P2 submission and hydrated
 * from the session registry — it never exists in an initial fixture set.
 */
export const REAL_CASE_PHASE2 = derivePhase2();
export const REAL_CASE_PHASE2_S1 = buildPhase2S1Package(REAL_CASE_PHASE2);

/** PRE-DERIVATION PASS 1 sets (validated by validate.ts). */
export const RAW_CASE_FIXTURES: Record<string, DemoFixtureSet> = {
  [CASE_A_ID]: caseAFixtureSet,
  [CASE_B_ID]: caseBFixtureSet,
};

function enrichedCaseA(): DemoFixtureSet {
  const phase1: RealCasePhase1 = REAL_CASE_PHASE1.phase1EnvelopeA;
  return {
    ...caseAFixtureSet,
    events: [...REAL_CASE_PHASE1.caseAEvents],
    phase1,
  };
}

/**
 * P4 — the canonical Phase-1 SELECTED candidate (H. Paul Rico) pivot for Case
 * B's cross-case match records. The matrix, the operations rail, and the flow
 * intelligence all read cross-case MATCHES from the cross-case provider seam
 * (`listMatches`); the raw PASS-1 fixture pointed that seam at Callahan. This
 * derived list swaps the source AND identity-resolved target to the SELECTED
 * Phase-1 candidate — the same deterministic answer the ranking already
 * produces — while leaving the raw PASS-1 corpus untouched. Falls back to the
 * fixture as-is when the ranking carries no SELECTED candidate.
 */
export const CASE_B_DERIVED_CROSS_CASE_MATCHES = (
  caseBFixtureSet.crossCase ?? []
).map((m) => {
  const selectedEntityId = REAL_CASE_PHASE1.phase1EnvelopeB.crossCaseSignal?.candidateRanking.find(
    (c) => c.status === "SELECTED",
  )?.entityId;
  if (!selectedEntityId || selectedEntityId === m.sourceEntityId) return m;
  return { ...m, sourceEntityId: selectedEntityId, targetEntityId: selectedEntityId };
});

/**
 * P4 — the Case-B cross-case OVERLAY pivots on the same selected candidate: the
 * injected foreign island's head becomes H. Paul Rico and the local bridge
 * anchor becomes the local "Rico" node (was the WJA node ↔ Callahan head). The
 * staged graph reveal then centers the RICO ↔ RICO bridge — the canonical
 * Phase-1 selected signal — instead of the WJA node.
 */
export const CASE_B_DERIVED_FOREIGN_OVERLAYS = (
  caseBFixtureSet.foreignCaseOverlays ?? []
).map((o) => {
  if (o.ref !== "ct") return o;
  const ricoNode = o.nodes.find((n: { id?: string }) => n.id === ENT_RICO);
  if (!ricoNode || (o.localTargetMatch ?? "").toUpperCase().includes("RICO")) return o;
  const nodes = [ricoNode, ...o.nodes.filter((n: { id?: string }) => n.id !== ENT_RICO)];
  return { ...o, localTargetMatch: "Rico", nodes };
});

function enrichedCaseB(): DemoFixtureSet {
  const d = REAL_CASE_PHASE1;
  const phase1: RealCasePhase1 = {
    ...d.phase1EnvelopeB,
    postFreezeDelta: REAL_CASE_BREAKTHROUGH.delta,
    breakthroughRecord: REAL_CASE_BREAKTHROUGH.record,
  };
  const derivedHoles = d.hole ? [d.hole] : [];
  // PASS 4 — Phase-2 motive-investigation envelope (pre-evidence derivation +
  // the S1 package's deterministic delta + the later-historical validation
  // overlay). All scores are DERIVED_BY_DEMO_LOGIC investigative-relevance
  // estimates — never guilt or probability statements.
  const phase2: RealCasePhase2 = {
    investigationId: caseBFixtureSet.investigation.id,
    caseId: caseBFixtureSet.case.id,
    derivedLeadId: REAL_CASE_PHASE2.lead.id,
    derivedHypothesisIds: REAL_CASE_PHASE2.hypotheses.map((h) => h.id),
    derivedGapId: REAL_CASE_PHASE2.gap.id,
    derivedGraphHoleId: HOLE_P2_MOTIVE,
    derivedEvidenceRequestId: REAL_CASE_PHASE2.evidenceRequest.id,
    assessmentFreeze: REAL_CASE_PHASE2.freeze,
    comparison: REAL_CASE_PHASE2.comparison,
    ledger: REAL_CASE_PHASE2.ledger,
    evidenceDelta: REAL_CASE_PHASE2_S1.delta,
    historicalValidation: buildPhase2HistoricalValidation(),
    evidenceReadout: buildPhase2EvidenceReadout(),
    // PASS 4 — S1 observation records + the cross-case connection evidence as
    // seam projections (the route surface resolves their content; never spliced
    // into the base envelope's record arrays).
    secondEvidence: REAL_CASE_PHASE2_S1.observations,
    connectionEvidence: buildPhase2ConnectionEvidence(),
  };
  const phase2Holes = REAL_CASE_PHASE2.hole ? [REAL_CASE_PHASE2.hole] : [];
  return {
    ...caseBFixtureSet,
    events: [...d.caseBEvents],
    phase1,
    phase2,
    // P4 — cross-case seams resolve at the canonical Phase-1 SELECTED candidate
    // (H. Paul Rico), never at the raw fixture's reference entity (Callahan).
    crossCase: CASE_B_DERIVED_CROSS_CASE_MATCHES,
    foreignCaseOverlays: CASE_B_DERIVED_FOREIGN_OVERLAYS,
    // PASS 4 fence — the pre-ingest envelope carries ONLY the PASS-1 canonical
    // observations. S1 second-evidence records (source / artifact / evidence /
    // observations / relation / edge) NEVER enter the initial fixture set: they
    // exist solely as EREQ_P2 choreography + the phase2 projection and are
    // hydrated live into the workspace by the S1 ingestion run.
    observations: [...caseBFixtureSet.observations],
    leads: [
      ...caseBFixtureSet.leads,
      ...(d.lead ? [d.lead] : []),
      REAL_CASE_PHASE2.lead,
    ],
    hypotheses: [
      ...caseBFixtureSet.hypotheses,
      ...(d.hypothesis ? [d.hypothesis] : []),
      ...REAL_CASE_PHASE2.hypotheses,
    ],
    gaps: [
      ...caseBFixtureSet.gaps,
      ...(d.gap ? [d.gap] : []),
      REAL_CASE_PHASE2.gap,
    ],
    evidenceRequests: [
      ...caseBFixtureSet.evidenceRequests,
      ...(d.evidenceRequest ? [d.evidenceRequest] : []),
      REAL_CASE_PHASE2.evidenceRequest,
    ],
    graphHoles: [...(caseBFixtureSet.graphHoles ?? []), ...derivedHoles, ...phase2Holes],
    // PASS 3 — Exhibit-719 breakthrough as an on-demand choreography + graph
    // overlay. `upload` is overridden for Case B so the standard upload trigger
    // (evidence page / graph panel) replays the 10-event breakthrough stream;
    // a `breakthrough` key is also available for direct triggers.
    // PASS 4 — the Phase-2 analysis stream (`phase2`, 8 events) and its S1
    // second-evidence ingestion (`phase2-s1`, 10 events) are additional named
    // sequences, added without disturbing the Phase-3 sequences.
    namedSequences: {
      upload: [...REAL_CASE_BREAKTHROUGH.events],
      breakthrough: [...REAL_CASE_BREAKTHROUGH.events],
      phase2: [...REAL_CASE_PHASE2.events],
      "phase2-s1": [...REAL_CASE_PHASE2_S1.events],
    },
    graphRealtimeCatalog: REAL_CASE_BREAKTHROUGH.catalog,
  };
}

export const caseAEnriched = enrichedCaseA();
export const caseBEnriched = enrichedCaseB();

// ============================================================================
// Fixture Sets (keyed by case ID) — ENRICHED with the Phase-1 derivation
// ============================================================================

export const REAL_CASE_FIXTURES: Record<string, DemoFixtureSet> = {
  [CASE_A_ID]: caseAEnriched,
  [CASE_B_ID]: caseBEnriched,
};

/** Resolve an ENRICHED fixture set by case ID. Returns undefined for unknown cases. */
export function getRealCaseFixtureSet(caseId: string): DemoFixtureSet | undefined {
  return REAL_CASE_FIXTURES[caseId];
}

// ============================================================================
// Graph Holes (keyed by case ID) — PASS 1 holes + the derived Phase-1 hole
// ============================================================================

export const REAL_CASE_GRAPH_HOLES: Record<string, GraphHole[]> = {
  [CASE_A_ID]: caseAGraphHoles,
  [CASE_B_ID]: [
    ...caseBGraphHoles,
    ...(REAL_CASE_PHASE1.hole ? [REAL_CASE_PHASE1.hole] : []),
    REAL_CASE_PHASE2.hole,
  ],
};

// ============================================================================
// Foreign Overlays (keyed by case ID → ref → overlay)
// ============================================================================

export const REAL_CASE_FOREIGN_OVERLAYS: Record<string, Record<string, any>> = {
  [CASE_A_ID]: caseAForeignOverlays,
  [CASE_B_ID]: caseBForeignOverlays,
};

// ============================================================================
// Foreign Entity DBs (keyed by case ID)
// ============================================================================

export const REAL_CASE_FOREIGN_ENTITIES: Record<string, Record<string, any>> = {
  [CASE_A_ID]: caseAForeignEntityDb,
  [CASE_B_ID]: caseBForeignEntityDb,
};

// ============================================================================
// Entity-Link-by-Candidate Maps (keyed by case ID)
// ============================================================================

export const REAL_CASE_ENTITY_LINKS: Record<string, Record<string, string>> = {
  [CASE_A_ID]: ENTITY_LINK_BY_CANDIDATE_A,
  [CASE_B_ID]: {},  // Case B has no ER
};

// ============================================================================
// Discovery Candidates (derived from each case's graph)
// ============================================================================

export const REAL_CASE_DISCOVERY_CANDIDATES: Record<string, ReturnType<typeof deriveRealCaseDiscoveryCandidates>> = {
  [CASE_A_ID]: deriveRealCaseDiscoveryCandidates(
    caseAFixtureSet.graphNodes,
    caseAFixtureSet.graphEdges,
    caseAFixtureSet.entities,
  ),
  [CASE_B_ID]: deriveRealCaseDiscoveryCandidates(
    caseBFixtureSet.graphNodes,
    caseBFixtureSet.graphEdges,
    caseBFixtureSet.entities,
  ),
};

// ============================================================================
// Fenced Packages (re-exported for provider consumption)
// ============================================================================

export {
  FENCED_PACKAGES,
  FENCED_BY_ID,
  ALL_FENCED_RECORD_IDS,
} from "./fenced";
export type { FencedPackage, FencedRecord } from "./fenced";

// ============================================================================
// Registry Re-exports
// ============================================================================

export {
  CASE_A_ID,
  CASE_B_ID,
  REAL_CASE_IDS,
  INVESTIGATION_A_ID,
  INVESTIGATION_B_ID,
} from "./lookup";

export {
  NS_CASE_A,
  NS_CASE_B,
  NS_SHARED,
  NS_BREAKTHROUGH,
  NS_COUNTER,
  CASE_A_SLUG,
  CASE_B_SLUG,
  REAL_CASE_SLUGS,
} from "./registry";
