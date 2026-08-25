# Event Semantics

## Overview

INDAGO events are strongly typed using Zod discriminated unions. Every event has:

- `eventType`: A `z.literal()` string discriminator
- `payload`: A typed payload schema specific to that event type
- `BaseEvent` fields: eventId, version, timestamp, investigationId, etc.

## Pattern

```typescript
// Base event with shared fields
BaseEventSchema = {
  eventId, version, timestamp, investigationId, correlationId, operationId, actor
}

// Concrete event with typed discriminator + payload
InvestigationCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('INVESTIGATION_CREATED'),
  payload: InvestigationCreatedPayloadSchema,
})

// Discriminated union
InvestigationEventSchema = z.discriminatedUnion('eventType', [
  InvestigationCreatedEventSchema,
  InvestigationStartedEventSchema,
  ...
])
```

## Event Categories

### Investigation Events
- INVESTIGATION_CREATED
- INVESTIGATION_STARTED
- INVESTIGATION_PAUSED
- INVESTIGATION_RESUMED
- INVESTIGATION_CLOSED
- INVESTIGATION_ARCHIVED

### Evidence Events
- EVIDENCE_INGESTED
- EVIDENCE_PROCESSED
- EVIDENCE_REVIEWED
- EVIDENCE_VERIFIED
- EVIDENCE_REJECTED

### Graph Events
- GRAPH_VERSION_CREATED
- GRAPH_NODE_ADDED
- GRAPH_NODE_REMOVED
- GRAPH_EDGE_ADDED
- GRAPH_EDGE_REMOVED
- GRAPH_ANALYSIS_COMPLETED
- GRAPH_HOLE_DETECTED

### Analysis Events
- HYPOTHESIS_CREATED / PROMOTED / ABANDONED
- LEAD_CREATED / PROMOTED / REJECTED
- GAP_IDENTIFIED / ADDRESSED

### Execution Events
- RUN_STARTED / COMPLETED / FAILED / CANCELLED
- CHECKPOINT_CREATED
- TOOL_EXECUTED / TOOL_FAILED

## Key Properties

1. **Events are immutable**: Once created, never modified
2. **Events are ordered**: Version numbers ensure ordering
3. **Events are traceable**: CorrelationId and OperationId link related events
4. **Events are typed**: Discriminated unions provide compile-time safety
5. **Events carry provenance**: Actor field identifies who/what triggered the event
