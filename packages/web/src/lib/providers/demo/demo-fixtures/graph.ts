// ============================================================================
// Operation Financial Shadow — Graph fixtures (Web Topology)
//
// Topology is deliberately a hub-and-spoke around the intermediary account
// (GN_BANK), with three features built in on purpose so the demo can
// exercise real product behavior, not just draw a pretty graph:
//
//   - GE_1 (BANK -> VICTOR) is a genuine graph-theoretic bridge: removing
//     it disconnects {VICTOR, WITNESS} from the rest of the network. Used
//     to demo bridge-halo emphasis without hand-picking a "isBridge" flag.
//   - GE_5 (SHELL_ONE -> SHELL_TWO) is status: "CONTRADICTED" — demonstrates
//     the counter-evidence flip (red dashed rendering) called out in the
//     core differentiator.
//   - GE_6 (VICTOR -> WITNESS) has support: 0.2 — demonstrates the
//     low-confidence dashed-edge treatment on a single weak, uncorroborated
//     link to an unidentified witness.
// ============================================================================

import { GraphVersionSchema, GraphNodeSchema, GraphEdgeSchema } from "@indago/contracts";
import type { GraphVersion, GraphNode, GraphEdge } from "@indago/contracts";
import {
  GRAPH_VERSION, GRAPH_VERSION_V1, GRAPH_VERSION_V2, INVESTIGATION_ID,
  GN_VICTOR, GN_MARIA, GN_SHELL_ONE, GN_SHELL_TWO, GN_BANK, GN_WITNESS,
  GE_1, GE_2, GE_3, GE_4, GE_5, GE_6,
  REL_1, REL_2, REL_3, REL_4, REL_5, REL_6,
  ENT_VICTOR, ENT_MARIA, ENT_SHELL_ONE, ENT_SHELL_TWO, ENT_BANK, ENT_WITNESS,
} from "./lookup";
import { obs } from "./times";

const versionData: GraphVersion = {
  id: GRAPH_VERSION,
  investigationId: INVESTIGATION_ID,
  versionNumber: 3,
  status: "ACTIVE",
  projectionStatus: "COMPLETE",
  nodeCount: 6,
  edgeCount: 6,
  createdAt: obs("2024-06-15"),
  updatedAt: obs("2024-06-28"),
};

// PR-7: the deterministic version SERIES the demo surfaces through
// GraphProvider.listVersions. v1/v2 are SUPERSEDED (historic, immutable); v3 is
// the ACTIVE projection the graph actually renders. Ever-increasing
// versionNumber matches the platform's ascending enumeration.
const versionSeriesData: GraphVersion[] = [
  {
    id: GRAPH_VERSION_V1,
    investigationId: INVESTIGATION_ID,
    versionNumber: 1,
    status: "SUPERSEDED",
    projectionStatus: "COMPLETE",
    nodeCount: 3,
    edgeCount: 2,
    createdAt: obs("2023-11-05"),
    updatedAt: obs("2024-02-05"),
  },
  {
    id: GRAPH_VERSION_V2,
    investigationId: INVESTIGATION_ID,
    versionNumber: 2,
    status: "SUPERSEDED",
    projectionStatus: "COMPLETE",
    nodeCount: 5,
    edgeCount: 4,
    parentGraphVersionId: GRAPH_VERSION_V1,
    createdAt: obs("2024-02-05"),
    updatedAt: obs("2024-06-10"),
  },
  {
    id: GRAPH_VERSION,
    investigationId: INVESTIGATION_ID,
    versionNumber: 3,
    status: "ACTIVE",
    projectionStatus: "COMPLETE",
    nodeCount: 6,
    edgeCount: 6,
    parentGraphVersionId: GRAPH_VERSION_V2,
    createdAt: obs("2024-06-15"),
    updatedAt: obs("2024-06-28"),
  },
];

const nodes: GraphNode[] = [
  {
    id: GN_VICTOR, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "ENTITY", entityId: ENT_VICTOR, label: "Victor Aldridge",
    structuralImportance: 0.9, observationCount: 3, sourceCount: 2,
    createdAt: obs("2023-11-05"), updatedAt: obs("2023-11-05"),
  },
  {
    id: GN_SHELL_ONE, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "ENTITY", entityId: ENT_SHELL_ONE, label: "Aldridge Holdings S.A.",
    structuralImportance: 0.85, observationCount: 3, sourceCount: 2,
    createdAt: obs("2023-12-20"), updatedAt: obs("2023-12-20"),
  },
  {
    id: GN_BANK, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "ENTITY", entityId: ENT_BANK, label: "Intermediary Account 0093",
    structuralImportance: 0.95, observationCount: 4, sourceCount: 2,
    createdAt: obs("2024-02-05"), updatedAt: obs("2024-02-05"),
  },
  {
    id: GN_SHELL_TWO, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "ENTITY", entityId: ENT_SHELL_TWO, label: "Northbridge Capital Ltd.",
    structuralImportance: 0.8, observationCount: 3, sourceCount: 2,
    createdAt: obs("2024-02-06"), updatedAt: obs("2024-02-06"),
  },
  {
    id: GN_MARIA, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "ENTITY", entityId: ENT_MARIA, label: "Maria Castellan",
    structuralImportance: 0.68, observationCount: 2, sourceCount: 1,
    createdAt: obs("2024-05-20"), updatedAt: obs("2024-05-20"),
  },
  {
    id: GN_WITNESS, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    type: "OBSERVATION", entityId: ENT_WITNESS, label: "Unidentified Witness",
    structuralImportance: 0.2, observationCount: 0, sourceCount: 0,
    createdAt: obs("2024-06-10"), updatedAt: obs("2024-06-10"),
  },
];

const edges: GraphEdge[] = [
  {
    // Hub -> Victor. The single edge connecting {VICTOR, WITNESS} to the
    // rest of the network — a genuine bridge (cut edge).
    id: GE_1, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_BANK, targetNodeId: GN_VICTOR, relationType: "ownership",
    relationHypothesisId: REL_1, support: 0.78, structuralImportance: 0.72,
    directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1,
    createdAt: obs("2023-12-20"), updatedAt: obs("2023-12-20"),
  },
  {
    // Hub -> Shell One.
    id: GE_3, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_BANK, targetNodeId: GN_SHELL_ONE, relationType: "financial",
    relationHypothesisId: REL_3, support: 0.74, structuralImportance: 0.68,
    directed: true, status: "ACTIVE", observationCount: 2, sourceCount: 1,
    createdAt: obs("2024-02-05"), updatedAt: obs("2024-02-05"),
  },
  {
    // Hub -> Shell Two.
    id: GE_4, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_BANK, targetNodeId: GN_SHELL_TWO, relationType: "financial",
    relationHypothesisId: REL_4, support: 0.72, structuralImportance: 0.66,
    directed: true, status: "ACTIVE", observationCount: 2, sourceCount: 1,
    createdAt: obs("2024-02-06"), updatedAt: obs("2024-02-06"),
  },
  {
    // Hub -> Maria.
    id: GE_2, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_BANK, targetNodeId: GN_MARIA, relationType: "financial",
    relationHypothesisId: REL_2, support: 0.66, structuralImportance: 0.6,
    directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1,
    createdAt: obs("2024-05-20"), updatedAt: obs("2024-05-20"),
  },
  {
    // Cross-link between the two shell companies — subsequently contradicted
    // by a conflicting location record. Demonstrates the counter-evidence
    // flip: this edge renders as a dashed red line, not a normal link.
    id: GE_5, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_SHELL_ONE, targetNodeId: GN_SHELL_TWO, relationType: "financial",
    relationHypothesisId: REL_5, support: 0.7, structuralImportance: 0.64,
    directed: true, status: "CONTRADICTED", observationCount: 2, sourceCount: 1,
    createdAt: obs("2024-06-10"), updatedAt: obs("2024-06-10"),
  },
  {
    // Weak, single-source link to an unidentified witness — deliberately
    // low support to demonstrate the low-confidence dashed-edge treatment.
    id: GE_6, investigationId: INVESTIGATION_ID, versionId: GRAPH_VERSION,
    sourceNodeId: GN_VICTOR, targetNodeId: GN_WITNESS, relationType: "ownership",
    relationHypothesisId: REL_6, support: 0.2, structuralImportance: 0.5,
    directed: true, status: "ACTIVE", observationCount: 1, sourceCount: 1,
    createdAt: obs("2024-06-15"), updatedAt: obs("2024-06-15"),
  },
];

export const operationFinancialShadowGraph = {
  version: GraphVersionSchema.parse(versionData),
  nodes: nodes.map((n) => GraphNodeSchema.parse(n)),
  edges: edges.map((e) => GraphEdgeSchema.parse(e)),
};

/** Historical version series surfaced by GraphProvider.listVersions (ascending). */
export const operationFinancialShadowVersions: GraphVersion[] =
  versionSeriesData.map((v) => GraphVersionSchema.parse(v));
