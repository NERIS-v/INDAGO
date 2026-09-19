// ============================================================================
// M-A07 Entity Mention Candidate — extraction engine
//
// A PURE, deterministic engine that turns an Observation into entity-like
// mention drafts. It is infrastructure-free:
//   - NO network, NO storage, NO random, NO LLM, NO clock, NO ML
//   - input (Observation) → output (EntityMentionDraft[]), deterministic
//
// Locked pipeline (first match wins, document order guaranteed):
//   1. PATTERN_MATCH      — high-precision lexical shapes
//   2. GAZETTEER_MATCH    — injected data lookup
//   3. CONTEXTUAL_RULE    — nearby category-label context
//   4. HEURISTIC_FALLBACK — untyped capitalized tokens (explicit uncertainty)
//
// M-A07 boundary (enforced):
//   - extracts mentions only; NEVER creates canonical Entity records
//   - NEVER assigns EntityId / ResolutionScore
//   - NEVER merges candidates across observations
//   - identical Observation MUST produce identical output
// ============================================================================

import type {
  EntityType,
  ExtractionMethod,
  Observation,
  Provenance,
} from '@indago/contracts';
import { EntityMentionCandidateSchema } from '@indago/contracts';
import {
  CAPITALIZED_NAME_RE,
  matchTypedPatterns,
} from './pattern-rules.js';
import { classifyByContext } from './contextual-rules.js';
import { isPlausibleEntityToken } from './heuristic-fallback.js';
import {
  createGazetteer,
  type Gazetteer,
  type GazetteerEntry,
} from './gazetteer.js';
import { deterministicEntityMentionId } from './entity-mention-id.js';
import {
  ENTITY_MENTION_BOUNDS,
  type EntityMentionDraft,
  type EntityMentionExtractionResult,
} from './types.js';

export interface EntityMentionExtractorConfig {
  /**
   * Gazetteer data. INJECTED — the engine never hardcodes entries. When not
   * provided, the empty gazetteer is used (no gazetteer classifications).
   */
  readonly gazetteerEntries?: readonly GazetteerEntry[];
}

interface Span {
  text: string;
  start: number;
  end: number;
  entityType?: EntityType;
  extractionMethod: ExtractionMethod;
}

/**
 * Deterministic transcription of a mention's surface text for matching. The
 * canonical match value is distinct from the surface text: it is used for
 * later matching, never to rewrite the source-faithful mention.
 */
function canonicalMatchValueOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cull overlapping/duplicate spans deterministically. First-occurrence wins,
 * ties by earlier start; identical (start, end, type) collapse naturally.
 * Only the first 100 drafts are kept (bounded output).
 *
 * PATTERN_MATCH is the highest-precision stage and is emitted before the
 * guessed stages: when a pattern span and a capitalized/contextual span
 * overlap (e.g. "Meridian Trading LLP" vs a shorter "Meridian Trading" guess),
 * the typed pattern span wins so a precise classification is never displaced
 * by a weaker one. Output is returned in document order.
 */
function dedupeAndBound(spans: Span[]): Span[] {
  const byStart = (a: Span, b: Span): number => a.start - b.start || a.end - b.end;
  const pattern = spans.filter((s) => s.extractionMethod === 'PATTERN_MATCH').sort(byStart);
  const guessed = spans.filter((s) => s.extractionMethod !== 'PATTERN_MATCH').sort(byStart);

  const out: Span[] = [];
  const overlaps = (s: Span): boolean =>
    out.some((kept) => s.start < kept.end && kept.start < s.end);

  for (const s of pattern) {
    if (out.length >= ENTITY_MENTION_BOUNDS.maxMentions) break;
    if (overlaps(s)) continue;
    out.push(s);
  }
  for (const s of guessed) {
    if (out.length >= ENTITY_MENTION_BOUNDS.maxMentions) break;
    if (overlaps(s)) continue;
    out.push(s);
  }

  return out.sort(byStart);
}

/**
 * Extract entity-like mention drafts from one Observation.
 *
 * Deterministic: the same Observation yields the same drafts with the same
 * offsets, types, methods, and canonical match values. Provenance is inherited
 * verbatim from the Observation (a mention is a span of that same source
 * content — nothing is fabricated).
 */
export async function extractEntityMentions(
  observation: Observation,
  config: EntityMentionExtractorConfig = {},
): Promise<EntityMentionExtractionResult> {
  const gazetteer: Gazetteer = createGazetteer(config.gazetteerEntries ?? []);
  const content = observation.content;
  const spans: Span[] = [];

  // ---- 1. PATTERN_MATCH — high-precision lexical shapes.
  for (const m of matchTypedPatterns(content)) {
    spans.push({
      text: m.text,
      start: m.start,
      end: m.end,
      entityType: m.entityType,
      extractionMethod: 'PATTERN_MATCH',
    });
  }

  // ---- 2. GAZETTEER_MATCH — injected phrase pass over the WHOLE content.
  // A phrase search (not the capitalized-run tokenizer) types multi-name
  // run-ons at their true spans ("Neha Kapoor Rohan Singh" → "Neha Kapoor" +
  // "Rohan Singh") and matches single-token entries identically. PATTERN spans
  // still win via dedupe priority when a gazetteer hit overlaps a typed
  // pattern span.
  for (const m of gazetteer.matchAll(content)) {
    spans.push({
      text: m.text,
      start: m.start,
      end: m.end,
      entityType: m.entityType,
      extractionMethod: 'GAZETTEER_MATCH',
    });
  }

  // ---- 3/4. CONTEXTUAL → HEURISTIC over capitalized tokens not yet covered.
  CAPITALIZED_NAME_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = CAPITALIZED_NAME_RE.exec(content)) !== null) {
    const token = cm[0];
    const start = cm.index;
    const end = start + token.length;

    // Contextual stage: nearby category-label context.
    const ctx = classifyByContext({ text: token, start, end, content });
    if (ctx !== undefined) {
      spans.push({
        text: token,
        start,
        end,
        entityType: ctx.entityType,
        extractionMethod: ctx.extractionMethod,
      });
      continue;
    }

    // Heuristic fallback: untyped capitalized token (explicit uncertainty).
    if (isPlausibleEntityToken(token)) {
      spans.push({
        text: token,
        start,
        end,
        extractionMethod: 'HEURISTIC_FALLBACK',
        // entityType deliberately undefined.
      });
    }
  }

  const drafts: EntityMentionDraft[] = dedupeAndBound(spans).map((s) => ({
    observationId: observation.id,
    text: s.text,
    start: s.start,
    end: s.end,
    ...(s.entityType !== undefined ? { entityType: s.entityType } : {}),
    extractionMethod: s.extractionMethod,
    canonicalMatchValue: canonicalMatchValueOf(s.text),
    provenance: observation.provenance,
  }));

  return { drafts };
}

// ============================================================================
// Finalizer
//
// Pure, but requires clock-resolved timestamps from the caller: the extractor
// stays deterministic (no clock); the worker supplies observed times at
// persistence. Produces a fully schema-valid EntityMentionCandidate with a
// deterministic id. Mirrors M-A06 finalizeObservation.
// ============================================================================

export interface EntityMentionFinalizeInput {
  readonly draft: EntityMentionDraft;
  readonly nowIso: string;
}

export async function finalizeEntityMention(
  input: EntityMentionFinalizeInput,
): Promise<typeof EntityMentionCandidateSchema._type> {
  const { draft, nowIso } = input;
  const id = await deterministicEntityMentionId({
    observationId: draft.observationId,
    start: draft.start,
    end: draft.end,
    entityType: draft.entityType,
    canonicalMatchValue: draft.canonicalMatchValue,
  });

  return EntityMentionCandidateSchema.parse({
    id,
    observationId: draft.observationId,
    text: draft.text,
    start: draft.start,
    end: draft.end,
    ...(draft.entityType !== undefined ? { entityType: draft.entityType } : {}),
    extractionMethod: draft.extractionMethod,
    ...(draft.canonicalMatchValue !== undefined
      ? { canonicalMatchValue: draft.canonicalMatchValue }
      : {}),
    provenance: draft.provenance,
    createdAt: { value: nowIso, precision: 'exact' },
    updatedAt: { value: nowIso, precision: 'exact' },
  });
}

/**
 * Version constant surfaced for operators to verify which identity derivation
 * is in effect (survives schema changes without silent id drift).
 */
export const ENTITY_MENTION_IDENTITY_DERIVATION = {
  namespace: 'indago:entity-mention-candidate',
  version: 1,
} as const;

export type { Gazetteer, GazetteerEntry, Provenance };
