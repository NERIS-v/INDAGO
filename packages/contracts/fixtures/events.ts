import type { InvestigationCreatedEvent, EvidenceIngestedEvent, GraphNodeAddedEvent } from '../src/events/index.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Event Fixtures
// ============================================================================

export const FIXTURE_INVESTIGATION_CREATED_EVENT: InvestigationCreatedEvent = {
  eventId: FIXTURE_IDS.event1,
  version: 1,
  timestamp: { value: '2025-01-15T09:00:00Z', precision: 'exact' },
  investigationId: FIXTURE_IDS.investigation1,
  correlationId: FIXTURE_IDS.correlation1,
  operationId: FIXTURE_IDS.operation1,
  actor: 'investigator-mayur',
  eventType: 'INVESTIGATION_CREATED',
  payload: {
    investigationId: FIXTURE_IDS.investigation1,
    caseId: FIXTURE_IDS.case1,
    title: 'Financial Transfer Analysis',
    createdAt: { value: '2025-01-15T09:00:00Z', precision: 'exact' },
  },
};

export const FIXTURE_EVIDENCE_INGESTED_EVENT: EvidenceIngestedEvent = {
  eventId: FIXTURE_IDS.event2,
  version: 1,
  timestamp: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
  investigationId: FIXTURE_IDS.investigation1,
  correlationId: FIXTURE_IDS.correlation1,
  operationId: FIXTURE_IDS.operation1,
  actor: 'system-ingestion',
  eventType: 'EVIDENCE_INGESTED',
  payload: {
    evidenceId: FIXTURE_IDS.evidence1,
    sourceId: FIXTURE_IDS.source1,
    caseId: FIXTURE_IDS.case1,
    type: 'FINANCIAL',
    title: 'Financial Transaction Records',
    observationCount: 3,
    entityCount: 2,
  },
};

export const FIXTURE_GRAPH_NODE_ADDED_EVENT: GraphNodeAddedEvent = {
  eventId: FIXTURE_IDS.event1,
  version: 1,
  timestamp: { value: '2025-01-15T10:10:00Z', precision: 'exact' },
  investigationId: FIXTURE_IDS.investigation1,
  correlationId: FIXTURE_IDS.correlation1,
  operationId: FIXTURE_IDS.operation1,
  actor: 'graph-engine-v1',
  eventType: 'GRAPH_NODE_ADDED',
  payload: {
    nodeId: FIXTURE_IDS.graphNode1,
    graphVersionId: FIXTURE_IDS.graphVersion1,
    type: 'ENTITY',
    entityId: FIXTURE_IDS.entity1,
    label: 'Alice Johnson',
  },
};
