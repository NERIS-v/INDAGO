import { z } from 'zod';

// ============================================================================
// Semantic ID Schemas
//
// Every ID in INDAGO is a UUID with a distinct semantic type.
// Do not use bare z.string() where a semantic ID exists.
// ============================================================================

export const InvestigationIdSchema = z.string().uuid();
export type InvestigationId = z.infer<typeof InvestigationIdSchema>;

export const CaseIdSchema = z.string().uuid();
export type CaseId = z.infer<typeof CaseIdSchema>;

export const SourceIdSchema = z.string().uuid();
export type SourceId = z.infer<typeof SourceIdSchema>;

export const ArtifactIdSchema = z.string().uuid();
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;

export const EvidenceIdSchema = z.string().uuid();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

export const ObservationIdSchema = z.string().uuid();
export type ObservationId = z.infer<typeof ObservationIdSchema>;

export const EntityIdSchema = z.string().uuid();
export type EntityId = z.infer<typeof EntityIdSchema>;

export const EntityHypothesisIdSchema = z.string().uuid();
export type EntityHypothesisId = z.infer<typeof EntityHypothesisIdSchema>;

export const EntityRoleHypothesisIdSchema = z.string().uuid();
export type EntityRoleHypothesisId = z.infer<typeof EntityRoleHypothesisIdSchema>;

export const RelationHypothesisIdSchema = z.string().uuid();
export type RelationHypothesisId = z.infer<typeof RelationHypothesisIdSchema>;

export const EntityComparisonIdSchema = z.string().uuid();
export type EntityComparisonId = z.infer<typeof EntityComparisonIdSchema>;

export const GraphNodeIdSchema = z.string().uuid();
export type GraphNodeId = z.infer<typeof GraphNodeIdSchema>;

export const GraphEdgeIdSchema = z.string().uuid();
export type GraphEdgeId = z.infer<typeof GraphEdgeIdSchema>;

export const GraphVersionIdSchema = z.string().uuid();
export type GraphVersionId = z.infer<typeof GraphVersionIdSchema>;

export const HypothesisIdSchema = z.string().uuid();
export type HypothesisId = z.infer<typeof HypothesisIdSchema>;

export const LeadIdSchema = z.string().uuid();
export type LeadId = z.infer<typeof LeadIdSchema>;

export const InvestigativeGapIdSchema = z.string().uuid();
export type InvestigativeGapId = z.infer<typeof InvestigativeGapIdSchema>;

export const EvidenceRequestIdSchema = z.string().uuid();
export type EvidenceRequestId = z.infer<typeof EvidenceRequestIdSchema>;

export const ReviewTaskIdSchema = z.string().uuid();
export type ReviewTaskId = z.infer<typeof ReviewTaskIdSchema>;

export const AuditEventIdSchema = z.string().uuid();
export type AuditEventId = z.infer<typeof AuditEventIdSchema>;

export const InvestigationRunIdSchema = z.string().uuid();
export type InvestigationRunId = z.infer<typeof InvestigationRunIdSchema>;

export const CheckpointIdSchema = z.string().uuid();
export type CheckpointId = z.infer<typeof CheckpointIdSchema>;

export const ToolIdSchema = z.string().uuid();
export type ToolId = z.infer<typeof ToolIdSchema>;

export const ToolExecutionIdSchema = z.string().uuid();
export type ToolExecutionId = z.infer<typeof ToolExecutionIdSchema>;

export const EventIdSchema = z.string().uuid();
export type EventId = z.infer<typeof EventIdSchema>;

export const CorrelationIdSchema = z.string().uuid();
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

export const OperationIdSchema = z.string().uuid();
export type OperationId = z.infer<typeof OperationIdSchema>;

export const ClaimIdSchema = z.string().uuid();
export type ClaimId = z.infer<typeof ClaimIdSchema>;
