import type { GraphNode } from '../src/graph/graph-node.js';
import type { GraphEdge } from '../src/graph/graph-edge.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Graph Fixtures
// ============================================================================

export const FIXTURE_GRAPH_NODE_1 = {
  id: FIXTURE_IDS.graphNode1,
  investigationId: FIXTURE_IDS.investigation1,
  versionId: FIXTURE_IDS.graphVersion1,
  type: 'ENTITY' as const,
  entityId: FIXTURE_IDS.entity1,
  label: 'Alice Johnson',
  structuralImportance: 0.85,
  observationCount: 3,
  sourceCount: 2,
  createdAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' as const },
  updatedAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' as const },
};

export const FIXTURE_GRAPH_NODE_2 = {
  id: FIXTURE_IDS.graphNode2,
  investigationId: FIXTURE_IDS.investigation1,
  versionId: FIXTURE_IDS.graphVersion1,
  type: 'ENTITY' as const,
  entityId: FIXTURE_IDS.entity2,
  label: 'Bob Smith',
  structuralImportance: 0.65,
  observationCount: 2,
  sourceCount: 1,
  createdAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' as const },
  updatedAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' as const },
};

export const FIXTURE_GRAPH_EDGE_1 = {
  id: FIXTURE_IDS.graphEdge1,
  investigationId: FIXTURE_IDS.investigation1,
  versionId: FIXTURE_IDS.graphVersion1,
  sourceNodeId: FIXTURE_IDS.graphNode1,
  targetNodeId: FIXTURE_IDS.graphNode2,
  relationType: 'financial' as const,
  support: 0.85,
  structuralImportance: 0.72,
  directed: true,
  status: 'ACTIVE' as const,
  observationCount: 1,
  sourceCount: 1,
  createdAt: { value: '2025-01-15T10:11:00Z', precision: 'exact' as const },
  updatedAt: { value: '2025-01-15T10:11:00Z', precision: 'exact' as const },
};
