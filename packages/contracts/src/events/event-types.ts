import { z } from 'zod';

// ============================================================================
// Event Types
//
// Enumeration of all domain event types in INDAGO.
// Used as z.literal() discriminators in event schemas.
// ============================================================================

export const EventTypeSchema = z.enum([
  // Investigation lifecycle
  'INVESTIGATION_CREATED',
  'INVESTIGATION_STARTED',
  'INVESTIGATION_PAUSED',
  'INVESTIGATION_RESUMED',
  'INVESTIGATION_CLOSED',
  'INVESTIGATION_ARCHIVED',

  // Evidence lifecycle
  'EVIDENCE_INGESTED',
  'EVIDENCE_PROCESSED',
  'EVIDENCE_REVIEWED',
  'EVIDENCE_VERIFIED',
  'EVIDENCE_REJECTED',

  // Observation lifecycle
  'OBSERVATION_EXTRACTED',
  'OBSERVATION_VALIDATED',
  'OBSERVATION_CONTRADICTED',

  // Entity lifecycle
  'ENTITY_CREATED',
  'ENTITY_UPDATED',
  'ENTITY_MERGED',
  'ENTITY_SPLIT',
  'ENTITY_ARCHIVED',

  // Entity resolution
  'ENTITY_HYPOTHESIS_CREATED',
  'ENTITY_HYPOTHESIS_RESOLVED',
  'ENTITY_HYPOTHESIS_CONTRADICTED',
  'ENTITY_ROLE_HYPOTHESIS_CREATED',
  'ENTITY_ROLE_HYPOTHESIS_UPDATED',

  // Relation lifecycle
  'RELATION_CREATED',
  'RELATION_UPDATED',
  'RELATION_CONTRADICTED',
  'RELATION_ARCHIVED',

  // Hypothesis lifecycle
  'HYPOTHESIS_CREATED',
  'HYPOTHESIS_PROMOTED',
  'HYPOTHESIS_ABANDONED',
  'HYPOTHESIS_SUPERSEDED',

  // Lead lifecycle
  'LEAD_CREATED',
  'LEAD_PROMOTED',
  'LEAD_REJECTED',
  'LEAD_STALE',

  // Gap lifecycle
  'GAP_IDENTIFIED',
  'GAP_ADDRESSED',
  'GAP_WONFIX',

  // Graph events
  'GRAPH_VERSION_CREATED',
  'GRAPH_NODE_ADDED',
  'GRAPH_NODE_REMOVED',
  'GRAPH_EDGE_ADDED',
  'GRAPH_EDGE_REMOVED',
  'GRAPH_ANALYSIS_COMPLETED',
  'GRAPH_HOLE_DETECTED',

  // Execution events
  'RUN_STARTED',
  'RUN_PAUSED',
  'RUN_RESUMED',
  'RUN_COMPLETED',
  'RUN_FAILED',
  'RUN_CANCELLED',
  'CHECKPOINT_CREATED',
  'TOOL_EXECUTED',
  'TOOL_FAILED',

  // Review events
  'REVIEW_TASK_CREATED',
  'REVIEW_TASK_COMPLETED',
  'REVIEW_TASK_ESCALATED',

  // Audit events
  'AUDIT_EVENT_RECORDED',

  // Agent events
  'AGENT_DECISION_MADE',
  'AGENT_CLAIM_PROPOSED',
  'AGENT_CLAIM_GROUNDED',
]);
export type EventType = z.infer<typeof EventTypeSchema>;
