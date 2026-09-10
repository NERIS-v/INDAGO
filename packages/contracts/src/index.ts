// ============================================================================
// @indago/contracts
//
// Zod-based contract layer for INDAGO V7.
// All types are inferred from schemas. No implementation imports.
// ============================================================================

// Common primitives
export * from './common/ids.js';
export * from './common/timestamps.js';
export * from './common/confidence.js';
export * from './common/provenance.js';
export * from './common/comparison-status.js';
export * from './common/pagination.js';
export * from './common/metadata.js';
export * from './common/errors.js';

// Domain contracts
export * from './domain/investigation.js';
export * from './domain/case.js';
export * from './domain/source.js';
export * from './domain/artifact.js';
export * from './domain/evidence.js';
export * from './domain/observation.js';
export * from './domain/entity.js';
export * from './domain/entity-mention-candidate.js';
export * from './domain/candidate-pair.js';
export * from './domain/relation.js';
export * from './domain/hypothesis.js';
export * from './domain/lead.js';
export * from './domain/investigative-gap.js';
export * from './domain/evidence-request.js';
export * from './domain/review-task.js';
export * from './domain/audit-event.js';

// Graph contracts
export * from './graph/graph-node.js';
export * from './graph/graph-edge.js';
export * from './graph/graph-version.js';
export * from './graph/graph-analysis.js';
export * from './graph/graph-projection.js';

// Intelligence contracts
export * from './intelligence/entity-resolution.js';
export * from './intelligence/relation-resolution.js';
export * from './intelligence/evidence-search.js';
export * from './intelligence/cross-case.js';
export * from './intelligence/graph-holes.js';
export * from './intelligence/gap-classification.js';
export * from './intelligence/evidence-ranking.js';
export * from './intelligence/counter-evidence.js';
export * from './intelligence/robustness.js';
export * from './intelligence/route-stage.js';
export * from './intelligence/intelligence-results.js';
export * from './intelligence/ingestion-envelope.js';
export * from './intelligence/adapter-capability.js';
export * from './intelligence/ingestion-errors.js';
export * from './intelligence/artifact-reference.js';
export * from './intelligence/evidence-submission.js';
export * from './intelligence/upload-router.js';
export * from './intelligence/ingestion-job-payload.js';
export * from './intelligence/normalization.js';

// Execution contracts
export * from './execution/investigation-run.js';
export * from './execution/state-machine.js';
export * from './execution/checkpoints.js';
export * from './execution/tool.js';
export * from './execution/tool-execution.js';
export * from './execution/execution-errors.js';
export * from './execution/recovery.js';

// Agent contracts
export * from './agent/agent-state.js';
export * from './agent/agent-messages.js';
export * from './agent/claim-grounding.js';
export * from './agent/agent-decisions.js';

// Event contracts
export * from './events/event-types.js';
export * from './events/base-event.js';
export * from './events/investigation-events.js';
export * from './events/evidence-events.js';
export * from './events/graph-events.js';
export * from './events/analysis-events.js';
export * from './events/observation-events.js';
export * from './events/execution-events.js';

// Security contracts
export * from './security/authorization.js';
export * from './security/access-context.js';
export * from './security/sensitivity.js';
export * from './security/pii.js';
