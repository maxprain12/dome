/**
 * Web Fetch Tool
 * 
 * Fetch and extract content from web pages.
 * Based on clawdbot's web fetch functionality.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import {
  jsonResult,
  readStringParam,
  readBooleanParam,
  readNumberParam,
  readCache,
  writeCache,
  normalizeCacheKey,
  withTimeout,
  resolveTimeoutSeconds,
  resolveCacheTtlMs,
  readResponseText,
  type CacheEntry,
} from './common';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_CACHE_TTL_MINUTES = 60;
const MAX_CONTENT_LENGTH = 100000; // 100KB text limit

// Common user agent for web requests
const USER_AGENT = 'Mozilla/5.0 (compatible; Dome/1.0; +https://dome.app)';

// =============================================================================
// Cache
// =============================================================================

const FETCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

// =============================================================================
// Schema
// =============================================================================

const WebFetchSchema = Type.Object({
  url: Type.String({ description: 'URL to fetch content from.' }),
  extractText: Type.Optional(
    Type.Boolean({
      description: 'Extract text content only, removing HTML tags. Default: true.',
    }),
  ),
  includeMetadata: Type.Optional(
    Type.Boolean({
      description: 'Include page metadata (title, description, etc.). Default: true.',
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
      description: 'CSS selector to extract specific content (e.g., "article", "main", ".content").',
    }),
  ),
});

// =============================================================================
// Configuration
// =============================================================================

export interface WebFetchConfig {
  /** Timeout in seconds */
  timeoutSeconds?: number;
  /** Cache TTL in minutes */
  cacheTtlMinutes?: number;
  /** Maximum content length */
  maxLength?: number;
  /** Custom user agent */
  userAgent?: string;
}

// =============================================================================
// HTML Processing
// =============================================================================

/**
 * Extract text content from HTML, removing tags.
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  
  // Replace common block elements with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s+/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

/**
 * Decode common HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&hellip;': '…',
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'gi'), char);
  }
  
  // Decode numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
  
  return decoded;
}

/**
 * Extract metadata from HTML.
 */
function extractMetadata(html: string, url: string): Record<string, string | undefined> {
  const metadata: Record<string, string | undefined> = {};
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    metadata.title = decodeHtmlEntities(titleMatch[1].trim());
  }
  
  // Extract meta tags
  const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["']\s+(?:[^>]*?\s+)?content=["']([^"']*)["'][^>]*>/gi;
  let match;
  
  while ((match = metaRegex.exec(html)) !== null) {
    const name = match[1]?.toLowerCase();
    const content = decodeHtmlEntities(match[2]?.trim() ?? '');
    if (!name) continue;
    
    if (name === 'description' || name === 'og:description') {
      metadata.description = metadata.description || content;
    } else if (name === 'author' || name === 'og:author') {
      metadata.author = metadata.author || content;
    } else if (name === 'og:title') {
      metadata.ogTitle = content;
    } else if (name === 'og:image') {
      metadata.image = content;
    } else if (name === 'og:site_name') {
      metadata.siteName = content;
    } else if (name === 'article:published_time' || name === 'date') {
      metadata.publishedDate = content;
    }
  }
  
  // Extract canonical URL
  const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  if (canonicalMatch) {
    metadata.canonicalUrl = canonicalMatch[1];
  }
  
  // Add source URL
  metadata.sourceUrl = url;
  
  // Try to extract site name from URL
  if (!metadata.siteName) {
    try {
      metadata.siteName = new URL(url).hostname;
    } catch {
      // Ignore
    }
  }
  
  return metadata;
}

/**
 * Extract content using a CSS selector (simplified).
 */
function extractBySelector(html: string, selector: string): string | null {
  // Simplified selector matching for common cases
  // For full CSS selector support, would need a DOM parser
  
  // Handle class selectors (.classname)
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    const regex = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
    const match = html.match(regex);
    return match?.[1] ?? null;
  }
  
  // Handle ID selectors (#id)
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    const regex = new RegExp(`<[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
    const match = html.match(regex);
    return match?.[1] ?? null;
  }
  
  // Handle tag selectors (article, main, etc.)
  const tagRegex = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'i');
  const tagMatch = html.match(tagRegex);
  return tagMatch?.[1] ?? null;
}

// =============================================================================
// Main Fetch Function
// =============================================================================

async function fetchWebContent(params: {
  url: string;
  extractText: boolean;
  includeMetadata: boolean;
  maxLength: number;
  selector?: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  userAgent: string;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `${params.url}:${params.extractText}:${params.selector || 'none'}`,
  );
  
  const cached = readCache(FETCH_CACHE, cacheKey);
  if (cached) return { ...cached.value, cached: true };

  const start = Date.now();

  const response = await fetch(params.url, {
    method: 'GET',
    headers: {
      'User-Agent': params.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const html = await response.text();
  
  let result: Record<string, unknown> = {
    url: params.url,
    finalUrl: response.url,
    contentType,
    statusCode: response.status,
  };

  // Extract metadata if requested
  if (params.includeMetadata) {
    result.metadata = extractMetadata(html, params.url);
  }

  // Extract content
  let content = html;
  
  // Apply selector if provided
  if (params.selector) {
    const selected = extractBySelector(html, params.selector);
    if (selected) {
      content = selected;
    } else {
      result.selectorWarning = `Selector "${params.selector}" did not match any content`;
    }
  }

  // Extract text if requested
  if (params.extractText) {
    content = extractTextFromHtml(content);
  }

  // Truncate if necessary
  if (content.length > params.maxLength) {
    content = content.slice(0, params.maxLength);
    result.truncated = true;
    result.originalLength = html.length;
  }

  result.content = content;
  result.contentLength = content.length;
  result.tookMs = Date.now() - start;

  writeCache(FETCH_CACHE, cacheKey, result, params.cacheTtlMs);
  
  return result;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a web fetch tool.
 */
export function createWebFetchTool(config?: WebFetchConfig): AnyAgentTool {
  return {
    label: 'Web Fetch',
    name: 'web_fetch',
    description: 'Fetch and extract content from a web page. Returns the page content as text, optionally with metadata like title, description, and author.',
    parameters: WebFetchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const url = readStringParam(params, 'url', { required: true });
        const extractText = readBooleanParam(params, 'extractText', { defaultValue: true }) ?? true;
        const includeMetadata = readBooleanParam(params, 'includeMetadata', { defaultValue: true }) ?? true;
        const maxLength = readNumberParam(params, 'maxLength', { integer: true }) ?? config?.maxLength ?? 50000;
        const selector = readStringParam(params, 'selector');

        // Validate URL
        try {
          new URL(url);
        } catch {
          return jsonResult({
            status: 'error',
            error: 'Invalid URL provided',
          });
        }

        const result = await fetchWebContent({
          url,
          extractText,
          includeMetadata,
          maxLength: Math.min(maxLength, MAX_CONTENT_LENGTH),
          selector,
          timeoutSeconds: resolveTimeoutSeconds(config?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
          cacheTtlMs: resolveCacheTtlMs(config?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
          userAgent: config?.userAgent ?? USER_AGENT,
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
