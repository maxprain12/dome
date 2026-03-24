/**
 * Web Search Tool
 *
 * Search the live web using the built-in Playwright browser search.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import {
  jsonResult,
  readStringParam,
  readNumberParam,
  readCache,
  writeCache,
  normalizeCacheKey,
  resolveTimeoutSeconds,
  resolveCacheTtlMs,
  type CacheEntry,
} from './common';

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_TIMEOUT_SECONDS = 15;
const DEFAULT_CACHE_TTL_MINUTES = 30;

const SUPPORTED_FRESHNESS_SHORTCUTS = new Set(['pd', 'pw', 'pm', 'py']);
const FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const WebSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query string.' }),
  count: Type.Optional(
    Type.Number({
      description: 'Number of results to return (1-10). Default: 5.',
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description: "2-letter country code for region-specific results (e.g., 'DE', 'US').",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code for search results (e.g., 'de', 'en', 'fr').",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description: "Freshness hint for browser search. Supported shortcuts: 'pd', 'pw', 'pm', 'py'.",
    }),
  ),
});

export interface WebSearchConfig {
  maxResults?: number;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
}

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (SUPPORTED_FRESHNESS_SHORTCUTS.has(lower)) return lower;

  if (FRESHNESS_RANGE.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

async function runWebSearch(params: {
  query: string;
  count: number;
  timeoutSeconds: number;
  cacheTtlMs: number;
  country?: string;
  searchLang?: string;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `${params.query}:${params.count}:${params.country || 'default'}:${params.searchLang || 'default'}:${params.freshness || 'default'}`,
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) return { ...cached.value, cached: true };

  if (typeof window === 'undefined' || !window.electron?.ai?.webSearch) {
    throw new Error('web_search requiere el entorno Electron.');
  }

  const startedAt = Date.now();
  const result = await window.electron.ai.webSearch({
    query: params.query,
    count: params.count,
    country: params.country,
    search_lang: params.searchLang,
    freshness: params.freshness,
  });

  if (result?.status === 'error') {
    throw new Error(result.error || 'No se pudo completar la búsqueda web.');
  }

  const payload = {
    ...result,
    tookMs: Date.now() - startedAt,
  };
  writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
  return payload;
}

export function createWebSearchTool(config?: WebSearchConfig): AnyAgentTool {
  return {
    label: 'Web Search',
    name: 'web_search',
    description: 'Search the live web using the built-in Playwright browser search. Returns titles, URLs, and snippets from current search results.',
    parameters: WebSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const count = readNumberParam(params, 'count', { integer: true }) ?? config?.maxResults ?? DEFAULT_SEARCH_COUNT;
        const country = readStringParam(params, 'country');
        const searchLang = readStringParam(params, 'search_lang');
        const rawFreshness = readStringParam(params, 'freshness');
        const freshness = rawFreshness ? normalizeFreshness(rawFreshness) : undefined;

        if (rawFreshness && !freshness) {
          return jsonResult({
            status: 'error',
            error: 'freshness must be one of pd, pw, pm, py, or a range like YYYY-MM-DDtoYYYY-MM-DD.',
          });
        }

        const result = await runWebSearch({
          query,
          count: resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
          timeoutSeconds: resolveTimeoutSeconds(config?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
          cacheTtlMs: resolveCacheTtlMs(config?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
          country,
          searchLang,
          freshness,
        });

        return jsonResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}
