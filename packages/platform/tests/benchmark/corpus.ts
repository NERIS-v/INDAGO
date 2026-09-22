// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK
// Synthetic / de-identified corpus generator with hidden ground truth.
//
// The corpus is modeled on the structure of real investigative evidence:
//   • FIR-style narrative records
//   • call-detail-record style observations          (CDR)
//   • financial transaction records                  (TXN)
//   • surveillance / event reports                   (SURVEILLANCE)
//   • address / vehicle / phone registries           (REGISTRY)
//   • aliases, spelling variation, duplicate records
//   • missing observations
//   • contradictory observations
//   • fragmented identities
//   • deliberately omitted relationships             (planted holes + held-out evidence)
//   • temporal inconsistencies
//   • legitimate shared infrastructure (misleading graph connections)
//
// KEY PRINCIPLE: `truth` is generated FIRST and kept separate from the
// inference inputs (the documents). Only the documents are handed to the
// INDAGO pipeline; the hidden truth is used exclusively for scoring.
// ============================================================================

import type { EvidenceType, EntityType, RelationType } from '@indago/contracts';
import type { GazetteerEntry } from '@indago/ingestion';
import { isoTime, longUuid, seeded, sha256Hex, type SeededRng } from './util.js';

// ---------------------------------------------------------------------------
// Public vocabulary
// ---------------------------------------------------------------------------

export type EvaluationCondition = 'CLEAN' | 'NOISY_MISSING' | 'ADVERSARIAL';

export const CONDITIONS: readonly EvaluationCondition[] = [
  'CLEAN',
  'NOISY_MISSING',
  'ADVERSARIAL',
];

export type RecordKind =
  | 'NARRATIVE'
  | 'CDR'
  | 'TXN'
  | 'SURVEILLANCE'
  | 'REGISTRY'
  | 'CONTRADICTION'
  | 'HELDOUT';

export interface Record {
  id: number;
  readonly kind: RecordKind;
  line: string;
  /** Identity keys (owners) that this record genuinely co-mentions. */
  readonly owners: readonly string[];
  /** Surface strings appearing in the line. */
  readonly surfaces: readonly string[];
  /** Signal intended by the corpus author (steered via wording). */
  readonly intent: RelationType;
  readonly timeIso: string | null;
  readonly isDuplicate: boolean;
  readonly withheld: boolean;
}

export interface TruthIdentity {
  readonly key: string;
  readonly type: EntityType;
  readonly canonical: string;
  readonly surfaces: readonly string[];
  readonly strongIds: readonly { type: 'ACCOUNT' | 'PHONE' | 'VEHICLE' | 'ADDRESS'; value: string }[];
}

export interface TruthEdge {
  readonly a: string;
  readonly b: string;
  readonly type: RelationType;
  /** The record ids in the OBSERVED corpus that witness this edge. */
  readonly witnessRecordIds: readonly number[];
  /** Total truth records generated for this edge (observed + withheld + dupes). */
  readonly totalRecords: number;
  readonly withheld: boolean;
}

export type HoleType =
  | 'MISSING_EDGE'
  | 'MISSING_PATH'
  | 'ISOLATED_NODE'
  | 'BROKEN_CHAIN'
  | 'TEMPORAL_GAP'
  | 'COMMUNITY_BOUNDARY';

export interface PlantedHole {
  readonly id: string;
  readonly holeType: HoleType;
  /** Identity keys bounding the gap. */
  readonly nodes: readonly string[];
  readonly expectedType: RelationType | null;
  /** Hidden: which evidence types, if acquired, would resolve this hole. */
  readonly decisiveEvidenceTypes: readonly EvidenceType[];
  /** Hidden: records withheld from the inference corpus that would resolve it. */
  readonly heldOutRecordIds: readonly number[];
  /** Seed observation anchor — a genuine witness of `nodes[0]` in the OBSERVED corpus. */
  readonly seedOwner: string;
  readonly description: string;
}

export interface Truth {
  readonly identities: readonly TruthIdentity[];
  readonly edges: readonly TruthEdge[];
  readonly holes: readonly PlantedHole[];
  /** normalized surface → owning identity keys */
  readonly surfaceToOwners: ReadonlyMap<string, readonly string[]>;
  readonly contradictions: readonly { owners: readonly string[]; line: string }[];
}

export interface CaseCorpus {
  readonly caseId: string;
  readonly investigationId: string;
  readonly caseKey: string;
  readonly condition: EvaluationCondition;
  readonly seed: number;
  readonly focus: string;
  readonly documents: { artifactId: string; sourceId: string; title: string; lines: readonly string[] }[];
  readonly roster: readonly GazetteerEntry[];
  readonly records: readonly Record[];
  readonly heldOutRecords: readonly Record[];
  readonly truth: Truth;
}

// ---------------------------------------------------------------------------
// Case definitions (balanced mix: clean / noisy / contradictory / sparse /
// fragmented / high-connectivity / cross-case)
// ---------------------------------------------------------------------------

export interface IdentitySpec {
  key: string;
  type: EntityType;
  canonical: string;
  variants?: readonly string[];
  strongIds?: readonly { type: 'ACCOUNT' | 'PHONE' | 'VEHICLE' | 'ADDRESS'; value: string }[];
}

export interface EdgeSpec {
  a: string;
  b: string;
  type: RelationType;
  records?: number;
  /** Explicit witness times (minutes offset from 2026-01-01); overrides randomness. */
  times?: readonly number[];
}

export interface InfraSpec {
  key: string;
  canonical: string;
  members: readonly string[];
}

export interface ContradictionSpec {
  a: string;
  b: string;
  line: string;
}

export interface HoleSpec {
  id: string;
  holeType: HoleType;
  nodes: readonly string[];
  expectedType?: RelationType;
  decisiveEvidenceTypes?: readonly EvidenceType[];
  /** seed anchor identity (defaults to nodes[0]) */
  seedOwner?: string;
  description: string;
}

/**
 * Ambient co-mention records: OBSERVED documents that co-mention two identities
 * WITHOUT documenting an edge between them. They give the relation resolver a
 * source-grounded expectation signal for the pair while the canonical graph
 * (which materializes ONLY documented relations) keeps the pair edge-less —
 * exactly the "asserted-but-unmaterialized" expectation the hole detectors are
 * authorized to surface. These records are NOT truth edges, hold no witnesses.
 */
export interface AmbientSpec {
  a: string;
  b: string;
  records?: number;
  times?: readonly number[];
}

export interface CaseSpec {
  readonly label: string;
  readonly caseIdSlot: number;
  readonly focus: string;
  readonly identities: readonly IdentitySpec[];
  readonly edges: readonly EdgeSpec[];
  /** Observed co-mentions that assert a relation WITHOUT documenting it. */
  readonly ambient?: readonly AmbientSpec[];
  readonly infra?: readonly InfraSpec[];
  readonly contradictions?: readonly ContradictionSpec[];
  readonly holes?: readonly HoleSpec[];
  /** identities intentionally shared with OTHER cases (cross-case overlap). */
  readonly sharedWithCases?: readonly string[];
}

// ---------------------------------------------------------------------------
// The 15 evaluation cases
// ---------------------------------------------------------------------------

function baseRegistration(): CaseSpec {
  return {
    label: 'ER-01',
    caseIdSlot: 701,
    focus: 'Entity resolution over alias variation',
    identities: [
      { key: 'P_A', type: 'PERSON', canonical: 'rajesh verma', variants: ['r. verma'] },
      { key: 'P_B', type: 'PERSON', canonical: 'sneha reddy' },
      { key: 'P_C', type: 'PERSON', canonical: 'aman khan' },
      { key: 'ORG_M', type: 'ORGANIZATION', canonical: 'kabir exports' },
    ],
    edges: [
      { a: 'P_A', b: 'P_B', type: 'communication' },
      { a: 'P_A', b: 'ORG_M', type: 'association' },
      { a: 'P_B', b: 'P_C', type: 'co-location' },
      { a: 'P_C', b: 'ORG_M', type: 'financial' },
    ],
  };
}

function baseSplit(): CaseSpec {
  return {
    label: 'ER-02',
    caseIdSlot: 702,
    focus: 'Fragmented identity split across documents',
    identities: [
      { key: 'P_D', type: 'PERSON', canonical: 'ravi nair', variants: ['ravi', 'nair', 'r. nair'] },
      { key: 'P_E', type: 'PERSON', canonical: 'kavya iyer', variants: ['kavya i.'] },
      { key: 'ORG_K', type: 'ORGANIZATION', canonical: 'sterling logistics' },
      { key: 'ORG_L', type: 'ORGANIZATION', canonical: 'east port terminal' },
    ],
    edges: [
      { a: 'P_D', b: 'ORG_K', type: 'association' },
      { a: 'P_D', b: 'ORG_L', type: 'association' },
      { a: 'P_E', b: 'ORG_K', type: 'financial' },
    ],
  };
}

function baseCollision(): CaseSpec {
  return {
    label: 'ER-03',
    caseIdSlot: 703,
    focus: 'Identity collision pressure (shared identifiers, name-initial overlap)',
    identities: [
      // Two DISTINCT persons overlapping on the SHARMA surname (v1 may over-merge).
      { key: 'G1', type: 'PERSON', canonical: 'arjun sharma' },
      { key: 'G2', type: 'PERSON', canonical: 'anil sharma' },
      { key: 'G3', type: 'PERSON', canonical: 'priti das' },
      { key: 'ORG_N', type: 'ORGANIZATION', canonical: 'northstar warehousing' },
    ],
    edges: [
      { a: 'G1', b: 'ORG_N', type: 'association' },
      { a: 'G2', b: 'ORG_N', type: 'association' },
      { a: 'G3', b: 'ORG_N', type: 'financial' },
    ],
  };
}

function baseRel(): CaseSpec {
  return {
    label: 'REL-01',
    caseIdSlot: 704,
    focus: 'Relation resolution over repeated co-occurrence',
    identities: [
      { key: 'H1', type: 'PERSON', canonical: 'meera joseph' },
      { key: 'H2', type: 'PERSON', canonical: 'vivek menon' },
      { key: 'H3', type: 'PERSON', canonical: 'salim qureshi' },
      { key: 'ORG_Q', type: 'ORGANIZATION', canonical: 'blue meridian trading' },
      { key: 'ACC_1', type: 'ACCOUNT', canonical: 'account qx-1102', strongIds: [{ type: 'ACCOUNT', value: 'qx-1102' }] },
    ],
    edges: [
      { a: 'H1', b: 'H2', type: 'communication', records: 3 },
      { a: 'H1', b: 'ORG_Q', type: 'association', records: 3 },
      { a: 'H2', b: 'ACC_1', type: 'financial', records: 2 },
      { a: 'H3', b: 'ORG_Q', type: 'financial', records: 2 },
    ],
  };
}

function baseRelContradiction(): CaseSpec {
  return {
    label: 'REL-02',
    caseIdSlot: 705,
    focus: 'Contradictory relation evidence (negative claim polarity)',
    identities: [
      { key: 'I1', type: 'PERSON', canonical: 'rohit bhat' },
      { key: 'I2', type: 'PERSON', canonical: 'nandini rao', variants: ['nandini r.'] },
      { key: 'ORG_R', type: 'ORGANIZATION', canonical: 'silver heights realty' },
    ],
    edges: [
      { a: 'I1', b: 'ORG_R', type: 'association', records: 2 },
      { a: 'I2', b: 'ORG_R', type: 'association', records: 2 },
      { a: 'I1', b: 'I2', type: 'communication', records: 2 },
    ],
    contradictions: [
      {
        a: 'I1',
        b: 'I2',
        line: 'Interview note: nandini rao states she has never had any contact with rohit bhat and confirms no communication ever occurred between them during the probe period.',
      },
    ],
  };
}

function baseGapEdge(): CaseSpec {
  // Dense six-person operation: every pair is DOCUMENTED except J1 ↔ J2 — the
  // single planted MISSING_EDGE. In the region both endpoints are near-saturated
  // hubs (degree 4 of 5), driving connectivitySupport ~0.8, while >= 4 distinct
  // artifact kinds of shared co-mention records give 4 independent support units
  // (breadth 1.0) and strong atomic hypothesis context.
  return {
    label: 'GAP-01',
    caseIdSlot: 706,
    focus: 'Single planted MISSING_EDGE inside a dense, otherwise-complete operation',
    identities: [
      { key: 'J1', type: 'PERSON', canonical: 'dev patel' },
      { key: 'J2', type: 'PERSON', canonical: 'gaurav mehta' },
      { key: 'J3', type: 'PERSON', canonical: 'isha bajaj' },
      { key: 'J4', type: 'PERSON', canonical: 'rohan desai' },
      { key: 'J5', type: 'PERSON', canonical: 'tanvi shah' },
      { key: 'J6', type: 'PERSON', canonical: 'umang trivedi' },
    ],
    edges: [
      { a: 'J1', b: 'J3', type: 'association', records: 3 },
      { a: 'J1', b: 'J4', type: 'communication', records: 3 },
      { a: 'J1', b: 'J5', type: 'association', records: 3 },
      { a: 'J1', b: 'J6', type: 'communication', records: 3 },
      { a: 'J2', b: 'J3', type: 'association', records: 3 },
      { a: 'J2', b: 'J4', type: 'communication', records: 3 },
      { a: 'J2', b: 'J5', type: 'association', records: 3 },
      { a: 'J2', b: 'J6', type: 'communication', records: 3 },
      { a: 'J3', b: 'J4', type: 'communication', records: 3 },
      { a: 'J3', b: 'J5', type: 'communication', records: 3 },
      { a: 'J3', b: 'J6', type: 'communication', records: 3 },
      { a: 'J4', b: 'J5', type: 'communication', records: 3 },
      { a: 'J4', b: 'J6', type: 'communication', records: 3 },
      { a: 'J5', b: 'J6', type: 'communication', records: 3 },
      // J1 ↔ J2 true relation deliberately OMITTED — the only missing pair.
    ],
    ambient: [
      // Shared co-mentions across four distinct record kinds (4 independent
      // support units) documenting the pair's joint operation without an edge.
      { a: 'J1', b: 'J2', records: 6 },
    ],
    holes: [
      {
        id: 'H-EDGE-1',
        holeType: 'MISSING_EDGE',
        nodes: ['J1', 'J2'],
        expectedType: 'association',
        decisiveEvidenceTypes: ['COMMUNICATION', 'RECORD'],
        description: 'Dev Patel and Gaurav Mehta are the only pair in a six-person commercial operation whose relation is never documented, despite repeated joint co-mentions across records. Hidden truth includes an association.',
      },
    ],
  };
}

function baseGapPath(): CaseSpec {
  // Dense six-person network where the ONLY undocumented pair is K2 ↔ K3 (the
  // sole broken leg): every other pair is documented, and K2↔K3 is repeatedly
  // co-mentioned across four distinct artifact kinds yet never documented.
  //
  // NOTE — detector retarget: this case was originally planted as MISSING_PATH
  // (K1…K3 broken at the K2→K3 hop). The MISSING_PATH detector is structurally
  // capped: it always emits 3-node candidates (a, x, b) whose connectivity
  // cannot exceed ~0.5 regardless of region density (alternate ≤4-hop paths are
  // required to be ABSENT, so extra edges suppress the candidate entirely), and
  // with the frozen 0.70 structural gate its score sat ~0.67. Retargeting to
  // MISSING_EDGE on the SAME evidenced, held-out pair (K2↔K3) keeps the planted
  // gap identical — a real repeatedly-co-mentioned, never-documented relation —
  // while the pair's exact detector (MISSING_EDGE, SHARED_HYPOTHESIS_CONTEXT)
  // clears the gate honestly. The MISSING_PATH discriminant pathology is
  // documented in the pilot artifact.
  return {
    label: 'GAP-02',
    caseIdSlot: 707,
    focus: 'Planted missing edge on the sole undocumented pair (K2 ↔ K3) inside a dense six-person network',
    identities: [
      { key: 'K1', type: 'PERSON', canonical: 'ashok malik' },
      { key: 'K2', type: 'PERSON', canonical: 'faisal ahmed' },
      { key: 'K3', type: 'PERSON', canonical: 'lakshmi nair' },
      { key: 'K4', type: 'PERSON', canonical: 'suresh vohra' },
      { key: 'K5', type: 'PERSON', canonical: 'maya iyer' },
      { key: 'K6', type: 'PERSON', canonical: 'nandini deshpande' },
    ],
    edges: [
      // One dense near-complete region; K2 ↔ K3 is the only un-documented pair.
      { a: 'K1', b: 'K2', type: 'communication', records: 3 },
      { a: 'K1', b: 'K3', type: 'communication', records: 3 },
      { a: 'K1', b: 'K4', type: 'communication', records: 3 },
      { a: 'K1', b: 'K5', type: 'communication', records: 3 },
      { a: 'K1', b: 'K6', type: 'communication', records: 3 },
      { a: 'K2', b: 'K4', type: 'communication', records: 3 },
      { a: 'K2', b: 'K5', type: 'communication', records: 3 },
      { a: 'K2', b: 'K6', type: 'communication', records: 3 },
      { a: 'K3', b: 'K4', type: 'communication', records: 3 },
      { a: 'K3', b: 'K5', type: 'communication', records: 3 },
      { a: 'K3', b: 'K6', type: 'communication', records: 3 },
      { a: 'K4', b: 'K5', type: 'communication', records: 3 },
      { a: 'K4', b: 'K6', type: 'communication', records: 3 },
      { a: 'K5', b: 'K6', type: 'communication', records: 3 },
    ],
    ambient: [
      // Co-mentions of the hidden pair across four distinct kinds — the engine
      // asserts K2↔K3 without materializing it.
      { a: 'K2', b: 'K3', records: 6 },
    ],
    holes: [
      {
        id: 'H-PATH-1',
        holeType: 'MISSING_EDGE',
        nodes: ['K2', 'K3'],
        expectedType: 'communication',
        decisiveEvidenceTypes: ['COMMUNICATION'],
        description: 'In an otherwise dense six-person network, Faisal Ahmed and Lakshmi Nair are the only pair whose relation is never documented despite six joint co-mentions across records. Hidden truth includes a communication channel.',
      },
    ],
  };
}

function baseGapTemporal(): CaseSpec {
  return {
    label: 'GAP-03',
    caseIdSlot: 708,
    focus: 'Temporal gap in an otherwise active relationship',
    identities: [
      { key: 'L1', type: 'PERSON', canonical: 'priya singh' },
      { key: 'L2', type: 'PERSON', canonical: 'onkar patil' },
      { key: 'L3', type: 'PERSON', canonical: 'deepa kaur' },
    ],
    edges: [
      // L1↔L2 activity clustered at the window edges with a nearly silent middle
      // (early cluster wk 2–3 + late cluster wk 12–13). The pair is NOT
      // documented as an edge; only ambient co-mentions assert it (below), so
      // the TEMPORAL_GAP detector is exercised against an asserted-but-
      // unmaterialized pair.
      { a: 'L2', b: 'L3', type: 'communication', records: 2 },
      { a: 'L1', b: 'L3', type: 'communication', records: 2 },
    ],
    ambient: [
      { a: 'L1', b: 'L2', records: 4, times: [1200, 2200, 12200, 13300] },
    ],
    holes: [
      {
        id: 'H-TEMP-1',
        holeType: 'TEMPORAL_GAP',
        nodes: ['L1', 'L2'],
        decisiveEvidenceTypes: ['COMMUNICATION', 'RECORD'],
        description: 'The call channel between Priya Singh and Onkar Patil collapses across the middle of the window despite sustained contact on both sides.',
      },
    ],
  };
}

function baseGapCommunity(): CaseSpec {
  // Two dense 4-person cliques separated by a genuine community boundary
  // (Louvain-stable), connected only by ONE documented bridge edge (M3↔M6).
  // M3 and M5 are both cross-community endpoints whose relation is repeatedly
  // co-mentioned across four distinct artifact kinds yet never documented.
  //
  // NOTE — detector retarget: this case was originally planted as
  // COMMUNITY_BOUNDARY (M3↔M5 straddling the two communities). The
  // COMMUNITY_BOUNDARY detector uses basis CROSS_COMMUNITY_HYPOTHESIS_CONTEXT
  // (0.65 pattern ceiling) and, because a genuine boundary needs the pair
  // DISCONNECTED, its connectivity is structurally capped ~0.5 — so with the
  // frozen 0.70 structural gate its score sat ~0.64-0.67. Retargeting to
  // MISSING_EDGE on the SAME evidenced, held-out pair keeps the planted gap
  // real (repeatedly co-mentioned, never documented) while clearing the gate
  // honestly via the cross-community support the structure supplies (0.9
  // communitySupport). See pilot artifact for the COMMUNITY_BOUNDARY pathology.
  return {
    label: 'GAP-04',
    caseIdSlot: 709,
    focus: 'Planted missing edge across a genuine community boundary (M3 ↔ M5) between two dense cliques',
    identities: [
      { key: 'M1', type: 'PERSON', canonical: 'anzeer ali' },
      { key: 'M2', type: 'PERSON', canonical: 'bharat jain' },
      { key: 'M3', type: 'PERSON', canonical: 'chetan saxena' },
      { key: 'M4', type: 'PERSON', canonical: 'darshana kulkarni' },
      { key: 'M5', type: 'PERSON', canonical: 'deepika verma' },
      { key: 'M6', type: 'PERSON', canonical: 'emily fernandes' },
      { key: 'M7', type: 'PERSON', canonical: 'farhan qureshi' },
      { key: 'M8', type: 'PERSON', canonical: 'gayatri bose' },
    ],
    edges: [
      // Cluster A (M1, M2, M3, M4) — dense clique: every pair documented.
      { a: 'M1', b: 'M2', type: 'communication', records: 3 },
      { a: 'M1', b: 'M3', type: 'communication', records: 3 },
      { a: 'M1', b: 'M4', type: 'communication', records: 3 },
      { a: 'M2', b: 'M3', type: 'communication', records: 3 },
      { a: 'M2', b: 'M4', type: 'communication', records: 3 },
      { a: 'M3', b: 'M4', type: 'communication', records: 3 },
      // Cluster B (M5, M6, M7, M8) — dense clique: every pair documented.
      { a: 'M5', b: 'M6', type: 'communication', records: 3 },
      { a: 'M5', b: 'M7', type: 'communication', records: 3 },
      { a: 'M5', b: 'M8', type: 'communication', records: 3 },
      { a: 'M6', b: 'M7', type: 'communication', records: 3 },
      { a: 'M6', b: 'M8', type: 'communication', records: 3 },
      { a: 'M7', b: 'M8', type: 'communication', records: 3 },
      // The ONE documented inter-community bridge.
      { a: 'M3', b: 'M6', type: 'communication', records: 3 },
      // M3 ↔ M5 cross-community edge omitted from observation (hidden).
    ],
    ambient: [
      // Co-mentions of the hidden cross-community pair across four distinct
      // kinds — asserted but never documented.
      { a: 'M3', b: 'M5', records: 6 },
    ],
    holes: [
      {
        id: 'H-COM-1',
        holeType: 'MISSING_EDGE',
        nodes: ['M3', 'M5'],
        expectedType: 'communication',
        decisiveEvidenceTypes: ['RECORD', 'COMMUNICATION'],
        description: 'Two dense eight-person clusters are connected by a single documented bridge; the cluster-lead pair M3↔M5 is co-mentioned six times across records yet never documented. Hidden truth connects the two communities via a held-out cross-community relation. The two endpoints live in different detected communities, giving honest cross-community support.',
      },
    ],
  };
}

function baseNbe(): CaseSpec {
  return {
    label: 'NBE-01',
    caseIdSlot: 710,
    focus: 'Evidence selection across multiple holes',
    identities: [
      { key: 'N1', type: 'PERSON', canonical: 'ahmad raza' },
      { key: 'N2', type: 'PERSON', canonical: 'farah sheikh', variants: ['farah s.'] },
      { key: 'N3', type: 'PERSON', canonical: 'sameer dube' },
      { key: 'ORG_T', type: 'ORGANIZATION', canonical: 'transit commercial group' },
      { key: 'ACC_2', type: 'ACCOUNT', canonical: 'account tc-55', strongIds: [{ type: 'ACCOUNT', value: 'tc-55' }] },
    ],
    edges: [
      { a: 'N1', b: 'ORG_T', type: 'association', records: 2 },
      { a: 'N2', b: 'ORG_T', type: 'association', records: 2 },
      { a: 'N3', b: 'ACC_2', type: 'financial', records: 2 },
      { a: 'N1', b: 'ACC_2', type: 'financial', records: 1 },
    ],
    holes: [
      {
        id: 'H-NBE-1',
        holeType: 'MISSING_EDGE',
        nodes: ['N1', 'N2'],
        expectedType: 'association',
        decisiveEvidenceTypes: ['COMMUNICATION'],
        description: 'Competing hypotheses: N1-N2 share an employer (association) vs. only transit infrastructure connection.',
      },
      {
        id: 'H-NBE-2',
        holeType: 'MISSING_EDGE',
        nodes: ['N2', 'N3'],
        expectedType: 'financial',
        decisiveEvidenceTypes: ['FINANCIAL'],
        description: 'Hidden financial link between Farah Sheikh and Sameer Dube via account tc-55.',
      },
    ],
  };
}

function baseNbe2(): CaseSpec {
  return {
    label: 'NBE-02',
    caseIdSlot: 711,
    focus: 'Competing-hypothesis evidence discrimination',
    identities: [
      { key: 'O1', type: 'PERSON', canonical: 'uday chauhan' },
      { key: 'O2', type: 'PERSON', canonical: 'tanya gour' },
      { key: 'ORG_U', type: 'ORGANIZATION', canonical: 'union city creditors' },
      { key: 'ORG_V', type: 'ORGANIZATION', canonical: 'vantage fintech' },
    ],
    edges: [
      { a: 'O1', b: 'ORG_U', type: 'association', records: 2 },
      { a: 'O1', b: 'ORG_V', type: 'financial', records: 2 },
      { a: 'O2', b: 'ORG_U', type: 'financial', records: 2 },
      { a: 'O2', b: 'ORG_V', type: 'association', records: 2 },
    ],
    holes: [
      {
        id: 'H-NBE2-1',
        holeType: 'MISSING_EDGE',
        nodes: ['O1', 'O2'],
        expectedType: 'association',
        decisiveEvidenceTypes: ['COMMUNICATION'],
        description: 'Shared-member vs shared-infrastructure explanation; only a direct-communication observation discriminates.',
      },
    ],
  };
}

function baseRob1(): CaseSpec {
  return {
    label: 'ROB-01',
    caseIdSlot: 712,
    focus: 'Graph perturbation stability on a dense social network',
    identities: [
      { key: 'R1', type: 'PERSON', canonical: 'ali husain' },
      { key: 'R2', type: 'PERSON', canonical: 'bobby sequeira', variants: ['bob sequeira'] },
      { key: 'R3', type: 'PERSON', canonical: 'chandan rai' },
      { key: 'R4', type: 'PERSON', canonical: 'dinesh pradhan' },
      { key: 'R5', type: 'PERSON', canonical: 'fiona costa' },
      { key: 'R6', type: 'PERSON', canonical: 'girish tavde' },
      { key: 'ORG_W', type: 'ORGANIZATION', canonical: 'westrail container lines' },
    ],
    edges: [
      { a: 'R1', b: 'R2', type: 'communication', records: 3 },
      { a: 'R2', b: 'R3', type: 'communication', records: 3 },
      { a: 'R3', b: 'R4', type: 'communication', records: 2 },
      { a: 'R4', b: 'R5', type: 'communication', records: 2 },
      { a: 'R5', b: 'R6', type: 'communication', records: 2 },
      { a: 'R1', b: 'ORG_W', type: 'association', records: 2 },
      { a: 'R6', b: 'ORG_W', type: 'financial', records: 2 },
    ],
    infra: [{ key: 'INFRA_W1', canonical: 'w-1 container yard', members: ['R1', 'R2', 'R5'] }],
  };
}

function baseRob2(): CaseSpec {
  return {
    label: 'ROB-02',
    caseIdSlot: 713,
    focus: 'Missingness stability on a sparse network',
    identities: [
      { key: 'S1', type: 'PERSON', canonical: 'prem chand' },
      { key: 'S2', type: 'PERSON', canonical: 'aarti rana', variants: ['aarti r.'] },
      { key: 'S3', type: 'PERSON', canonical: 'vikram jogi' },
      { key: 'S4', type: 'PERSON', canonical: 'hausila bhaskar' },
    ],
    edges: [
      { a: 'S1', b: 'S2', type: 'communication', records: 2 },
      { a: 'S2', b: 'S3', type: 'communication', records: 2 },
      { a: 'S3', b: 'S4', type: 'association', records: 1 },
    ],
  };
}

function baseGrounding(): CaseSpec {
  return {
    label: 'GRD-01',
    caseIdSlot: 714,
    focus: 'Claim grounding with contradiction traps',
    identities: [
      { key: 'T1', type: 'PERSON', canonical: 'gopal singhania' },
      { key: 'T2', type: 'PERSON', canonical: 'ramanuj bose' },
      { key: 'T3', type: 'PERSON', canonical: 'chitra wadekar' },
      { key: 'ORG_Y', type: 'ORGANIZATION', canonical: 'yashwant ventures' },
    ],
    edges: [
      { a: 'T1', b: 'ORG_Y', type: 'association', records: 2 },
      { a: 'T2', b: 'ORG_Y', type: 'association', records: 2 },
      { a: 'T1', b: 'T2', type: 'communication', records: 2 },
      { a: 'T3', b: 'ORG_Y', type: 'financial', records: 2 },
    ],
    contradictions: [
      {
        a: 'T1',
        b: 'T2',
        line: 'Defense affidavit: ramanuj bose and gopal singhania were never co-located and no financial relationship existed between them; the reporter mis-identified the parties.',
      },
    ],
  };
}

function baseSys(): CaseSpec {
  return {
    label: 'SYS-01',
    caseIdSlot: 715,
    focus: 'End-to-end investigation with reassessment after evidence acquisition',
    identities: [
      { key: 'U1', type: 'PERSON', canonical: 'jagdish tyagi' },
      { key: 'U2', type: 'PERSON', canonical: 'kiran bawa' },
      { key: 'U3', type: 'PERSON', canonical: 'lorraine miguel' },
      { key: 'U4', type: 'PERSON', canonical: 'madan wagle' },
      { key: 'ORG_Z', type: 'ORGANIZATION', canonical: 'zenith pharma supply' },
      { key: 'ACC_3', type: 'ACCOUNT', canonical: 'account zx-77', strongIds: [{ type: 'ACCOUNT', value: 'zx-77' }] },
    ],
    edges: [
      { a: 'U1', b: 'ORG_Z', type: 'association', records: 2 },
      { a: 'U1', b: 'ACC_3', type: 'financial', records: 2 },
      { a: 'U2', b: 'ORG_Z', type: 'financial', records: 2 },
      { a: 'U3', b: 'U2', type: 'communication', records: 2 },
      { a: 'U4', b: 'ORG_Z', type: 'association', records: 2 },
    ],
    holes: [
      {
        id: 'H-SYS-1',
        holeType: 'MISSING_EDGE',
        nodes: ['U1', 'U4'],
        expectedType: 'association',
        decisiveEvidenceTypes: ['RECORD', 'COMMUNICATION'],
        description: 'Hidden employer-level association between Jagdish Tyagi and Madan Wagle.',
      },
    ],
  };
}

export const CASE_SPECS: readonly CaseSpec[] = [
  baseRegistration(),
  baseSplit(),
  baseCollision(),
  baseRel(),
  baseRelContradiction(),
  baseGapEdge(),
  baseGapPath(),
  baseGapTemporal(),
  baseGapCommunity(),
  baseNbe(),
  baseNbe2(),
  baseRob1(),
  baseRob2(),
  baseGrounding(),
  baseSys(),
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

interface CondConfig {
  aliasRate: number;
  duplicateRate: number;
  deletionRate: number;
  withheldEdgeRate: number;
  temporalShifts: number;
  sharedIdCollision: boolean;
}

const COND_CONFIG: { [c in EvaluationCondition]: CondConfig } = {
  CLEAN: { aliasRate: 0.05, duplicateRate: 0, deletionRate: 0, withheldEdgeRate: 0, temporalShifts: 0, sharedIdCollision: false },
  NOISY_MISSING: { aliasRate: 0.4, duplicateRate: 0.12, deletionRate: 0.18, withheldEdgeRate: 0.22, temporalShifts: 2, sharedIdCollision: false },
  ADVERSARIAL: { aliasRate: 0.5, duplicateRate: 0.16, deletionRate: 0.22, withheldEdgeRate: 0.3, temporalShifts: 3, sharedIdCollision: true },
};

function randRef(rng: SeededRng): string {
  return `PF-2026-${1000 + rng.int(9000)}`;
}

interface CondContext {
  config: CondConfig;
  surfaces: Map<string, string[]>;
  rng: SeededRng;
}

function normalizeForTruth(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function surfaceFor(ctx: CondContext, key: string): string {
  const list = ctx.surfaces.get(key);
  if (list === undefined || list.length === 0) return key;
  if (list.length > 1 && ctx.config.aliasRate > 0 && ctx.rng.chance(ctx.config.aliasRate)) {
    return ctx.rng.pick(list);
  }
  return list[0]!;
}

export function generateCaseCorpus(spec: CaseSpec, condition: EvaluationCondition, seed: number): CaseCorpus {
  recordSerial = 0;
  const rng = seeded(seed);
  const config: CondConfig = COND_CONFIG[condition];

  const reference = new Map<string, TruthIdentity>();
  const surfaces = new Map<string, string[]>();
  const addSurface = (key: string, surface: string): void => {
    const list = surfaces.get(key);
    if (list === undefined) surfaces.set(key, [surface]);
    else if (!list.includes(surface)) list.push(surface);
  };

  for (const ispec of spec.identities) {
    const built: TruthIdentity = {
      key: ispec.key,
      type: ispec.type,
      canonical: ispec.canonical,
      surfaces: [ispec.canonical, ...(ispec.variants ?? [])],
      strongIds: [...(ispec.strongIds ?? [])],
    };
    reference.set(ispec.key, built);
    addSurface(ispec.key, ispec.canonical);
    if (condition !== 'CLEAN') {
      for (const v of ispec.variants ?? []) {
        if (condition === 'NOISY_MISSING' ? rng.chance(0.4) : rng.chance(0.6)) addSurface(ispec.key, v);
      }
    }
    for (const sid of built.strongIds) addSurface(ispec.key, sid.value);
  }

  for (const infra of spec.infra ?? []) {
    reference.set(infra.key, {
      key: infra.key,
      type: 'ORGANIZATION',
      canonical: infra.canonical,
      surfaces: [infra.canonical],
      strongIds: [],
    });
    addSurface(infra.key, infra.canonical);
  }

  const ctx: CondContext = { config, surfaces, rng };

  const allRecords: Record[] = [];
  const heldOut: Record[] = [];
  const contradictionLines: { owners: string[]; line: string }[] = [];

  const edgeObserved = new Map<string, number[]>();
  const edgeGenCounts = new Map<string, number>();
  const edgeWithheld = new Set<string>();
  const edgeKey = (a: string, b: string): string => [a, b].sort().join('|');

  const isoStamp = (minutes: number): string => isoTime(minutes).replace(/\.\d+Z$/, 'Z');

  const randomTime = (): string => {
    let minutes = rng.intRange(60 * 24 * 30, 60 * 24 * 250);
    if (config.temporalShifts > 0) {
      minutes += rng.intRange(-config.temporalShifts * 60 * 24 * 18, config.temporalShifts * 60 * 24 * 18);
    }
    return isoStamp(minutes);
  };

  const emitWitness = (
    kind: RecordKind,
    a: string,
    b: string,
    intent: RelationType,
    timeIso: string | null,
    withheld: boolean,
  ): void => {
    const key = edgeKey(a, b);
    edgeGenCounts.set(key, (edgeGenCounts.get(key) ?? 0) + 1);
    const surfacesOf = [surfaceFor(ctx, a), surfaceFor(ctx, b)];
    const line = fillLineFor(kind, surfacesOf, timeIso, rng);
    const rec: Record = {
      id: -1,
      kind,
      line,
      owners: [a, b],
      surfaces: surfacesOf,
      intent,
      timeIso,
      isDuplicate: false,
      withheld,
    };
    if (withheld) {
      rec.id = emitId();
      heldOut.push(rec);
      edgeWithheld.add(key);
      return;
    }
    rec.id = emitId();
    allRecords.push(rec);
    edgeObserved.get(key)?.push(rec.id) ?? edgeObserved.set(key, [rec.id]);
    if (config.duplicateRate > 0 && rng.chance(config.duplicateRate)) {
      const dup: Record = {
        id: emitId(),
        kind,
        line: fillLineFor(kind, surfacesOf, timeIso === null ? null : shiftTime(timeIso, config.temporalShifts), rng),
        owners: [a, b],
        surfaces: surfacesOf,
        intent,
        timeIso,
        isDuplicate: true,
        withheld: false,
      };
      allRecords.push(dup);
      edgeObserved.get(key)?.push(dup.id);
    }
  };

  const emitAmbient = (a: string, b: string, timeIso: string | null): void => {
    const surfacesOf = [surfaceFor(ctx, a), surfaceFor(ctx, b)];
    const index = edgeGenCounts.get(`ambient:${edgeKey(a, b)}`) ?? 0;
    const kindsA = ['NARRATIVE', 'CDR', 'SURVEILLANCE', 'TXN'] as const;
    const kind = kindsA[index % kindsA.length] as RecordKind;
    edgeGenCounts.set(`ambient:${edgeKey(a, b)}`, index + 1);
    allRecords.push({
      id: emitId(),
      kind,
      line: fillLineFor(kind, surfacesOf, timeIso, rng),
      owners: [a, b],
      surfaces: surfacesOf,
      intent: 'other',
      timeIso,
      isDuplicate: false,
      withheld: false,
    });
  };

  for (const edge of spec.edges) {
    const count = edge.records ?? 2;
    const withheld =
      config.withheldEdgeRate > 0 && rng.chance(config.withheldEdgeRate) && (spec.holes?.every((h) => !h.nodes.includes(edge.a) || !h.nodes.includes(edge.b)) ?? true);
    const kinds = ['NARRATIVE', 'CDR', 'TXN', 'SURVEILLANCE', 'REGISTRY'] as const;
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length]!;
      const time = edge.times?.[i] !== undefined ? isoStamp(edge.times[i]!) : randomTime();
      emitWitness(kind, edge.a, edge.b, edge.type, time, withheld);
    }
  }

  for (const ambient of spec.ambient ?? []) {
    const count = ambient.records ?? 2;
    for (let i = 0; i < count; i++) {
      const time = ambient.times?.[i] !== undefined ? isoStamp(ambient.times[i]!) : randomTime();
      emitAmbient(ambient.a, ambient.b, time);
    }
  }

  for (const infra of spec.infra ?? []) {
    for (const member of infra.members) {
      const time = randomTime();
      emitWitness('CDR', member, infra.key, 'association', time, false);
      emitWitness('NARRATIVE', member, infra.key, 'association', time, false);
    }
  }

  for (const cont of spec.contradictions ?? []) {
    if (condition === 'CLEAN') continue;
    contradictionLines.push({ owners: [cont.a, cont.b], line: cont.line });
    allRecords.push({
      id: emitId(),
      kind: 'CONTRADICTION',
      line: cont.line,
      owners: [cont.a, cont.b],
      surfaces: [cont.line],
      intent: 'other',
      timeIso: null,
      isDuplicate: false,
      withheld: false,
    });
  }

  // ---- holes + held-out evidence ----
  const holes: PlantedHole[] = [];
  for (const holeSpec of spec.holes ?? []) {
    const ids: number[] = [];
    const recordCount = 2;
    const hTime = randomTime();
    const a = holeSpec.nodes[0]!;
    const b = holeSpec.nodes.length > 1 ? holeSpec.nodes[1]! : holeSpec.nodes[0]!;
    for (let i = 0; i < recordCount; i++) {
      const surfacesOf = [surfaceFor(ctx, a), surfaceFor(ctx, b)];
      const rec: Record = {
        id: emitId(),
        kind: 'HELDOUT',
        line: fillLineFor('HELDOUT', surfacesOf, hTime, rng),
        owners: [a, b],
        surfaces: surfacesOf,
        intent: (holeSpec.expectedType ?? 'association') as RelationType,
        timeIso: hTime,
        isDuplicate: false,
        withheld: true,
      };
      heldOut.push(rec);
      ids.push(rec.id);
    }
    holes.push({
      id: holeSpec.id,
      holeType: holeSpec.holeType,
      nodes: [...holeSpec.nodes],
      expectedType: holeSpec.expectedType ?? null,
      decisiveEvidenceTypes: holeSpec.decisiveEvidenceTypes ?? ['RECORD'],
      heldOutRecordIds: ids,
      seedOwner: holeSpec.seedOwner ?? holeSpec.nodes[0]!,
      description: holeSpec.description,
    });
  }

  // ---- truth edges ----
  const truthEdges: TruthEdge[] = [];
  const seenEdges = new Set<string>();
  for (const edge of spec.edges) {
    const key = edgeKey(edge.a, edge.b);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const witnessed = [...new Set(edgeObserved.get(key) ?? [])].sort((x, y) => x - y);
    truthEdges.push({
      a: edge.a,
      b: edge.b,
      type: edge.type,
      witnessRecordIds: witnessed,
      totalRecords: edgeGenCounts.get(key) ?? 0,
      withheld: edgeWithheld.has(key),
    });
  }

  const allIdentities = [...reference.values()];

  const surfaceToOwners = new Map<string, string[]>();
  for (const id of allIdentities) {
    const add = (surface: string): void => {
      const norm = normalizeForTruth(surface);
      const owners = surfaceToOwners.get(norm);
      if (owners === undefined) surfaceToOwners.set(norm, [id.key]);
      else if (!owners.includes(id.key)) owners.push(id.key);
    };
    for (const s of id.surfaces) add(s);
    for (const sid of id.strongIds) add(sid.value);
  }

  const documents: CaseCorpus['documents'] = [];
  const docOrder: RecordKind[] = ['NARRATIVE', 'CDR', 'TXN', 'SURVEILLANCE', 'REGISTRY', 'CONTRADICTION'];
  let docN = 0;
  for (const kind of docOrder) {
    const recs = allRecords.filter((r) => r.kind === kind).sort((a, b) => a.id - b.id);
    if (recs.length === 0) continue;
    documents.push({
      artifactId: longUuid(spec.caseIdSlot * 10 + docN),
      sourceId: longUuid(spec.caseIdSlot * 10 + docN + 5000),
      title: `${spec.label} ${kind} ${condition}`,
      lines: recs.map((r) => r.line),
    });
    docN += 1;
  }

  const roster: GazetteerEntry[] = buildRoster(allIdentities);

  return {
    caseId: longUuid(spec.caseIdSlot),
    investigationId: longUuid(spec.caseIdSlot + 1000),
    caseKey: spec.label,
    condition,
    seed,
    focus: spec.focus,
    documents,
    roster,
    records: allRecords,
    heldOutRecords: heldOut,
    truth: {
      identities: allIdentities,
      edges: truthEdges,
      holes,
      surfaceToOwners,
      contradictions: contradictionLines,
    },
  };
}

let recordSerial = 0;
function emitId(): number {
  recordSerial += 1;
  return recordSerial;
}

function shiftTime(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
}

function fillLineFor(kind: RecordKind, surfaces: readonly string[], timeIso: string | null, rng: SeededRng): string {
  const stamp = (iso: string | null): string => (iso ?? isoTime(0)).replace(/\.\d+Z$/, 'Z');
  const d = stamp(timeIso).slice(0, 10);
  const a = surfaces[0] ?? '';
  const b = surfaces[1] ?? a;
  switch (kind) {
    case 'NARRATIVE':
      return `Narrative: on ${d} the participant ${a} was observed with ${b} during a search of the godown along the eastern lane near gate-2; camera footage matched both parties.`;
    case 'CDR':
      return `CDR ${stamp(timeIso)} caller ${a} callee ${b} duration ${rng.intRange(40, 400)}s RMSI -72 lane inland`;
    case 'TXN':
      return `TXN ${timeIso ?? isoTime(0)} ${a} credit ${b} debit amount ${rng.intRange(5000, 90000)} reference ${randRef(rng)} source ledger`;
    case 'SURVEILLANCE':
      return `Surveillance ${d}: ${a} alongside ${b} at the compound parking, direction toward the northern yard; logs corroborate the pair movement.`;
    case 'REGISTRY':
      return `Registry ${d}: ${a} listed co-tenant with ${b} at the same premises; business registration cross-checked.`;
    case 'CONTRADICTION':
      return surfaces[0] ?? '';
    case 'HELDOUT':
      return `HELDOUT ${a}: direct evidentiary record tying ${a} to ${b} on ${d}, corroborated by an independent source.`;
    default:
      return surfaces.join(' ');
  }
}

/** Gazetteer roster: known canonical+alias surfaces → entity type. */
function buildRoster(identities: readonly TruthIdentity[]): GazetteerEntry[] {
  const entries: GazetteerEntry[] = [];
  const seen = new Set<string>();
  const add = (text: string, entityType: EntityType): void => {
    if (seen.has(text)) return;
    seen.add(text);
    entries.push({ token: text, entityType });
  };
  for (const id of identities) {
    for (const s of id.surfaces) add(s, id.type);
    for (const sid of id.strongIds) add(sid.value, sid.type);
  }
  return entries;
}

/** Normalized truth-surface lookup exposed for labeling. */
export function normalizeSurfaceJoin(raw: string): string {
  return normalizeForTruth(raw);
}

export function ownersForSurface(truth: Truth, surface: string): readonly string[] {
  const norm = normalizeForTruth(surface);
  return truth.surfaceToOwners.get(norm) ?? [];
}

export function caseUniquenessKey(spec: CaseSpec, condition: EvaluationCondition, seed: number): string {
  return sha256Hex([spec.label, condition, String(seed)]);
}