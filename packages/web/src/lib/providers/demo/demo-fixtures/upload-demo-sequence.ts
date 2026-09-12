import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import type { SseEvent } from "@/lib/realtime/sse-client";
import type { GraphRealtimeCatalog } from "../../types";
import { catalogKey } from "../../types";
import { deterministicUuid } from "../submit";
import { obs } from "./times";
import { CASE_ID, INVESTIGATION_ID, GRAPH_VERSION, GN_BANK, GN_VICTOR } from "./lookup";

export interface DemoStreamEvent extends SseEvent {
  readonly delayMs: number;
}

const GN_COURIER = deterministicUuid("upload:node:courier-firm");
const ENT_COURIER = deterministicUuid("upload:entity:courier-firm");
const GN_SIM = deterministicUuid("upload:node:unregistered-sim");
const ENT_SIM = deterministicUuid("upload:entity:unregistered-sim");
const GE_BANK_COURIER = deterministicUuid("upload:edge:bank-courier");
const GE_COURIER_SIM = deterministicUuid("upload:edge:courier-sim");
const GE_COURIER_OWNER = deterministicUuid("upload:edge:courier-owner");
const GAP_COURIER_OWNER = deterministicUuid("upload:gap:courier-owner");
const HOLE_COURIER_OWNER = deterministicUuid("upload:hole:courier-owner");

const courierNode: GraphNode = {
  id: GN_COURIER,
  investigationId: INVESTIGATION_ID,
  versionId: GRAPH_VERSION,
  type: "ENTITY",
  entityId: ENT_COURIER,
  label: "Meridian Transit Pvt Ltd",
  structuralImportance: 0.58,
  observationCount: 1,
  sourceCount: 1,
  createdAt: obs("2024-06-18"),
  updatedAt: obs("2024-06-18"),
};

const simNode: GraphNode = {
  id: GN_SIM,
  investigationId: INVESTIGATION_ID,
  versionId: GRAPH_VERSION,
  type: "ENTITY",
  entityId: ENT_SIM,
  label: "Unregistered SIM · +91 98•••••42",
  structuralImportance: 0.4,
  observationCount: 1,
  sourceCount: 1,
  createdAt: obs("2024-06-18"),
  updatedAt: obs("2024-06-18"),
};

const bankToCourierEdge: GraphEdge = {
  id: GE_BANK_COURIER,
  investigationId: INVESTIGATION_ID,
  versionId: GRAPH_VERSION,
  sourceNodeId: GN_BANK,
  targetNodeId: GN_COURIER,
  relationType: "financial",
  support: 0.61,
  structuralImportance: 0.5,
  directed: true,
  status: "ACTIVE",
  observationCount: 1,
  sourceCount: 1,
  createdAt: obs("2024-06-18"),
  updatedAt: obs("2024-06-18"),
};

const courierToSimEdge: GraphEdge = {
  id: GE_COURIER_SIM,
  investigationId: INVESTIGATION_ID,
  versionId: GRAPH_VERSION,
  sourceNodeId: GN_COURIER,
  targetNodeId: GN_SIM,
  relationType: "communication",
  support: 0.55,
  structuralImportance: 0.42,
  directed: true,
  status: "ACTIVE",
  observationCount: 1,
  sourceCount: 1,
  createdAt: obs("2024-06-18"),
  updatedAt: obs("2024-06-18"),
};

const ownershipHole: GraphHole = {
  id: HOLE_COURIER_OWNER,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  graphVersionId: GRAPH_VERSION,
  type: "ISOLATED_NODE",
  investigationGapId: GAP_COURIER_OWNER,
  nodeIds: [GN_COURIER],
  expectedEdgeType: "ownership",
  significance: 0.7,
  description:
    "Meridian Transit Pvt Ltd has no resolved ownership record — beneficial owner unconfirmed.",
  suggestedEvidenceTypes: ["ROC/MCA filing", "registered-agent record"],
  detectedAt: obs("2024-06-18", "12:05:00"),
};

const ownershipResolvedEdge: GraphEdge = {
  id: GE_COURIER_OWNER,
  investigationId: INVESTIGATION_ID,
  versionId: GRAPH_VERSION,
  sourceNodeId: GN_VICTOR,
  targetNodeId: GN_COURIER,
  relationType: "ownership",
  support: 0.81,
  structuralImportance: 0.6,
  directed: true,
  status: "ACTIVE",
  observationCount: 1,
  sourceCount: 1,
  createdAt: obs("2024-06-18", "12:07:00"),
  updatedAt: obs("2024-06-18", "12:07:00"),
};

// STAGE 1: Pre-loaded into memory
export function getSetupEvents(): DemoStreamEvent[] {
  return [];
}

// STAGE 2: Plays when user clicks Submit Evidence
export const uploadDemoSequence: DemoStreamEvent[] = [
  {
    id: "upload-evt-courier-node",
    investigationId: INVESTIGATION_ID,
    action: "ENTITY_CREATED",
    actor: "extractor.graph",
    targetType: "ENTITY",
    targetId: ENT_COURIER,
    description: "Resolved entity 'Meridian Transit Pvt Ltd'.",
    timestamp: "2024-06-18T12:00:00.000Z",
    delayMs: 400,
  },
  {
    id: "upload-evt-burst-hole",
    investigationId: INVESTIGATION_ID,
    action: "GAP_IDENTIFIED",
    actor: "analyst.gap",
    targetType: "GAP",
    targetId: GAP_COURIER_OWNER,
    description: "Identified gap: Meridian Transit Pvt Ltd ownership unresolved.",
    timestamp: "2024-06-18T12:00:30.000Z",
    delayMs: 1400,
  },
  {
    id: "upload-evt-resolve-hole",
    investigationId: INVESTIGATION_ID,
    action: "EVIDENCE_REVIEWED",
    actor: "analyst.review",
    targetType: "GAP",
    targetId: GAP_COURIER_OWNER,
    description: "Verified ROC filing: Victor Aldridge holds controlling stake in Meridian.",
    timestamp: "2024-06-18T12:02:00.000Z",
    delayMs: 4000,
  },
  {
    id: "upload-evt-sim-node",
    investigationId: INVESTIGATION_ID,
    action: "ENTITY_CREATED",
    actor: "extractor.graph",
    targetType: "ENTITY",
    targetId: ENT_SIM,
    description: "Resolved linked entity 'Unregistered SIM' from the uploaded document.",
    timestamp: "2024-06-18T12:02:00.150Z",
    delayMs: 5200,
  },
];

export const uploadDemoCatalog: GraphRealtimeCatalog = {
  [catalogKey("ENTITY_CREATED", ENT_COURIER)]: {
    kind: "node",
    node: courierNode,
    extraEdges: [bankToCourierEdge],
  },
  [catalogKey("ENTITY_CREATED", ENT_SIM)]: {
    kind: "node",
    node: simNode,
    extraEdges: [courierToSimEdge],
  },
  [catalogKey("GAP_IDENTIFIED", GAP_COURIER_OWNER)]: { kind: "hole", hole: ownershipHole },
  [catalogKey("EVIDENCE_REVIEWED", GAP_COURIER_OWNER)]: {
    kind: "hole-resolve",
    resolvesHoleId: GAP_COURIER_OWNER,
    edge: ownershipResolvedEdge,
  },
};