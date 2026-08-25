// ============================================================================
// Built-in Parser Factory
//
// Creates a ParserRegistry pre-populated with M-PR2 stub parsers.
// Each stub declares capability and implements canParse().
// parse() throws "not implemented" — M-PR3 implements extraction.
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
 * Create a ParserRegistry pre-populated with all M-PR2 stub parsers.
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
