// ============================================================================
// PASS 4 — Phase 2 Motive / Causal-Hypothesis Investigation (DERIVED + live S1)
//
// "Why was Roger Wheeler killed?" Three canonical competing hypotheses
// (H1 / H2 / H3 — condensed from the doc's §17 exact wording):
//
//   H1 Protect the financial operation
//      "The owner was killed to protect the company's financial operation
//       from the exposure that his audit would create."
//   H2 Regain / keep control
//      "The owner's removal of the president and his assumption of control
//       over the company threatened the surrounding network's hold on the
//       operation; the killing restored / preserved that control."
//   H3 Personal retaliation / other
//      "The owner was killed for a personal or non-operational reason
//       unrelated to the company's operation."
//
// The pre-evidence comparison runs a deterministic MOTIVE-POOL scorer over the
// canonical Case B observations: OBS_B4 (skimming-audit-fired) is the single
// shared narrative, so H1 and H2 tie ("two faces of one fork") and H3 is
// weakest by honest signal. The comparison is FROZEN (FREEZE_P2) for a
// prediction-style replay, alongside a reasoning ledger.
//
// The SECOND EVIDENCE (S1 — WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT
// III.B.5)) is NOT part of any initial set: the physical corporate document is
// BLOCKED (research required per the fence), so the live ingestion honestly
// ingests the House-report PUBLIC ACCOUNT as report-text and derives three
// observations (OBS_P2_A1/A2/A3). Post-ingestion re-scoring promotes H1 to the
// leading derived explanation (SUPPORTED — never PROVEN) while H2 retains
// partial overlap and H3 stays weakest. The candidate motive-context edge
// (WJA → Wheeler, financial) is PROPOSED (judge-acceptable only). A later
// historical-validation layer records the secondhand hearsay chain (class-5
// LATER_HISTORICAL_KNOWLEDGE) as SOURCE_CREDIBILITY / UNRESOLVED.
//
// Scores are investigative-relevance estimates labeled DERIVED_BY_DEMO_LOGIC —
// never guilt, conspiracy, or probability-of-truth statements. Nothing here
// fingerprints Martorano / Bulger / Flemmi / Connolly hearsay (that fence
// stays closed in this pass).
// ============================================================================

import type {
  Artifact,
  Evidence,
  EvidenceRequest,
  GraphEdge,
  GraphHole,
  Hypothesis,
  InvestigativeGap,
  Lead,
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
  LeadSchema,
  ObservationSchema,
  RelationHypothesisSchema,
  SourceSchema,
} from "@indago/contracts";
import type { DemoStreamEvent } from "../demo/demo-fixtures/events";
import type { DemoWorkspaceState } from "../demo/state";
import { demoContentHash } from "../demo/submit";
import { evt, obs } from "./times";
import type { AssessmentStatus } from "../../intel/reverse-hypothesis/hypothesis-model";
import { caseBFixtureSet } from "./case-b";
import type {
  GraphRealtimeCatalog,
  MotiveHypothesisComparison,
  MotiveHypothesisFrame,
  MotiveHypothesisKey,
  MotiveHypothesisScoreRow,
  Phase2AssessmentFreeze,
  Phase2EvidenceDelta,
  Phase2EvidenceReadout,
  Phase2HistoricalValidation,
  Phase2HoleStatusChange,
  Phase2RunResult,
  Phase2S1Record,
  Phase2ScoreState,
  ReasoningLedger,
  ReasoningLedgerAction,
  ReasoningLedgerEntry,
} from "../types";
import { catalogKey } from "../types";
import {
  ART_EXHIBIT_719,
  ART_S1_AUDIT,
  CASE_B_ID,
  ENT_CALLAHAN,
  ENT_HITMAN,
  ENT_RICO,
  ENT_WHEELER,
  ENT_WINTER_HILL,
  ENT_WJA,
  EREQ_P2,
  EVID_EXHIBIT_719,
  EVID_HR_TULSA,
  EVID_HR_WJA,
  EVID_S1_AUDIT,
  EVT_P2_01,
  EVT_P2_02,
  EVT_P2_03,
  EVT_P2_04,
  EVT_P2_05,
  EVT_P2_06,
  EVT_P2_07,
  EVT_P2_08,
  EVT_P2S_01,
  EVT_P2S_02,
  EVT_P2S_03,
  EVT_P2S_04,
  EVT_P2S_05,
  EVT_P2S_06,
  EVT_P2S_07,
  EVT_P2S_08,
  EVT_P2S_09,
  EVT_P2S_10,
  FREEZE_P2,
  GAP_AG2,
  GE_B_AUDIT_WJA,
  GN_B_HITMAN,
  GN_B_RICO,
  GN_B_WHEELER,
  GN_B_WJA,
  GRAPH_VERSION_B,
  HOLE_P2_MOTIVE,
  HYP_P2_H1,
  HYP_P2_H2,
  HYP_P2_H3,
  HYP_P2_HL,
  INVESTIGATION_B_ID,
  LEAD_P2,
  LEDGER_P2,
  OBS_B4,
  OBS_B5,
  OBS_B6,
  OBS_B7,
  OBS_B8,
  OBS_B9,
  OBS_P2_A1,
  OBS_P2_A2,
  OBS_P2_A3,
  OBS_P2_B1,
  REASON_P2_01,
  REASON_P2_02,
  REASON_P2_03,
  REASON_P2_04,
  REASON_P2_05,
  REASON_P2_06,
  REASON_P2_07,
  REASON_P2_08,
  REASON_P2_09,
  REASON_P2_10,
  REASON_P2_11,
  REC_CALLAHAN_BODY,
  REC_P2_LATER_WITNESS,
  REL_B_AUDIT,
  SRC_EXHIBIT_719,
  SRC_HR_TULSA_B,
  SRC_S1_AUDIT,
} from "./lookup";

// ============================================================================
// Constants
// ============================================================================

/** Canonical target class named by evidence request EREQ_P2. */
export const PHASE2_SECOND_EVIDENCE_CLASS =
  "WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5)";

/** WJA↔FBI (Exhibit-719) observations are deliberately EXCLUDED from the
 *  motive pool: they report an institutional financial relationship, not a
 *  motive for the homicide (doc §16 P2.5 / P2.7). */
export const MOTIVE_POOL_EXCLUDED_IDS: readonly string[] = [OBS_B7, OBS_B8, OBS_B9];

/** Motive-pool gate: observations that could bear on WHY Wheeler was killed. */
export const MOTIVE_POOL_RE =
  /\b(wheeler|audit|skim|fired|president|control)\b|\bskimming[- ]audit[- ]fired\b/i;

/** H1 — Protect the financial operation (exposure lexicon). */
export const H1_MOTIVE_RE =
  /audit|skim|skimming|financial|money|funds|purchase|expense|exposure|probe/i;

/** H2 — Regain / keep control (removal + control lexicon). */
export const H2_MOTIVE_RE =
  /fired|president|removed|control|oversight|replace|takeover|authority/i;

/** H3 — Personal retaliation / other (personal-or-unrelated lexicon). */
export const H3_MOTIVE_RE =
  /personal|retaliation|revenge|grievance|insult|grudge/i;

/** Documented deterministic weights of the motive score:
 *      score = 0.6 · meanStrength + 0.4 · exclusivityRatio − 0.1 · overlapRatio
 *  meanStrength     mean observation strength over the hypothesis's matched set
 *  exclusivityRatio exclusive matched observations / matched (a shared record
 *                   supports two competing hypotheses at once — weaker for each)
 *  overlapRatio     matched observations also matched by a sibling hypothesis
 *  DERIVED_BY_DEMO_LOGIC. */
export const PHASE2_SCORE_WEIGHTS = {
  strength: 0.6,
  exclusivity: 0.4,
  overlapPenalty: 0.1,
} as const;

export const PHASE2_SUPPORT_WEIGHTS = {
  auditNarrative: 0.5,
  timingContext: 0.3,
  structuralFit: 0.2,
} as const;

const SCORE_LABEL = "DERIVED_BY_DEMO_LOGIC" as const;
const EXTRACTOR = "intel.phase2.v1";
const S1_EXTRACTOR = "intel.phase2-s1.ingest.v1";
export const S1_INGEST_AT = obs("2024-07-02", "09:00:00");
const PRE_ANALYSIS_AT = obs("2024-07-01", "12:00:00");
const PRE_FREEZE_AT = obs("2024-07-01", "14:00:00");
const S1_AUDIT_EVENT_AT = evt("1981-01-01", "approximate", "12:00:00");

export const PHASE2_STRENGTH = {
  evidence: 0.7,
  obsA1: 0.7,
  obsA2: 0.7,
  obsA3: 0.6,
  structuralImportance: 0.55,
  // Parity with the derived Case-A reveal edge support (REVEAL_STRENGTH.
  // ricoHitman): the connection observation's strength mirrors the graph edge
  // it describes, so the seam never outscored the underlying graph signal.
  connRicoHitman: 0.72,
} as const;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// ============================================================================
// Deterministic fingerprint helpers (stable stringify + FNV-1a 64-bit)
// ============================================================================

function stableStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.keys(v)
            .sort()
            .reduce((acc: Record<string, unknown>, k) => {
              acc[k] = v[k];
              return acc;
            }, {})
        : v,
  );
}

function fnv1a64(input: string): string {
  const prime = 0x100000001b3n;
  let hash = 0xcbf29ce484222325n;
  for (const char of input) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

interface Phase2FreezeSnapshot {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly frozenAt: { readonly value: string; readonly precision: "exact" };
  readonly runId: string;
  readonly stage: "PHASE_2_PRE_EVIDENCE_FREEZE";
  readonly hypothesisIds: readonly string[];
  readonly rows: readonly {
    readonly id: string;
    readonly score: number;
    readonly rank: number;
    readonly support: readonly string[];
  }[];
  readonly observationIds: readonly string[];
}

function compactRows(rows: readonly MotiveHypothesisScoreRow[]): Phase2FreezeSnapshot["rows"] {
  return rows
    .map((r) => ({
      id: r.hypothesisId,
      score: r.score,
      rank: r.rank,
      support: [...r.supportingObservationIds].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Deterministic 32-hex fingerprint over the key-sorted Phase-2 snapshot. */
export function computePhase2FreezeFingerprint(snapshot: Phase2FreezeSnapshot): string {
  const stable = stableStringify(snapshot);
  return fnv1a64(`${stable}::phase2-freeze`) + fnv1a64(`${stable}::phase2-salt`);
}

/** Fingerprint of the SAME Phase-2 snapshot with the post-evidence rows and
 *  pool (used by the S1 delta's before/after comparison). */
export function computePhase2FreezeFingerprintAfter(
  freeze: Phase2AssessmentFreeze,
  afterRows: readonly MotiveHypothesisScoreRow[],
  afterObservationIds: readonly string[],
): string {
  const { fingerprint: _drop, rows: _preRows, ...snapshot } = freeze;
  return computePhase2FreezeFingerprint({
    ...snapshot,
    rows: compactRows(afterRows),
    observationIds: [...afterObservationIds].sort(),
  });
}

// ============================================================================
// Motive-pool scoring (deterministic, DERIVED_BY_DEMO_LOGIC)
// ============================================================================

function isMotivePoolMember(o: Observation): boolean {
  if (MOTIVE_POOL_EXCLUDED_IDS.includes(o.id)) return false;
  return MOTIVE_POOL_RE.test(o.content);
}

function lexiconFor(key: MotiveHypothesisKey): RegExp {
  if (key === "H1") return H1_MOTIVE_RE;
  if (key === "H2") return H2_MOTIVE_RE;
  return H3_MOTIVE_RE;
}

/** Reverse-hypothesis-style classification of an observation set. */
function deriveAssessmentStatus(
  supportingCount: number,
  contradictingCount: number,
): AssessmentStatus {
  if (contradictingCount > 0 && supportingCount > 0) return "SUPPORTED_WITH_CONFLICT";
  if (contradictingCount > 0) return "CONTRADICTED";
  if (supportingCount > 0) return "SUPPORTED";
  return "UNRESOLVED";
}

interface MotiveComputation {
  readonly rows: readonly MotiveHypothesisScoreRow[];
  readonly pool: readonly string[];
}

/**
 * Compute the H1/H2/H3 comparison for a point in time. `promotedIds` derives
 * deterministically: a hypothesis is promoted (canonical status SUPPORTED)
 * only on POST evidence when it carries ≥ 2 exclusive observations AND the
 * top score — the data decides, never a name-keyed hardcode.
 */
export function computeMotiveScores(
  frames: readonly MotiveHypothesisFrame[],
  observations: readonly Observation[],
  stage: "PRE_EVIDENCE" | "POST_EVIDENCE",
): MotiveComputation {
  const pool = observations
    .filter(isMotivePoolMember)
    .map((o) => o.id)
    .sort();

  const matched = (key: MotiveHypothesisKey): Observation[] =>
    observations.filter((o) => isMotivePoolMember(o) && lexiconFor(key).test(o.content));

  const rows = frames.map((frame) => {
    const mine = matched(frame.key);
    const siblingSet = new Set<string>();
    for (const other of frames) {
      if (other.key === frame.key) continue;
      for (const o of matched(other.key)) siblingSet.add(o.id);
    }
    const supporting = mine.map((o) => o.id).sort();
    const overlappingIds = supporting.filter((id) => siblingSet.has(id));
    const exclusiveIds = supporting.filter((id) => !siblingSet.has(id));
    const contrad = observations.filter(
      (o) => isMotivePoolMember(o) && /denied by/i.test(o.content),
    );
    const contradictingIds = contrad.map((o) => o.id).sort();

    const meanStrength = mine.length > 0
      ? mine.reduce((sum, o) => sum + o.strength, 0) / mine.length
      : 0;
    const exclusivityRatio = supporting.length > 0
      ? exclusiveIds.length / supporting.length
      : 0;
    const overlapRatio = supporting.length > 0
      ? overlappingIds.length / supporting.length
      : 0;
    const score = round4(
      PHASE2_SCORE_WEIGHTS.strength * meanStrength +
        PHASE2_SCORE_WEIGHTS.exclusivity * exclusivityRatio -
        PHASE2_SCORE_WEIGHTS.overlapPenalty * overlapRatio,
    );

    return {
      hypothesisId: frame.hypothesisId,
      key: frame.key,
      title: frame.title,
      score,
      supportingObservationIds: supporting,
      contradictingObservationIds: contradictingIds,
      exclusiveObservationIds: exclusiveIds,
      poolSize: pool.length,
      assessmentStatus: deriveAssessmentStatus(supporting.length, contradictingIds.length),
      scoreLabel: SCORE_LABEL,
      canonicalStatus: "ACTIVE",
      rank: 0,
    };
  });

  const scores = rows.map((r) => r.score);
  const maxScore = Math.max(...scores);
  const ranked = rows.map((r) => ({
    ...r,
    rank: 1 + scores.filter((s) => s > r.score).length,
  }));

  const promotedIds =
    stage === "POST_EVIDENCE"
      ? ranked
          .filter(
            (r) =>
              r.score === maxScore &&
              r.exclusiveObservationIds.length >= 2 &&
              r.score > 0,
          )
          .map((r) => r.hypothesisId)
      : [];

  const withStatus = ranked.map((r) => ({
    ...r,
    canonicalStatus: promotedIds.includes(r.hypothesisId) ? "SUPPORTED" : "ACTIVE",
  }));

  return {
    rows: withStatus.map((r) => ({ ...r, supportingObservationIds: [...r.supportingObservationIds] })),
    pool,
  };
}

// ============================================================================
// Canonical competing-hypothesis frames (doc §17 exact wording)
// ============================================================================

export function buildPhase2Frames(): readonly MotiveHypothesisFrame[] {
  return [
    {
      key: "H1",
      hypothesisId: HYP_P2_H1,
      title: "H1 — Protect the financial operation",
      statement:
        "The owner was killed to protect the company's financial operation from the exposure that his audit would create.",
      summary: "Wheeler's audit was uncovering the skim into the company's operation; killing the owner stopped the exposure his audit would create.",
    },
    {
      key: "H2",
      hypothesisId: HYP_P2_H2,
      title: "H2 — Regain / keep control",
      statement:
        "The owner's removal of the president and his assumption of control over the company threatened the surrounding network's hold on the operation; the killing restored / preserved that control.",
      summary: "Wheeler fired the president and took direct control; the killing restored the network's hold on the operation.",
    },
    {
      key: "H3",
      hypothesisId: HYP_P2_H3,
      title: "H3 — Personal retaliation / other",
      statement:
        "The owner was killed for a personal or non-operational reason unrelated to the company's operation.",
      summary: "A personal or unrelated motive reading; the weakest by the honest signal.",
    },
  ];
}

/**
 * PASS 4 — demo §14 FOR/AGAINST readout for the Hypothesis-route surface.
 * Authored here in the data layer; the surface renders it against the workspace
 * observation provider (the route never authors content). Deliberately
 * display-only: the score-driving rows keep their pool-lexicon sets, so scores
 * and statuses (H1 0.68 SUPPORTED / H2 0.32 / H3 0.00) stay deterministic. For
 * the leading hypothesis (H1) the support is the audit / skim path (OBS_B4),
*  the external criminal-network signal (OBS_B6), the Phase-1 internal
 *  information pathway (OBS_B5), and the S1 audit-timing records; what argues
 *  against is the honest limitation record (OBS_P2_A3 — no public finding, the
 *  corporate audit file BLOCKED). OBS_P2_B1 (the cross-case connection between
 *  H. Paul Rico and the shooter / Boston gang) is listed in H1's support but
 *  the route surface SURFACES it only once the graph carries the solid (ACTIVE)
 *  Rico ↔ hitman edge — the "?" hole alone never unlocks it. H2 keeps its shared
 *  fork record (OBS_B4),
 *  with the network signal and the limitation arguing against the pure-control
 *  reading. H3 has no supporting signal (the weakest, by elimination); what
 *  argues against it is the evidence that frames the killing as a network /
 *  operation matter rather than a personal one.
 */
export function buildPhase2EvidenceReadout(): Phase2EvidenceReadout {
  return {
    H1: {
      supporting: [OBS_B4, OBS_B6, OBS_B5, OBS_P2_A1, OBS_P2_A2, OBS_P2_B1],
      contradicting: [OBS_P2_A3],
    },
    H2: {
      supporting: [OBS_B4],
      contradicting: [OBS_B6, OBS_P2_A3],
    },
    H3: {
      supporting: [],
      contradicting: [OBS_B6, OBS_P2_A1],
    },
  };
}

/**
 * PASS 4 — cross-case CONNECTION evidence for the LEAD hypothesis (H1). The
 * Case-A network operation (Exhibit-719 pathway) solidifies the case-link
 * between H. Paul Rico and the shooter through the Winter Hill / Boston gang
 * operation: once the operation has run, the workspace graph carries an ACTIVE
 * edge between the two nodes (GN_B_RICO → GN_B_HITMAN). The OBSERVATION is
 * delivered as a seam projection (never a base-envelope record); the route
 * surface surfaces it in H1's supporting set ONLY when that edge is genuinely
 * solid — the "?" graph hole alone never unlocks it.
 */
export interface Phase2ConnectionEvidence {
  readonly observation: Observation;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

/** Deterministic connection-evidence projection (edge-gated visibility). */
export function buildPhase2ConnectionEvidence(): Phase2ConnectionEvidence {
  return {
    observation: ObservationSchema.parse({
      id: OBS_P2_B1,
      evidenceId: EVID_EXHIBIT_719,
      sourceId: SRC_EXHIBIT_719,
      type: "RELATIONAL",
      content:
        "CROSS-CASE CONNECTION — the Case-A network operation (Exhibit-719 pathway) confirms the case-link " +
        "between H. Paul Rico and the shooter through the Winter Hill / Boston gang operation: the graph now reads " +
        "Rico → hitman as a solid (ACTIVE) edge instead of the '?' uncertainty the Case-B record alone leaves. The " +
        "connection supports the operation-protection reading (H1) — investigative relevance only, never a guilt statement.",
      entityIds: [ENT_RICO, ENT_HITMAN, ENT_WINTER_HILL],
      candidateMentions: [],
      hypothesisIds: [HYP_P2_H1],
      strength: PHASE2_STRENGTH.connRicoHitman,
      provenance: {
        sourceId: SRC_EXHIBIT_719,
        artifactId: ART_EXHIBIT_719,
        documentRef: "WORLD JAI ALAI PURCHASE REPORT (Exhibit 719)",
        extractor: "govinfo.cross-case.v1",
      },
      observedAt: evt("1981-05-11", "approximate", "12:00:00"),
      createdAt: S1_INGEST_AT,
      updatedAt: S1_INGEST_AT,
    }),
    sourceNodeId: GN_B_RICO,
    targetNodeId: GN_B_HITMAN,
  };
}

// ============================================================================
// Record builders — pre-evidence derivation (canonical, parsed, deterministic)
// ============================================================================

function buildPreEvidenceHypothesis(frame: MotiveHypothesisFrame): Hypothesis {
  const isH3 = frame.key === "H3";
  return HypothesisSchema.parse({
    id: frame.hypothesisId,
    investigationId: INVESTIGATION_B_ID,
    title: frame.title,
    statement: frame.statement,
    status: "ACTIVE",
    confidence: isH3 ? 0.3 : 0.6,
    supportingObservationIds: isH3 ? [] : [OBS_B4],
    contradictingObservationIds: [],
    supportingEvidenceIds: isH3 ? [] : [EVID_HR_TULSA],
    contradictingEvidenceIds: [],
    relatedEntityIds: isH3 ? [ENT_WHEELER] : [ENT_WHEELER, ENT_WJA],
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_TULSA_B,
          extractor: EXTRACTOR,
          derivedFrom: isH3 ? [] : [OBS_B4],
        },
      ],
      createdAt: PRE_ANALYSIS_AT,
    },
    createdAt: PRE_ANALYSIS_AT,
    updatedAt: PRE_ANALYSIS_AT,
  });
}

/**
 * The "hidden link" capsule hypothesis — the derived cross-case reading that the
 * security-connected figure H. Paul Rico is the suspected link joining the
 * Case-A and Case-B files. Carried under its own category in the Hypothesis
 * route so the tab groups real evidence together instead of presenting the
 * derived hypotheses as empty shells. Honest framing: hypothesized — not
 * established — nothing recorded proves the shooter was sourced, scheduled, or
 * shielded by the figure. Delivered on the enriched envelope, NOT part of the
 * derivePhase2 motive comparison.
 */
export function buildHiddenLinkHypothesis(): Hypothesis {
  return HypothesisSchema.parse({
    id: HYP_P2_HL,
    investigationId: INVESTIGATION_B_ID,
    title: "The suspected hidden link behind the shooting",
    statement:
      "The comparison keeps surfacing the same person on both sides of the record: the former-FBI security " +
      "figure the company kept on staff in the Case-A file, and the same security-connected circle the Case-B " +
      "record keeps routing the shooter's network back toward. It is hypothesized — not established — that " +
      "this figure, H. Paul Rico, is the hidden link joining the two cases; no record proves the shooter was " +
      "sourced, scheduled, or shielded by him.",
    status: "ACTIVE",
    confidence: 0.42,
    supportingObservationIds: [OBS_B4, OBS_B5, OBS_B6],
    contradictingObservationIds: [],
    supportingEvidenceIds: [EVID_HR_TULSA, EVID_HR_WJA],
    contradictingEvidenceIds: [],
    relatedEntityIds: [ENT_RICO, ENT_HITMAN, ENT_WINTER_HILL],
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_TULSA_B,
          extractor: EXTRACTOR,
          derivedFrom: [OBS_B4, OBS_B5, OBS_B6],
        },
      ],
      createdAt: PRE_ANALYSIS_AT,
    },
    createdAt: PRE_ANALYSIS_AT,
    updatedAt: PRE_ANALYSIS_AT,
  });
}

function buildLead(): Lead {
  return LeadSchema.parse({
    id: LEAD_P2,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    title: "Pursue the motive discriminator: the WJA audit / financial record",
    description:
      "Phase 2 asks why Roger Wheeler was killed. The pre-evidence comparison shows H1 and H2 as two faces of one fork (a single shared narrative, OBS_B4) and H3 weakest. The next-best evidence is the audit / financial record (the motive discriminator) — not a hidden relationship.",
    status: "NEW",
    priority: "HIGH",
    confidence: 0.45,
    posture: "T1_INVESTIGATIVE_LEAD",
    relatedEntityIds: [ENT_WHEELER, ENT_WJA],
    supportingObservationIds: [OBS_B4],
    relatedEvidenceIds: [EVID_HR_TULSA],
    gapIds: [GAP_AG2],
    sourceCandidateType: "MANUAL",
    sourceCandidateKey: `manual:${LEAD_P2}`,
    sourceCandidateSnapshot: {},
    provenance: {
      entries: [
        {
          sourceId: SRC_HR_TULSA_B,
          extractor: EXTRACTOR,
          derivedFrom: [OBS_B4],
        },
      ],
      createdAt: PRE_ANALYSIS_AT,
    },
    createdAt: PRE_ANALYSIS_AT,
    updatedAt: PRE_ANALYSIS_AT,
  });
}

function buildGap(): InvestigativeGap {
  return InvestigativeGapSchema.parse({
    id: GAP_AG2,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    type: "FINANCIAL_GAP",
    title: "Motive discrimination: protect the operation vs. regain control vs. personal",
    description:
      "Phase 2 needs to discriminate WHY Wheeler was killed. The graph can show access (who had a pathway) but cannot yet show purpose (who benefits from the killing). The analytical gap between 'people with access' and 'people with motive' is AG2: the current record carries a single shared narrative (OBS_B4) that ties H1 and H2 and leaves H3 without support.",
    status: "IDENTIFIED",
    priority: "HIGH",
    impact: 0.7,
    expectedInformationValue: 0.74,
    relatedEntityIds: [ENT_WHEELER, ENT_WJA],
    relatedHypothesisIds: [HYP_P2_H1, HYP_P2_H2, HYP_P2_H3],
    evidenceRequestIds: [EREQ_P2],
    createdAt: PRE_ANALYSIS_AT,
    updatedAt: PRE_ANALYSIS_AT,
  });
}

function buildHole(): GraphHole {
  return {
    id: HOLE_P2_MOTIVE,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    graphVersionId: GRAPH_VERSION_B,
    type: "MISSING_EDGE",
    investigationGapId: GAP_AG2,
    nodeIds: [GN_B_WJA, GN_B_WHEELER],
    expectedEdgeType: "financial",
    significance: 0.68,
    description:
      "The motive hole: the graph can show access (which organizations touch the operation), but it cannot yet show purpose (who benefits from the killing of the owner). No candidate motive-context edge connects the company's financial operation to a motive for the homicide — the sealed WJA audit / financial record (S1) is the discriminator that would break the H1/H2 fork.",
    suggestedEvidenceTypes: [
      "corporate audit records",
      "financial records",
      "Connecticut Special Revenue files",
    ],
    detectedAt: PRE_ANALYSIS_AT,
  };
}

function buildEvidenceRequest(): EvidenceRequest {
  return EvidenceRequestSchema.parse({
    id: EREQ_P2,
    gapId: GAP_AG2,
    hypothesisIds: [HYP_P2_H1, HYP_P2_H2, HYP_P2_H3],
    evidenceType: "RECORD",
    description:
      "Request the WJA audit / financial document — the motive discriminator for why Wheeler was killed — target class: WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5). The sealed corporate audit / financial records (and the Connecticut Special Revenue files) are the next-best evidence to break the H1/H2 fork.",
    utility: {
      expectedInformationGain: 0.78,
      eig: 0.78,
      relevance: 0.92,
      feasibility: 0.3,
      cost: 0.45,
      score: 0.7,
    },
    rationale:
      "The pre-evidence comparison freezes a tie (H1 ≈ H2) on one shared record; only the audit / financial record can discriminate the exposure reading (H1) from the control reading (H2) and test personal retaliation (H3) by elimination.",
    status: "SUBMITTED",
    resultingEvidenceIds: [],
    createdBy: "analyst",
    createdAt: PRE_ANALYSIS_AT,
    updatedAt: PRE_ANALYSIS_AT,
  });
}

function buildFreeze(
  rows: readonly MotiveHypothesisScoreRow[],
  pool: readonly string[],
): Phase2AssessmentFreeze {
  const hypothesisIds = [HYP_P2_H1, HYP_P2_H2, HYP_P2_H3];
  const snapshot: Omit<Phase2AssessmentFreeze, "fingerprint"> & { observationIds: readonly string[] } = {
    id: FREEZE_P2,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    frozenAt: PRE_FREEZE_AT,
    runId: "phase2-2024-07-01",
    stage: "PHASE_2_PRE_EVIDENCE_FREEZE",
    hypothesisIds,
    rows: rows.map((r) => ({ ...r })),
    supportingObservationIds: dedupe(rows.flatMap((r) => r.supportingObservationIds)).sort(),
    contradictingObservationIds: dedupe(rows.flatMap((r) => r.contradictingObservationIds)).sort(),
    nodeIds: caseBFixtureSet.graphNodes.map((n) => n.id),
    edgeIds: caseBFixtureSet.graphEdges.map((e) => e.id),
    observationIds: [...pool],
    scoreLabel: SCORE_LABEL,
    caveat:
      "Three portraits, sketched by the same record. None of them has won yet. The graph can show access. It cannot yet show purpose.",
  };
  const fingerprint = computePhase2FreezeFingerprint({
    id: snapshot.id,
    investigationId: snapshot.investigationId,
    caseId: snapshot.caseId,
    frozenAt: snapshot.frozenAt,
    runId: snapshot.runId,
    stage: snapshot.stage,
    hypothesisIds: snapshot.hypothesisIds,
    rows: compactRows(rows),
    observationIds: pool,
  });
  const { observationIds: _drop, ...rest } = snapshot;
  return { ...rest, fingerprint };
}

function ledgerEntry(input: {
  readonly id: string;
  readonly ordering: number;
  readonly kind: string;
  readonly title: string;
  readonly detail: string;
  readonly action: ReasoningLedgerAction;
  readonly derivedFrom?: readonly string[];
  readonly at?: { readonly value: string; readonly precision: "exact" };
}): ReasoningLedgerEntry {
  return {
    id: input.id,
    ledgerId: LEDGER_P2,
    investigationId: INVESTIGATION_B_ID,
    caseId: CASE_B_ID,
    ordering: input.ordering,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    action: input.action,
    derivedFrom: input.derivedFrom ?? [],
    at: input.at ?? PRE_ANALYSIS_AT,
  };
}

function buildPreLedger(): ReasoningLedger {
  const entries: readonly ReasoningLedgerEntry[] = [
    ledgerEntry({
      id: REASON_P2_01,
      ordering: 1,
      kind: "RULE_OF_EVIDENCE",
      title: "No proof language",
      detail:
        "Throughout Phase 2 the ledger records a rule: hypotheses are ranked and SUPPORTED at most — never PROVEN. There is no guilty/proven outcome in this derivation.",
      action: "RECORD_REASONING",
    }),
    ledgerEntry({
      id: REASON_P2_02,
      ordering: 2,
      kind: "HYPOTHESIS_COMPARISON",
      title: "H1 — protect the financial operation",
      detail:
        "H1 (the owner was killed to protect the operation from the exposure his audit would create) is the first face of the fork; its only current support is the shared narrative OBS_B4.",
      action: "RECORD_REASONING",
      derivedFrom: [OBS_B4],
    }),
    ledgerEntry({
      id: REASON_P2_03,
      ordering: 3,
      kind: "HYPOTHESIS_COMPARISON",
      title: "H2 — regain / keep control",
      detail:
        "H2 (the removal of the president and assumption of control threatened the operation's hold on the network; the killing restored it) rests on the SAME shared narrative OBS_B4 — hence the pre-evidence tie.",
      action: "RECORD_REASONING",
      derivedFrom: [OBS_B4],
    }),
    ledgerEntry({
      id: REASON_P2_04,
      ordering: 4,
      kind: "HYPOTHESIS_COMPARISON",
      title: "H3 — weakest by honest signal",
      detail:
        "H3 (personal or non-operational motive) has no distinct observation set in the current record and collapses by the honest signal.",
      action: "RECORD_REASONING",
    }),
    ledgerEntry({
      id: REASON_P2_05,
      ordering: 5,
      kind: "GRAPH_HOLE",
      title: "Access vs. purpose",
      detail:
        "The graph can show access (which organizations touch the operation) but cannot yet show purpose (who benefits from the killing). The motive hole sits between people with access and people with motive.",
      action: "RECORD_REASONING",
      derivedFrom: [OBS_B4, OBS_B5],
    }),
    ledgerEntry({
      id: REASON_P2_06,
      ordering: 6,
      kind: "EVIDENCE_REQUEST",
      title: "Next-best evidence is the motive discriminator",
      detail:
        "The audit / financial record (S1) is requested to break the H1/H2 fork — a motive discriminator, not a hidden relationship. EREQ_P2 SUBMITTED.",
      action: "REQUEST_RECORDS",
      derivedFrom: [OBS_B4],
    }),
    ledgerEntry({
      id: REASON_P2_07,
      ordering: 7,
      kind: "PREDICTION_FREEZE",
      title: "Pre-evidence comparison frozen",
      detail:
        "The pre-evidence H1/H2/H3 comparison is frozen (FREEZE_P2) with a deterministic fingerprint for a prediction-style replay after the second evidence is ingested.",
      action: "PRESERVE_EVIDENCE",
    }),
  ];
  return { id: LEDGER_P2, investigationId: INVESTIGATION_B_ID, caseId: CASE_B_ID, entries };
}

// ============================================================================
// Phase-2 initial derivation event stream (8 events, "phase2" sequence)
// ============================================================================

function phase2Timestamp(hour: number): string {
  return `2024-07-01T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function phase2Event(
  id: string,
  action: string,
  targetType: string,
  targetId: string,
  description: string,
  hour: number,
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
    timestamp: phase2Timestamp(hour),
    delayMs: 350 * index,
  };
}

export function buildPhase2Events(): readonly DemoStreamEvent[] {
  return [
    phase2Event(EVT_P2_01, "HYPOTHESIS_ANALYSIS_STARTED", "HYPOTHESIS", HYP_P2_H1, "Phase 2 opened: why was Roger Wheeler killed?", 10, 0),
    phase2Event(EVT_P2_02, "HYPOTHESES_PROPOSED", "HYPOTHESIS", HYP_P2_H1, "Three canonical competing hypotheses proposed (H1 protect operation / H2 regain control / H3 personal).", 11, 1),
    phase2Event(EVT_P2_03, "HYPOTHESES_COMPARED", "HYPOTHESIS", HYP_P2_H2, "Motive pool compared across the workspace observations; OBS_B4 is the shared narrative.", 12, 2),
    phase2Event(EVT_P2_04, "HYPOTHESES_ASSESSED", "HYPOTHESIS", HYP_P2_H3, "Reverse-hypothesis assessment: H1 and H2 tie on the shared record; H3 is weakest by honest signal.", 13, 3),
    phase2Event(EVT_P2_05, "COMPARISON_RENDERED", "HYPOTHESIS", HYP_P2_H1, "Three portraits, sketched by the same record. None of them has won yet.", 14, 4),
    phase2Event(EVT_P2_06, "GRAPH_HOLE_DETECTED", "GRAPH_HOLE", HOLE_P2_MOTIVE, "The graph can show access. It cannot yet show purpose — the motive hole between people with access and people with motive.", 15, 5),
    phase2Event(EVT_P2_07, "EVIDENCE_REQUEST_CREATED", "EVIDENCE_REQUEST", EREQ_P2, "Next-best evidence is the motive discriminator: the WJA audit / financial document (House Report III.B.5).", 16, 6),
    phase2Event(EVT_P2_08, "FREEZE_COMPARED", "PREDICTION_FREEZE", FREEZE_P2, "Pre-evidence comparison frozen deterministically for a prediction-style replay.", 17, 7),
  ];
}

// ============================================================================
// Phase-2 derivation (pure, deterministic)
// ============================================================================

export interface Phase2Derivation {
  readonly frames: readonly MotiveHypothesisFrame[];
  readonly hypotheses: readonly Hypothesis[];
  readonly lead: Lead;
  readonly gap: InvestigativeGap;
  readonly hole: GraphHole;
  readonly evidenceRequest: EvidenceRequest;
  readonly comparison: MotiveHypothesisComparison;
  readonly freeze: Phase2AssessmentFreeze;
  readonly ledger: ReasoningLedger;
  readonly events: readonly DemoStreamEvent[];
}

/** Deterministic Phase-2 derivation over the CANONICAL Case B fixture set.
 *  Consumes only PASS 1 observations — never fenced S1 material. */
export function derivePhase2(): Phase2Derivation {
  const frames = buildPhase2Frames();
  const { rows, pool } = computeMotiveScores(
    frames,
    caseBFixtureSet.observations,
    "PRE_EVIDENCE",
  );
  const hypotheses = frames.map(buildPreEvidenceHypothesis);
  const lead = buildLead();
  const gap = buildGap();
  const hole = buildHole();
  const evidenceRequest = buildEvidenceRequest();
  const comparison: MotiveHypothesisComparison = { stage: "PRE_EVIDENCE", rows };
  const freeze = buildFreeze(rows, pool);
  const ledger = buildPreLedger();
  const events = buildPhase2Events();
  return {
    frames,
    hypotheses,
    lead,
    gap,
    hole,
    evidenceRequest,
    comparison,
    freeze,
    ledger,
    events,
  };
}

// ============================================================================
// S1 record builders — live second-evidence ingestion (DERIVED_ON_INGEST)
// ============================================================================

const S1_SCOPE_LEAKSAFE = true;

function buildS1Source(): Source {
  return SourceSchema.parse({
    id: SRC_S1_AUDIT,
    caseId: CASE_B_ID,
    name: PHASE2_SECOND_EVIDENCE_CLASS,
    type: "FILE_UPLOAD",
    status: "ACTIVE",
    systemOrigin: "frontend.demo.v1",
    evidenceIds: [EVID_S1_AUDIT],
    description:
      "WJA audit / financial document account — the physical corporate audit and financial records are BLOCKED to the investigation (research required: corporate records, Connecticut Special Revenue archives, Tulsa/DA file). " +
      "The House Report's public narrative of the audit and its timing is the only account currently available; it is ingested here honestly as a report-text account, NOT as the sealed corporate document.",
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function buildS1Artifact(): Artifact {
  return ArtifactSchema.parse({
    id: ART_S1_AUDIT,
    evidenceId: EVID_S1_AUDIT,
    sourceId: SRC_S1_AUDIT,
    type: "DOCUMENT",
    filename: "wja-audit-account-house-report.txt",
    mimeType: "text/plain",
    sizeBytes: 2400,
    hash: demoContentHash("phase2:wja-audit-account"),
    storagePath: "ingest/phase2/wja-audit-account-house-report.txt",
    extractedText:
      "SECOND EVIDENCE — WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5) — PUBLIC ACCOUNT ONLY. " +
      "The physical corporate audit file is sealed / BLOCKED; the House report narrative records the audit of the company's financial operation " +
      "and its timing relative to the homicide. The extract does not reproduce the sealed document's figures.",
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function s1Provenance(): {
  sourceId: string;
  artifactId: string;
  documentRef: string;
  extractor: string;
} {
  return {
    sourceId: SRC_S1_AUDIT,
    artifactId: ART_S1_AUDIT,
    documentRef: "WJA audit / financial account (House Report III.B.5)",
    extractor: S1_EXTRACTOR,
  };
}

function buildS1Evidence(observationIds: readonly string[]): Evidence {
  return EvidenceSchema.parse({
    id: EVID_S1_AUDIT,
    caseId: CASE_B_ID,
    investigationId: INVESTIGATION_B_ID,
    sourceId: SRC_S1_AUDIT,
    type: "RECORD",
    status: "PROCESSED",
    title: PHASE2_SECOND_EVIDENCE_CLASS,
    description:
      "House-report public account of the WJA audit / financial document and its timing relative to the homicide — the honest fallback for the physically BLOCKED corporate audit record. " +
      "It does not reproduce the sealed document and does not name who killed Roger Wheeler. Motive-discriminator posting: the account supports the financial-operation exposure reading (H1) more than the control reading (H2).",
    artifactIds: [ART_S1_AUDIT],
    observationIds: [...observationIds],
    entityIds: [ENT_WHEELER, ENT_WJA],
    hypothesisIds: [HYP_P2_H1, HYP_P2_H2, HYP_P2_H3],
    strength: PHASE2_STRENGTH.evidence,
    posture: "T1_INVESTIGATIVE_LEAD",
    provenance: {
      sourceId: SRC_S1_AUDIT,
      artifactId: ART_S1_AUDIT,
      documentRef: "WJA audit / financial account (House Report III.B.5)",
      extractor: S1_EXTRACTOR,
    },
    ingestionTime: S1_INGEST_AT,
    observedAt: S1_AUDIT_EVENT_AT,
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function buildS1Observation(params: {
  id: string;
  type: string;
  content: string;
  strength: number;
}): Observation {
  return ObservationSchema.parse({
    id: params.id,
    evidenceId: EVID_S1_AUDIT,
    sourceId: SRC_S1_AUDIT,
    type: params.type,
    content: params.content,
    entityIds: [ENT_WHEELER, ENT_WJA],
    candidateMentions: [],
    hypothesisIds: [HYP_P2_H1, HYP_P2_H2, HYP_P2_H3],
    strength: params.strength,
    provenance: s1Provenance(),
    observedAt: S1_AUDIT_EVENT_AT,
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function buildS1Observations(): readonly Observation[] {
  return [
    buildS1Observation({
      id: OBS_P2_A1,
      type: "FINANCIAL",
      content:
        "SECOND EVIDENCE — the audit Roger Wheeler ordered had begun probing the money skimmed from the company's financial operation; the House report's narrative is the only public account of the audit (the corporate document itself is sealed and BLOCKED).",
      strength: PHASE2_STRENGTH.obsA1,
    }),
    buildS1Observation({
      id: OBS_P2_A2,
      type: "FACTUAL",
      content:
        "SECOND EVIDENCE — Wheeler was murdered shortly after the audit began, while the audit of the company's financial operation was underway; the audit had been ordered months before the murder.",
      strength: PHASE2_STRENGTH.obsA2,
    }),
    buildS1Observation({
      id: OBS_P2_A3,
      type: "FACTUAL",
      content:
        "SECOND EVIDENCE LIMITATION — no public record shows the amount skimmed or any written audit finding before the murder; the corporate audit file remains BLOCKED pending research (corporate records and Connecticut Special Revenue files).",
      strength: PHASE2_STRENGTH.obsA3,
    }),
  ];
}

/** Deterministic support for the candidate motive-context relation/edge:
 *   0.5 · audit narrative + 0.3 · timing context + 0.2 · structural fit (1 =
 *   the financial operation is structurally joined to the owner). Defaults yield
 *   0.5·0.7 + 0.3·0.7 + 0.2·1.0 = 0.76. The edge stays PROPOSED (judge-acceptable
 *   only — a machine score must not silently accept it). */
export function derivePhase2Support(input?: {
  readonly auditStrength?: number;
  readonly timingStrength?: number;
  readonly structuralFit?: number;
}): number {
  return round4(
    PHASE2_SUPPORT_WEIGHTS.auditNarrative *
      (input?.auditStrength ?? PHASE2_STRENGTH.obsA1) +
      PHASE2_SUPPORT_WEIGHTS.timingContext *
        (input?.timingStrength ?? PHASE2_STRENGTH.obsA2) +
      PHASE2_SUPPORT_WEIGHTS.structuralFit * (input?.structuralFit ?? 1),
  );
}

function buildS1Relation(support: number): RelationHypothesis {
  return RelationHypothesisSchema.parse({
    id: REL_B_AUDIT,
    sourceEntityId: ENT_WJA,
    targetEntityId: ENT_WHEELER,
    relationType: "financial",
    support,
    evidenceBasis: [OBS_P2_A1, OBS_P2_A2],
    contradictions: [OBS_P2_A3],
    temporalInterval: {
      validFrom: S1_AUDIT_EVENT_AT,
      precision: "approximate",
      semantics: "observed",
    },
    directed: true,
    strength: PHASE2_STRENGTH.structuralImportance,
    status: "PROPOSED",
    provenance: s1Provenance(),
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function buildS1Edge(support: number): GraphEdge {
  return GraphEdgeSchema.parse({
    id: GE_B_AUDIT_WJA,
    investigationId: INVESTIGATION_B_ID,
    versionId: GRAPH_VERSION_B,
    sourceNodeId: GN_B_WJA,
    targetNodeId: GN_B_WHEELER,
    relationType: "financial",
    relationHypothesisId: REL_B_AUDIT,
    support,
    structuralImportance: PHASE2_STRENGTH.structuralImportance,
    directed: true,
    temporalRange: {
      validFrom: S1_AUDIT_EVENT_AT,
      precision: "approximate",
      semantics: "observed",
    },
    // The graph edge materializes the PROPOSED relation as an ACTIVE edge
    // (ONLY the graph-edge lifecycle is exposed on GraphEdge; the candidacy is
    // carried honestly by the relation hypothesis REL_B_AUDIT, whose status
    // stays PROPOSED — a machine score must not silently accept it).
    status: "ACTIVE",
    observationCount: 2,
    sourceCount: 1,
    createdAt: S1_INGEST_AT,
    updatedAt: S1_INGEST_AT,
  });
}

function s1IngestEntry(observationIds: readonly string[]): {
  sourceId: string;
  artifactId: string;
  documentRef: string;
  extractor: string;
  derivedFrom: readonly string[];
} {
  return {
    sourceId: SRC_S1_AUDIT,
    artifactId: ART_S1_AUDIT,
    documentRef: "WJA audit / financial account (House Report III.B.5)",
    extractor: S1_EXTRACTOR,
    derivedFrom: [...observationIds],
  };
}

function reassessHypothesis(
  pre: Hypothesis,
  postRow: MotiveHypothesisScoreRow,
): Hypothesis {
  const promoted = postRow.canonicalStatus === "SUPPORTED";
  const chain = {
    entries: [
      ...(pre.provenance.entries?.map((entry) => ({ ...entry })) ?? []),
      s1IngestEntry([...postRow.supportingObservationIds]),
    ],
    currentHypothesisId: pre.id,
    createdAt: pre.provenance.createdAt,
  };
  return HypothesisSchema.parse({
    ...pre,
    status: promoted ? "SUPPORTED" : "ACTIVE",
    confidence: promoted ? round4(pre.confidence + 0.1) : pre.confidence,
    supportingObservationIds: [...postRow.supportingObservationIds],
    contradictingObservationIds: [...postRow.contradictingObservationIds],
    supportingEvidenceIds: promoted
      ? dedupe([...(pre.supportingEvidenceIds ?? []), EVID_S1_AUDIT])
      : (pre.supportingEvidenceIds ?? []),
    contradictingEvidenceIds: pre.contradictingEvidenceIds ?? [],
    provenance: chain,
    updatedAt: S1_INGEST_AT,
  });
}

function reassessGap(gap: InvestigativeGap): InvestigativeGap {
  if (gap.status === "PARTIALLY_ADDRESSED") return gap;
  return InvestigativeGapSchema.parse({
    ...gap,
    status: "PARTIALLY_ADDRESSED",
    resolution:
      "PARTIAL: ingestion of the WJA audit / financial account discriminates why Wheeler was killed — the financial-operation exposure reading (H1) posts ahead of the control reading (H2), and the candidate motive-context edge (WJA → Wheeler, financial) is PROPOSED. NOT resolved: the document remains sealed/blocked and no finding has been proved; H2 retains partial overlap and H3 stays weakest.",
    updatedAt: S1_INGEST_AT,
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
    updatedAt: S1_INGEST_AT,
  });
}

// ============================================================================
// Phase-2 S1 delta / record / ledger entries
// ============================================================================

function buildDelta(
  d: Phase2Derivation,
  preRows: readonly MotiveHypothesisScoreRow[],
  prePool: readonly string[],
  postRows: readonly MotiveHypothesisScoreRow[],
  postPool: readonly string[],
): Phase2EvidenceDelta {
  const freeze = d.freeze;
  const after: Phase2ScoreState = {
    stage: "POST_EVIDENCE",
    rows: postRows.map((r) => ({ ...r })),
    observationIds: [...postPool],
    fingerprint: computePhase2FreezeFingerprintAfter(freeze, postRows, postPool),
  };
  const before: Phase2ScoreState = {
    stage: "PRE_EVIDENCE",
    rows: preRows.map((r) => ({ ...r })),
    observationIds: [...prePool],
    fingerprint: freeze.fingerprint,
  };
  const holeStatusChanges: readonly Phase2HoleStatusChange[] = [
    {
      graphHoleId: HOLE_P2_MOTIVE,
      status: "PARTIALLY_RESOLVED",
      derivedFromEvidenceIds: [EVID_S1_AUDIT],
    },
  ];
  return {
    caseId: CASE_B_ID,
    investigationId: INVESTIGATION_B_ID,
    appliedAt: S1_INGEST_AT,
    evidenceIngestedIds: [EVID_S1_AUDIT],
    observationExtractedIds: [OBS_P2_A1, OBS_P2_A2, OBS_P2_A3],
    relationCreatedIds: [REL_B_AUDIT],
    graphNodesAdded: [],
    graphEdgesAdded: [GE_B_AUDIT_WJA],
    hypothesisPromotedIds: [HYP_P2_H1],
    evidenceRequestIdsCompleted: [EREQ_P2],
    gapStatusChanges: [
      { gapId: GAP_AG2, from: "IDENTIFIED", to: "PARTIALLY_ADDRESSED" },
    ],
    holeStatusChanges,
    before,
    after,
    rankingChanged: true,
    leakSafeClass: PHASE2_SECOND_EVIDENCE_CLASS,
  };
}

function buildRecord(delta: Phase2EvidenceDelta): Phase2S1Record {
  return {
    determinismLabel: "indago-phase2-s1",
    ingestedAt: S1_INGEST_AT,
    evidenceId: EVID_S1_AUDIT,
    evidenceClass: PHASE2_SECOND_EVIDENCE_CLASS,
    evidenceStatus: "PROCESSED",
    physicalDocStatus: "BLOCKED",
    fallback: "REPORT_TEXT_ACCOUNT",
    extractedObservationIds: [OBS_P2_A1, OBS_P2_A2, OBS_P2_A3],
    relationId: REL_B_AUDIT,
    nodeId: GN_B_WJA,
    edgeId: GE_B_AUDIT_WJA,
    hypothesesPromoted: [HYP_P2_H1],
    gapId: GAP_AG2,
    gapStatus: "PARTIALLY_ADDRESSED",
    evidenceRequestId: EREQ_P2,
    evidenceRequestStatus: "COMPLETED",
    freezeFingerprintBefore: delta.before.fingerprint,
    freezeFingerprintAfter: delta.after.fingerprint,
    summary:
      "The WJA audit / financial account (House-report public narrative; physical corporate document BLOCKED) was ingested: the audit of the company's financial operation (H1) posts ahead of the control reading (H2), and personal retaliation (H3) stays weakest. " +
      "It records motive evidence — NOT proof of who killed Wheeler.",
  };
}

export function buildPhase2RunLedgerEntries(): readonly ReasoningLedgerEntry[] {
  return [
    ledgerEntry({
      id: REASON_P2_08,
      ordering: 8,
      kind: "INGESTION",
      title: "Second evidence ingested",
      detail:
        "S1 ingested as the honest fallback: the physical WJA audit / financial document is BLOCKED (research required); the House-report public account was ingested as report-text.",
      action: "RECORD_REASONING",
      derivedFrom: [EVID_S1_AUDIT, OBS_P2_A1, OBS_P2_A2, OBS_P2_A3],
      at: S1_INGEST_AT,
    }),
    ledgerEntry({
      id: REASON_P2_09,
      ordering: 9,
      kind: "REASSESSMENT",
      title: "Post-ingestion reassessment",
      detail:
        "Re-scoring re-ran the reverse-hypothesis engine: H1 (protect the financial operation) is the leading derived explanation; H2 retains partial overlap on the shared narrative (OBS_B4); the motive is NOT-PROVEN.",
      action: "RECORD_REASONING",
      derivedFrom: [OBS_B4, OBS_P2_A1, OBS_P2_A2, OBS_P2_A3],
      at: S1_INGEST_AT,
    }),
    ledgerEntry({
      id: REASON_P2_10,
      ordering: 10,
      kind: "LIMITATION",
      title: "Testimonial-chain weakness (later layer)",
      detail:
        "The later hearsay chain (a witness who never met the security chief; the chief died before he could be questioned) is secondhand attribution. Classification: SOURCE_CREDIBILITY; the motive stays UNRESOLVED under both readings. The hearsay edges render a hearsay-posture with low declared support — never PROVEN/CONFIRMED.",
      action: "RECORD_REASONING",
      derivedFrom: [REC_P2_LATER_WITNESS, REC_CALLAHAN_BODY],
      at: S1_INGEST_AT,
    }),
    ledgerEntry({
      id: REASON_P2_11,
      ordering: 11,
      kind: "FINAL_ACTION",
      title: "Open a new lead for the blocked records",
      detail:
        "The physical audit / financial records remain BLOCKED; a new lead is opened to obtain the corporate records and the Connecticut Special Revenue files (research required) — the documents, not this analysis, would strengthen or weaken the leading explanation.",
      action: "OPEN_NEW_LEAD",
      derivedFrom: [EVID_S1_AUDIT],
      at: S1_INGEST_AT,
    }),
  ];
}

// ============================================================================
// Phase-2 S1 event stream (10 events, "phase2-s1" sequence)
// ============================================================================

function s1Timestamp(hour: number): string {
  return `2024-07-02T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function s1Event(
  id: string,
  action: string,
  targetType: string,
  targetId: string,
  description: string,
  hour: number,
  index: number,
): DemoStreamEvent {
  return {
    id,
    investigationId: INVESTIGATION_B_ID,
    action,
    actor: S1_EXTRACTOR,
    targetType,
    targetId,
    description,
    timestamp: s1Timestamp(hour),
    delayMs: 350 * index,
  };
}

export function buildPhase2S1Events(): readonly DemoStreamEvent[] {
  return [
    s1Event(EVT_P2S_01, "EVIDENCE_INGESTED", "EVIDENCE", EVID_S1_AUDIT, "Ingested second evidence: WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5) — public account of the blocked corporate document.", 10, 0),
    s1Event(EVT_P2S_02, "OBSERVATION_EXTRACTED", "OBSERVATION", OBS_P2_A1, "Extracted observation: the audit Wheeler ordered was probing the money skimmed from the company's financial operation.", 11, 1),
    s1Event(EVT_P2S_03, "OBSERVATION_EXTRACTED", "OBSERVATION", OBS_P2_A2, "Extracted observation: Wheeler was murdered shortly after the audit began, while the audit was underway.", 12, 2),
    s1Event(EVT_P2S_04, "OBSERVATION_EXTRACTED", "OBSERVATION", OBS_P2_A3, "Extracted observation (limitation): no public figure or written audit finding; the physical document stays BLOCKED.", 13, 3),
    s1Event(EVT_P2S_05, "RELATION_CREATED", "RELATION", REL_B_AUDIT, "Created PROPOSED financial relation hypothesis: WJA ↔ Wheeler (audit-exposure context).", 14, 4),
    s1Event(EVT_P2S_06, "GRAPH_EDGE_ADDED", "GRAPH_EDGE", GE_B_AUDIT_WJA, "Materialized the PROPOSED relation as an ACTIVE candidate motive-context edge: WJA → Wheeler (financial).", 15, 5),
    s1Event(EVT_P2S_07, "REASSESSMENT_RUN", "HYPOTHESIS", HYP_P2_H1, "Post-ingestion re-scoring re-ran the reverse-hypothesis engine on the surviving evidence.", 16, 6),
    s1Event(EVT_P2S_08, "HYPOTHESIS_PROMOTED", "HYPOTHESIS", HYP_P2_H1, "H1 (protect the operation) is the leading derived explanation — supported, not proved.", 17, 7),
    s1Event(EVT_P2S_09, "GAP_ADDRESSED", "GAP", GAP_AG2, "Gap updated: PARTIALLY_ADDRESSED — motive-discrimination progress recorded; the residual question stays open.", 18, 8),
    s1Event(EVT_P2S_10, "LEDGER_APPENDED", "REASONING_LEDGER", LEDGER_P2, "Reasoning ledger appended with the reassessment, hearsay limitation, and final action.", 19, 9),
  ];
}

// ============================================================================
// Graph overlay catalog (drives the realtime graph deltas with no UI change)
// ============================================================================

export function buildPhase2Catalog(edge: GraphEdge): GraphRealtimeCatalog {
  return {
    [catalogKey("RELATION_CREATED", REL_B_AUDIT)]: { kind: "edge", edge },
    [catalogKey("GRAPH_EDGE_ADDED", GE_B_AUDIT_WJA)]: { kind: "edge", edge },
  };
}

// ============================================================================
// Package assembly
// ============================================================================

export interface Phase2S1Package {
  readonly source: Source;
  readonly artifact: Artifact;
  readonly evidence: Evidence;
  readonly observations: readonly Observation[];
  readonly relation: RelationHypothesis;
  readonly edge: GraphEdge;
  readonly reassessedHypotheses: readonly Hypothesis[];
  readonly gapReassessment: InvestigativeGap;
  readonly evidenceRequestCompletion: EvidenceRequest;
  readonly delta: Phase2EvidenceDelta;
  readonly record: Phase2S1Record;
  readonly events: readonly DemoStreamEvent[];
  readonly catalog: GraphRealtimeCatalog;
  readonly ledgerEntries: readonly ReasoningLedgerEntry[];
  readonly run: Phase2RunResult;
}

/** Build the full Phase-2 S1 package. Deterministic: the same inputs always
 *  yield the same canonical records. `d` defaults to the canonical derivation. */
export function buildPhase2S1Package(d: Phase2Derivation = derivePhase2()): Phase2S1Package {
  const support = derivePhase2Support({});
  const observations = buildS1Observations();
  const evidence = buildS1Evidence(observations.map((o) => o.id));
  const source = buildS1Source();
  const artifact = buildS1Artifact();
  const relation = buildS1Relation(support);
  const edge = buildS1Edge(support);

  const postObservations = dedupe([
    ...caseBFixtureSet.observations.map((o) => o.id),
    ...observations.map((o) => o.id),
  ])
    .map((id) =>
      [...caseBFixtureSet.observations, ...observations].find((o) => o.id === id),
    )
    .filter((o): o is Observation => o !== undefined);

  const { rows: preRows, pool: prePool } = computeMotiveScores(
    d.frames,
    caseBFixtureSet.observations,
    "PRE_EVIDENCE",
  );
  const { rows: postRows, pool: postPool } = computeMotiveScores(
    d.frames,
    postObservations,
    "POST_EVIDENCE",
  );

  const preById = new Map(d.hypotheses.map((h) => [h.id, h]));
  const reassessedHypotheses = postRows.map((row) => {
    const pre = preById.get(row.hypothesisId);
    if (!pre) throw new Error(`Missing pre-evidence hypothesis ${row.hypothesisId}`);
    return reassessHypothesis(pre, row);
  });
  const gapReassessment = reassessGap(d.gap);
  const evidenceRequestCompletion = completeEvidenceRequest(d.evidenceRequest, evidence.id);
  const events = buildPhase2S1Events();
  const catalog = buildPhase2Catalog(edge);
  const ledgerEntries = buildPhase2RunLedgerEntries();
  const delta = buildDelta(d, preRows, prePool, postRows, postPool);
  const record = buildRecord(delta);

  const patch: Phase2RunResult["patch"] = {
    sources: [source],
    artifacts: [artifact],
    evidence: [evidence],
    observations: [...observations],
    relations: [relation],
    graphNodes: [],
    graphEdges: [edge],
    hypotheses: [...reassessedHypotheses],
    gapReassessments: [{ id: gapReassessment.id, record: gapReassessment }],
    evidenceRequestCompletions: [
      { id: evidenceRequestCompletion.id, record: evidenceRequestCompletion },
    ],
  };
  const run: Phase2RunResult = {
    patch,
    record,
    delta,
    ledgerEntries,
  };
  return {
    source,
    artifact,
    evidence,
    observations,
    relation,
    edge,
    reassessedHypotheses,
    gapReassessment,
    evidenceRequestCompletion,
    delta,
    record,
    events,
    catalog,
    ledgerEntries,
    run,
  };
}

/**
 * Idempotently insert/reassess the Phase-2 S1 patch into a demo workspace
 * state. New records are inserted only once; reassessed hypotheses, gaps, and
 * evidence requests always overwrite with their deterministic new state.
 */
export function applyPhase2RunToState(
  state: DemoWorkspaceState,
  run: Phase2RunResult,
): void {
  const p = run.patch;
  const insert = <T>(map: Map<string, T>, record: { id: string } & T): void => {
    if (!map.has(record.id)) map.set(record.id, record);
  };
  for (const record of p.sources) insert(state.sourceById, record);
  for (const record of p.artifacts) insert(state.artifactById, record);
  for (const record of p.evidence) insert(state.evidenceById, record);
  for (const record of p.observations) insert(state.observationById, record);
  for (const record of p.relations) insert(state.relationById, record);
  for (const record of p.graphNodes) insert(state.graphNodeById, record);
  for (const record of p.graphEdges) insert(state.graphEdgeById, record);
  for (const record of p.hypotheses) state.hypothesisById.set(record.id, record);
  for (const { id, record } of p.gapReassessments) state.gapById.set(id, record);
  for (const { id, record } of p.evidenceRequestCompletions) {
    state.evidenceRequestById.set(id, record);
  }
}

/** Build (from the default derivation) and apply a Phase-2 S1 run. */
export function runPhase2S1Ingestion(
  state: DemoWorkspaceState,
  d: Phase2Derivation = derivePhase2(),
): Phase2RunResult {
  const run = buildPhase2S1Package(d).run;
  applyPhase2RunToState(state, run);
  return run;
}

// ============================================================================
// Match gate — the analyst's submission must carry the target class
// ============================================================================

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when the submission title or any file name contains the canonical
 *  EREQ_P2 target class (normalized). Anything else does NOT trigger ingest. */
export function matchesPhase2Class(
  title: string,
  fileNames: readonly string[],
): boolean {
  const needle = normalize(PHASE2_SECOND_EVIDENCE_CLASS);
  const haystack = normalize([title, ...fileNames].join(" "));
  return haystack.includes(needle);
}

// ============================================================================
// Later-historical validation overlay (class-5 LATER_HISTORICAL_KNOWLEDGE)
//
// The House-report testimony surfaced LONG after the Phase-2 analysis (after
// this derivation closes). The hearsay chain is single-source and secondhand:
// a later witness (who never met the security chief) attributed the information
// to THE SECURITY CHIEF, who died before he could be questioned. The fencing
// releases THIS projection only here — never in any earlier surface.
// ============================================================================

/** Deterministic later-historical validation overlay (run-time derivation).
 *  Rendered as LATER_HISTORICAL_KNOWLEDGE and NEVER PROVEN/CONFIRMED. */
export function buildPhase2HistoricalValidation(): Phase2HistoricalValidation {
  return {
    hypothesisIds: [HYP_P2_H1],
    classification: "LATER_HISTORICAL_KNOWLEDGE",
    verdict: "PARTIALLY_CORROBORATED",
    witnessEntityId: REC_P2_LATER_WITNESS,
    hearsayChain: [
      {
        hopLabel: "chain-1 (later testimony)",
        entityId: REC_P2_LATER_WITNESS,
        note: "A later witness reported that a sheet identifying the president as the target was tendered; the account was reported after this analysis closed.",
      },
      {
        hopLabel: "chain-2 (secondhand attribution)",
        entityId: ENT_CALLAHAN,
        note: "The information is attributed to THE SECURITY CHIEF; the witness never met the security chief, and the chief died before he could be questioned.",
      },
    ],
    nonMeeting:
      "The later witness never met the security chief; the hearsay chain is single-source and secondhand.",
    stance: "SOURCE_CREDIBILITY",
    mannerOfProof: "UNRESOLVED",
    derivedFrom: [REC_P2_LATER_WITNESS, REC_CALLAHAN_BODY],
    at: { value: "2024-07-02T12:00:00.000Z", precision: "exact" },
  };
}

/** Marker so consumers/tests can assert the phase-2 class is leak-safe by
 *  construction (the S1 scope never carries the later-witness names). */
export const PHASE2_S1_LEAKSAFE = S1_SCOPE_LEAKSAFE;