// ============================================================================
// M-PR2 Parser Routing
//
// Deterministic parser selection from artifact classification.
// Defines the boundary between classification and extraction.
//
// This module does NOT:
//   - Perform extraction
//   - Create observations
//   - Refetch artifacts
// ============================================================================

export type {
  ParserCapability,
  ParserRoute,
  ParserRouteResult,
} from './parser-capability.js';

export type { ArtifactParser } from './artifact-parser.js';

export { ParserRegistry } from './parser-registry.js';

export { selectParser } from './parser-router.js';

export { createDefaultParserRegistry } from './builtins/index.js';
