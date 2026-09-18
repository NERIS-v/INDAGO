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
// Classifications are made ONLY by explicit, word-boundary-aware category
// labels present within a bounded window adjacent to the candidate. Generic
// prepositions and common nouns ("at ", "in ", "near ") are NOT triggers on
// their own — a mere coincidence of a generic word nearby never classifies a
// candidate. Each trigger must name the category itself.
// ============================================================================

import type { EntityType } from '@indago/contracts';

export interface ContextualRule {
  readonly entityType: EntityType;
  /** Explicit category-label phrases that, adjacent to the candidate, type it. */
  readonly triggers: readonly string[];
}

/**
 * Contextual trigger table. Each entry maps a category to explicit leading
 * labels that name the category of a following/adjacent proper noun
 * ("located at X", "caller X", "company named Y"). Only phrases that name the
 * category count — generic prepositions like "at"/"in"/"near" are excluded so
 * that "met John at noon" cannot make John a LOCATION.
 */
export const CONTEXTUAL_RULES: readonly ContextualRule[] = [
  {
    entityType: 'PERSON',
    triggers: [
      'mr', 'mrs', 'ms', 'dr', 'prof', 'sri', 'smt', 'shri',
      'surname', 'alias', 'identified as', 'named', 'known as',
      'contact', 'caller', 'callee', 'interviewee',
      'involving', 'records',
    ],
  },
  {
    entityType: 'ORGANIZATION',
    triggers: [
      'organisation named', 'organization named', 'company named',
      'corporation called', 'agency called', 'institution called',
    ],
  },
  {
    entityType: 'LOCATION',
    triggers: [
      'located at', 'located in', 'situated at', 'address of', 'address ',
      'city of', 'near the', 'premises of', 'residence of', 'residence at',
      'lives in', 'resides in', 'based in', 'travelled to', 'traveled to',
      'moved to', 'headed to', 'branch at', 'office at',
    ],
  },
  {
    entityType: 'DEVICE',
    triggers: ['device', 'handset', 'instrument', 'imei of'],
  },
  {
    entityType: 'VEHICLE',
    triggers: ['vehicle', 'car', 'bike', 'registration', 'plate', 'number plate'],
  },
];

// Stopword guard — never classify generic words via berthed context.
const CONTEXT_STOPWORDS = new Set([
  'that', 'this', 'these', 'those', 'with', 'from', 'into', 'when', 'after',
  'before', 'using', 'based', 'per', 'and', 'the', 'a', 'an', 'who', 'which',
  'what', 'where', 'here', 'there',
  // Pronouns/determiners: a capitalized pronoun is never an entity mention.
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'hers', 'it', 'its', 'they', 'them', 'their', 'theirs',
]);

/**
 * Person-indicating verbs checked in the SHORT WINDOW AFTER a candidate. A
 * category label ("Contact X") sits before its noun; a subject-verb instead
 * follows its subject ("Neha Kapoor communicated", "Rohan Singh coordinates").
 * The list is deliberately tiny and high-precision — generic verbs such as
 * "met"/"was"/"is" are excluded so weak capitalization never becomes a PERSON.
 */
const PERSON_AFTER_TRIGGERS: readonly string[] = [
  'stating', 'appears', 'appeared', 'communicated', 'coordinates',
  'coordinated', 'paid', 'pays', 'spoke', 'resides', 'lives',
];

export function isContextStopword(token: string): boolean {
  return CONTEXT_STOPWORDS.has(token.toLowerCase());
}

/** Escape regex metacharacters in a trigger phrase. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary-aware presence test. The phrase must appear as a whole word
 * (or phrase), never as a bare substring of a longer word — so "dr" matches
 * "Dr Smith" but not "Drsth", and "at" never matches inside "located at".
 * Boundary tokens are handled explicitly so window slices that begin or end
 * mid-sentence still behave deterministically.
 */
function hasPhrase(text: string, phrase: string): boolean {
  const escaped = escapeRegExp(phrase.trim());
  if (escaped.length === 0) return false;
  return new RegExp(
    `(?:^|[^A-Za-z0-9_])${escaped}(?=[^A-Za-z0-9_]|$)`,
    'i',
  ).test(text);
}

/**
 * Contextual lookup with a bounded leading-window scan.
 *
 * `beforeText` is the content immediately preceding the candidate. A category
 * label names the noun that FOLLOWS it ("located at Solaris Tower", "the
 * caller Ravi"), so only the BEFORE window is scanned — a label that appears
 * AFTER the candidate belongs to a different noun and must not classify it.
 * The first trigger found (scanning the bounded window) classifies the
 * candidate. Only explicit category-naming phrases (word-boundary aware) fire —
 * a generic word elsewhere in the window never classifies.
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

  const window = input.window ?? 24;
  const before = input.content.slice(Math.max(0, input.start - window), input.start);

  for (const rule of CONTEXTUAL_RULES) {
    for (const trigger of rule.triggers) {
      if (hasPhrase(before, trigger)) {
        return { entityType: rule.entityType, extractionMethod: 'CONTEXTUAL_RULE' };
      }
    }
  }

  // Person after-window: a curated subject-taking verb unambiguously marks the
  // preceding capitalized token as an actor. Conservative by construction —
  // only the fixed PERSON_AFTER_TRIGGERS list fires, and organizations are
  // already typed by PATTERN_MATCH (which takes precedence).
  const after = input.content.slice(
    Math.min(input.content.length, input.end),
    Math.min(input.content.length, input.end + window),
  );
  for (const trigger of PERSON_AFTER_TRIGGERS) {
    if (hasPhrase(after, trigger)) {
      return { entityType: 'PERSON', extractionMethod: 'CONTEXTUAL_RULE' };
    }
  }

  return undefined;
}
