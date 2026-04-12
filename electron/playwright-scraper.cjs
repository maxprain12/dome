/* eslint-disable no-console */
/**
 * Playwright-powered web scraping service.
 * Centralizes navigation, rendering, extraction and screenshot generation in main.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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

/**
 * Cookie / CMP flow (post-navigation, pre-extraction)
 * 1) CMP-specific "accept all" selectors (main frame + iframes where needed)
 * 2) Role-based accept in known CMP containers
 * 3) Heuristic clicks scoped to consent-like roots only (no global "ok/allow")
 * 4) verifyConsentState + optional retry
 *
 * Previously: blind clicks on every button matching vague strings, then removal of
 * all [role="dialog"] / .modal — prone to scraping the consent UI itself.
 */

/** Text snippets for buttons/links *inside* consent-like containers only */
const SCOPED_CONSENT_BUTTON_TEXTS = [
  'accept all',
  'allow all',
  'accept all cookies',
  'allow all cookies',
  'agree to all',
  'aceptar todo',
  'aceptar todas',
  'tout accepter',
  'tout accepter et continuer',
  'i agree',
  'got it',
  'acknowledge',
  'consent',
  'accept cookies',
  'accept',
  'aceptar',
  'agree',
  'accepter',
];

const CMP_ACCEPT_CONFIG = [
  {
    id: 'sourcepoint',
    useFrames: false,
    selectors: ['#sp-cc-accept', 'button.sp_choice_all', 'button[title="Accept all cookies"]'],
  },
  {
    id: 'onetrust',
    useFrames: false,
    selectors: [
      '#onetrust-accept-btn-handler',
      'button#onetrust-accept-btn-handler',
      '.onetrust-accept-btn-handler',
    ],
  },
  {
    id: 'cookiebot',
    useFrames: true,
    selectors: [
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
      'button[data-cookieaction="accept"]',
    ],
  },
  {
    id: 'usercentrics',
    useFrames: false,
    selectors: [
      '[data-testid="uc-accept-all-button"]',
      '[data-testid="uc-accept-all-banner"]',
      '#uc-btn-accept-banner',
    ],
  },
  {
    id: 'didomi',
    useFrames: false,
    selectors: ['#didomi-notice-agree-button', 'button#didomi-notice-agree-button'],
  },
  {
    id: 'quantcast',
    useFrames: false,
    selectors: ['button.qc-cmp2-summary-buttons-accept'],
  },
  {
    id: 'trustarc',
    useFrames: false,
    selectors: ['#truste-consent-button', 'button#truste-consent-button', '.trustarc-agree-btn'],
  },
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
let chromiumInstallPromise = null;

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

function getUserDataPlaywrightBrowsersDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'playwright-browsers');
  } catch {
    return null;
  }
}

function resolvePlaywrightCliJs() {
  try {
    const { app } = require('electron');
    if (app?.isPackaged && process.resourcesPath) {
      const packaged = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'playwright',
        'cli.js',
      );
      if (fs.existsSync(packaged)) return packaged;
    }
  } catch {
    /* ignore */
  }
  const dev = path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js');
  return fs.existsSync(dev) ? dev : null;
}

/**
 * Run `playwright install chromium` into PLAYWRIGHT_BROWSERS_PATH using Electron's bundled Node
 * (ELECTRON_RUN_AS_NODE), so packaged apps do not need a system `node` binary.
 */
function runPlaywrightInstallChromium(targetDir) {
  const cli = resolvePlaywrightCliJs();
  if (!cli) {
    return Promise.reject(new Error('[PlaywrightScraper] playwright/cli.js not found'));
  }

  return new Promise((resolve, reject) => {
    fs.mkdirSync(targetDir, { recursive: true });
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: targetDir,
      },
      cwd: path.dirname(cli),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright install chromium exited with code ${code}`));
    });
  });
}

async function ensureChromiumInstalled() {
  if (resolveChromiumExecutablePath()) return;

  const userDir = getUserDataPlaywrightBrowsersDir();
  if (!userDir) {
    throw new Error('[PlaywrightScraper] Cannot resolve userData path for Playwright browsers');
  }

  fs.mkdirSync(userDir, { recursive: true });
  process.env.PLAYWRIGHT_BROWSERS_PATH = userDir;
  resolvedBrowsersRoot = userDir;

  if (resolveChromiumExecutablePath()) return;

  if (!chromiumInstallPromise) {
    console.log('[PlaywrightScraper] Downloading Chromium (first use, ~150–400 MB)...');
    chromiumInstallPromise = runPlaywrightInstallChromium(userDir).finally(() => {
      chromiumInstallPromise = null;
    });
  }
  await chromiumInstallPromise;

  if (!resolveChromiumExecutablePath()) {
    throw new Error(
      '[PlaywrightScraper] Chromium install finished but executable not found. Check network / disk space.',
    );
  }
}

function configurePlaywrightBrowserPath() {
  if (resolvedBrowsersRoot) return resolvedBrowsersRoot;

  const candidates = [];
  let isPackaged = false;
  try {
    const { app } = require('electron');
    isPackaged = Boolean(app?.isPackaged);
    const userBrowsers = getUserDataPlaywrightBrowsersDir();
    if (userBrowsers) {
      if (isPackaged) {
        candidates.push(userBrowsers);
      } else {
        candidates.push(path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'));
        candidates.push(userBrowsers);
      }
    }
  } catch {
    candidates.push(path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'));
  }

  if (isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'playwright-browsers'));
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright-core', '.local-browsers'),
    );
  } else if (!isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'playwright-browsers'));
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright-core', '.local-browsers'),
    );
  }

  if (!candidates.includes(path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'))) {
    candidates.push(path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
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

  await ensureChromiumInstalled();
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

async function trySelectors(page, selectors, visibleTimeout = 1500, clickTimeout = 3500) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: visibleTimeout });
      await loc.click({ timeout: clickTimeout });
      return true;
    } catch {
      try {
        const loc = page.locator(sel).first();
        const visible = await loc.isVisible().catch(() => false);
        if (visible) {
          await loc.click({ timeout: clickTimeout, force: true });
          return true;
        }
      } catch {
        // try next selector
      }
    }
  }
  return false;
}

async function trySelectorsInAllFrames(page, selectors) {
  const frames = page.frames();
  for (const frame of frames) {
    for (const sel of selectors) {
      try {
        const loc = frame.locator(sel).first();
        await loc.waitFor({ state: 'visible', timeout: 900 });
        await loc.click({ timeout: 3500 });
        return true;
      } catch {
        try {
          const loc = frame.locator(sel).first();
          const visible = await loc.isVisible().catch(() => false);
          if (visible) {
            await loc.click({ timeout: 3500, force: true });
            return true;
          }
        } catch {
          // try next
        }
      }
    }
  }
  return false;
}

async function tryAcceptAllRole(page) {
  const scopes = [
    page.locator('#onetrust-banner-sdk'),
    page.locator('#onetrust-consent-sdk'),
    page.locator('#CybotCookiebotDialog'),
    page.locator('.qc-cmp2-container'),
    page.locator('[class*="qc-cmp"]'),
  ];

  for (const scope of scopes) {
    try {
      if ((await scope.count()) === 0) continue;
      const btn = scope
        .getByRole('button', {
          name: /accept all|allow all|agree to all|aceptar todo|tout accepter/i,
        })
        .first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 4000 });
        return true;
      }
    } catch {
      // next scope
    }
  }

  try {
    const globalBtn = page
      .getByRole('button', { name: /accept all( cookies)?|allow all( cookies)?/i })
      .first();
    if (await globalBtn.isVisible({ timeout: 450 }).catch(() => false)) {
      await globalBtn.click({ timeout: 4000 });
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

async function dismissCookieBannersScoped(page) {
  try {
    await page.evaluate((buttonTexts) => {
      const containerSelectors = [
        '[id*="onetrust"]',
        '[class*="onetrust"]',
        '[id*="cookiebot"]',
        '[class*="cookiebot"]',
        '[id*="CybotCookiebot"]',
        '[id*="truste"]',
        '[class*="trustarc"]',
        '[id*="didomi"]',
        '[class*="didomi"]',
        '[id*="usercentrics"]',
        '[class*="usercentrics"]',
        '[class*="qc-cmp"]',
        '[id*="qc-cmp"]',
        '[class*="cookie-banner"]',
        '[id*="cookie-banner"]',
        '[class*="consent-banner"]',
        '[id*="consent-banner"]',
        '[data-testid*="cookie"]',
        '[data-testid*="consent"]',
        '[aria-label*="cookie" i]',
      ];

      const roots = new Set();
      for (const sel of containerSelectors) {
        try {
          document.querySelectorAll(sel).forEach((node) => roots.add(node));
        } catch {
          // invalid selector from site
        }
      }

      for (const root of roots) {
        const buttons = root.querySelectorAll('button, [role="button"], a, input[type="submit"]');
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
      }
    }, SCOPED_CONSENT_BUTTON_TEXTS);
  } catch (error) {
    console.warn('[PlaywrightScraper] Scoped cookie dismiss failed:', error?.message || error);
  }
}

async function verifyConsentState(page) {
  try {
    return await page.evaluate(() => {
      function isVisible(el) {
        if (!el) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') === 0) {
          return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 16 && r.bottom > 0 && r.right > 0;
      }

      const cmpSelectors = [
        '#onetrust-banner-sdk',
        '#onetrust-consent-sdk',
        '#CybotCookiebotDialog',
        '.qc-cmp-ui-container',
        '.qc-cmp2-container',
      ];

      let cmpVisible = false;
      for (const sel of cmpSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          cmpVisible = true;
          break;
        }
      }

      let consentDialog = false;
      for (const d of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
        if (!isVisible(d)) continue;
        const t = (d.innerText || '').toLowerCase();
        if (t.includes('cookie') || t.includes('consent') || (t.includes('privacy') && t.includes('accept'))) {
          consentDialog = true;
          break;
        }
      }

      const body = (document.body?.innerText || '').toLowerCase();
      const head = body.slice(0, 4500);
      const phrases = [
        'accept all cookies',
        'manage cookie preferences',
        'cookie settings',
        'we use cookies',
        'your cookie preferences',
        'cookie consent',
      ];
      const phraseHits = phrases.filter((p) => head.includes(p)).length;

      return { cmpVisible, consentDialog, phraseHits };
    });
  } catch (error) {
    console.warn('[PlaywrightScraper] verifyConsentState failed:', error?.message || error);
    return { cmpVisible: false, consentDialog: false, phraseHits: 0 };
  }
}

/**
 * @returns {{ strategies: string[], consentBlocked: boolean, consentSignalScore: number }}
 */
async function handleCookieConsent(page, timeoutMs) {
  const strategies = [];
  const pushStrategy = (id) => {
    if (!strategies.includes(id)) strategies.push(id);
  };

  const visibleTimeout = Math.min(2000, Math.max(800, timeoutMs / 15));
  const clickTimeout = Math.min(5000, Math.max(2000, timeoutMs / 8));

  for (const cmp of CMP_ACCEPT_CONFIG) {
    try {
      const ok = cmp.useFrames
        ? await trySelectorsInAllFrames(page, cmp.selectors)
        : await trySelectors(page, cmp.selectors, visibleTimeout, clickTimeout);
      if (ok) pushStrategy(cmp.id);
    } catch {
      // continue with next CMP
    }
  }

  if (await tryAcceptAllRole(page)) pushStrategy('accept-all-role');

  await dismissCookieBannersScoped(page);
  pushStrategy('scoped-click');

  await page.waitForTimeout(400);

  let state = await verifyConsentState(page);
  if (state.cmpVisible || state.consentDialog || state.phraseHits >= 2) {
    for (const cmp of CMP_ACCEPT_CONFIG) {
      try {
        const ok = cmp.useFrames
          ? await trySelectorsInAllFrames(page, cmp.selectors)
          : await trySelectors(page, cmp.selectors, visibleTimeout, clickTimeout);
        if (ok) pushStrategy(`${cmp.id}-retry`);
      } catch {
        // next
      }
    }
    if (await tryAcceptAllRole(page)) pushStrategy('accept-all-role-retry');
    await dismissCookieBannersScoped(page);
    pushStrategy('scoped-click-retry');
    await page.waitForTimeout(400);
    state = await verifyConsentState(page);
  }

  const consentBlocked = Boolean(state.cmpVisible || state.consentDialog || state.phraseHits >= 2);

  if (consentBlocked) {
    console.warn(
      '[PlaywrightScraper] Consent may still be visible:',
      JSON.stringify({ strategies, state }),
    );
  }

  return {
    strategies,
    consentBlocked,
    consentSignalScore: state.phraseHits,
  };
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

        let consentInfo = {
          strategies: [],
          consentBlocked: false,
          consentSignalScore: 0,
        };

        if (!page.isClosed()) {
          consentInfo = await handleCookieConsent(page, request.timeoutMs);
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

        const consentBlocked = Boolean(
          consentInfo.consentBlocked || extracted.consentLikelyDominated,
        );
        const warnings = Array.isArray(extracted.warnings) ? [...extracted.warnings] : [];
        if (consentBlocked) {
          warnings.push(
            'El contenido podría estar parcialmente bloqueado por el aviso de cookies o privacidad.',
          );
        }

        return {
          success: true,
          url: finalUrl,
          finalUrl,
          title: extracted.title || metadataHints.title || finalUrl,
          content,
          metadata: request.includeMetadata
            ? { ...extracted.metadata, consentBlocked, consentLikelyDominated: extracted.consentLikelyDominated }
            : undefined,
          screenshot,
          screenshotFormat,
          warnings,
          excerpt: extracted.excerpt,
          consentBlocked,
          consentStrategyUsed: consentInfo.strategies.length ? consentInfo.strategies.join(',') : 'none',
          consentSignalScore: Math.max(consentInfo.consentSignalScore || 0, 0),
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
            await handleCookieConsent(page, Math.min(request.timeoutMs, 15000));
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
