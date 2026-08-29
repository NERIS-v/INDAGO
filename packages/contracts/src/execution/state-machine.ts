import { z } from 'zod';
import { CheckpointIdSchema } from '../common/ids.js';

// ============================================================================
// Investigation Run State Machine
//
// Defines the execution pipeline state for a specific investigation run.
//
// SEPARATION OF CONCERNS:
//   InvestigationStatus (domain/investigation.ts):
//     Persistent lifecycle of the investigation object itself.
//     DRAFT / ACTIVE / PAUSED / CLOSED / ARCHIVED
//
//   InvestigationRunStatus (execution/investigation-run.ts):
//     Runtime execution status of a specific run.
//     QUEUED / INITIALIZING / RUNNING / PAUSED / COMPLETED / FAILED / CANCELLED
//
//   InvestigationRunState (this file):
//     Pipeline stage the run is currently in.
//     CREATED → INGESTING → NORMALIZING → ANALYZING → DISCOVERING → ...
//
// This file defines ONLY the run-state machine.
// ============================================================================

export const InvestigationRunStateSchema = z.enum([
  'CREATED',
  'INGESTING',
  'NORMALIZING',
  'ANALYZING',
  'DISCOVERING',
  'WAITING_FOR_EVIDENCE',
  'REASSESSING',
  'REVIEW_REQUIRED',
  'PAUSED',
  'FAILED',
  'COMPLETED',
]);
export type InvestigationRunState = z.infer<typeof InvestigationRunStateSchema>;

// ============================================================================
// Transition Contracts
// ============================================================================

export const TransitionSchema = z.object({
  from: InvestigationRunStateSchema,
  to: InvestigationRunStateSchema,
  trigger: z.string()
    .describe('Event or action that triggers this transition'),
  guard: z.string().optional()
    .describe('Condition that must be true for this transition'),
}).strict();
export type Transition = z.infer<typeof TransitionSchema>;

/**
 * Resume transition contract.
 *
 * PAUSED is NOT modeled as an ordinary target state in the transition graph.
 * Instead, pause preserves the immediately previous resumable run state,
 * and resume returns to that state.
 *
 * Semantic rule:
 *   pause preserves the immediately previous resumable run state;
 *   resume returns to that state.
 */
export const ResumeTransitionSchema = z.object({
  fromState: z.literal('PAUSED'),
  resumeToState: InvestigationRunStateSchema
    .describe('The state being resumed to'),
  pausedFromState: InvestigationRunStateSchema
    .describe('The state that was active when PAUSED'),
}).strict();
export type ResumeTransition = z.infer<typeof ResumeTransitionSchema>;

/**
 * Recovery action from FAILED state.
 *
 * FAILED → recovery action → target state.
 * Recovery is NOT an ordinary state transition — it goes through
 * the RecoveryAction concept.
 */
export const RecoveryActionTypeSchema = z.enum([
  'RETRY_FROM_CHECKPOINT',
  'RESTART_RUN',
  'SKIP_FAILED_STAGE',
  'MANUAL_INTERVENTION',
]);
export type RecoveryActionType = z.infer<typeof RecoveryActionTypeSchema>;

export const RecoveryActionSchema = z.object({
  type: RecoveryActionTypeSchema,
  fromState: z.literal('FAILED'),
  targetState: InvestigationRunStateSchema.optional()
    .describe('Target state after recovery. Required for static recoveries (RETRY_FROM_CHECKPOINT, RESTART_RUN, MANUAL_INTERVENTION). Omitted for SKIP_FAILED_STAGE where the target is computed at runtime based on which stage failed.'),
  checkpointId: CheckpointIdSchema.optional()
    .describe('Checkpoint to resume from, if applicable'),
  description: z.string(),
}).strict();
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

/**
 * Complete run-state configuration bundling:
 *   - ordinary valid transitions
 *   - explicitly invalid transitions (for documentation)
 *   - PAUSED resumability rules
 *   - FAILED recovery actions
 */
export const RunStateConfigurationSchema = z.object({
  validTransitions: z.array(TransitionSchema)
    .describe('Ordinary state transitions (excludes PAUSED targets and FAILED recovery)'),
  invalidTransitions: z.array(TransitionSchema)
    .describe('Explicitly invalid transitions for documentation and error messages'),
  resumeTransitions: z.array(ResumeTransitionSchema)
    .describe('PAUSED resumability rules — pause preserves previous state, resume returns to it'),
  recoveryActions: z.array(RecoveryActionSchema)
    .describe('Permitted recovery actions from FAILED state'),
}).strict();
export type RunStateConfiguration = z.infer<typeof RunStateConfigurationSchema>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RUN_STATE_CONFIGURATION: RunStateConfiguration = {
  validTransitions: [
    { from: 'CREATED', to: 'INGESTING', trigger: 'PIPELINE_START' },
    { from: 'CREATED', to: 'FAILED', trigger: 'INGESTION_PERMANENT_FAILURE' },
    { from: 'INGESTING', to: 'NORMALIZING', trigger: 'INGESTION_COMPLETE' },
    { from: 'INGESTING', to: 'FAILED', trigger: 'INGESTION_PERMANENT_FAILURE' },
    { from: 'NORMALIZING', to: 'ANALYZING', trigger: 'NORMALIZATION_COMPLETE' },
    { from: 'NORMALIZING', to: 'FAILED', trigger: 'INGESTION_PERMANENT_FAILURE' },
    { from: 'ANALYZING', to: 'DISCOVERING', trigger: 'ANALYSIS_COMPLETE' },
    { from: 'DISCOVERING', to: 'REVIEW_REQUIRED', trigger: 'DISCOVERY_REQUIRES_REVIEW' },
    { from: 'DISCOVERING', to: 'WAITING_FOR_EVIDENCE', trigger: 'EVIDENCE_NEEDED' },
    { from: 'WAITING_FOR_EVIDENCE', to: 'REASSESSING', trigger: 'EVIDENCE_RECEIVED' },
    { from: 'REASSESSING', to: 'ANALYZING', trigger: 'REASSESSED_NEEDS_ANALYSIS' },
    { from: 'REASSESSING', to: 'DISCOVERING', trigger: 'REASSESSED_NEEDS_DISCOVERY' },
    { from: 'REASSESSING', to: 'REVIEW_REQUIRED', trigger: 'REASSESSED_READY_FOR_REVIEW' },
    { from: 'REASSESSING', to: 'COMPLETED', trigger: 'INVESTIGATION_COMPLETE' },
    { from: 'REVIEW_REQUIRED', to: 'WAITING_FOR_EVIDENCE', trigger: 'REVIEW_NEEDS_EVIDENCE' },
    { from: 'REVIEW_REQUIRED', to: 'COMPLETED', trigger: 'REVIEW_APPROVED' },
  ],
  invalidTransitions: [
    { from: 'COMPLETED', to: 'INGESTING', trigger: 'Cannot restart after completion' },
    { from: 'COMPLETED', to: 'ANALYZING', trigger: 'Cannot analyze after completion' },
    { from: 'COMPLETED', to: 'DISCOVERING', trigger: 'Cannot discover after completion' },
    { from: 'FAILED', to: 'COMPLETED', trigger: 'Cannot complete without recovery' },
    { from: 'WAITING_FOR_EVIDENCE', to: 'COMPLETED', trigger: 'Cannot complete while waiting' },
    { from: 'CREATED', to: 'COMPLETED', trigger: 'Cannot complete before starting' },
    { from: 'INGESTING', to: 'COMPLETED', trigger: 'Cannot complete during ingestion' },
  ],
  resumeTransitions: [
    { fromState: 'PAUSED', resumeToState: 'INGESTING', pausedFromState: 'INGESTING' },
    { fromState: 'PAUSED', resumeToState: 'NORMALIZING', pausedFromState: 'NORMALIZING' },
    { fromState: 'PAUSED', resumeToState: 'ANALYZING', pausedFromState: 'ANALYZING' },
    { fromState: 'PAUSED', resumeToState: 'DISCOVERING', pausedFromState: 'DISCOVERING' },
    { fromState: 'PAUSED', resumeToState: 'WAITING_FOR_EVIDENCE', pausedFromState: 'WAITING_FOR_EVIDENCE' },
    { fromState: 'PAUSED', resumeToState: 'REASSESSING', pausedFromState: 'REASSESSING' },
    { fromState: 'PAUSED', resumeToState: 'REVIEW_REQUIRED', pausedFromState: 'REVIEW_REQUIRED' },
  ],
  recoveryActions: [
    {
      type: 'RETRY_FROM_CHECKPOINT',
      fromState: 'FAILED',
      targetState: 'CREATED',
      description: 'Retry from last successful checkpoint. Run re-enters CREATED with checkpoint context.',
    },
    {
      type: 'RESTART_RUN',
      fromState: 'FAILED',
      targetState: 'CREATED',
      description: 'Restart the run from the beginning, discarding progress.',
    },
    {
      type: 'SKIP_FAILED_STAGE',
      fromState: 'FAILED',
      // No targetState — runtime computes the next stage after the failed one
      description: 'Skip the failed stage and continue from the next stage. Target state is determined at runtime based on which stage failed.',
    },
    {
      type: 'MANUAL_INTERVENTION',
      fromState: 'FAILED',
      targetState: 'FAILED',
      description: 'Requires human intervention. Run remains FAILED until resolved.',
    },
  ],
};
