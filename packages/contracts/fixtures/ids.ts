import { randomUUID } from 'node:crypto';

// ============================================================================
// ID Fixtures
//
// Deterministic test IDs for fixtures and tests.
// ============================================================================

export const FIXTURE_IDS = {
  // Investigations
  investigation1: randomUUID(),
  investigation2: randomUUID(),

  // Cases
  case1: randomUUID(),
  case2: randomUUID(),

  // Sources
  source1: randomUUID(),
  source2: randomUUID(),

  // Evidence
  evidence1: randomUUID(),
  evidence2: randomUUID(),
  evidence3: randomUUID(),

  // Observations
  observation1: randomUUID(),
  observation2: randomUUID(),
  observation3: randomUUID(),

  // Entities
  entity1: randomUUID(),
  entity2: randomUUID(),
  entity3: randomUUID(),

  // Entity Hypotheses
  entityHypothesis1: randomUUID(),
  entityHypothesis2: randomUUID(),

  // Entity Role Hypotheses
  entityRoleHypothesis1: randomUUID(),

  // Relation Hypotheses
  relationHypothesis1: randomUUID(),

  // Entity Comparisons
  entityComparison1: randomUUID(),

  // Graph
  graphNode1: randomUUID(),
  graphNode2: randomUUID(),
  graphEdge1: randomUUID(),
  graphVersion1: randomUUID(),

  // Hypotheses
  hypothesis1: randomUUID(),
  hypothesis2: randomUUID(),

  // Leads
  lead1: randomUUID(),
  lead2: randomUUID(),

  // Gaps
  gap1: randomUUID(),

  // Evidence Requests
  evidenceRequest1: randomUUID(),

  // Review Tasks
  reviewTask1: randomUUID(),

  // Audit Events
  auditEvent1: randomUUID(),

  // Runs
  run1: randomUUID(),

  // Checkpoints
  checkpoint1: randomUUID(),

  // Tools
  tool1: randomUUID(),

  // Tool Executions
  toolExecution1: randomUUID(),

  // Events
  event1: randomUUID(),
  event2: randomUUID(),

  // Correlation/Operation
  correlation1: randomUUID(),
  operation1: randomUUID(),

  // Claims
  claim1: randomUUID(),

  // Artifacts
  artifact1: randomUUID(),
} as const;
