import { z } from 'zod';
import { EvidenceTypeSchema } from '../domain/evidence.js';

// ============================================================================
// Evidence-Type Vocabulary (Phase 5A-PR10 Freeze)
//
// The CANONICAL evidence-type vocabulary for the INDAGO pipeline is the domain
// `EvidenceTypeSchema` enum (domain/evidence.ts):
//
//   DOCUMENT | RECORD | TESTIMONY | PHYSICAL | DIGITAL | FINANCIAL
//   | COMMUNICATION | OTHER
//
// This module does NOT create a second competing enum. It exposes ONE
// versioned, frozen REFERENCE to the canonical vocabulary so that PR10-facing
// surfaces (evidence requests, graph-hole suggestions, recommended evidence,
// next-best-evidence selection) share the exact same vocabulary, versioned
// consistently with repository policy conventions.
//
// Semantics (frozen for V1):
//   - `evidenceTypes` mirrors the domain enum in canonical declaration order.
//   - The canonical identity of an evidence type IS the enum value. A
//     free-form descriptive subtype (e.g. "federal response letter") is NOT an
//     evidence type; specificity is carried by free-text `description`/
//     `rationale` fields, never by the evidence-type field.
//   - A future vocabulary revision (new member, split, deprecation) is a NEW
//     policy version, never an in-place mutation.
// ============================================================================

/** Version of the frozen evidence-type vocabulary reference (PR10 owns this). */
export const EVIDENCE_TYPE_VOCABULARY_VERSION = 'v1' as const;
export type EvidenceTypeVocabularyVersion = typeof EVIDENCE_TYPE_VOCABULARY_VERSION;

export const EvidenceTypeVocabularySchema = z.object({
  version: z.literal(EVIDENCE_TYPE_VOCABULARY_VERSION)
    .describe('Vocabulary reference version. A vocabulary change is a new version, never an in-place mutation.'),
  evidenceTypes: z.array(EvidenceTypeSchema)
    .min(1)
    .describe('Canonical evidence types, in canonical declaration order (mirrors EvidenceTypeSchema).'),
}).strict();
export type EvidenceTypeVocabulary = z.infer<typeof EvidenceTypeVocabularySchema>;

/** The frozen V1 reference to the canonical evidence-type vocabulary. */
export const EVIDENCE_TYPE_VOCABULARY_V1: EvidenceTypeVocabulary = {
  version: EVIDENCE_TYPE_VOCABULARY_VERSION,
  evidenceTypes: [
    'DOCUMENT',
    'RECORD',
    'TESTIMONY',
    'PHYSICAL',
    'DIGITAL',
    'FINANCIAL',
    'COMMUNICATION',
    'OTHER',
  ],
};