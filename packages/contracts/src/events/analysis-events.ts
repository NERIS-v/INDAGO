import { z } from 'zod';
import {
  InvestigationIdSchema,
  HypothesisIdSchema,
  LeadIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { BaseEventSchema } from './base-event.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';

// ============================================================================
// Analysis Events
//
// Typed events for analysis lifecycle (hypotheses, leads, gaps).
// ============================================================================

export const HypothesisCreatedPayloadSchema = z.object({
  hypothesisId: HypothesisIdSchema,
  investigationId: InvestigationIdSchema,
  title: z.string(),
  statement: z.string(),
  confidence: AnalyticalConfidenceSchema,
}).strict();
export type HypothesisCreatedPayload = z.infer<typeof HypothesisCreatedPayloadSchema>;

export const HypothesisCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('HYPOTHESIS_CREATED'),
  payload: HypothesisCreatedPayloadSchema,
}).strict();

export const HypothesisPromotedPayloadSchema = z.object({
  hypothesisId: HypothesisIdSchema,
  promotedBy: z.string(),
  previousConfidence: AnalyticalConfidenceSchema,
  newConfidence: AnalyticalConfidenceSchema,
}).strict();
export type HypothesisPromotedPayload = z.infer<typeof HypothesisPromotedPayloadSchema>;

export const HypothesisPromotedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('HYPOTHESIS_PROMOTED'),
  payload: HypothesisPromotedPayloadSchema,
}).strict();

export const HypothesisAbandonedPayloadSchema = z.object({
  hypothesisId: HypothesisIdSchema,
  abandonedBy: z.string(),
  reason: z.string(),
}).strict();
export type HypothesisAbandonedPayload = z.infer<typeof HypothesisAbandonedPayloadSchema>;

export const HypothesisAbandonedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('HYPOTHESIS_ABANDONED'),
  payload: HypothesisAbandonedPayloadSchema,
}).strict();

export const LeadCreatedPayloadSchema = z.object({
  leadId: LeadIdSchema,
  investigationId: InvestigationIdSchema,
  title: z.string(),
  priority: z.string(),
  confidence: AnalyticalConfidenceSchema,
}).strict();
export type LeadCreatedPayload = z.infer<typeof LeadCreatedPayloadSchema>;

export const LeadCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('LEAD_CREATED'),
  payload: LeadCreatedPayloadSchema,
}).strict();

export const LeadPromotedPayloadSchema = z.object({
  leadId: LeadIdSchema,
  promotedBy: z.string(),
  promotedTo: z.string()
    .describe('What the lead was promoted to'),
}).strict();
export type LeadPromotedPayload = z.infer<typeof LeadPromotedPayloadSchema>;

export const LeadPromotedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('LEAD_PROMOTED'),
  payload: LeadPromotedPayloadSchema,
}).strict();

export const LeadRejectedPayloadSchema = z.object({
  leadId: LeadIdSchema,
  rejectedBy: z.string(),
  reason: z.string(),
}).strict();
export type LeadRejectedPayload = z.infer<typeof LeadRejectedPayloadSchema>;

export const LeadRejectedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('LEAD_REJECTED'),
  payload: LeadRejectedPayloadSchema,
}).strict();

export const GapIdentifiedPayloadSchema = z.object({
  gapId: InvestigativeGapIdSchema,
  investigationId: InvestigationIdSchema,
  type: z.string(),
  title: z.string(),
  priority: z.string(),
}).strict();
export type GapIdentifiedPayload = z.infer<typeof GapIdentifiedPayloadSchema>;

export const GapIdentifiedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GAP_IDENTIFIED'),
  payload: GapIdentifiedPayloadSchema,
}).strict();

export const GapAddressedPayloadSchema = z.object({
  gapId: InvestigativeGapIdSchema,
  addressedBy: z.string(),
  resolution: z.string(),
}).strict();
export type GapAddressedPayload = z.infer<typeof GapAddressedPayloadSchema>;

export const GapAddressedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GAP_ADDRESSED'),
  payload: GapAddressedPayloadSchema,
}).strict();

export const AnalysisEventSchema = z.discriminatedUnion('eventType', [
  HypothesisCreatedEventSchema,
  HypothesisPromotedEventSchema,
  HypothesisAbandonedEventSchema,
  LeadCreatedEventSchema,
  LeadPromotedEventSchema,
  LeadRejectedEventSchema,
  GapIdentifiedEventSchema,
  GapAddressedEventSchema,
]);
export type AnalysisEvent = z.infer<typeof AnalysisEventSchema>;
