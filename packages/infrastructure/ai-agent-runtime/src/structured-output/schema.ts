// ============================================================================
// Structured output — zod → provider-native JSON Schema (@indago/ai-agent-runtime)
//
// The pipeline (v2, AI_RUNTIME_POLICY_VERSION):
//   feature zod schema → JSON Schema representation → provider-native
//   structured output (Gemini Interactions response_format.schema / Ollama
//   format: <schema>) → LLM → provider response → parse → zod validation.
//
// This module is the "JSON Schema representation" step. It converts the
// caller's zod schema via `zod-to-json-schema` (documented, deterministic),
// then normalizes it onto a SHARED, conservative provider subset and rejects
// anything that cannot be represented safely — deterministically, with a typed
// error. NO weakening, NO silent structural changes, NO mutation of the caller's
// schema object.
//
// Shared provider subset (the intersection both current provider contracts
// enumerate). Allowed node keywords:
//   type, enum, description, format, minimum, maximum,
//   minItems, maxItems, items, prefixItems, properties, required,
//   additionalProperties, minProperties, maxProperties,
//   title | default   (annotations only; they never constrain acceptance)
//
// Structural normalizations (semantics-preserving, deterministic):
//   - jsonSchema7 optional-hack `anyOf:[{not:{}}, X]` → X
//     (undefined-ness at a property is expressed by omission from `required`)
//   - `anyOf:[A, {type:"null"}]` → `{...A, type:[A.type, "null"]}`
//     (nullability joins the type array, matching the providers' own style)
//   - `const: v` → `enum: [v]`        (the providers' subset has no `const`)
//   - `$schema` is stripped           (annotation only)
//
// Deterministically rejected (UNSUPPORTED_CAPABILITY): anyOf/oneOf/allOf/not,
// if/then/else, $ref/$defs/definitions/$id/$anchor/$dynamicRef/$recursiveRef,
// patternProperties, propertyNames, contains/minContains/maxContains,
// dependentSchemas/dependentRequired/dependencies, array-form `items` (draft-04
// tuple), general multi-type arrays, pattern, minLength/maxLength and other
// keywords outside the shared subset.
//
// Conversion failures / recursive schemas / unconstrained schemas (no `type`) /
// oversized or overly deep schemas → SCHEMA_VALIDATION_FAILED. The thrown error
// never embeds schema values received from a caller beyond safe identifiers.
// ============================================================================

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AiRuntimeError } from '../errors/ai-runtime-error.js';

/** Hard structural-depth guard (internal safety bound, not configurable). */
export const MAX_SCHEMA_DEPTH = 64;

/** Default ceiling for a serialized provider schema, mirroring DEFAULT_AI_BUDGETS.maxSchemaBytes. */
export const DEFAULT_MAX_SCHEMA_BYTES = 50_000;

export interface SchemaDocument {
  /** Normalized, provider-safe JSON Schema (plain object). */
  readonly schema: Readonly<Record<string, unknown>>;
  /** Canonical deterministic JSON serialization (sorted keys). */
  readonly serialized: string;
  /** UTF-8 byte length of `serialized`. */
  readonly byteLength: number;
}

export interface ConvertSchemaOptions {
  /** Max serialized schema size in UTF-8 bytes. Hard rejection. Defaults to DEFAULT_MAX_SCHEMA_BYTES. */
  readonly maxBytes?: number;
}

const ALLOWED_KEYWORDS = new Set([
  'type',
  'enum',
  'description',
  'format',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'items',
  'prefixItems',
  'properties',
  'required',
  'additionalProperties',
  'minProperties',
  'maxProperties',
  'title',
  'default',
]);

const ALLOWED_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);

/** Combinational / traversal / subschema keywords the shared subset cannot express. */
const REJECTED_KEYWORDS = [
  'anyOf',
  'oneOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  '$ref',
  '$id',
  '$anchor',
  '$defs',
  'definitions',
  '$dynamicRef',
  '$recursiveRef',
  'patternProperties',
  'propertyNames',
  'contains',
  'minContains',
  'maxContains',
  'dependentSchemas',
  'dependentRequired',
  'dependencies',
  'additionalItems',
  'unevaluatedProperties',
  'unevaluatedItems',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaError(message: string, options: { cause?: unknown } = {}): AiRuntimeError {
  return new AiRuntimeError('SCHEMA_VALIDATION_FAILED', message, options);
}

function capabilityError(message: string): AiRuntimeError {
  return new AiRuntimeError('UNSUPPORTED_CAPABILITY', message);
}

/** Matches the jsonSchema7 optional-hack `anyOf:[{not:{}}, X]`. */
function optionalHackOperand(raw: Record<string, unknown>): unknown | null {
  if (!Array.isArray(raw.anyOf) || raw.anyOf.length !== 2) return null;
  const [first, second] = raw.anyOf as [unknown, unknown];
  if (
    !isPlainObject(first) ||
    Object.keys(first).length !== 1 ||
    !('not' in first) ||
    !isPlainObject(first.not) ||
    Object.keys(first.not as Record<string, unknown>).length !== 0
  ) {
    return null;
  }
  return second;
}

/** Matches `anyOf:[A, {type:"null"}]` or `[{type:"null"}, A]` for a single-typed A. */
function nullableUnionMerge(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(raw.anyOf) || raw.anyOf.length !== 2) return null;
  const [first, second] = raw.anyOf as [unknown, unknown];
  const isNullNode = (value: unknown): value is Record<string, unknown> =>
    isPlainObject(value) && value.type === 'null' && Object.keys(value).length === 1;

  let base: unknown;
  if (isNullNode(first)) {
    base = second;
  } else if (isNullNode(second)) {
    base = first;
  } else {
    return null;
  }

  if (!isPlainObject(base)) return null;
  if (typeof base.type !== 'string' || !ALLOWED_TYPES.has(base.type)) return null;
  if (REJECTED_KEYWORDS.some((keyword) => keyword in base)) return null;

  return { ...base, type: [base.type, 'null'] };
}

function assertPlainObjectOrBoolean(value: unknown, path: string): unknown {
  if (typeof value === 'boolean') return value;
  if (isPlainObject(value)) return value;
  throw schemaError(`Schema value at "${path}" must be an object or boolean`);
}

function normalizeNode(raw: unknown, depth: number, path: string): unknown {
  if (depth > MAX_SCHEMA_DEPTH) {
    throw schemaError(`Schema is nested deeper than the supported depth of ${MAX_SCHEMA_DEPTH} (at "${path}")`);
  }

  const rawNode = assertPlainObjectOrBoolean(raw, path);
  if (typeof rawNode === 'boolean') return rawNode;
  const node = rawNode as Record<string, unknown>;

  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue;
    stripped[key] = value;
  }

  const optionalOperand = optionalHackOperand(stripped);
  if (optionalOperand !== null) {
    return normalizeNode(optionalOperand, depth, path);
  }

  const nulled = nullableUnionMerge(stripped);
  if (nulled !== null) {
    return normalizeNode(nulled, depth, path);
  }

  if ('const' in stripped) {
    const constant = stripped.const;
    if (!Array.isArray(constant)) {
      stripped.enum = [constant];
      delete stripped.const;
    }
  }

  for (const keyword of REJECTED_KEYWORDS) {
    if (keyword in stripped) {
      throw capabilityError(
        `Schema at "${path}" uses "${keyword}", which the shared provider subset cannot enforce natively`,
      );
    }
  }

  for (const key of Object.keys(stripped)) {
    if (!ALLOWED_KEYWORDS.has(key)) {
      throw capabilityError(
        `Schema at "${path}" uses "${key}", which is outside the shared provider schema subset`,
      );
    }
  }

  if ('type' in stripped) {
    const typeValue = stripped.type;
    if (typeof typeValue === 'string') {
      if (!ALLOWED_TYPES.has(typeValue)) {
        throw capabilityError(`Schema at "${path}" uses unsupported type "${typeValue}"`);
      }
    } else if (Array.isArray(typeValue)) {
      validateTypeArray(typeValue, path);
    } else {
      throw schemaError(`Schema at "${path}" has an invalid "type" keyword`);
    }
  }

  if ('properties' in stripped) {
    const properties = stripped.properties;
    if (!isPlainObject(properties)) {
      throw schemaError(`Schema at "${path}" has invalid "properties"`);
    }
    const normalizedProperties: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(properties)) {
      normalizedProperties[name] = normalizeNode(child, depth + 1, `${path}.properties.${name}`);
    }
    stripped.properties = normalizedProperties;
  }

  if ('items' in stripped) {
    if (Array.isArray(stripped.items)) {
      throw capabilityError(
        `Schema at "${path}" uses array-form "items" (tuple), which the shared provider subset cannot enforce natively`,
      );
    }
    stripped.items = normalizeNode(stripped.items, depth + 1, `${path}.items`);
  }

  if ('prefixItems' in stripped) {
    if (!Array.isArray(stripped.prefixItems)) {
      throw schemaError(`Schema at "${path}" has invalid "prefixItems"`);
    }
    stripped.prefixItems = stripped.prefixItems.map((child, index) =>
      normalizeNode(child, depth + 1, `${path}.prefixItems[${index}]`),
    );
  }

  if ('additionalProperties' in stripped) {
    stripped.additionalProperties = normalizeNode(
      stripped.additionalProperties,
      depth + 1,
      `${path}.additionalProperties`,
    );
  }

  if ('required' in stripped) {
    if (
      !Array.isArray(stripped.required) ||
      stripped.required.some((entry) => typeof entry !== 'string')
    ) {
      throw schemaError(`Schema at "${path}" has invalid "required"`);
    }
  }

  if ('enum' in stripped) {
    if (!Array.isArray(stripped.enum) || stripped.enum.length === 0) {
      throw schemaError(`Schema at "${path}" has invalid "enum"`);
    }
  }

  return stripped;
}

function validateTypeArray(typeValue: unknown[], path: string): void {
  if (typeValue.length === 0) {
    throw schemaError(`Schema at "${path}" has an empty "type" array`);
  }
  const nonNullTypes: string[] = [];
  for (const entry of typeValue) {
    if (entry === 'null') continue;
    if (typeof entry !== 'string' || !ALLOWED_TYPES.has(entry)) {
      throw capabilityError(`Schema at "${path}" uses unsupported type value "${String(entry)}"`);
    }
    nonNullTypes.push(entry);
  }
  if (new Set(nonNullTypes).size !== 1) {
    throw capabilityError(
      `Schema at "${path}" combines multiple concrete types; only [<type>, "null"] is representable in the shared provider subset`,
    );
  }
}

/** Ensures the final document is JSON.stringify-safe and never silently collapses values (NaN, undefined, BigInt, functions). */
function assertJsonSafe(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw schemaError(`Schema contains a non-finite number at "${path}"`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonSafe(entry, `${path}.${key}`);
    }
    return;
  }
  throw schemaError(`Schema contains a non-JSON value at "${path}"`);
}

/** Canonical deterministic serialization (stable, sorted key order). */
function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (isPlainObject(entry)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(entry).sort()) {
        sorted[k] = entry[k];
      }
      return sorted;
    }
    return entry;
  });
}

/**
 * Converts a feature zod schema into a provider-native, provider-safe JSON
 * Schema document. Deterministic: identical input → identical normalized schema
 * and identical serialized bytes.
 *
 * @throws AiRuntimeError SCHEMA_VALIDATION_FAILED — conversion failure, recursive/
 *   unconstrained/oversized/overly-deep schema, or non-JSON-safe values.
 * @throws AiRuntimeError UNSUPPORTED_CAPABILITY — valid zod schema whose construct
 *   the shared provider subset cannot enforce natively (no silent weakening).
 */
export function convertSchemaDocument(
  schema: z.ZodType<unknown>,
  options: ConvertSchemaOptions = {},
): SchemaDocument {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SCHEMA_BYTES;

  let raw: unknown;
  try {
    raw = zodToJsonSchema(schema, { target: 'jsonSchema7' });
  } catch (error) {
    throw schemaError('The zod schema could not be converted to JSON Schema (recursive or unnameable?)', {
      cause: error,
    });
  }

  if (!isPlainObject(raw)) {
    throw schemaError('The zod schema did not convert to a JSON Schema object');
  }

  const normalized = normalizeNode(raw, 0, '(root)');
  if (!isPlainObject(normalized) || !('type' in normalized)) {
    throw schemaError(
      'The zod schema is unconstrained (no "type"), so provider-native enforcement cannot guarantee structured output',
    );
  }

  assertJsonSafe(normalized, 'schema');
  const serialized = canonicalStringify(normalized);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > maxBytes) {
    throw schemaError(
      `The generated schema is ${byteLength} bytes, exceeding the configured maxSchemaBytes of ${maxBytes}`,
    );
  }

  return {
    schema: normalized,
    serialized,
    byteLength,
  };
}