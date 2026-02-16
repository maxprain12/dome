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

/**
 * Recursively sanitize a schema for Gemini API compatibility.
 * Gemini rejects: const, additionalProperties, and some anyOf/oneOf patterns.
 */
function sanitizeForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};

  // Skip unsupported keywords
  if ('additionalProperties' in schema) {
    /* Gemini does not support additionalProperties */
  }

  // Convert const to enum (Gemini supports enum, not const)
  if ('const' in schema) {
    out.type = schema.type ?? 'string';
    out.enum = [(schema as { const: unknown }).const];
    if (schema.description) out.description = schema.description;
    return out;
  }

  // Convert anyOf/oneOf to Gemini-compatible format
  const union = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined;
  if (Array.isArray(union) && union.length > 0) {
    const consts = union
      .filter((b): b is Record<string, unknown> => b != null && typeof b === 'object' && 'const' in b)
      .map((b) => b.const);
    const hasNull = union.some(
      (b) => b != null && typeof b === 'object' && ((b as { type?: string }).type === 'null' || (b as { const?: unknown }).const === null),
    );
    const firstNonNull = union.find(
      (b) =>
        b != null &&
        typeof b === 'object' &&
        (b as { type?: string }).type !== 'null' &&
        !('const' in b && (b as { const: unknown }).const === null),
    );

    if (consts.length > 0) {
      out.type = 'string';
      out.enum = hasNull ? [...consts, null] : [...consts];
      if (schema.description) out.description = schema.description;
      return out;
    }
    if (firstNonNull && typeof firstNonNull === 'object') {
      const sanitized = sanitizeForGemini(firstNonNull as Record<string, unknown>);
      Object.assign(out, sanitized);
      if (schema.description && !out.description) out.description = schema.description;
      return out;
    }
    return { type: 'string', description: (schema.description as string) ?? '' };
  }

  // Copy supported fields
  if (schema.type) out.type = schema.type;
  if (schema.description) out.description = schema.description;
  if (schema.title) out.title = schema.title;
  if (schema.enum) out.enum = schema.enum;
  if (schema.minimum !== undefined) out.minimum = schema.minimum;
  if (schema.maximum !== undefined) out.maximum = schema.maximum;
  if (schema.default !== undefined) out.default = schema.default;

  // Recursively sanitize properties (objects)
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      (out.properties as Record<string, unknown>)[k] = sanitizeForGemini(v as Record<string, unknown>);
    }
  }

  // Recursively sanitize items (arrays)
  if (schema.items) {
    out.items = Array.isArray(schema.items)
      ? (schema.items as Record<string, unknown>[]).map((item) => sanitizeForGemini(item))
      : sanitizeForGemini(schema.items as Record<string, unknown>);
  }

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
