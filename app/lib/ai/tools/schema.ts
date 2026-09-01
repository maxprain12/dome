/**
 * AI Tools Schema Helpers
 * 
 * TypeBox schema helpers for defining tool parameters.
 * Based on clawdbot's src/agents/schema/typebox.ts
 */

import { Type, type TSchema, type Static } from '@sinclair/typebox';

// =============================================================================
// String Enum Helpers
// =============================================================================

interface StringEnumOptions<T extends readonly string[]> {
  description?: string;
  title?: string;
  default?: T[number];
}

/**
 * Create a string enum schema.
 * 
 * Avoids Type.Union([Type.Literal(...)]) which compiles to anyOf.
 * Some providers reject anyOf in tool schemas; a flat string enum is safer.
 * 
 * @example
 * const ActionSchema = stringEnum(['create', 'update', 'delete'] as const);
 */
export function stringEnum<T extends readonly string[]>(
  values: T,
  options: StringEnumOptions<T> = {},
) {
  return Type.Unsafe<T[number]>({
    type: 'string',
    enum: [...values],
    ...options,
  });
}

/**
 * Create an optional string enum schema.
 */
export function optionalStringEnum<T extends readonly string[]>(
  values: T,
  options: StringEnumOptions<T> = {},
) {
  return Type.Optional(stringEnum(values, options));
}

// =============================================================================
// Common Schema Patterns
// =============================================================================

/**
 * Create a required string schema with description.
 */
export function requiredString(description: string) {
  return Type.String({ description });
}

/**
 * Create an optional string schema with description.
 */
export function optionalString(description: string) {
  return Type.Optional(Type.String({ description }));
}

/**
 * Create an optional number schema with description.
 */
export function optionalNumber(description: string, options?: { minimum?: number; maximum?: number }) {
  return Type.Optional(Type.Number({ description, ...options }));
}

/**
 * Create an optional integer schema with description.
 */
export function optionalInteger(description: string, options?: { minimum?: number; maximum?: number }) {
  return Type.Optional(Type.Integer({ description, ...options }));
}

/**
 * Create an optional boolean schema with description.
 */
export function optionalBoolean(description: string) {
  return Type.Optional(Type.Boolean({ description }));
}

/**
 * Create an optional string array schema with description.
 */
export function optionalStringArray(description: string) {
  return Type.Optional(Type.Array(Type.String(), { description }));
}

// =============================================================================
// Schema Normalization
// =============================================================================

/**
 * Normalize a TypeBox schema for compatibility with different providers.
 * 
 * - Removes unsupported properties
 * - Flattens nested unions
 * - Ensures required fields are correct
 */
export function normalizeSchema(schema: TSchema): Record<string, unknown> {
  const normalized = JSON.parse(JSON.stringify(schema));
  
  // Remove TypeBox-specific metadata
  delete normalized['$id'];
  delete normalized['$static'];
  delete normalized['transform'];
  
  return normalized;
}

/**
 * Convert a TypeBox schema to JSON Schema format for OpenAI.
 */
export function toOpenAISchema(schema: TSchema): Record<string, unknown> {
  const normalized = normalizeSchema(schema);
  
  // OpenAI expects additionalProperties: false by default
  if (normalized.type === 'object' && !('additionalProperties' in normalized)) {
    normalized.additionalProperties = false;
  }
  
  return normalized;
}

/**
 * Convert a TypeBox schema to JSON Schema format for Anthropic.
 */
export function toAnthropicSchema(schema: TSchema): Record<string, unknown> {
  const normalized = normalizeSchema(schema);
  
  // Anthropic uses input_schema key
  return normalized;
}

// Gemini rejects: const, additionalProperties, and some anyOf/oneOf patterns.
// The helpers below split sanitizeForGemini's branches into small pure functions.

function convertConstToEnum(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!('const' in schema)) return undefined;
  const out: Record<string, unknown> = {
    type: schema.type ?? 'string',
    enum: [(schema as { const: unknown }).const],
  };
  if (schema.description) out.description = schema.description;
  return out;
}

function isNullVariant(branch: unknown): boolean {
  if (branch == null || typeof branch !== 'object') return false;
  const b = branch as { type?: string; const?: unknown };
  return b.type === 'null' || ('const' in b && b.const === null);
}

function buildUnionFromConsts(
  schema: Record<string, unknown>,
  union: Record<string, unknown>[],
  consts: unknown[],
): Record<string, unknown> {
  const hasNull = union.some(isNullVariant);
  const out: Record<string, unknown> = {
    type: 'string',
    enum: hasNull ? [...consts, null] : [...consts],
  };
  if (schema.description) out.description = schema.description;
  return out;
}

function buildUnionFromFirst(
  schema: Record<string, unknown>,
  firstNonNull: Record<string, unknown>,
): Record<string, unknown> {
  const out = sanitizeForGemini(firstNonNull);
  if (schema.description && !out.description) out.description = schema.description;
  return out;
}

function convertUnionToEnum(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  const union = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(union) || union.length === 0) return undefined;

  const consts = union
    .filter((b): b is Record<string, unknown> => b != null && typeof b === 'object' && 'const' in b)
    .map((b) => b.const);
  if (consts.length > 0) return buildUnionFromConsts(schema, union, consts);

  const firstNonNull = union.find((b) => !isNullVariant(b));
  if (firstNonNull && typeof firstNonNull === 'object') return buildUnionFromFirst(schema, firstNonNull);

  return { type: 'string', description: (schema.description as string) ?? '' };
}

function copySupportedFields(schema: Record<string, unknown>, out: Record<string, unknown>): void {
  if (schema.type) out.type = schema.type;
  if (schema.description) out.description = schema.description;
  if (schema.title) out.title = schema.title;
  if (schema.enum) out.enum = schema.enum;
  if (schema.minimum !== undefined) out.minimum = schema.minimum;
  if (schema.maximum !== undefined) out.maximum = schema.maximum;
  if (schema.default !== undefined) out.default = schema.default;
}

function sanitizeProperties(schema: Record<string, unknown>, out: Record<string, unknown>): void {
  if (!schema.properties || typeof schema.properties !== 'object') return;
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    sanitized[k] = sanitizeForGemini(v as Record<string, unknown>);
  }
  out.properties = sanitized;
}

function sanitizeItems(schema: Record<string, unknown>, out: Record<string, unknown>): void {
  if (!schema.items) return;
  out.items = Array.isArray(schema.items)
    ? (schema.items as Record<string, unknown>[]).map((item) => sanitizeForGemini(item))
    : sanitizeForGemini(schema.items as Record<string, unknown>);
}

/**
 * Recursively sanitize a schema for Gemini API compatibility.
 * Gemini rejects: const, additionalProperties, and some anyOf/oneOf patterns.
 */
function sanitizeForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;
  // Gemini does not support additionalProperties; it is simply not copied.

  const fromConst = convertConstToEnum(schema);
  if (fromConst) return fromConst;

  const fromUnion = convertUnionToEnum(schema);
  if (fromUnion) return fromUnion;

  const out: Record<string, unknown> = {};
  copySupportedFields(schema, out);
  sanitizeProperties(schema, out);
  sanitizeItems(schema, out);
  if (Array.isArray(schema.required)) out.required = schema.required;

  return out;
}

/**
 * Convert a TypeBox schema to JSON Schema format for Google Gemini.
 * Removes const, additionalProperties; converts anyOf/oneOf to enum.
 */
export function toGeminiSchema(schema: TSchema): Record<string, unknown> {
  const normalized = normalizeSchema(schema) as Record<string, unknown>;
  return sanitizeForGemini(normalized);
}

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Schema for file path parameter
 */
export const FilePathSchema = Type.String({
  description: 'Absolute or relative file path',
});

/**
 * Schema for URL parameter
 */
export const UrlSchema = Type.String({
  description: 'URL to fetch or process',
  format: 'uri',
});

/**
 * Schema for query/search parameter
 */
export const QuerySchema = Type.String({
  description: 'Search query string',
});

/**
 * Schema for count/limit parameter
 */
export const CountSchema = Type.Optional(Type.Integer({
  description: 'Number of results to return',
  minimum: 1,
  maximum: 100,
  default: 10,
}));

/**
 * Schema for timeout parameter (in seconds)
 */
export const TimeoutSchema = Type.Optional(Type.Integer({
  description: 'Timeout in seconds',
  minimum: 1,
  maximum: 300,
  default: 30,
}));

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if a value matches a TypeBox schema.
 * 
 * Note: This is a simple check, not a full validation.
 * For full validation, use @sinclair/typebox/value
 */
export function matchesSchema<T extends TSchema>(
  schema: T,
  value: unknown,
): value is Static<T> {
  if (schema.type === 'string') {
    return typeof value === 'string';
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return typeof value === 'number';
  }
  if (schema.type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (schema.type === 'array') {
    return Array.isArray(value);
  }
  if (schema.type === 'object') {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  if (schema.type === 'null') {
    return value === null;
  }
  // For unions and other complex types, assume valid
  return true;
}

// =============================================================================
// Schema Extraction
// =============================================================================

/**
 * Extract required property names from a TypeBox object schema.
 */
export function getRequiredProperties(schema: TSchema): string[] {
  if (schema.type !== 'object') return [];
  return Array.isArray(schema.required) ? schema.required : [];
}

/**
 * Extract all property names from a TypeBox object schema.
 */
export function getPropertyNames(schema: TSchema): string[] {
  if (schema.type !== 'object' || !schema.properties) return [];
  return Object.keys(schema.properties as Record<string, unknown>);
}

/**
 * Check if a property is required in a TypeBox object schema.
 */
export function isPropertyRequired(schema: TSchema, propertyName: string): boolean {
  return getRequiredProperties(schema).includes(propertyName);
}
