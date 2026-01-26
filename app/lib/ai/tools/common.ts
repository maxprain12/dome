/**
 * AI Tools Common Utilities
 * 
 * Shared utilities for tool implementations.
 * Based on clawdbot's src/agents/tools/common.ts
 */

import type { AgentToolResult, ToolResultContent } from './types';

// =============================================================================
// Parameter Reading Helpers
// =============================================================================

export interface StringParamOptions {
  required?: boolean;
  trim?: boolean;
  label?: string;
  allowEmpty?: boolean;
}

/**
 * Read a string parameter from tool arguments.
 */
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string | undefined;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
): string | undefined {
  const { required = false, trim = true, label = key, allowEmpty = false } = options;
  const raw = params[key];
  
  if (typeof raw !== 'string') {
    if (required) throw new Error(`${label} required`);
    return undefined;
  }
  
  const value = trim ? raw.trim() : raw;
  
  if (!value && !allowEmpty) {
    if (required) throw new Error(`${label} required`);
    return undefined;
  }
  
  return value;
}

/**
 * Read a string or number parameter as string.
 */
export function readStringOrNumberParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; label?: string } = {},
): string | undefined {
  const { required = false, label = key } = options;
  const raw = params[key];
  
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (value) return value;
  }
  
  if (required) throw new Error(`${label} required`);
  return undefined;
}

/**
 * Read a number parameter from tool arguments.
 */
export function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; label?: string; integer?: boolean } = {},
): number | undefined {
  const { required = false, label = key, integer = false } = options;
  const raw = params[key];
  
  let value: number | undefined;
  
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) value = parsed;
    }
  }
  
  if (value === undefined) {
    if (required) throw new Error(`${label} required`);
    return undefined;
  }
  
  return integer ? Math.trunc(value) : value;
}

/**
 * Read a boolean parameter from tool arguments.
 */
export function readBooleanParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; label?: string; defaultValue?: boolean } = {},
): boolean | undefined {
  const { required = false, label = key, defaultValue } = options;
  const raw = params[key];
  
  if (typeof raw === 'boolean') {
    return raw;
  }
  
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  
  if (typeof raw === 'number') {
    return raw !== 0;
  }
  
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  
  if (required) throw new Error(`${label} required`);
  return undefined;
}

/**
 * Read a string array parameter from tool arguments.
 */
export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string[];
export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string[] | undefined;
export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
): string[] | undefined {
  const { required = false, label = key } = options;
  const raw = params[key];
  
  if (Array.isArray(raw)) {
    const values = raw
      .filter((entry) => typeof entry === 'string')
      .map((entry) => (entry as string).trim())
      .filter(Boolean);
    
    if (values.length === 0) {
      if (required) throw new Error(`${label} required`);
      return undefined;
    }
    return values;
  }
  
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) {
      if (required) throw new Error(`${label} required`);
      return undefined;
    }
    return [value];
  }
  
  if (required) throw new Error(`${label} required`);
  return undefined;
}

// =============================================================================
// Result Builders
// =============================================================================

/**
 * Create a JSON result for a tool.
 */
export function jsonResult<T>(payload: T): AgentToolResult<T> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

/**
 * Create a text result for a tool.
 */
export function textResult(text: string): AgentToolResult<{ text: string }> {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    details: { text },
  };
}

/**
 * Create an error result for a tool.
 */
export function errorResult(
  message: string,
  details?: Record<string, unknown>,
): AgentToolResult<{ status: 'error'; error: string }> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status: 'error', error: message, ...details }, null, 2),
      },
    ],
    details: { status: 'error', error: message, ...details },
    isError: true,
  };
}

/**
 * Create an image result for a tool.
 */
export function imageResult(params: {
  path: string;
  base64: string;
  mimeType: string;
  extraText?: string;
  details?: Record<string, unknown>;
}): AgentToolResult<{ path: string }> {
  const content: ToolResultContent[] = [
    {
      type: 'text',
      text: params.extraText ?? `MEDIA:${params.path}`,
    },
    {
      type: 'image',
      data: params.base64,
      mimeType: params.mimeType,
    },
  ];
  
  return {
    content,
    details: { path: params.path, ...params.details },
  };
}

/**
 * Create a success result with a message.
 */
export function successResult(
  message: string,
  details?: Record<string, unknown>,
): AgentToolResult<{ status: 'success'; message: string }> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status: 'success', message, ...details }, null, 2),
      },
    ],
    details: { status: 'success', message, ...details },
  };
}

// =============================================================================
// Action Gate Helper
// =============================================================================

export type ActionGate<T extends Record<string, boolean | undefined>> = (
  key: keyof T,
  defaultValue?: boolean,
) => boolean;

/**
 * Create an action gate for checking allowed actions.
 */
export function createActionGate<T extends Record<string, boolean | undefined>>(
  actions: T | undefined,
): ActionGate<T> {
  return (key, defaultValue = true) => {
    const value = actions?.[key];
    if (value === undefined) return defaultValue;
    return value !== false;
  };
}

// =============================================================================
// Caching Helpers
// =============================================================================

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Read from a cache if not expired.
 */
export function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): CacheEntry<T> | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  
  return entry;
}

/**
 * Write to a cache with TTL.
 */
export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Normalize a cache key by lowercasing and trimming.
 */
export function normalizeCacheKey(key: string): string {
  return key.toLowerCase().trim();
}

// =============================================================================
// Timeout Helpers
// =============================================================================

/**
 * Create an AbortSignal that times out after the specified milliseconds.
 */
export function withTimeout(
  existingSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    
    if (existingSignal) {
      // Combine signals
      const controller = new AbortController();
      
      existingSignal.addEventListener('abort', () => controller.abort(existingSignal.reason));
      timeoutSignal.addEventListener('abort', () => controller.abort(timeoutSignal.reason));
      
      return controller.signal;
    }
    
    return timeoutSignal;
  }
  
  // Fallback for older environments
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs);
  
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort(existingSignal.reason);
    });
  }
  
  return controller.signal;
}

/**
 * Convert timeout seconds to milliseconds with validation.
 */
export function resolveTimeoutSeconds(
  value: number | undefined,
  defaultValue: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return defaultValue;
  }
  return Math.min(Math.max(1, value), 300); // 1-300 seconds
}

/**
 * Convert cache TTL minutes to milliseconds with validation.
 */
export function resolveCacheTtlMs(
  minutes: number | undefined,
  defaultMinutes: number,
): number {
  const resolved = minutes ?? defaultMinutes;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    return defaultMinutes * 60 * 1000;
  }
  return resolved * 60 * 1000;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Read response text safely.
 */
export async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
