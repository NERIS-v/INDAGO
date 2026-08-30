// ============================================================================
// M-A06 Observation Extraction
//
// A PURE, deterministic engine that turns extracted + normalized material
// into observation drafts. It is infrastructure-free:
//   - NO network, NO storage, NO random, NO LLM, NO clock
//   - input → output only
//
// Output contract: `ObservationExtractionResult` with
//   - observations: ASSEMBLED drafts (all semantic fields except timestamps,
//     which are stamped by the orchestrating worker at persistence time)
//   - warnings: deterministic structured warnings for unsupported constructs
//
// Determinism: identical (RawExtraction, evidenceId, sourceId) MUST yield
// identical observations with identical ids. order is deterministic (sort by
// type, location key, content). No silencing — unsupported material yields a
// structured warning, not a silent fallback.
//
// Provenance: every observation carries ProvenanceSchema with the exact source
// location the extraction used. Nothing is fabricated; OCR confidence is never
// converted into strength.
// ============================================================================

import type {
  EventTime,
  NormalizedExtraction,
  Observation,
  ObservationType,
  Provenance,
} from '@indago/contracts';
import { ObservationSchema } from '@indago/contracts';
import type { RawExtraction } from '../extraction/types.js';
import {
  OBSERVATION_BOUNDS,
  NARRATIVE_STRENGTH_BASELINE,
  RECONSTRUCTED_STRENGTH_BASELINE,
  STRUCTURED_STRENGTH_BASELINE,
  OBSERVATION_EXTRACTOR_REF,
  Y_TOLERANCE,
  canonicalizeContent,
  composeStructuredRow,
  detectObservedAt,
  extractCandidateMentions,
  inferObservationType,
  inferStructuredRelation,
  isAssertiveContent,
  isMeaningfulLeafPath,
  mergeSameLineSpans,
  type MergeableSpan,
} from './observation-rules.js';
import {
  OBSERVATION_IDENTITY_VERSION,
  deterministicObservationId,
  serializeSourceLocation,
  type LocationStructureKind,
} from './observation-id.js';

export interface ObservationDraft {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly artifactId: string;
  readonly type: ObservationType;
  readonly content: string;
  /** Canonical serialized source location — the exact identity component */
  readonly locationKey: string;
  readonly candidateMentions: readonly string[];
  readonly strength: number;
  readonly provenance: Provenance;
  readonly observedAt?: EventTime;
}

export type ObservationExtractorWarningCode =
  | 'UNSUPPORTED_FORMAT'
  | 'NO_ASSERTIVE_UNITS'
  | 'CANDIDATE_CAP_REACHED';

export interface ObservationExtractionWarning {
  readonly code: ObservationExtractorWarningCode;
  readonly message: string;
}

export interface ObservationExtractionResult {
  readonly observations: readonly ObservationDraft[];
  readonly warnings: readonly ObservationExtractionWarning[];
}

export interface ObservationExtractorInput {
  readonly raw: RawExtraction;
  readonly normalized: NormalizedExtraction;
  readonly evidenceId: string;
  readonly sourceId: string;
}

function extractionMethodOf(raw: RawExtraction): string {
  return ('extractionMethod' in raw ? raw.extractionMethod : 'unknown') as string;
}

interface Candidate {
  readonly kind: LocationStructureKind;
  readonly locationRef: Parameters<typeof serializeSourceLocation>[1];
  readonly content: string;
  readonly typeHint?: { readonly relation?: 'communication' | 'financial' | 'spatial_locality' | null };
  readonly reconstruction?: boolean;
}

function strengthOf(candidate: Candidate): number {
  if (candidate.kind === 'row' && !candidate.reconstruction) {
    return STRUCTURED_STRENGTH_BASELINE;
  }
  if (candidate.reconstruction) {
    return RECONSTRUCTED_STRENGTH_BASELINE;
  }
  return NARRATIVE_STRENGTH_BASELINE;
}

// ============================================================================
// Per-format candidates
// ============================================================================

function txtCandidates(extraction: Extract<RawExtraction, { readonly format: 'TXT' }>): Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of extraction.lines) {
    const content = canonicalizeContent(line.text, OBSERVATION_BOUNDS.maxContentLength);
    if (!isAssertiveContent(content)) continue;
    candidates.push({
      kind: 'line',
      locationRef: {
        line: line.sourceLocation.lineNumber,
        charStart: line.sourceLocation.charStart,
        charEnd: line.sourceLocation.charEnd,
      },
      content,
    });
  }
  return candidates;
}

function csvCandidates(extraction: Extract<RawExtraction, { readonly format: 'CSV' }>): Candidate[] {
  const headers = extraction.headers;
  const candidates: Candidate[] = [];
  for (const record of extraction.records) {
    const values = record.cells.map((c) => c.rawValue);
    const relation = inferStructuredRelation(record.cells);
    const composed = composeStructuredRow(relation, headers, values);
    if (!isAssertiveContent(composed)) continue;
    candidates.push({
      kind: 'row',
      locationRef: { row: record.rowNumber },
      content: composed,
      typeHint: { relation: relation ?? null },
    });
  }
  return candidates;
}

function docxCandidates(extraction: Extract<RawExtraction, { readonly format: 'DOCX' }>): Candidate[] {
  const candidates: Candidate[] = [];
  for (const section of extraction.sections) {
    if (section.type === 'table') {
      const headers = section.rows[0]?.cells.map((c) => c.text) ?? [];
      for (const [rowIndex, row] of section.rows.slice(1).entries()) {
        const values = row.cells.map((c) => c.text);
        const relation = inferStructuredRelation(
          headers.map((h, i) => ({ columnName: h, rawValue: values[i] ?? '' })),
        );
        const composed = composeStructuredRow(relation, headers, values);
        if (!isAssertiveContent(composed)) continue;
        candidates.push({
          kind: 'row',
          locationRef: {
            table: section.sourceLocation.tableIndex ?? undefined,
            row: rowIndex + 1,
          },
          content: composed,
          typeHint: { relation: relation ?? null },
        });
      }
      continue;
    }
    const content = canonicalizeContent(section.text, OBSERVATION_BOUNDS.maxContentLength);
    if (!isAssertiveContent(content)) continue;
    candidates.push({
      kind: 'line',
      locationRef: { block: section.sourceLocation.blockIndex },
      content,
      typeHint: section.type === 'heading' ? { relation: null } : undefined,
    });
  }
  return candidates;
}

function pdfCandidates(extraction: Extract<RawExtraction, { readonly format: 'PDF' }>): Candidate[] {
  const candidates: Candidate[] = [];
  const maxLength = OBSERVATION_BOUNDS.maxContentLength;

  for (const page of extraction.pages) {
    // Consecutive spans that carry native geometry + offsets are merged into
    // visual-line units; spans without geometry stay isolated candidates.
    const gathers: { spans: MergeableSpan[]; flush: () => void } = {
      spans: [],
      flush: () => {
        if (gathers.spans.length === 0) return;
        for (const unit of mergeSameLineSpans(gathers.spans, Y_TOLERANCE)) {
          const content = canonicalizeContent(unit.text, maxLength);
          if (!isAssertiveContent(content)) continue;
          candidates.push({
            kind: 'line',
            locationRef: {
              page: page.pageNumber,
              charStart: unit.start,
              charEnd: unit.end,
            },
            content,
          });
        }
        gathers.spans = [];
      },
    };

    for (const span of page.spans) {
      const boundingBox = span.sourceLocation.boundingBox;
      const offsets = span.sourceLocation.pageTextOffset;
      if (boundingBox !== undefined && offsets !== undefined) {
        gathers.spans.push({
          text: span.text,
          y: boundingBox.y,
          h: boundingBox.h,
          start: offsets.start,
          end: offsets.end,
        });
        continue;
      }
      gathers.flush();
      const content = canonicalizeContent(span.text, maxLength);
      if (!isAssertiveContent(content)) continue;
      candidates.push({
        kind: 'line',
        locationRef: {
          page: page.pageNumber,
          charStart: offsets?.start,
          charEnd: offsets?.end,
        },
        content,
      });
    }
    gathers.flush();
  }
  return candidates;
}

function jsonCandidates(extraction: Extract<RawExtraction, { readonly format: 'JSON' }>): Candidate[] {
  const candidates: Candidate[] = [];
  const walk = (value: unknown, path: string): void => {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'string' || typeof value === 'number') {
      const content = canonicalizeContent(String(value), OBSERVATION_BOUNDS.maxContentLength);
      if (!isMeaningfulLeafPath(path, content)) return;
      candidates.push({
        kind: 'path',
        locationRef: { path },
        content,
        reconstruction: true,
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      walk(v, path === '' ? k : `${path}.${k}`);
    }
  };
  walk(extraction.data, '');
  return candidates;
}

function xmlCandidates(extraction: Extract<RawExtraction, { readonly format: 'XML' }>): Candidate[] {
  const candidates: Candidate[] = [];
  const pathName = (name: string, key: string) => `${key}.${name}`;
  const walk = (node: { name: string; children: ReadonlyArray<unknown> }, path: string): void => {
    for (const child of node.children) {
      if (typeof child === 'string') {
        const content = canonicalizeContent(child.trim(), OBSERVATION_BOUNDS.maxContentLength);
        if (!isMeaningfulLeafPath(path, content)) continue;
        candidates.push({
          kind: 'path',
          locationRef: { path },
          content,
          reconstruction: true,
        });
        continue;
      }
      walk(child as { name: string; children: ReadonlyArray<unknown> }, pathName((child as { name: string }).name, path));
    }
  };
  walk(extraction.root, pathName(extraction.root.name, 'xml'));
  return candidates;
}

function imageCandidates(
  extraction: Extract<RawExtraction, { readonly format: 'IMAGE' }>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const maxLength = OBSERVATION_BOUNDS.maxContentLength;

  // OCR lines carry bounding boxes — group spans that share a visual baseline
  // into one source-faithful candidate (missing geometry falls back to the
  // raw line split below).
  if (extraction.ocrLines !== undefined && extraction.ocrLines.length > 0) {
    let offset = 0;
    const spans: MergeableSpan[] = extraction.ocrLines.map((l) => {
      const start = offset;
      const end = offset + l.text.length;
      offset = end;
      return {
        text: l.text,
        y: l.bbox.y0,
        h: l.bbox.y1 - l.bbox.y0,
        start,
        end,
      };
    });
    mergeSameLineSpans(spans, Y_TOLERANCE).forEach((unit, index) => {
      const content = canonicalizeContent(unit.text, maxLength);
      if (!isAssertiveContent(content)) return;
      candidates.push({
        kind: 'line',
        locationRef: { line: index + 1 },
        content,
      });
    });
    return candidates;
  }

  (extraction.text?.split('\n') ?? []).forEach((lineText, index) => {
    const content = canonicalizeContent(lineText, maxLength);
    if (!isAssertiveContent(content)) return;
    candidates.push({
      kind: 'line',
      locationRef: { line: index + 1 },
      content,
    });
  });
  return candidates;
}

function collectCandidates(raw: RawExtraction): Candidate[] {
  switch (raw.format) {
    case 'TXT':
      return txtCandidates(raw);
    case 'CSV':
      return csvCandidates(raw);
    case 'DOCX':
      return docxCandidates(raw);
    case 'PDF':
      return pdfCandidates(raw);
    case 'JSON':
      return jsonCandidates(raw);
    case 'XML':
      return xmlCandidates(raw);
    case 'IMAGE':
      return imageCandidates(raw);
    default:
      return [];
  }
}

// ============================================================================
// Assembly
// ============================================================================

function buildProvenance(candidate: Candidate, input: ObservationExtractorInput): Provenance {
  const ref = candidate.locationRef;
  const provenance: Provenance = {
    sourceId: input.sourceId,
    artifactId: input.raw.artifactId,
    extractor: OBSERVATION_EXTRACTOR_REF,
    extractionMethod: extractionMethodOf(input.raw),
  };
  if (ref.page !== undefined) provenance.pageRef = `page ${ref.page}`;
  if (ref.row !== undefined) provenance.rowRef = `row ${ref.row}`;
  if (ref.path !== undefined) provenance.documentRef = ref.path;
  if (ref.charStart !== undefined && ref.charEnd !== undefined) {
    provenance.spanRef = `span ${ref.charStart}-${ref.charEnd}`;
  } else if (ref.line !== undefined) {
    provenance.spanRef = `line ${ref.line}`;
  } else if (ref.block !== undefined) {
    provenance.documentRef = `block ${ref.block}`;
  }
  return provenance;
}

async function assemble(
  candidate: Candidate,
  input: ObservationExtractorInput,
): Promise<ObservationDraft | undefined> {
  const type = inferObservationType(candidate.content, candidate.typeHint);
  const locationKey = serializeSourceLocation(candidate.kind, candidate.locationRef);
  const candidateMentions = extractCandidateMentions(candidate.content);
  const observedAt = detectObservedAt(candidate.content);

  return {
    evidenceId: input.evidenceId,
    sourceId: input.sourceId,
    artifactId: input.raw.artifactId,
    type,
    content: candidate.content,
    locationKey,
    candidateMentions,
    strength: strengthOf(candidate),
    provenance: buildProvenance(candidate, input),
    ...(observedAt ? { observedAt } : {}),
  };
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Extract observation drafts from raw + normalized material.
 * Deterministic: same inputs → identical observations and ids.
 * attemptId is deliberately NOT part of the identity.
 */
export async function extractObservations(
  input: ObservationExtractorInput,
): Promise<ObservationExtractionResult> {
  const candidates = collectCandidates(input.raw);
  const warnings: ObservationExtractionWarning[] = [];

  if (candidates.length === 0) {
    const unsupported =
      input.raw.format === 'IMAGE' && input.raw.extractionMethod === 'unsupported';
    warnings.push({
      code: unsupported ? 'UNSUPPORTED_FORMAT' : 'NO_ASSERTIVE_UNITS',
      message: unsupported
        ? `OCR unsupported for image artifact ${input.raw.artifactId}; no observations extracted.`
        : `No assertive source units found for artifact ${input.raw.artifactId}; no observations extracted.`,
    });
  }

  const drafts: ObservationDraft[] = [];
  for (const candidate of candidates) {
    if (drafts.length >= OBSERVATION_BOUNDS.maxObservations) {
      warnings.push({
        code: 'CANDIDATE_CAP_REACHED',
        message: `Observation candidate cap (${OBSERVATION_BOUNDS.maxObservations}) reached; remaining units skipped.`,
      });
      break;
    }
    const draft = await assemble(candidate, input);
    if (draft) drafts.push(draft);
  }

  drafts.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.provenance.rowRef?.localeCompare(b.provenance.rowRef ?? '') ||
      a.content.localeCompare(b.content),
  );

  return { observations: drafts, warnings };
}

// ============================================================================
// Finalizer
//
// Pure, but requires clock-resolved timestamps from the caller: the extractor
// stays deterministic (no clock), the worker supplies observed times at
// persistence. Produces a fully schema-valid Observation.
// ============================================================================

export interface ObservationFinalizeInput {
  readonly draft: ObservationDraft;
  readonly nowIso: string;
}

export async function finalizeObservation(input: ObservationFinalizeInput): Promise<Observation> {
  const { draft, nowIso } = input;
  const identity = await deterministicObservationId({
    evidenceId: draft.evidenceId,
    sourceId: draft.sourceId,
    locationKey: draft.locationKey,
    type: draft.type,
    canonicalContent: draft.content,
  });

  return ObservationSchema.parse({
    id: identity,
    evidenceId: draft.evidenceId,
    sourceId: draft.sourceId,
    type: draft.type,
    content: draft.content,
    entityIds: [],
    candidateMentions: draft.candidateMentions,
    strength: draft.strength,
    provenance: draft.provenance,
    ...(draft.observedAt ? { observedAt: draft.observedAt } : {}),
    createdAt: { value: nowIso, precision: 'exact' },
    updatedAt: { value: nowIso, precision: 'exact' },
  });
}

/**
 * Version constant surfaced for operators to verify which identity derivation
 * is in effect (survives schema changes without silent id drift).
 */
export const OBSERVATION_IDENTITY_DERIVATION = {
  namespace: 'indago:observation',
  version: OBSERVATION_IDENTITY_VERSION,
} as const;