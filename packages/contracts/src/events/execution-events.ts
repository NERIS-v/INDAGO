import { z } from 'zod';
import {
  InvestigationRunIdSchema,
  InvestigationIdSchema,
  CheckpointIdSchema,
  ToolIdSchema,
  ToolExecutionIdSchema,
} from '../common/ids.js';
import { BaseEventSchema } from './base-event.js';

// ============================================================================
// Execution Events
//
// Typed events for execution lifecycle (runs, checkpoints, tools).
// ============================================================================

export const RunStartedPayloadSchema = z.object({
  runId: InvestigationRunIdSchema,
  investigationId: InvestigationIdSchema,
  totalStages: z.number().int(),
}).strict();
export type RunStartedPayload = z.infer<typeof RunStartedPayloadSchema>;

export const RunStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('RUN_STARTED'),
  payload: RunStartedPayloadSchema,
}).strict();

export const RunCompletedPayloadSchema = z.object({
  runId: InvestigationRunIdSchema,
  completedStages: z.number().int(),
  durationMs: z.number().int(),
}).strict();
export type RunCompletedPayload = z.infer<typeof RunCompletedPayloadSchema>;

export const RunCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('RUN_COMPLETED'),
  payload: RunCompletedPayloadSchema,
}).strict();

export const RunFailedPayloadSchema = z.object({
  runId: InvestigationRunIdSchema,
  failedStage: z.string(),
  error: z.string(),
  retryable: z.boolean(),
}).strict();
export type RunFailedPayload = z.infer<typeof RunFailedPayloadSchema>;

export const RunFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('RUN_FAILED'),
  payload: RunFailedPayloadSchema,
}).strict();

export const RunCancelledPayloadSchema = z.object({
  runId: InvestigationRunIdSchema,
  reason: z.string(),
}).strict();
export type RunCancelledPayload = z.infer<typeof RunCancelledPayloadSchema>;

export const RunCancelledEventSchema = BaseEventSchema.extend({
  eventType: z.literal('RUN_CANCELLED'),
  payload: RunCancelledPayloadSchema,
}).strict();

export const CheckpointCreatedPayloadSchema = z.object({
  checkpointId: CheckpointIdSchema,
  runId: InvestigationRunIdSchema,
  stage: z.string(),
  stageIndex: z.number().int(),
}).strict();
export type CheckpointCreatedPayload = z.infer<typeof CheckpointCreatedPayloadSchema>;

export const CheckpointCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('CHECKPOINT_CREATED'),
  payload: CheckpointCreatedPayloadSchema,
}).strict();

export const ToolExecutedPayloadSchema = z.object({
  toolExecutionId: ToolExecutionIdSchema,
  toolId: ToolIdSchema,
  runId: InvestigationRunIdSchema,
  status: z.string(),
  durationMs: z.number().int().optional(),
}).strict();
export type ToolExecutedPayload = z.infer<typeof ToolExecutedPayloadSchema>;

export const ToolExecutedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('TOOL_EXECUTED'),
  payload: ToolExecutedPayloadSchema,
}).strict();

export const ToolFailedPayloadSchema = z.object({
  toolExecutionId: ToolExecutionIdSchema,
  toolId: ToolIdSchema,
  runId: InvestigationRunIdSchema,
  error: z.string(),
  retryable: z.boolean(),
}).strict();
export type ToolFailedPayload = z.infer<typeof ToolFailedPayloadSchema>;

export const ToolFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('TOOL_FAILED'),
  payload: ToolFailedPayloadSchema,
}).strict();

export const ExecutionEventSchema = z.discriminatedUnion('eventType', [
  RunStartedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  RunCancelledEventSchema,
  CheckpointCreatedEventSchema,
  ToolExecutedEventSchema,
  ToolFailedEventSchema,
]);
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
