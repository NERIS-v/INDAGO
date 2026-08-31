// ============================================================================
// M-A07 Entity Mention Candidate — public surface
// ============================================================================

export {
  extractEntityMentions,
  finalizeEntityMention,
  ENTITY_MENTION_IDENTITY_DERIVATION,
} from './entity-mention-extractor.js';
export type {
  EntityMentionExtractorConfig,
} from './entity-mention-extractor.js';

export {
  ENTITY_MENTION_IDENTITY_NAMESPACE,
  ENTITY_MENTION_IDENTITY_VERSION,
  buildEntityMentionIdentityKey,
  deterministicEntityMentionId,
} from './entity-mention-id.js';
export type { EntityMentionIdentityInput } from './entity-mention-id.js';

export {
  ENTITY_PATTERN_RULES,
  matchTypedPatterns,
  CAPITALIZED_NAME_RE,
} from './pattern-rules.js';
export type { EntityPatternRule } from './pattern-rules.js';

export {
  createGazetteer,
  EMPTY_GAZETTEER,
} from './gazetteer.js';
export type { Gazetteer, GazetteerEntry } from './gazetteer.js';

export {
  CONTEXTUAL_RULES,
  classifyByContext,
  isContextStopword,
} from './contextual-rules.js';
export type { ContextualRule } from './contextual-rules.js';

export {
  HEURISTIC_METHOD,
  isPlausibleEntityToken,
} from './heuristic-fallback.js';

export {
  ENTITY_MENTION_BOUNDS,
} from './types.js';
export type {
  EntityMentionDraft,
  EntityMentionExtractionResult,
} from './types.js';
