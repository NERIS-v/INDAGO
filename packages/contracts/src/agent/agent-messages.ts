import { z } from 'zod';
import {
  InvestigationIdSchema,
  InvestigationRunIdSchema,
  ClaimIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Agent Messages
//
// Messages exchanged between the agent and INDAGO subsystems.
// ============================================================================

export const MessageTypeSchema = z.enum([
  'OBSERVATION',
  'HYPOTHESIS',
  'CLAIM',
  'QUESTION',
  'COMMAND',
  'RESPONSE',
  'ERROR',
  'STATUS_UPDATE',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const AgentMessageSchema = z.object({
  type: MessageTypeSchema,
  investigationId: InvestigationIdSchema,
  runId: InvestigationRunIdSchema,
  content: z.string().min(1).max(50000)
    .describe('Message content'),
  confidence: AnalyticalConfidenceSchema.optional()
    .describe('Confidence in this message'),
  claimId: ClaimIdSchema.optional()
    .describe('Associated claim, if this is a claim message'),
  replyTo: z.string().uuid().optional()
    .describe('ID of the message this is replying to'),
  timestamp: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentConversationSchema = z.object({
  investigationId: InvestigationIdSchema,
  runId: InvestigationRunIdSchema,
  messages: z.array(AgentMessageSchema),
  startedAt: ObservedTimeSchema,
  lastMessageAt: ObservedTimeSchema,
  messageCount: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type AgentConversation = z.infer<typeof AgentConversationSchema>;
