// ============================================================================
// Operation Financial Shadow — Cross-Case fixtures (canonical shape)
// ============================================================================

import { CrossCaseMatchSchema } from "@indago/contracts";
import type { CrossCaseMatch, Entity } from "@indago/contracts";
import { CASE_ID, CROSS_CASE_ID, CROSS_ENTITY_ID, INVESTIGATION_ID, ENT_VICTOR, GN_VICTOR } from "./lookup";
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
      { id: "foreign-cobalt-4", type: "ENTITY", label: "Colón Escrow & Trust S.A.", isForeign: true, structuralImportance: 0.7 },
      { id: "foreign-cobalt-5", type: "ENTITY", label: "Panama Nominee Bureau", isForeign: true, structuralImportance: 0.64 },
      { id: "foreign-cobalt-6", type: "ENTITY", label: "Silverbay Holdings Ltd.", isForeign: true, structuralImportance: 0.56 },
      { id: "foreign-cobalt-7", type: "ENTITY", label: "Freight Ledger 4411-X", isForeign: true, structuralImportance: 0.5 },
    ],
    edges: [
      { id: "f-edge-c1", sourceNodeId: "foreign-cobalt-1", targetNodeId: "foreign-cobalt-2", support: 1, isForeignEdge: true },
      { id: "f-edge-c2", sourceNodeId: "foreign-cobalt-2", targetNodeId: "foreign-cobalt-3", support: 1, isForeignEdge: true },
      { id: "f-edge-c3", sourceNodeId: "foreign-cobalt-1", targetNodeId: "foreign-cobalt-3", support: 1, isForeignEdge: true },
      { id: "f-edge-c4", sourceNodeId: "foreign-cobalt-2", targetNodeId: "foreign-cobalt-4", support: 0.9, isForeignEdge: true },
      { id: "f-edge-c5", sourceNodeId: "foreign-cobalt-4", targetNodeId: "foreign-cobalt-3", support: 0.8, isForeignEdge: true },
      { id: "f-edge-c6", sourceNodeId: "foreign-cobalt-4", targetNodeId: "foreign-cobalt-5", support: 0.75, isForeignEdge: true },
      { id: "f-edge-c7", sourceNodeId: "foreign-cobalt-5", targetNodeId: "foreign-cobalt-3", support: 0.7, isForeignEdge: true },
      { id: "f-edge-c8", sourceNodeId: "foreign-cobalt-6", targetNodeId: "foreign-cobalt-3", support: 0.65, isForeignEdge: true },
      { id: "f-edge-c9", sourceNodeId: "foreign-cobalt-6", targetNodeId: "foreign-cobalt-2", support: 0.6, isForeignEdge: true },
      { id: "f-edge-c10", sourceNodeId: "foreign-cobalt-1", targetNodeId: "foreign-cobalt-4", support: 0.8, isForeignEdge: true },
      { id: "f-edge-c11", sourceNodeId: "foreign-cobalt-7", targetNodeId: "foreign-cobalt-3", support: 0.6, isForeignEdge: true },
      { id: "f-edge-c12", sourceNodeId: "foreign-cobalt-7", targetNodeId: "foreign-cobalt-2", support: 0.55, isForeignEdge: true },
      // Directly shared-infrastructure links onto the LOCAL bridge node (VICTOR
      // graph node): compels the island to spring-connect to the bridge, not
      // hang off it through a single generated edge.
      { id: "f-bridge-c1", sourceNodeId: GN_VICTOR, targetNodeId: "foreign-cobalt-2", support: 0.72, isForeignEdge: true },
      { id: "f-bridge-c2", sourceNodeId: GN_VICTOR, targetNodeId: "foreign-cobalt-4", support: 0.66, isForeignEdge: true },
      { id: "f-bridge-c3", sourceNodeId: GN_VICTOR, targetNodeId: "foreign-cobalt-6", support: 0.7, isForeignEdge: true },
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
      { id: "foreign-crimson-4", type: "ENTITY", label: "OTC Desk Coordinator", isForeign: true, structuralImportance: 0.78 },
      { id: "foreign-crimson-5", type: "ENTITY", label: "Mining Pool Proxy", isForeign: true, structuralImportance: 0.62 },
      { id: "foreign-crimson-6", type: "ENTITY", label: "Riga Fiat Gateway", isForeign: true, structuralImportance: 0.55 },
      { id: "foreign-crimson-7", type: "ENTITY", label: "Cold Storage Vault", isForeign: true, structuralImportance: 0.46 },
    ],
    edges: [
      { id: "f-edge-cr1", sourceNodeId: "foreign-crimson-1", targetNodeId: "foreign-crimson-2", support: 1, isForeignEdge: true },
      { id: "f-edge-cr2", sourceNodeId: "foreign-crimson-2", targetNodeId: "foreign-crimson-3", support: 1, isForeignEdge: true },
      { id: "f-edge-cr3", sourceNodeId: "foreign-crimson-3", targetNodeId: "foreign-crimson-4", support: 0.7, isForeignEdge: true },
      { id: "f-edge-cr4", sourceNodeId: "foreign-crimson-2", targetNodeId: "foreign-crimson-4", support: 0.75, isForeignEdge: true },
      { id: "f-edge-cr5", sourceNodeId: "foreign-crimson-4", targetNodeId: "foreign-crimson-5", support: 0.7, isForeignEdge: true },
      { id: "f-edge-cr6", sourceNodeId: "foreign-crimson-1", targetNodeId: "foreign-crimson-5", support: 0.6, isForeignEdge: true },
      { id: "f-edge-cr7", sourceNodeId: "foreign-crimson-5", targetNodeId: "foreign-crimson-6", support: 0.65, isForeignEdge: true },
      { id: "f-edge-cr8", sourceNodeId: "foreign-crimson-2", targetNodeId: "foreign-crimson-7", support: 0.55, isForeignEdge: true },
      { id: "f-edge-cr9", sourceNodeId: "foreign-crimson-6", targetNodeId: "foreign-crimson-7", support: 0.6, isForeignEdge: true },
      { id: "f-edge-cr10", sourceNodeId: "foreign-crimson-6", targetNodeId: "foreign-crimson-3", support: 0.5, isForeignEdge: true },
      // Shared gateways onto the local bridge node.
      { id: "f-bridge-cr1", sourceNodeId: GN_VICTOR, targetNodeId: "foreign-crimson-4", support: 0.58, isForeignEdge: true },
      { id: "f-bridge-cr2", sourceNodeId: GN_VICTOR, targetNodeId: "foreign-crimson-6", support: 0.6, isForeignEdge: true },
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
  "foreign-cobalt-4": {
    id: "foreign-cobalt-4",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Colón Escrow & Trust S.A.",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["Colón Trust", "CETSA"],
    summary: "A Panama-based escrow and trust administration firm. Routed consolidation deposits between the Cobalt vaults and the shell apex entities. Officer records are locked behind the Case Boundary.",
    createdAt: obs("2023-12-01"),
    updatedAt: obs("2023-12-01"),
  },
  "foreign-cobalt-5": {
    id: "foreign-cobalt-5",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Panama Nominee Bureau",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["Nominee Registry", "PNB"],
    summary: "A nominee-provider bureau supplying proxy directors and signatories for the Cobalt shell companies. No named principal appears in its incorporation filings.",
    createdAt: obs("2024-01-15"),
    updatedAt: obs("2024-01-15"),
  },
  "foreign-cobalt-6": {
    id: "foreign-cobalt-6",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Silverbay Holdings Ltd.",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["Silverbay", "SHL"],
    summary: "A second-tier Panamanian holding entity consolidating funds before onward distribution. Shares the registrar of the case's forward apex entity.",
    createdAt: obs("2024-02-08"),
    updatedAt: obs("2024-02-08"),
  },
  "foreign-cobalt-7": {
    id: "foreign-cobalt-7",
    caseId: CROSS_CASE_ID,
    investigationId: INVESTIGATION_ID,
    canonicalName: "Freight Ledger 4411-X",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Freight Ledger", "Ledger 4411-X"],
    summary: "A freight and logistics ledger account tied to Cobalt movements. Invoices reference a custody corridor matching the local case's transport network.",
    createdAt: obs("2024-03-05"),
    updatedAt: obs("2024-03-05"),
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
  },
  "foreign-crimson-4": {
    id: "foreign-crimson-4",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "OTC Desk Coordinator",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "PERSON",
    aliases: ["Crimson OTC", "Desk Coordinator"],
    summary: "The over-the-counter desk coordinator brokering large peer trades between the mixing pools and the off-ramps. Identity details are locked behind the Operation Crimson boundary.",
    createdAt: obs("2024-04-02"),
    updatedAt: obs("2024-04-02"),
  },
  "foreign-crimson-5": {
    id: "foreign-crimson-5",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Mining Pool Proxy",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ORGANIZATION",
    aliases: ["Pool Proxy"],
    summary: "A mining-pool proxy account that feeds fresh coin into the obfuscation pipeline. It launders origin signals before coins reach the mixing node.",
    createdAt: obs("2024-04-18"),
    updatedAt: obs("2024-04-18"),
  },
  "foreign-crimson-6": {
    id: "foreign-crimson-6",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Riga Fiat Gateway",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Riga Gateway"],
    summary: "A Baltics-based fiat gateway where crypto holdings are settled into traditional banking. Its counterparty set overlaps the local case's transport corridor.",
    createdAt: obs("2024-05-11"),
    updatedAt: obs("2024-05-11"),
  },
  "foreign-crimson-7": {
    id: "foreign-crimson-7",
    caseId: "case-f4a910b2",
    investigationId: INVESTIGATION_ID,
    canonicalName: "Cold Storage Vault",
    status: "ACTIVE",
    observationIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    roleHypothesisIds: [],
    entityType: "ACCOUNT",
    aliases: ["Cold Vault B"],
    summary: "A long-held cold-storage vault accumulating post-mix balances. Withdrawals are sparse and routed exclusively through the flagged exchange account.",
    createdAt: obs("2024-06-01"),
    updatedAt: obs("2024-06-01"),
  }
};