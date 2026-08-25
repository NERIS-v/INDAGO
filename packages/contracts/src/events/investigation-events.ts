import { z } from 'zod';
import {
  InvestigationIdSchema,
  CaseIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { BaseEventSchema } from './base-event.js';

// ============================================================================
// Investigation Events
//
// Typed events for investigation lifecycle.
// Each event uses z.literal() for eventType and a typed payload.
// ============================================================================

export const InvestigationCreatedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  title: z.string(),
  createdAt: ObservedTimeSchema,
}).strict();
export type InvestigationCreatedPayload = z.infer<typeof InvestigationCreatedPayloadSchema>;

export const InvestigationCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_CREATED'),
  payload: InvestigationCreatedPayloadSchema,
}).strict();

export const InvestigationStartedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  startedAt: ObservedTimeSchema,
}).strict();
export type InvestigationStartedPayload = z.infer<typeof InvestigationStartedPayloadSchema>;

export const InvestigationStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_STARTED'),
  payload: InvestigationStartedPayloadSchema,
}).strict();

export const InvestigationPausedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  reason: z.string().optional(),
  pausedAt: ObservedTimeSchema,
}).strict();
export type InvestigationPausedPayload = z.infer<typeof InvestigationPausedPayloadSchema>;

export const InvestigationPausedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_PAUSED'),
  payload: InvestigationPausedPayloadSchema,
}).strict();

export const InvestigationResumedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  resumedAt: ObservedTimeSchema,
}).strict();
export type InvestigationResumedPayload = z.infer<typeof InvestigationResumedPayloadSchema>;

export const InvestigationResumedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_RESUMED'),
  payload: InvestigationResumedPayloadSchema,
}).strict();

export const InvestigationClosedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  closedAt: ObservedTimeSchema,
  summary: z.string().optional(),
}).strict();
export type InvestigationClosedPayload = z.infer<typeof InvestigationClosedPayloadSchema>;

export const InvestigationClosedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_CLOSED'),
  payload: InvestigationClosedPayloadSchema,
}).strict();

export const InvestigationArchivedPayloadSchema = z.object({
  investigationId: InvestigationIdSchema,
  archivedAt: ObservedTimeSchema,
}).strict();
export type InvestigationArchivedPayload = z.infer<typeof InvestigationArchivedPayloadSchema>;

export const InvestigationArchivedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_ARCHIVED'),
  payload: InvestigationArchivedPayloadSchema,
}).strict();

export const InvestigationEventSchema = z.discriminatedUnion('eventType', [
  InvestigationCreatedEventSchema,
  InvestigationStartedEventSchema,
  InvestigationPausedEventSchema,
  InvestigationResumedEventSchema,
  InvestigationClosedEventSchema,
  InvestigationArchivedEventSchema,
]);
export type InvestigationEvent = z.infer<typeof InvestigationEventSchema>;
