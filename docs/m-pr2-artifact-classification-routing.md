# M-PR2: Artifact Classification & Parser Routing

**Status:** COMPLETE + HARDENED (uncommitted)
**Date:** 2026-03-05
**Depends on:** M-PR1 (Artifact Acquisition)

## Purpose

Takes `VerifiedArtifact` output from M-PR1 and determines:
1. What format is this artifact? (PDF, DOCX, XLSX, CSV, etc.)
2. What parser should handle extraction?
3. What encoding does the content use?

**NOT in scope:** extraction, observation creation, entity resolution.

## Architecture

### Input → Output

```
VerifiedArtifact (from M-PR1)
    │
    ▼
┌─────────────────────┐
│  ArtifactClassifier  │  ← Deterministic, no network, no refetch
│  (trust order)       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   ParserRegistry     │  ← Typed indexes by format, MIME, family
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   ParserRouter       │  ← Uses registry indexes, deterministic selection
└─────────┬───────────┘
          │
          ▼
     ParserRoute
```

### Trust Order for Format Detection

1. **M-PR1's `detectedMimeType`** — from magic bytes (highest trust)
2. **Content sniffing** — JSON `{`/`[`, XML `<`, CSV delimiter heuristic
3. **File extension** — `.pdf`, `.docx`, etc. (hint only)
4. **Unknown** — fallback

### Parser Routing Algorithm

1. Use registry format index for exact format match (highest confidence)
2. If no exact match, check family fallback (only parsers with `acceptsFallbackFormats: true`)
3. Sort by priority ascending, then parserId alphabetically
4. Select first candidate
5. If no candidates, return `UNSUPPORTED_FORMAT` error

### Family Fallback (opt-in)

Family fallback is deliberately opt-in via `acceptsFallbackFormats` on `ParserCapability`:
- **Default (`false`)**: Parser only handles its declared exact formats
- **Opt-in (`true`)**: Parser can handle any artifact in its declared families

This prevents silent misrouting. A parser must explicitly declare that it accepts broader family-level routing. All 8 M-PR2 built-in stubs set `acceptsFallbackFormats: false`.

## Files

### `@indago/contracts` (modified)
- `src/intelligence/ingestion-errors.ts` — Added `UNSUPPORTED_FORMAT` to `IngestionErrorCategorySchema`

### `@indago/ingestion` (new/modified)

**Classification:**
- `src/classification/types.ts` — `ArtifactFormat`, `ArtifactFamily`, `EncodingType`, `ArtifactClassification`
- `src/classification/encoding-detector.ts` — UTF-8 BOM, UTF-16 LE/BE, binary detection
- `src/classification/artifact-classifier.ts` — `classifyArtifact(artifact, content?)`
- `src/classification/index.ts` — barrel exports

**Parser Routing:**
- `src/parser/parser-capability.ts` — `ParserCapability`, `ParserRoute`, `ParserRouteResult`
- `src/parser/artifact-parser.ts` — `ArtifactParser` interface (canParse only — no parse(), M-PR3)
- `src/parser/parser-registry.ts` — `ParserRegistry` class with typed format/MIME/family indexes
- `src/parser/parser-router.ts` — `selectParser()` deterministic routing using registry indexes
- `src/parser/index.ts` — barrel exports

**Built-in Stubs (8 — no UNKNOWN parser):**
- `src/parser/builtins/pdf-parser.ts`
- `src/parser/builtins/docx-parser.ts`
- `src/parser/builtins/xlsx-parser.ts`
- `src/parser/builtins/csv-parser.ts`
- `src/parser/builtins/txt-parser.ts`
- `src/parser/builtins/json-parser.ts`
- `src/parser/builtins/xml-parser.ts`
- `src/parser/builtins/image-parser.ts`
- `src/parser/builtins/index.ts` — `createDefaultParserRegistry()` factory

**Modified:**
- `src/index.ts` — Added classification + parser module exports

### Tests
- `tests/classification/encoding-detector.test.ts` — 11 tests
- `tests/classification/artifact-classifier.test.ts` — 19 tests
- `tests/parser/parser-registry.test.ts` — 12 tests
- `tests/parser/parser-router.test.ts` — 12 tests (includes acceptsFallbackFormats tests)
- `tests/parser/integration.test.ts` — 9 tests

## Constraints Enforced

- **No hidden artifact refetch** — Classifier classifies based on VerifiedArtifact metadata + optional content bytes. Never fetches from network.
- **Built-ins are stubs** — Capability declarations + canParse only. No extraction logic, no parse() method yet.
- **Deterministic routing** — Same VerifiedArtifact + same registry = same ParserRoute. No randomness, no LLM, no network calls.
- **ADAPTER ≠ PARSER** — Parser handles file-format semantics (PDF, CSV). Adapter handles source semantics (HTTP, S3, filesystem).
- **Strong typing** — `canParse(classification: ArtifactClassification)` takes typed classification, not loose strings.
- **Registry indexes used** — Router uses `getByFormat()` / `getByFamily()` from registry, not `list()` + filter.
- **UNKNOWN → UNSUPPORTED_FORMAT** — No unknown-parser. Unknown formats correctly return UNSUPPORTED_FORMAT.

## Verification

- **pnpm typecheck:** 0 errors
- **pnpm test:** 263 tests pass (76 contracts + 187 ingestion)
- **pnpm build:** Both packages clean
- **Architecture audit:** 0 `as any`, 0 forbidden imports, 0 console.log, 0 Zod in src
