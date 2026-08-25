// ============================================================================
// XML Parser
//
// Extracts structured XML using fast-xml-parser.
// Produces a tree of XmlNode with attributes and children.
// Invalid XML produces a structured MALFORMED_ARTIFACT error.
// Deterministic: same bytes = same parsed tree.
// ============================================================================

import { XMLParser } from 'fast-xml-parser';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';
import type { XmlNode } from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'xml-parser',
  parserVersion: '1.0.0',
  displayName: 'XML Parser',
  supportedFormats: ['XML'],
  supportedMimeTypes: ['application/xml', 'text/xml', 'application/xhtml+xml'],
  supportedFamilies: ['STRUCTURED_DATA', 'DOCUMENT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

function convertNode(obj: unknown): XmlNode | string {
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object' || obj === null) return String(obj);

  const record = obj as Record<string, unknown>;
  const name = (record[':name'] as string) ?? 'unknown';
  const attributes: Record<string, string> = {};

  if (record[':@'] && typeof record[':@'] === 'object') {
    const attrObj = record[':@'] as Record<string, string>;
    for (const [key, value] of Object.entries(attrObj)) {
      // fast-xml-parser stores attrs as "@attr" or "attr@attr"
      const cleanKey = key.replace(/^@/, '');
      attributes[cleanKey] = String(value);
    }
  }

  const children: (XmlNode | string)[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === ':name' || key === ':@') continue;
    if (key.startsWith(':')) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        children.push(convertNode(item));
      }
    } else if (typeof value === 'object' && value !== null) {
      const childRecord = value as Record<string, unknown>;
      // Check if this is a text node
      if ('#text' in childRecord) {
        children.push(String(childRecord['#text']));
      } else {
        childRecord[':name'] = key;
        children.push(convertNode(childRecord));
      }
    } else if (value !== undefined) {
      children.push(String(value));
    }
  }

  return { name, attributes, children };
}

function wrapAsXmlNode(parsed: unknown, rootName: string): XmlNode {
  if (parsed === null || parsed === undefined) {
    return { name: rootName, attributes: {}, children: [] };
  }

  if (typeof parsed === 'string') {
    return { name: rootName, attributes: {}, children: [parsed] };
  }

  if (typeof parsed !== 'object') {
    return { name: rootName, attributes: {}, children: [String(parsed)] };
  }

  const record = parsed as Record<string, unknown>;

  // If fast-xml-parser returned a single root element, extract it
  if (record[':name']) {
    return convertNode(record) as XmlNode;
  }

  // Otherwise the record IS the root element's children
  const children: (XmlNode | string)[] = [];
  const attributes: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith(':')) continue;
    if (key === ':@') {
      if (typeof value === 'object' && value !== null) {
        const attrObj = value as Record<string, string>;
        for (const [ak, av] of Object.entries(attrObj)) {
          attributes[ak.replace(/^@/, '')] = String(av);
        }
      }
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null && ':name' in item) {
          children.push(convertNode(item));
        } else if (typeof item === 'string') {
          children.push(item);
        } else if (typeof item === 'object' && item !== null) {
          const childRecord = item as Record<string, unknown>;
          children.push(convertNode({ ':name': key, ...childRecord }));
        } else {
          children.push(String(item));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      const childRecord = value as Record<string, unknown>;
      if ('#text' in childRecord) {
        children.push(String(childRecord['#text']));
      } else {
        childRecord[':name'] = key;
        children.push(convertNode(childRecord));
      }
    } else if (value !== undefined) {
      children.push(String(value));
    }
  }

  return { name: rootName, attributes, children };
}

export function createXmlParser(): ArtifactParser {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    attributesGroupName: ':@',
    textNodeName: '#text',
    parseTagValue: false,
    trimValues: false,
  });

  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'XML';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'XML',
            extractionMethod: 'xml-parse',
            extractedAt: new Date().toISOString(),
            root: { name: 'root', attributes: {}, children: [] },
            sourceLocation: { kind: 'xml-root', path: '/' },
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const text = new TextDecoder('utf-8', { fatal: false }).decode(input);

      let parsed: unknown;
      try {
        parsed = parser.parse(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid XML';
        return {
          ok: false,
          error: {
            category: 'MALFORMED_ARTIFACT',
            code: 'INVALID_XML',
            message: `Failed to parse XML: ${message}`,
            sourceId: context.artifactId,
            details: { parserId: CAPABILITY.parserId, parserVersion: CAPABILITY.parserVersion },
            retryable: false,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // Detect root element name from first child key
      let rootName = 'root';
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed as Record<string, unknown>).filter(
          (k) => !k.startsWith(':'),
        );
        if (keys.length === 1 && keys[0]) {
          rootName = keys[0];
        }
      }

      const root = wrapAsXmlNode(parsed, rootName);

      return {
        ok: true,
        extraction: {
          artifactId: context.artifactId,
          parserId: CAPABILITY.parserId,
          parserVersion: CAPABILITY.parserVersion,
          format: 'XML',
          extractionMethod: 'xml-parse',
          extractedAt: new Date().toISOString(),
          root,
          sourceLocation: { kind: 'xml-root', path: '/' },
          warnings: [],
        },
      };
    },
  };
}
