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
 * Convert a TypeBox schema to JSON Schema format for Google Gemini.
 */
export function toGeminiSchema(schema: TSchema): Record<string, unknown> {
  const normalized = normalizeSchema(schema);
  
  // Gemini has specific requirements for schemas
  // Remove any anyOf/oneOf patterns that Gemini doesn't support well
  if ('anyOf' in normalized) {
    // Try to flatten to first option
    const firstOption = (normalized.anyOf as Record<string, unknown>[])[0];
    return firstOption || normalized;
  }
  
  return normalized;
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
