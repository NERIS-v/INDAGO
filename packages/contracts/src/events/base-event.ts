import { z } from 'zod';
import {
  EventIdSchema,
  InvestigationIdSchema,
  CorrelationIdSchema,
  OperationIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';

// ============================================================================
// Base Event
//
// Generic base schema for all INDAGO events.
// Concrete events extend this with z.literal() for eventType
// and a typed payload schema.
//
// Pattern:
//   BaseEventSchema = { eventId, version, timestamp, ..., eventType, payload }
//   ConcreteEvent = BaseEvent + { eventType: z.literal('X'), payload: PayloadSchema }
//   Union = z.discriminatedUnion('eventType', [ConcreteEvent1, ...])
// ============================================================================

export const BaseEventSchema = z.object({
  eventId: EventIdSchema,
  version: z.number().int().positive()
    .describe('Event schema version'),
  timestamp: ObservedTimeSchema
    .describe('When this event was recorded'),
  domainEventTime: ObservedTimeSchema.optional()
    .describe('When the domain event actually occurred'),
  investigationId: InvestigationIdSchema,
  correlationId: CorrelationIdSchema
    .describe('Correlation ID for request tracing'),
  operationId: OperationIdSchema
    .describe('Operation ID for grouping related events'),
  actor: z.string().min(1)
    .describe('Who or what triggered this event'),
}).strict();
export type BaseEvent = z.infer<typeof BaseEventSchema>;
