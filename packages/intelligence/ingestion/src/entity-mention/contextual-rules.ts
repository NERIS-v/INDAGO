// ============================================================================
// M-A07 Entity Mention — CONTEXTUAL_RULE stage
//
// Deterministic, code-only contextual policy. A capitalized token that was not
// classified by PATTERN or GAZETTEER is typed by NEARBY CONTEXT WORDS that
// name the kind of thing it is.
//
// This is the THIRD stage of the pipeline:
//   PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC
//
// Context is inert/ambiguous-safe: a trigger word directly before/after the
// candidate (within a bounded window) that explicitly names the category.
// No semantic inference beyond the lexical trigger, never fabricated.
// ============================================================================

import type { EntityType } from '@indago/contracts';

export interface ContextualRule {
  readonly entityType: EntityType;
  /** Trigger phrases that, when adjacent to the candidate, type it. */
  readonly triggers: readonly string[];
}

/**
 * Contextual trigger table. Each entry maps a category to the leading labels
 * that would precede a proper noun of that category ("named contact X",
 * "location Mumbai", "organisation ACME").
 */
export const CONTEXTUAL_RULES: readonly ContextualRule[] = [
  {
    entityType: 'PERSON',
    triggers: [
      'mr ', 'mrs ', 'ms ', 'dr ', 'prof ', 'sri ', 'smt ', 'shri ',
      'surname', 'alias', 'identified as', 'named', 'individual named',
      'contact', 'caller ', 'callee ',
    ],
  },
  {
    entityType: 'ORGANIZATION',
    triggers: [
      'organisation ', 'organization ', 'company ', 'firm ', 'corporation ',
      'entity ', 'agency ', 'bank ', 'institution ', 'department ',
      'agency named', 'company named',
    ],
  },
  {
    entityType: 'LOCATION',
    triggers: [
      'located at ', 'location ', 'near ', 'at ', 'in ',
      'address ', 'premises ', 'residence ', 'city ', 'station ',
      'travelled to ', 'visited ', 'at the ',
    ],
  },
  {
    entityType: 'DEVICE',
    triggers: ['device ', 'handset ', 'phone number of device', 'instrument'],
  },
  {
    entityType: 'VEHICLE',
    triggers: ['vehicle ', 'car ', 'bike ', 'registr', 'plate'],
  },
];

// Stopword guard — never classify generic words via berthed context.
const CONTEXT_STOPWORDS = new Set([
  'that', 'this', 'these', 'those', 'with', 'from', 'into', 'when', 'after',
  'before', 'using', 'based', 'per', 'and', 'the', 'a', 'an', 'who', 'which',
  'what', 'where', 'here', 'there',
]);

export function isContextStopword(token: string): boolean {
  return CONTEXT_STOPWORDS.has(token.toLowerCase());
}

/**
 * Contextual lookup with a leading-window scan.
 *
 * `beforeText` is the content preceding the candidate; `afterText` the content
 * following it. The first trigger found (scanning from the candidate outward,
 * bounded by `window`) classifies the candidate.
 *
 * Deterministic: trigger-table order decides ties; window is a fixed constant.
 */
export function classifyByContext(input: {
  text: string;
  start: number;
  end: number;
  content: string;
  window?: number;
}): { entityType: EntityType; extractionMethod: 'CONTEXTUAL_RULE' } | undefined {
  if (isContextStopword(input.text)) return undefined;

  const window = input.window ?? 8;
  const before = input.content.slice(Math.max(0, input.start - window), input.start);
  const after = input.content.slice(input.end, input.end + window);
  const probe = `${before}∥${after}`.toLowerCase();

  for (const rule of CONTEXTUAL_RULES) {
    for (const trigger of rule.triggers) {
      if (probe.includes(trigger.toLowerCase())) {
        return { entityType: rule.entityType, extractionMethod: 'CONTEXTUAL_RULE' };
      }
    }
  }
  return undefined;
}
