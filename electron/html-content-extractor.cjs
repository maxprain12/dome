/* eslint-disable no-console */
/**
 * HTML content extraction utilities for web scraping.
 * Keeps DOM parsing and markdown conversion independent from the browser engine.
 */

const { Readability } = require('@mozilla/readability');
const { DOMParser } = require('linkedom');
const TurndownService = require('turndown');

/** Remove CMP / cookie UI roots; avoid stripping every [role="dialog"] or generic ".modal". */
const CONSENT_SPECIFIC_SELECTORS = [
  '[class*="onetrust"]',
  '[id*="onetrust"]',
  '[class*="cookiebot"]',
  '[id*="cookiebot"]',
  '[id*="CybotCookiebot"]',
  '[class*="CybotCookiebot"]',
  '[id*="truste"]',
  '[class*="trustarc"]',
  '[id*="didomi"]',
  '[class*="didomi"]',
  '[id*="usercentrics"]',
  '[class*="usercentrics"]',
  '[class*="qc-cmp"]',
  '[id*="qc-cmp"]',
  '[class*="cookie-consent"]',
  '[id*="cookie-consent"]',
  '[class*="consent-banner"]',
  '[id*="consent-banner"]',
  '[class*="cookie-banner"]',
  '[id*="cookie-banner"]',
  '[data-testid*="cookie"]',
  '[data-testid*="consent"]',
  '[class*="gdpr"]',
  '[id*="gdpr"]',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[id*="consent"]',
  '[class*="privacy"]',
  '[id*="privacy"]',
];

const STRUCTURAL_SELECTORS = [
  'script',
  'style',
  'noscript',
  'nav',
  'footer',
  'aside',
  'form',
  'iframe',
  'svg',
];

const BOILERPLATE_KEYWORDS = [
  'cookies',
  'cookie policy',
  'privacy policy',
  'we use cookies',
  'improve our services',
  'personalize your experience',
  'consent',
  'gdpr',
  'accept cookies',
  'cookie settings',
  'cookie preferences',
  'subscribe to our newsletter',
  'sign up for',
  'join our mailing list',
  'this site uses cookies',
  'by continuing to use',
  'we and our partners',
];

const BOILERPLATE_STRONG_SIGNALS = [
  'accept all cookies',
  'manage preferences',
  'cookie consent',
  'essential and non-essential cookies',
];

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  service.remove(['script', 'style', 'noscript', 'iframe', 'svg']);

  return service;
}

function parseDocument(html, url) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (url) {
    document.URL = url;
  }
  return document;
}

function removeMatchingElements(document, selectors) {
  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => node.remove());
    } catch (error) {
      console.warn('[HtmlExtractor] Invalid selector skipped:', selector, error?.message || error);
    }
  }
}

function removeConsentLikeDialogs(document) {
  const hints = ['cookie', 'consent', 'privacy', 'gdpr', 'similar technologies', 'preferences'];
  const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal');
  for (const el of dialogs) {
    const t = (el.textContent || '').toLowerCase();
    const hits = hints.filter((h) => t.includes(h)).length;
    if (hits >= 2 || (hits >= 1 && t.length < 720)) {
      el.remove();
    }
  }
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function filterBoilerplate(content) {
  if (!content || typeof content !== 'string') return '';

  const paragraphs = content.split(/\n\s*\n/);
  const filtered = paragraphs.filter((paragraph) => {
    const text = paragraph.trim();
    if (!text) return false;

    const lowered = text.toLowerCase();
    if (BOILERPLATE_STRONG_SIGNALS.some((signal) => lowered.includes(signal))) {
      return false;
    }

    const matches = BOILERPLATE_KEYWORDS.filter((keyword) => lowered.includes(keyword));
    if (matches.length >= 2) return false;
    if (text.length < 80 && matches.length >= 1) return false;

    return true;
  });

  return normalizeWhitespace(filtered.join('\n\n'));
}

function parseJsonLd(document) {
  const result = {
    author: undefined,
    publishedDate: undefined,
    modifiedDate: undefined,
    image: undefined,
  };

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent || 'null');
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isArticle = type === 'Article' || type === 'NewsArticle' || type === 'BlogPosting' || item.datePublished;
        if (!isArticle) continue;

        if (!result.author) {
          if (typeof item.author === 'string') {
            result.author = item.author;
          } else if (item.author && typeof item.author.name === 'string') {
            result.author = item.author.name;
          }
        }
        if (!result.publishedDate && typeof item.datePublished === 'string') {
          result.publishedDate = item.datePublished;
        }
        if (!result.modifiedDate && typeof item.dateModified === 'string') {
          result.modifiedDate = item.dateModified;
        }
        if (!result.image) {
          if (typeof item.image === 'string') {
            result.image = item.image;
          } else if (Array.isArray(item.image) && typeof item.image[0] === 'string') {
            result.image = item.image[0];
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return result;
}

function extractMetadata(document, finalUrl, metadataHints = {}) {
  const getMeta = (selector) => {
    const element = document.querySelector(selector);
    return element?.getAttribute('content') || element?.content || undefined;
  };

  const jsonLd = parseJsonLd(document);
  const siteName = getMeta('meta[property="og:site_name"]');

  return {
    title: metadataHints.title || getMeta('meta[property="og:title"]') || document.title || undefined,
    description:
      metadataHints.description ||
      getMeta('meta[property="og:description"]') ||
      getMeta('meta[name="description"]') ||
      getMeta('meta[name="twitter:description"]') ||
      undefined,
    image:
      metadataHints.image ||
      getMeta('meta[property="og:image"]') ||
      getMeta('meta[name="twitter:image"]') ||
      jsonLd.image ||
      undefined,
    author:
      metadataHints.author ||
      getMeta('meta[name="author"]') ||
      getMeta('meta[property="article:author"]') ||
      jsonLd.author ||
      undefined,
    siteName: metadataHints.siteName || siteName || undefined,
    section: metadataHints.section || getMeta('meta[property="article:section"]') || undefined,
    tags: metadataHints.tags || getMeta('meta[property="article:tag"]') || undefined,
    published_date:
      metadataHints.published_date ||
      getMeta('meta[property="article:published_time"]') ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      jsonLd.publishedDate ||
      undefined,
    modified_date:
      metadataHints.modified_date ||
      getMeta('meta[property="article:modified_time"]') ||
      jsonLd.modifiedDate ||
      undefined,
    canonical_url:
      metadataHints.canonical_url ||
      document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
      finalUrl ||
      undefined,
    url: finalUrl,
  };
}

function createFallbackMarkdown(document, selector, warnings) {
  const turndown = createTurndownService();
  const fallbackDocument = parseDocument(document.documentElement.outerHTML, document.URL);

  removeMatchingElements(fallbackDocument, STRUCTURAL_SELECTORS);
  removeMatchingElements(fallbackDocument, CONSENT_SPECIFIC_SELECTORS);
  removeConsentLikeDialogs(fallbackDocument);

  let root = fallbackDocument.body;
  if (selector) {
    try {
      const selected = fallbackDocument.querySelector(selector);
      if (selected) {
        root = selected;
      } else {
        warnings.push(`Selector "${selector}" no encontró contenido en el DOM final.`);
      }
    } catch {
      warnings.push(`Selector "${selector}" no es válido.`);
    }
  }

  const markdown = turndown.turndown(root?.innerHTML || '');
  const plainText = normalizeWhitespace(root?.textContent || '');

  return {
    markdown: filterBoilerplate(normalizeWhitespace(markdown)) || plainText,
    textContent: plainText,
  };
}

function assessConsentDominated(content, title) {
  const combined = `${title || ''}\n${content || ''}`.toLowerCase();
  const trimmed = combined.trim();
  if (trimmed.length < 80) return false;

  const strong = [
    'accept all cookies',
    'cookie preferences',
    'manage preferences',
    'cookie consent',
    'we use cookies and similar',
    'your privacy preferences',
    'manage cookie preferences',
  ];
  const strongHits = strong.filter((s) => combined.includes(s)).length;
  const head = combined.slice(0, 900);
  const headStrongHits = strong.filter((s) => head.includes(s)).length;

  if (strongHits >= 2) return true;
  if (headStrongHits >= 1 && trimmed.length < 1500) return true;

  const soft = ['cookies', 'consent', 'privacy policy', 'essential cookies', 'partners'];
  const softInHead = soft.filter((s) => head.includes(s)).length;
  if (softInHead >= 3 && trimmed.length < 2200) return true;

  return false;
}

function extractContentFromHtml({ html, url, finalUrl, selector, metadataHints = {} }) {
  const document = parseDocument(html, finalUrl || url);
  const warnings = [];

  const metadata = extractMetadata(document, finalUrl || url, metadataHints);
  let title = metadata.title || document.title || null;
  let content = '';
  let excerpt;

  try {
    const readabilityDocument = parseDocument(html, finalUrl || url);

    removeMatchingElements(readabilityDocument, STRUCTURAL_SELECTORS);
    removeMatchingElements(readabilityDocument, CONSENT_SPECIFIC_SELECTORS);
    removeConsentLikeDialogs(readabilityDocument);

    let article;
    if (selector) {
      try {
        const selected = readabilityDocument.querySelector(selector);
        if (selected) {
          const turndown = createTurndownService();
          const markdown = turndown.turndown(selected.outerHTML || selected.innerHTML || '');
          const plainText = normalizeWhitespace(selected.textContent || '');
          content = filterBoilerplate(normalizeWhitespace(markdown)) || plainText;
          excerpt = plainText.slice(0, 280);
        } else {
          warnings.push(`Selector "${selector}" no encontró contenido. Usando extracción automática.`);
        }
      } catch {
        warnings.push(`Selector "${selector}" no es válido. Usando extracción automática.`);
      }
    }

    if (!content) {
      article = new Readability(readabilityDocument, {
        charThreshold: 200,
        keepClasses: false,
      }).parse();

      if (article?.content) {
        const turndown = createTurndownService();
        content = filterBoilerplate(normalizeWhitespace(turndown.turndown(article.content)));
        title = article.title || title;
        excerpt = article.excerpt || excerpt;
      }
    }

  } catch (error) {
    warnings.push(`Readability falló: ${error?.message || error}`);
  }

  if (!content) {
    const fallback = createFallbackMarkdown(document, selector, warnings);
    content = fallback.markdown;
    excerpt = excerpt || fallback.textContent.slice(0, 280);
  }

  const normalizedContent = normalizeWhitespace(content);
  const consentLikelyDominated = assessConsentDominated(normalizedContent, title);
  if (consentLikelyDominated) {
    warnings.push(
      'El texto extraído parece dominado por avisos de cookies, consentimiento o privacidad.',
    );
  }

  return {
    title,
    content: normalizedContent,
    metadata,
    warnings,
    excerpt: excerpt ? normalizeWhitespace(excerpt) : undefined,
    consentLikelyDominated,
  };
}

module.exports = {
  extractContentFromHtml,
  assessConsentDominated,
};
