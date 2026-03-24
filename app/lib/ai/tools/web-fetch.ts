/**
 * Web Fetch Tool
 *
 * Delegates all HTML extraction to the main-process Playwright scraper.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import {
  jsonResult,
  normalizeCacheKey,
  readBooleanParam,
  readCache,
  readNumberParam,
  readStringParam,
  resolveCacheTtlMs,
  type CacheEntry,
  writeCache,
} from './common';

const DEFAULT_CACHE_TTL_MINUTES = 60;
const MAX_CONTENT_LENGTH = 100000;

const FETCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const WebFetchSchema = Type.Object({
  url: Type.String({ description: 'URL to fetch content from.' }),
  extractText: Type.Optional(
    Type.Boolean({
      description: 'Deprecated. The Playwright scraper already returns cleaned markdown/text content.',
    }),
  ),
  includeMetadata: Type.Optional(
    Type.Boolean({
      description: 'Include page metadata (title, description, author). Default: true.',
    }),
  ),
  maxLength: Type.Optional(
    Type.Number({
      description: 'Maximum content length to return. Default: 50000.',
      minimum: 1000,
      maximum: MAX_CONTENT_LENGTH,
    }),
  ),
  selector: Type.Optional(
    Type.String({
      description: 'Optional CSS selector to prioritize a specific section of the rendered DOM.',
    }),
  ),
  useAdvancedScraper: Type.Optional(
    Type.Boolean({
      description: 'Deprecated. Dome now uses the Playwright scraper for web content by default.',
    }),
  ),
  includeScreenshot: Type.Optional(
    Type.Boolean({
      description: 'Include a screenshot of the rendered page. Default: false.',
    }),
  ),
});

export interface WebFetchConfig {
  cacheTtlMinutes?: number;
  maxLength?: number;
}

type RendererScrapeResponse = {
  success: boolean;
  url: string;
  finalUrl?: string;
  title?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
  screenshot?: string | null;
  screenshotFormat?: string;
  warnings?: string[];
  error?: string;
};

function buildCacheKey(url: string, selector?: string, includeScreenshot?: boolean): string {
  return normalizeCacheKey(`${url}:${selector || 'auto'}:${includeScreenshot ? 'shot' : 'text'}`);
}

function mapMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return undefined;

  return {
    title: metadata.title,
    description: metadata.description,
    image: metadata.image,
    author: metadata.author,
    siteName: metadata.siteName ?? metadata.section,
    tags: metadata.tags,
    publishedDate: metadata.published_date,
    modifiedDate: metadata.modified_date,
    canonicalUrl: metadata.canonical_url,
    sourceUrl: metadata.url,
  };
}

async function scrapeViaMainProcess(params: {
  url: string;
  includeMetadata: boolean;
  includeScreenshot: boolean;
  maxLength: number;
  selector?: string;
}): Promise<Record<string, unknown>> {
  if (!window.electron?.web?.scrape) {
    throw new Error('Web scraping API not available');
  }

  const result = (await window.electron.web.scrape({
    url: params.url,
    includeMetadata: params.includeMetadata,
    includeScreenshot: params.includeScreenshot,
    maxLength: params.maxLength,
    selector: params.selector,
  })) as RendererScrapeResponse;

  if (!result.success) {
    return {
      status: 'error',
      error: result.error || 'Failed to scrape URL',
      url: params.url,
    };
  }

  const content = typeof result.content === 'string' ? result.content : '';
  const payload: Record<string, unknown> = {
    url: result.url || params.url,
    finalUrl: result.finalUrl || result.url || params.url,
    title: result.title ?? undefined,
    content,
    contentLength: content.length,
    truncated: content.length >= params.maxLength,
    contentFormat: 'markdown',
  };

  if (params.includeMetadata) {
    payload.metadata = mapMetadata(result.metadata);
  }

  if (params.includeScreenshot && result.screenshot) {
    payload.screenshot = `data:image/${result.screenshotFormat || 'jpeg'};base64,${result.screenshot}`;
  }

  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    payload.warnings = result.warnings;
  }

  return payload;
}

export function createWebFetchTool(config?: WebFetchConfig): AnyAgentTool {
  return {
    label: 'Web Fetch',
    name: 'web_fetch',
    description: 'Fetch and extract content from a web page using Dome\'s Playwright scraper in the main process.',
    parameters: WebFetchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const url = readStringParam(params, 'url', { required: true });
        const includeMetadata = readBooleanParam(params, 'includeMetadata', { defaultValue: true }) ?? true;
        const includeScreenshot = readBooleanParam(params, 'includeScreenshot', { defaultValue: false }) ?? false;
        const maxLength = readNumberParam(params, 'maxLength', { integer: true }) ?? config?.maxLength ?? 50000;
        const selector = readStringParam(params, 'selector');

        try {
          new URL(url);
        } catch {
          return jsonResult({
            status: 'error',
            error: 'Invalid URL provided',
          });
        }

        const cacheKey = buildCacheKey(url, selector, includeScreenshot);
        const cached = readCache(FETCH_CACHE, cacheKey);
        if (cached) {
          return jsonResult({ ...cached.value, cached: true });
        }

        const result = await scrapeViaMainProcess({
          url,
          includeMetadata,
          includeScreenshot,
          maxLength: Math.min(maxLength, MAX_CONTENT_LENGTH),
          selector,
        });

        if (result.status !== 'error') {
          writeCache(
            FETCH_CACHE,
            cacheKey,
            result,
            resolveCacheTtlMs(config?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
          );
        }

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
