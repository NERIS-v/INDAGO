// ============================================================================
// DOCX Parser
//
// Extracts structured content from DOCX using mammoth.
// Uses block-level provenance only — no fabricated character/byte offsets.
// M-PR3 constraint: DO NOT INVENT PROVENANCE.
// Mammoth converts DOCX to HTML paragraphs/tables. We extract structure
// and assign blockIndex/tableIndex/rowIndex/cellIndex as provenance.
// When provenance is unavailable, emit SOURCE_LOCATION_UNAVAILABLE warning.
// ============================================================================

import mammoth from 'mammoth';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';
import type {
  DocxSection,
  DocxTableRow,
  DocxTableCell,
} from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'docx-parser',
  parserVersion: '1.0.0',
  displayName: 'DOCX Parser',
  supportedFormats: ['DOCX'],
  supportedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  supportedFamilies: ['DOCUMENT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

/**
 * Parse HTML returned by mammoth into DOCX sections with block-level provenance.
 *
 * Mammoth returns simplified HTML — paragraphs as <p> or <h1>-<h6>,
 * tables as <table> with <tr>/<td>.
 *
 * We assign blockIndex to each top-level element sequentially.
 * No fabricated charStart/charEnd offsets.
 */
function parseMammothHtml(html: string): DocxSection[] {
  const sections: DocxSection[] = [];
  let blockIndex = 0;
  let tableIndex = 0;

  // Split by block-level tags
  const blockRegex = /<(p|h[1-6]|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  const matches = html.match(blockRegex) ?? [];

  for (const match of matches) {
    const tagMatch = match.match(/^<(p|h[1-6]|table)/i);
    if (!tagMatch || !tagMatch[1]) continue;
    const tag = tagMatch[1].toLowerCase();

    if (tag === 'table') {
      const rows: DocxTableRow[] = [];
      const rowRegex = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
      const rowMatches = match.match(rowRegex) ?? [];
      let rowIndex = 0;

      for (const rowMatch of rowMatches) {
        const cellRegex = /<td(?:\s[^>]*)?>[\s\S]*?<\/td>/gi;
        const cellMatches = rowMatch.match(cellRegex) ?? [];
        const cells: DocxTableCell[] = [];

        for (const cellMatch of cellMatches) {
          // Strip HTML tags from cell content
          const text = cellMatch
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();

          cells.push({ text });
        }

        rows.push({ cells });
        rowIndex++;
      }

      sections.push({
        type: 'table',
        rows,
        sourceLocation: {
          kind: 'docx-table',
          blockIndex,
          tableIndex,
        },
      });
      blockIndex++;
      tableIndex++;
    } else {
      // Paragraph or heading
      const text = match
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      if (tag.startsWith('h') && tag.length === 2) {
        const level = parseInt(tag[1]!, 10);
        sections.push({
          type: 'heading',
          level,
          text,
          sourceLocation: {
            kind: 'docx-block',
            blockIndex,
          },
        });
      } else {
        sections.push({
          type: 'paragraph',
          text,
          sourceLocation: {
            kind: 'docx-block',
            blockIndex,
          },
        });
      }
      blockIndex++;
    }
  }

  return sections;
}

export function createDocxParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'DOCX';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'DOCX',
            extractionMethod: 'structured',
            extractedAt: new Date().toISOString(),
            sections: [],
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const warnings: import('../../extraction/types.js').ExtractionWarning[] = [];

      let result: { value: string; messages: unknown[] };
      try {
        result = await mammoth.extractRawText({ buffer: Buffer.from(input) });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to extract DOCX';
        return {
          ok: false,
          error: {
            category: 'MALFORMED_ARTIFACT',
            code: 'INVALID_DOCX',
            message: `Failed to extract DOCX: ${message}`,
            sourceId: context.artifactId,
            details: { parserId: CAPABILITY.parserId, parserVersion: CAPABILITY.parserVersion },
            retryable: false,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // mammoth text extraction loses structure — we need HTML for sections
      let htmlResult: { value: string; messages: unknown[] };
      try {
        htmlResult = await mammoth.convertToHtml({ buffer: Buffer.from(input) });
      } catch {
        // Fallback: use text-only extraction
        const text = result.value;
        if (!text.trim()) {
          return {
            ok: true,
            extraction: {
              artifactId: context.artifactId,
              parserId: CAPABILITY.parserId,
              parserVersion: CAPABILITY.parserVersion,
              format: 'DOCX',
              extractionMethod: 'structured',
              extractedAt: new Date().toISOString(),
              sections: [],
              warnings: [
                { code: 'EMPTY_CONTENT', message: 'DOCX content is empty' },
              ],
            },
          };
        }

        const paragraphs = text.split(/\n+/).filter((p) => p.trim());
        const sections: DocxSection[] = paragraphs.map((para, i) => ({
          type: 'paragraph' as const,
          text: para.trim(),
          sourceLocation: {
            kind: 'docx-block' as const,
            blockIndex: i,
          },
        }));

        warnings.push({
          code: 'SOURCE_LOCATION_UNAVAILABLE',
          message: 'HTML conversion failed; using text-only extraction with basic provenance',
        });

        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'DOCX',
            extractionMethod: 'structured',
            extractedAt: new Date().toISOString(),
            sections,
            warnings,
          },
        };
      }

      let sections = parseMammothHtml(htmlResult.value);

      if (sections.length === 0 && result.value.trim()) {
        // HTML was empty but text was not — use text fallback
        const text = result.value;
        const paragraphs = text.split(/\n+/).filter((p) => p.trim());
        sections = paragraphs.map((para, i) => ({
          type: 'paragraph' as const,
          text: para.trim(),
          sourceLocation: {
            kind: 'docx-block' as const,
            blockIndex: i,
          },
        }));
      }

      if (sections.length === 0) {
        warnings.push({ code: 'EMPTY_CONTENT', message: 'DOCX content is empty' });
      }

      return {
        ok: true,
        extraction: {
          artifactId: context.artifactId,
          parserId: CAPABILITY.parserId,
          parserVersion: CAPABILITY.parserVersion,
          format: 'DOCX',
          extractionMethod: 'structured',
          extractedAt: new Date().toISOString(),
          sections,
          warnings,
        },
      };
    },
  };
}
