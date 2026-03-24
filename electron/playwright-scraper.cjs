/* eslint-disable no-console */
/**
 * Playwright-powered web scraping service.
 * Centralizes navigation, rendering, extraction and screenshot generation in main.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { extractContentFromHtml } = require('./html-content-extractor.cjs');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const DEFAULT_NAVIGATION_TIMEOUT = 30000;
const DEFAULT_NETWORK_IDLE_TIMEOUT = 5000;
const DEFAULT_POST_LOAD_DELAY = 1200;
const DEFAULT_MAX_CONTENT_LENGTH = 50000;
const DEFAULT_SEARCH_RESULT_COUNT = 5;
const DEFAULT_SEARCH_ENGINE = 'duckduckgo';
const SEARCH_FALLBACK_ENGINE = 'bing';

const CONSENT_BUTTON_TEXTS = [
  'accept',
  'agree',
  'i agree',
  'allow',
  'ok',
  'acceptar',
  'aceptar',
  'consent',
  'allow all',
  'accept all',
  'got it',
  'understand',
];

const API_DOMAINS = [
  'firebaseio.com',
  'api.github.com',
  'api.twitter.com',
  'api.reddit.com',
  'newsapi.org',
  'api.the-odds-api.com',
];

const API_PATTERNS = [
  /\/v\d+\/.*\.json$/i,
  /\/api\//i,
  /\.json$/i,
  /\/v0\/.*\.json$/i,
  /\/graphql$/i,
  /\/rest\//i,
];

let browserPromise = null;
let resolvedBrowsersRoot = null;

function isRetryableBrowserError(error) {
  const message = error?.message || String(error);
  return (
    message.includes('Target page, context or browser has been closed') ||
    message.includes('Browser has been closed') ||
    message.includes('browserType.launch') ||
    message.includes('Page crashed') ||
    message.includes('Navigation failed because page crashed')
  );
}

function isLikelyApiUrl(url) {
  try {
    const parsed = new URL(url);
    if (API_DOMAINS.some((domain) => parsed.hostname.includes(domain))) {
      return true;
    }

    return API_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

function configurePlaywrightBrowserPath() {
  if (resolvedBrowsersRoot) return resolvedBrowsersRoot;

  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'playwright-browsers'));
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright-core', '.local-browsers'),
    );
  }
  candidates.push(path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = candidate;
      resolvedBrowsersRoot = candidate;
      return candidate;
    }
  }

  return undefined;
}

function resolveExecutableFromDir(browserDir) {
  const headlessShellMacArm64 = path.join(
    browserDir,
    'chrome-headless-shell-mac-arm64',
    'chrome-headless-shell',
  );
  const chromeTestingMacArm64 = path.join(
    browserDir,
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  );
  const headlessShellMac = path.join(browserDir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell');
  const chromeTestingMac = path.join(
    browserDir,
    'chrome-mac-x64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  );
  const headlessShellLinux = path.join(browserDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  const chromeTestingLinux = path.join(browserDir, 'chrome-linux64', 'chrome');
  const headlessShellWin = path.join(browserDir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  const chromeTestingWin = path.join(browserDir, 'chrome-win64', 'chrome.exe');

  const candidates = [
    chromeTestingMacArm64,
    headlessShellMacArm64,
    chromeTestingMac,
    headlessShellMac,
    chromeTestingLinux,
    headlessShellLinux,
    chromeTestingWin,
    headlessShellWin,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveChromiumExecutablePath() {
  const browsersRoot = configurePlaywrightBrowserPath();
  if (!browsersRoot || !fs.existsSync(browsersRoot)) {
    return undefined;
  }

  const installedEntries = fs
    .readdirSync(browsersRoot)
    .filter((name) => name.startsWith('chromium_headless_shell-') || name.startsWith('chromium-'))
    .sort()
    .reverse();

  for (const entry of installedEntries) {
    const executable = resolveExecutableFromDir(path.join(browsersRoot, entry));
    if (executable) {
      return executable;
    }
  }

  return undefined;
}

async function getBrowser() {
  if (browserPromise) {
    return browserPromise;
  }

  const executablePath = resolveChromiumExecutablePath();

  browserPromise = chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
    ],
  });

  try {
    const browser = await browserPromise;
    browser.on('disconnected', () => {
      browserPromise = null;
    });
    return browser;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

async function close() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (error) {
    console.warn('[PlaywrightScraper] Browser close failed:', error?.message || error);
  } finally {
    browserPromise = null;
  }
}

async function withBrowserRetry(operation, request) {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableBrowserError(error)) {
      throw error;
    }

    console.warn('[PlaywrightScraper] Retrying after browser failure for URL:', request.url);
    await close();
    return await operation();
  }
}

function normalizeRequest(input) {
  if (typeof input === 'string') {
    return {
      url: input,
      includeScreenshot: true,
      includeMetadata: true,
      maxLength: DEFAULT_MAX_CONTENT_LENGTH,
    };
  }

  if (!input || typeof input !== 'object') {
    throw new Error('Invalid scrape request');
  }

  const maxLength = Math.min(
    Math.max(1000, Number.parseInt(String(input.maxLength ?? DEFAULT_MAX_CONTENT_LENGTH), 10) || DEFAULT_MAX_CONTENT_LENGTH),
    100000,
  );

  return {
    url: input.url,
    selector: typeof input.selector === 'string' ? input.selector : undefined,
    includeScreenshot: input.includeScreenshot !== false,
    includeMetadata: input.includeMetadata !== false,
    maxLength,
    timeoutMs:
      Math.min(
        Math.max(5000, Number.parseInt(String(input.timeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT), 10) || DEFAULT_NAVIGATION_TIMEOUT),
        120000,
      ),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : DEFAULT_USER_AGENT,
  };
}

function normalizeSearchRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid search request');
  }

  return {
    query: typeof input.query === 'string' ? input.query.trim() : '',
    count: Math.min(
      Math.max(1, Number.parseInt(String(input.count ?? DEFAULT_SEARCH_RESULT_COUNT), 10) || DEFAULT_SEARCH_RESULT_COUNT),
      10,
    ),
    country: typeof input.country === 'string' ? input.country.trim().toUpperCase() : '',
    searchLang: typeof input.searchLang === 'string' ? input.searchLang.trim().toLowerCase() : '',
    freshness: typeof input.freshness === 'string' ? input.freshness.trim().toLowerCase() : '',
    timeoutMs: Math.min(
      Math.max(5000, Number.parseInt(String(input.timeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT), 10) || DEFAULT_NAVIGATION_TIMEOUT),
      120000,
    ),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : DEFAULT_USER_AGENT,
  };
}

function resolveDuckDuckGoRegion(country, searchLang) {
  const normalizedCountry = country || 'us';
  const normalizedLang = searchLang || 'en';
  return `${normalizedCountry.toLowerCase()}-${normalizedLang}`;
}

function resolveDuckDuckGoFreshness(freshness) {
  switch ((freshness || '').toLowerCase()) {
    case 'pd':
      return 'd';
    case 'pw':
      return 'w';
    case 'pm':
      return 'm';
    case 'py':
      return 'y';
    default:
      return '';
  }
}

function resolveSearchResultUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    if (
      parsed.hostname.endsWith('bing.com') &&
      parsed.pathname.startsWith('/ck/')
    ) {
      const encoded = parsed.searchParams.get('u');
      if (encoded) {
        const normalized = encoded.startsWith('a1')
          ? encoded.slice(2)
          : encoded.startsWith('a')
            ? encoded.slice(1)
            : encoded;
        try {
          return Buffer.from(normalized, 'base64url').toString('utf8');
        } catch {
          // Ignore invalid redirect payloads and fall back to the original URL.
        }
      }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Ignore and fall back to the raw value.
  }
  return rawUrl;
}

function resolveSearchSiteName(url) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

async function dismissCookieBanners(page) {
  try {
    await page.evaluate((buttonTexts) => {
      const bannerSelectors = [
        '[class*="cookie"]',
        '[id*="cookie"]',
        '[class*="consent"]',
        '[id*="consent"]',
        '[class*="gdpr"]',
        '[class*="banner"]',
        '[class*="privacy"]',
        '[role="dialog"]',
        '.modal',
        '[data-testid*="cookie"]',
        '[data-testid*="consent"]',
      ];

      const buttons = document.querySelectorAll('button, [role="button"], a, input[type="submit"]');
      for (const button of buttons) {
        const text = (button.innerText || button.textContent || button.value || '').trim().toLowerCase();
        if (buttonTexts.some((entry) => text.includes(entry))) {
          try {
            button.click();
          } catch {
            // Ignore.
          }
        }
      }

      for (const selector of bannerSelectors) {
        try {
          const nodes = document.querySelectorAll(selector);
          nodes.forEach((node) => node.remove());
        } catch {
          // Ignore invalid selectors generated by sites.
        }
      }
    }, CONSENT_BUTTON_TEXTS);
  } catch (error) {
    console.warn('[PlaywrightScraper] Failed to dismiss cookie banners:', error?.message || error);
  }
}

async function autoScroll(page) {
  try {
    if (page.isClosed()) return;
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let currentStep = 0;
        const maxSteps = 10;
        const distance = Math.max(window.innerHeight, 600);
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          currentStep += 1;

          const reachedBottom =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 20;

          if (currentStep >= maxSteps || reachedBottom) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
      window.scrollTo(0, 0);
    });
  } catch (error) {
    if (!page.isClosed()) {
      console.warn('[PlaywrightScraper] Auto-scroll failed:', error?.message || error);
    }
  }
}

async function extractPageMetadata(page) {
  try {
    return await page.evaluate(() => {
      const getMeta = (selector) => {
        const element = document.querySelector(selector);
        return element?.getAttribute('content') || element?.content || undefined;
      };

      return {
        title: getMeta('meta[property="og:title"]') || document.title || undefined,
        description:
          getMeta('meta[property="og:description"]') ||
          getMeta('meta[name="description"]') ||
          getMeta('meta[name="twitter:description"]') ||
          undefined,
        image:
          getMeta('meta[property="og:image"]') ||
          getMeta('meta[name="twitter:image"]') ||
          undefined,
        author:
          getMeta('meta[name="author"]') ||
          getMeta('meta[property="article:author"]') ||
          undefined,
        section: getMeta('meta[property="article:section"]') || undefined,
        tags: getMeta('meta[property="article:tag"]') || undefined,
        published_date:
          getMeta('meta[property="article:published_time"]') ||
          document.querySelector('time[datetime]')?.getAttribute('datetime') ||
          undefined,
        modified_date:
          getMeta('meta[property="article:modified_time"]') || undefined,
        canonical_url:
          document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined,
        siteName: getMeta('meta[property="og:site_name"]') || undefined,
      };
    });
  } catch (error) {
    console.warn('[PlaywrightScraper] Metadata extraction failed:', error?.message || error);
    return {};
  }
}

async function fetchApiResponse(request) {
  const response = await fetch(request.url, {
    method: 'GET',
    headers: {
      'User-Agent': request.userAgent,
      Accept: 'application/json,text/json,*/*',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  let formattedBody = body;

  if (contentType.includes('application/json')) {
    try {
      formattedBody = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Keep raw body if JSON parsing fails.
    }
  }

  const finalUrl = response.url || request.url;

  return {
    success: true,
    url: finalUrl,
    finalUrl,
    title: finalUrl,
    content: formattedBody.slice(0, request.maxLength),
    metadata: request.includeMetadata
      ? {
          title: finalUrl,
          description: undefined,
          author: undefined,
          siteName: new URL(finalUrl).hostname,
          url: finalUrl,
          contentType,
        }
      : undefined,
    screenshot: null,
    screenshotFormat: 'jpeg',
    warnings: [],
  };
}

async function scrapeUrl(input) {
  const request = normalizeRequest(input);

  if (!request.url || typeof request.url !== 'string') {
    return {
      success: false,
      url: '',
      error: 'Invalid URL: missing url',
      title: null,
      content: null,
      metadata: {},
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  try {
    new URL(request.url);
  } catch {
    return {
      success: false,
      url: request.url,
      error: `Invalid URL: ${request.url}`,
      title: null,
      content: null,
      metadata: { url: request.url },
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  if (isLikelyApiUrl(request.url)) {
    try {
      return await fetchApiResponse(request);
    } catch (error) {
      return {
        success: false,
        url: request.url,
        error: error?.message || String(error),
        title: null,
        content: null,
        metadata: { url: request.url },
        screenshot: null,
        screenshotFormat: 'jpeg',
      };
    }
  }

  try {
    return await withBrowserRetry(async () => {
      let context;
      let page;

      try {
        const browser = await getBrowser();
        context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          userAgent: request.userAgent,
          javaScriptEnabled: true,
          locale: 'en-US',
          bypassCSP: false,
        });
        page = await context.newPage();
        page.setDefaultNavigationTimeout(request.timeoutMs);
        page.setDefaultTimeout(request.timeoutMs);

        await page.goto(request.url, {
          waitUntil: 'domcontentloaded',
          timeout: request.timeoutMs,
        });

        try {
          await page.waitForLoadState('networkidle', { timeout: Math.min(DEFAULT_NETWORK_IDLE_TIMEOUT, request.timeoutMs) });
        } catch {
          // Many sites never become idle; keep going with hydrated DOM.
        }

        if (!page.isClosed()) {
          await dismissCookieBanners(page);
          await autoScroll(page);
          await page.waitForTimeout(DEFAULT_POST_LOAD_DELAY);
        }

        const finalUrl = page.url();
        const html = await page.content();
        const metadataHints = request.includeMetadata ? await extractPageMetadata(page) : {};
        const extracted = extractContentFromHtml({
          html,
          url: request.url,
          finalUrl,
          selector: request.selector,
          metadataHints,
        });

        let screenshot = null;
        let screenshotFormat = 'jpeg';
        if (request.includeScreenshot && !page.isClosed()) {
          try {
            screenshot = (await page.screenshot({
              type: 'jpeg',
              quality: 85,
              fullPage: false,
            })).toString('base64');
          } catch (error) {
            screenshotFormat = 'png';
            console.warn('[PlaywrightScraper] JPEG screenshot failed, retrying with PNG:', error?.message || error);
            screenshot = (await page.screenshot({
              type: 'png',
              fullPage: false,
            })).toString('base64');
          }
        }

        const content = String(extracted.content || '').slice(0, request.maxLength);

        return {
          success: true,
          url: finalUrl,
          finalUrl,
          title: extracted.title || metadataHints.title || finalUrl,
          content,
          metadata: request.includeMetadata ? extracted.metadata : undefined,
          screenshot,
          screenshotFormat,
          warnings: extracted.warnings,
          excerpt: extracted.excerpt,
        };
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }, request);
  } catch (error) {
    console.error('[PlaywrightScraper] Error scraping URL:', request.url, error);
    return {
      success: false,
      url: request.url,
      error: error?.message || String(error),
      title: null,
      content: null,
      metadata: { url: request.url },
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }
}

async function searchWeb(input) {
  const request = normalizeSearchRequest(input);
  if (!request.query) {
    return {
      success: false,
      provider: 'playwright',
      engine: DEFAULT_SEARCH_ENGINE,
      query: '',
      count: 0,
      results: [],
      error: 'Query is required',
    };
  }

  try {
    return await withBrowserRetry(async () => {
      let context;
      let page;

      try {
        const browser = await getBrowser();
        context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
          userAgent: request.userAgent,
          javaScriptEnabled: true,
          locale: request.searchLang || 'en-US',
          bypassCSP: false,
        });
        page = await context.newPage();
        page.setDefaultNavigationTimeout(request.timeoutMs);
        page.setDefaultTimeout(request.timeoutMs);

        const searchEngines = [
          {
            engine: DEFAULT_SEARCH_ENGINE,
            url: (() => {
              const searchUrl = new URL('https://duckduckgo.com/html/');
              searchUrl.searchParams.set('q', request.query);
              searchUrl.searchParams.set('kl', resolveDuckDuckGoRegion(request.country, request.searchLang));
              const freshness = resolveDuckDuckGoFreshness(request.freshness);
              if (freshness) searchUrl.searchParams.set('df', freshness);
              return searchUrl;
            })(),
            waitForSelector: '.result, .web-result',
            anomalySelectors: ['.anomaly-modal__modal', '#challenge-form', 'form[action*="anomaly.js"]'],
            extractSelector: '.result, .web-result',
            extract: (nodes, max) => nodes.slice(0, max).map((node) => {
              const titleLink =
                node.querySelector('.result__title a') ||
                node.querySelector('.result__a') ||
                node.querySelector('h2 a') ||
                node.querySelector('a[href]');
              const snippetNode =
                node.querySelector('.result__snippet') ||
                node.querySelector('.result-snippet') ||
                node.querySelector('.result__extras__url') ||
                node.querySelector('p');
              const displayedUrlNode =
                node.querySelector('.result__url') ||
                node.querySelector('.result__extras__url') ||
                node.querySelector('.result__hostname');

              return {
                title: (titleLink?.textContent || '').trim(),
                url: titleLink?.getAttribute('href') || '',
                description: (snippetNode?.textContent || '').trim(),
                displayedUrl: (displayedUrlNode?.textContent || '').trim(),
              };
            }),
          },
          {
            engine: SEARCH_FALLBACK_ENGINE,
            url: (() => {
              const searchUrl = new URL('https://www.bing.com/search');
              searchUrl.searchParams.set('q', request.query);
              searchUrl.searchParams.set('setlang', request.searchLang || 'en-US');
              return searchUrl;
            })(),
            waitForSelector: 'li.b_algo, .b_algo',
            anomalySelectors: [],
            extractSelector: 'li.b_algo, .b_algo',
            extract: (nodes, max) => nodes.slice(0, max).map((node) => {
              const titleLink =
                node.querySelector('h2 a') ||
                node.querySelector('a[href]');
              const snippetNode =
                node.querySelector('.b_caption p') ||
                node.querySelector('.b_snippet') ||
                node.querySelector('p');
              const displayedUrlNode =
                node.querySelector('cite') ||
                node.querySelector('.tptt') ||
                node.querySelector('.b_attribution');

              return {
                title: (titleLink?.textContent || '').trim(),
                url: titleLink?.getAttribute('href') || '',
                description: (snippetNode?.textContent || '').trim(),
                displayedUrl: (displayedUrlNode?.textContent || '').trim(),
              };
            }),
          },
        ];

        let resolvedEngine = DEFAULT_SEARCH_ENGINE;
        let results = [];
        let fallbackReason = '';

        for (const engine of searchEngines) {
          resolvedEngine = engine.engine;
          await page.goto(engine.url.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: request.timeoutMs,
          });

          let sawResults = false;
          try {
            await page.waitForSelector(engine.waitForSelector, { timeout: Math.min(10000, request.timeoutMs) });
            sawResults = true;
          } catch {
            await dismissCookieBanners(page);
          }

          const isBlocked = engine.anomalySelectors.length > 0
            ? await page.evaluate((selectors) => selectors.some((selector) => Boolean(document.querySelector(selector))), engine.anomalySelectors)
            : false;

          if (isBlocked) {
            fallbackReason = `${engine.engine} returned an anti-bot challenge`;
            continue;
          }

          const rawResults = await page.$$eval(
            engine.extractSelector,
            engine.extract,
            request.count,
          );

          results = rawResults
            .map((entry) => {
              const url = resolveSearchResultUrl(entry.url);
              return {
                title: entry.title || url,
                url,
                description: entry.description,
                displayedUrl: entry.displayedUrl || url,
                siteName: resolveSearchSiteName(url),
              };
            })
            .filter((entry) => Boolean(entry.url));

          if (results.length > 0 || sawResults || engine.engine === SEARCH_FALLBACK_ENGINE) {
            break;
          }
        }

        if (results.length === 0 && fallbackReason) {
          return {
            success: false,
            provider: 'playwright',
            engine: resolvedEngine,
            query: request.query,
            count: 0,
            results: [],
            error: fallbackReason,
          };
        }

        return {
          success: true,
          provider: 'playwright',
          engine: resolvedEngine,
          query: request.query,
          count: results.length,
          results,
        };
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }, { url: `search:${request.query}` });
  } catch (error) {
    console.error('[PlaywrightScraper] Error searching web:', request.query, error);
    return {
      success: false,
      provider: 'playwright',
      engine: DEFAULT_SEARCH_ENGINE,
      query: request.query,
      count: 0,
      results: [],
      error: error?.message || String(error),
    };
  }
}

module.exports = {
  close,
  scrapeUrl,
  searchWeb,
};
