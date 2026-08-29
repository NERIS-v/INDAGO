// ============================================================================
// Built-in Parser Factory
//
// Creates a ParserRegistry pre-populated with the M-PR3 real parsers.
// Each parser implements canParse() + parse() and produces a structured
// RawExtraction with provenance. XLSX remains a declared-capability stub
// (known M-PR3 gap).
// ============================================================================

import { ParserRegistry } from '../parser-registry.js';
import { createPdfParser } from './pdf-parser.js';
import { createDocxParser } from './docx-parser.js';
import { createXlsxParser } from './xlsx-parser.js';
import { createCsvParser } from './csv-parser.js';
import { createTxtParser } from './txt-parser.js';
import { createJsonParser } from './json-parser.js';
import { createXmlParser } from './xml-parser.js';
import { createImageParser } from './image-parser.js';

/**
 * Create a ParserRegistry pre-populated with all M-PR3 real parsers.
 *
 * Usage:
 * ```ts
 * const registry = createDefaultParserRegistry();
 * const result = selectParser(classification, registry);
 * ```
 */
export function createDefaultParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();

  const parsers = [
    createPdfParser(),
    createDocxParser(),
    createXlsxParser(),
    createCsvParser(),
    createTxtParser(),
    createJsonParser(),
    createXmlParser(),
    createImageParser(),
  ];

  for (const parser of parsers) {
    registry.register(parser);
  }

  return registry;
}
