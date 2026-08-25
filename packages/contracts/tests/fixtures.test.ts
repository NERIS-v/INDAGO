import { describe, it, expect } from 'vitest';
import {
  InvestigationSchema,
  CaseSchema,
  SourceSchema,
  EvidenceSchema,
  ObservationSchema,
  EntitySchema,
  EntityHypothesisSchema,
  EntityRoleHypothesisSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  LeadSchema,
  ToolSchema,
  InvestigationCreatedEventSchema,
  EvidenceIngestedEventSchema,
  GraphNodeAddedEventSchema,
  RobustnessResultSchema,
} from '../src/index.js';
import { FIXTURE_INVESTIGATION_1, FIXTURE_CASE_1 } from '../fixtures/investigation.js';
import { FIXTURE_SOURCE_1 } from '../fixtures/sources.js';
import { FIXTURE_OBSERVATION_1 } from '../fixtures/observations.js';
import { FIXTURE_ENTITY_1, FIXTURE_ENTITY_HYPOTHESIS_1, FIXTURE_ENTITY_ROLE_HYPOTHESIS_1 } from '../fixtures/entities.js';
import { FIXTURE_GRAPH_NODE_1, FIXTURE_GRAPH_NODE_2, FIXTURE_GRAPH_EDGE_1 } from '../fixtures/graph.js';
import { FIXTURE_LEAD_1 } from '../fixtures/leads.js';
import { FIXTURE_TOOL_1 } from '../fixtures/tools.js';
import { FIXTURE_INVESTIGATION_CREATED_EVENT, FIXTURE_EVIDENCE_INGESTED_EVENT, FIXTURE_GRAPH_NODE_ADDED_EVENT } from '../fixtures/events.js';
import { FIXTURE_ROBUSTNESS_RESULT_1 } from '../fixtures/robustness.js';

// ============================================================================
// Fixtures Test
//
// Validates ALL fixtures against their schemas.
// This ensures our test data is contract-compliant.
// ============================================================================

describe('All Fixtures Validate Against Schemas', () => {
  it('Investigation fixture', () => {
    expect(InvestigationSchema.safeParse(FIXTURE_INVESTIGATION_1).success).toBe(true);
  });

  it('Case fixture', () => {
    expect(CaseSchema.safeParse(FIXTURE_CASE_1).success).toBe(true);
  });

  it('Source fixture', () => {
    expect(SourceSchema.safeParse(FIXTURE_SOURCE_1).success).toBe(true);
  });

  it('Observation fixture', () => {
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_1).success).toBe(true);
  });

  it('Entity fixture', () => {
    expect(EntitySchema.safeParse(FIXTURE_ENTITY_1).success).toBe(true);
  });

  it('EntityHypothesis fixture', () => {
    expect(EntityHypothesisSchema.safeParse(FIXTURE_ENTITY_HYPOTHESIS_1).success).toBe(true);
  });

  it('EntityRoleHypothesis fixture', () => {
    expect(EntityRoleHypothesisSchema.safeParse(FIXTURE_ENTITY_ROLE_HYPOTHESIS_1).success).toBe(true);
  });

  it('GraphNode fixture', () => {
    expect(GraphNodeSchema.safeParse(FIXTURE_GRAPH_NODE_1).success).toBe(true);
  });

  it('GraphEdge fixture', () => {
    expect(GraphEdgeSchema.safeParse(FIXTURE_GRAPH_EDGE_1).success).toBe(true);
  });

  it('Lead fixture', () => {
    expect(LeadSchema.safeParse(FIXTURE_LEAD_1).success).toBe(true);
  });

  it('Tool fixture', () => {
    expect(ToolSchema.safeParse(FIXTURE_TOOL_1).success).toBe(true);
  });

  it('InvestigationCreatedEvent fixture', () => {
    expect(InvestigationCreatedEventSchema.safeParse(FIXTURE_INVESTIGATION_CREATED_EVENT).success).toBe(true);
  });

  it('EvidenceIngestedEvent fixture', () => {
    expect(EvidenceIngestedEventSchema.safeParse(FIXTURE_EVIDENCE_INGESTED_EVENT).success).toBe(true);
  });

  it('GraphNodeAddedEvent fixture', () => {
    expect(GraphNodeAddedEventSchema.safeParse(FIXTURE_GRAPH_NODE_ADDED_EVENT).success).toBe(true);
  });

  it('RobustnessResult fixture', () => {
    expect(RobustnessResultSchema.safeParse(FIXTURE_ROBUSTNESS_RESULT_1).success).toBe(true);
  });
});

describe('F: GraphNode Confidence Rejection', () => {
  it('FIXTURE_GRAPH_NODE_1 does not contain confidence field', () => {
    expect('confidence' in FIXTURE_GRAPH_NODE_1).toBe(false);
  });

  it('FIXTURE_GRAPH_NODE_2 does not contain confidence field', () => {
    expect('confidence' in FIXTURE_GRAPH_NODE_2).toBe(false);
  });

  it('GraphNodeSchema validates fixture without confidence', () => {
    expect(GraphNodeSchema.safeParse(FIXTURE_GRAPH_NODE_1).success).toBe(true);
  });
});
