// ============================================================================
// Operation Financial Shadow — Cross-Case fixtures (canonical shape)
// ============================================================================

import { CrossCaseMatchSchema } from "@indago/contracts";
import type { CrossCaseMatch, Entity } from "@indago/contracts";
import { CASE_ID, CROSS_CASE_ID, CROSS_ENTITY_ID, INVESTIGATION_ID, ENT_VICTOR } from "./lookup";
import { obs } from "./times";

const match: CrossCaseMatch = {
  sourceCaseId: CASE_ID,
  targetCaseId: CROSS_CASE_ID,
  sourceEntityId: ENT_VICTOR,
  targetEntityId: CROSS_ENTITY_ID,
  matchScore: 0.87,
  sharedEvidenceTypes: ["FINANCIAL", "COMMUNICATION"],
  sharedEntityCount: 1,
  investigationIds: [INVESTIGATION_ID],
  confidence: 0.84,
  computedAt: obs("2024-06-25"),
};

export const operationFinancialShadowCrossCase: CrossCaseMatch[] = [
  CrossCaseMatchSchema.parse(match),
];

// ============================================================================
// VISUAL GRAPH MOCKS (Used by the Graph Panel to draw the foreign islands)
// ============================================================================

export interface CrossCaseGraphMock {
  id: string;
  title: string;
  summary: string;
  localTargetMatch: string; 
  bridgeSupport: number;
  nodes: any[];
  edges: any[];
}

export const MOCK_FOREIGN_CASES: Record<string, CrossCaseGraphMock> = {
  "cobalt": {
    id: CROSS_CASE_ID, 
    title: "Operation Cobalt",
    summary: "Money laundering network using Panamanian shell companies. Visibility restricted.",
    localTargetMatch: "VICTOR",
    bridgeSupport: 0.87,
    nodes: [
      { id: "foreign-cobalt-1", type: "ENTITY", label: "Unidentified Witness (Foreign)", isForeign: true, structuralImportance: 0.8 },
      { id: "foreign-cobalt-2", type: "ENTITY", label: "Offshore Vault 0093", isForeign: true, structuralImportance: 0.6 },
      { id: "foreign-cobalt-3", type: "ENTITY", label: "Aldridge Holdings S.A.", isForeign: true, structuralImportance: 0.9 },
    ],
    edges: [
      { id: "f-edge-c1", sourceNodeId: "foreign-cobalt-1", targetNodeId: "foreign-cobalt-2", support: 1, isForeignEdge: true },
      { id: "f-edge-c2", sourceNodeId: "foreign-cobalt-2", targetNodeId: "foreign-cobalt-3", support: 1, isForeignEdge: true },
      { id: "f-edge-c3", sourceNodeId: "foreign-cobalt-1", targetNodeId: "foreign-cobalt-3", support: 1, isForeignEdge: true },
    ]
  },
  "crimson": {
    id: "case-f4a910b2",
    title: "Operation Crimson",
    summary: "Cryptocurrency obfuscation syndicate operating out of Eastern Europe. Visibility restricted.",
    localTargetMatch: "TRANSIT", 
    bridgeSupport: 0.92,
    nodes: [
      { id: "foreign-crimson-1", type: "ENTITY", label: "Binance Hot Wallet", isForeign: true, structuralImportance: 0.9 },
      { id: "foreign-crimson-2", type: "ENTITY", label: "Mixing Service Node", isForeign: true, structuralImportance: 0.7 },
      { id: "foreign-crimson-3", type: "ENTITY", label: "Exchange Account (Flagged)", isForeign: true, structuralImportance: 0.5 },
    ],
    edges: [
      { id: "f-edge-cr1", sourceNodeId: "foreign-crimson-1", targetNodeId: "foreign-crimson-2", support: 1, isForeignEdge: true },
      { id: "f-edge-cr2", sourceNodeId: "foreign-crimson-2", targetNodeId: "foreign-crimson-3", support: 1, isForeignEdge: true },
    ]
  }
};

// ============================================================================
// FOREIGN ENTITY DATABASE (Structured exactly like canonical Entities)
// ============================================================================

export const FOREIGN_ENTITIES_DB: Record<string, Entity & any> = {
  // --- COBALT ENTITIES ---
  "foreign-cobalt-1": {
    id: "foreign-cobalt-1",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Unidentified Witness (Cobalt)",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "PERSON",
    aliases: ["Panama Courier", "Target X"],
    summary: "An unidentified individual associated with Operation Cobalt. Surveillance indicates frequent travel between Panama and London. Likely acts as a courier for offshore documents. Demographic data is locked behind Case Boundary.",
    createdAt: obs("2023-08-15"),
    updatedAt: obs("2023-08-15"),
  },
  "foreign-cobalt-2": {
    id: "foreign-cobalt-2",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Offshore Vault 0093",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Account 491-0093-X"],
    summary: "High-net-worth routing account held at a private Panamanian banking institution. Used primarily for consolidating funds before distribution to shell entities.",
    createdAt: obs("2023-09-01"),
    updatedAt: obs("2023-09-01"),
  },
  "foreign-cobalt-3": {
    id: "foreign-cobalt-3",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Aldridge Holdings S.A.",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["AHSA", "Aldridge Corp"],
    summary: "A registered holding company in Panama. Suspected to be the apex entity in the Cobalt laundering network. Corporate officers are entirely proxy directors.",
    createdAt: obs("2023-11-10"),
    updatedAt: obs("2023-11-10"),
  },

  // --- CRIMSON ENTITIES ---
  "foreign-crimson-1": {
    id: "foreign-crimson-1",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Binance Hot Wallet",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Wallet 0x9B2a..."],
    summary: "Centralized exchange hot wallet associated with Operation Crimson. High volume of incoming deposits from known darknet markets.",
    createdAt: obs("2024-01-05"),
    updatedAt: obs("2024-01-05"),
  },
  "foreign-crimson-2": {
    id: "foreign-crimson-2",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Mixing Service Node",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["Tornado Cash Proxy", "Mixer Pool"],
    summary: "Decentralized smart contract infrastructure used to break on-chain heuristics. Connected directly to the target wallet.",
    createdAt: obs("2024-02-12"),
    updatedAt: obs("2024-02-12"),
  },
  "foreign-crimson-3": {
    id: "foreign-crimson-3",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Exchange Account (Flagged)",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Crimson Exit Node"],
    summary: "Off-ramp exchange account where cryptocurrency is liquidated to fiat. The KYC associated with this account is locked under the Operation Crimson case file.",
    createdAt: obs("2024-03-20"),
    updatedAt: obs("2024-03-20"),
  }
};