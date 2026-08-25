import { describe, it, expect } from 'vitest';
import {
  InvestigationEventSchema,
  InvestigationCreatedEventSchema,
  InvestigationStartedEventSchema,
  InvestigationPausedEventSchema,
  InvestigationResumedEventSchema,
  InvestigationClosedEventSchema,
  InvestigationArchivedEventSchema,
  EvidenceEventSchema,
  EvidenceIngestedEventSchema,
  EvidenceProcessedEventSchema,
  EvidenceReviewedEventSchema,
  EvidenceVerifiedEventSchema,
  EvidenceRejectedEventSchema,
  GraphEventSchema,
  GraphVersionCreatedEventSchema,
  GraphNodeAddedEventSchema,
  GraphNodeRemovedEventSchema,
  GraphEdgeAddedEventSchema,
  GraphEdgeRemovedEventSchema,
  GraphAnalysisCompletedEventSchema,
  GraphHoleDetectedEventSchema,
  AnalysisEventSchema,
  ExecutionEventSchema,
} from '../src/index.js';
import {
  FIXTURE_INVESTIGATION_CREATED_EVENT,
  FIXTURE_EVIDENCE_INGESTED_EVENT,
  FIXTURE_GRAPH_NODE_ADDED_EVENT,
} from '../fixtures/events.js';
import { FIXTURE_IDS } from '../fixtures/ids.js';

// ============================================================================
// Event Contract Tests
//
// Verifies event schemas, discriminated unions, and typed payloads.
// ============================================================================

describe('Investigation Events', () => {
  it('InvestigationCreatedEvent validates', () => {
    const result = InvestigationCreatedEventSchema.safeParse(FIXTURE_INVESTIGATION_CREATED_EVENT);
    expect(result.success).toBe(true);
  });

  it('InvestigationEvent discriminated union works', () => {
    const result = InvestigationEventSchema.safeParse(FIXTURE_INVESTIGATION_CREATED_EVENT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventType).toBe('INVESTIGATION_CREATED');
    }
  });

  it('rejects event with wrong eventType', () => {
    const result = InvestigationCreatedEventSchema.safeParse({
      ...FIXTURE_INVESTIGATION_CREATED_EVENT,
      eventType: 'WRONG_TYPE',
    });
    expect(result.success).toBe(false);
  });
});

describe('Evidence Events', () => {
  it('EvidenceIngestedEvent validates', () => {
    const result = EvidenceIngestedEventSchema.safeParse(FIXTURE_EVIDENCE_INGESTED_EVENT);
    expect(result.success).toBe(true);
  });

  it('EvidenceEvent discriminated union works', () => {
    const result = EvidenceEventSchema.safeParse(FIXTURE_EVIDENCE_INGESTED_EVENT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventType).toBe('EVIDENCE_INGESTED');
    }
  });
});

describe('Graph Events', () => {
  it('GraphNodeAddedEvent validates', () => {
    const result = GraphNodeAddedEventSchema.safeParse(FIXTURE_GRAPH_NODE_ADDED_EVENT);
    expect(result.success).toBe(true);
  });

  it('GraphEvent discriminated union works', () => {
    const result = GraphEventSchema.safeParse(FIXTURE_GRAPH_NODE_ADDED_EVENT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventType).toBe('GRAPH_NODE_ADDED');
    }
  });
});

describe('Event Discrimination', () => {
  it('different event types are distinguishable', () => {
    const created = InvestigationCreatedEventSchema.safeParse(FIXTURE_INVESTIGATION_CREATED_EVENT);
    const ingested = EvidenceIngestedEventSchema.safeParse(FIXTURE_EVIDENCE_INGESTED_EVENT);
    const nodeAdded = GraphNodeAddedEventSchema.safeParse(FIXTURE_GRAPH_NODE_ADDED_EVENT);

    expect(created.success).toBe(true);
    expect(ingested.success).toBe(true);
    expect(nodeAdded.success).toBe(true);

    if (created.success && ingested.success && nodeAdded.success) {
      expect(created.data.eventType).not.toBe(ingested.data.eventType);
      expect(ingested.data.eventType).not.toBe(nodeAdded.data.eventType);
    }
  });
});
