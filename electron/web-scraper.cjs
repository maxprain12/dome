/* eslint-disable no-console */
/**
 * Web Scraper Module - Main Process
 * Uses Electron's BrowserWindow to scrape web content and generate screenshots
 * No external dependencies required - uses Chromium bundled with Electron
 */

const { BrowserWindow } = require('electron');

// Timeout configuration
const SCRAPE_TIMEOUT = 30000; // 30 seconds
const LOAD_TIMEOUT = 25000; // 25 seconds for page load

// Common cookie/consent banner selectors for removal
const BANNER_SELECTORS = [
  '[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]', '[id*="consent"]',
  '[class*="gdpr"]', '[class*="banner"]', '[class*="privacy"]',
  '[role="dialog"]', '.modal', '[data-testid*="cookie"]', '[data-testid*="consent"]'
];

// Button text patterns for Accept/Agree (case-insensitive)
const CONSENT_BUTTON_TEXTS = [
  'accept', 'agree', 'i agree', 'allow', 'ok', 'acceptar', 'aceptar',
  'consent', 'allow all', 'accept all', 'got it', 'understand'
];

/**
 * Extract text content from HTML, excluding boilerplate (nav, footer, cookie banners)
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function extractText(html) {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove nav, footer, and common banner-like elements by tag/class
  const excludePatterns = [
    /<nav[^>]*>[\s\S]*?<\/nav>/gi,
    /<footer[^>]*>[\s\S]*?<\/footer>/gi,
    /<[^>]*(?:class|id)=[^>]*(?:cookie|consent|gdpr|banner|privacy)[^>]*>[\s\S]*?<\/[^>]+>/gi
  ];
  for (const pat of excludePatterns) {
    text = text.replace(pat, ' ');
  }

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Dismiss cookie/consent banners: try clicking Accept buttons first, then remove by selector
 * @param {object} webContents - Electron webContents
 */
async function dismissCookieBanners(webContents) {
  const dismissScript = `
    (function() {
      const buttonTexts = ${JSON.stringify(CONSENT_BUTTON_TEXTS)};
      const bannerSelectors = ${JSON.stringify(BANNER_SELECTORS)};
      let clicked = false;

      // Try to click Accept/Agree buttons
      const buttons = document.querySelectorAll('button, [role="button"], a, input[type="submit"]');
      for (const btn of buttons) {
        const text = (btn.innerText || btn.textContent || btn.value || '').trim().toLowerCase();
        if (buttonTexts.some(t => text.includes(t))) {
          try {
            btn.click();
            clicked = true;
            break;
          } catch (e) { /* ignore */ }
        }
      }

      // Remove banner elements from DOM if no button was clicked
      for (const sel of bannerSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
        } catch (e) { /* ignore */ }
      }

      return clicked;
    })();
  `;
  try {
    await webContents.executeJavaScript(dismissScript);
  } catch (error) {
    console.error('[WebScraper] Error dismissing cookie banners:', error);
  }
}

/**
 * Filter boilerplate paragraphs (cookie notices, nav, etc.) from scraped content
 * @param {string} content - Raw content text
 * @returns {string} Filtered content
 */
function filterBoilerplate(content) {
  if (!content || typeof content !== 'string') return content;
  const boilerplateKeywords = [
    'cookies', 'cookie policy', 'privacy policy', 'we use cookies',
    'improve our services', 'personalize your experience', 'consent',
    'gdpr', 'accept cookies', 'cookie settings', 'cookie preferences',
    'subscribe to our newsletter', 'sign up for', 'join our mailing list',
    'this site uses cookies', 'by continuing to use', 'we and our partners'
  ];
  const strongSignals = [
    'accept all cookies', 'manage preferences', 'cookie consent',
    'essential and non-essential cookies'
  ];
  const paragraphs = content.split(/\n\s*\n/);
  const filtered = paragraphs.filter((p) => {
    const pTrim = p.trim();
    if (!pTrim) return false;
    const pLower = pTrim.toLowerCase();
    if (strongSignals.some((s) => pLower.includes(s))) return false;
    const matches = boilerplateKeywords.filter((k) => pLower.includes(k));
    if (matches.length >= 2) return false;
    if (pTrim.length < 80 && matches.length >= 1) return false;
    return true;
  });
  return filtered.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract metadata from page using executeJavaScript
 * @param {object} webContents - Electron webContents
 * @returns {Promise<object>} Metadata object
 */
async function extractMetadata(webContents) {
  const extractScript = `
    (function() {
      var metadata = {};
      function getMeta(selector) {
        var el = document.querySelector(selector);
        return el ? (el.content || el.getAttribute('content')) : null;
      }
      metadata.title = getMeta('meta[property="og:title"]') || document.title || null;
      metadata.description = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]') || getMeta('meta[name="twitter:description"]');
      metadata.image = getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]');
      metadata.author = getMeta('meta[name="author"]') || getMeta('meta[property="article:author"]');
      metadata.section = getMeta('meta[property="article:section"]');
      metadata.tags = getMeta('meta[property="article:tag"]');
      metadata.published_date = getMeta('meta[property="article:published_time"]');
      if (!metadata.published_date) {
        var timeEl = document.querySelector('time[datetime]');
        if (timeEl) metadata.published_date = timeEl.getAttribute('datetime');
      }
      metadata.modified_date = getMeta('meta[property="article:modified_time"]');
      if (!metadata.published_date || !metadata.modified_date) {
        var scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < scripts.length; i++) {
          try {
            var ld = JSON.parse(scripts[i].textContent);
            var items = Array.isArray(ld) ? ld : [ld];
            for (var j = 0; j < items.length; j++) {
              var obj = items[j];
              if (obj && (obj['@type'] === 'Article' || obj['@type'] === 'NewsArticle' || obj.datePublished)) {
                if (obj.datePublished && !metadata.published_date) metadata.published_date = obj.datePublished;
                if (obj.dateModified && !metadata.modified_date) metadata.modified_date = obj.dateModified;
                break;
              }
            }
          } catch (e) {}
        }
      }
      var images = Array.from(document.querySelectorAll('img'))
        .map(function(img) { return img.src || img.getAttribute('data-src'); })
        .filter(function(src) { return src && (src.indexOf('http') === 0 || src.indexOf('//') === 0); })
        .slice(0, 10);
      metadata.images = images;
      return metadata;
    })();
  `;
  
  try {
    return await webContents.executeJavaScript(extractScript);
  } catch (error) {
    console.error('[WebScraper] Error extracting metadata:', error);
    return {};
  }
}

/**
 * Convert DOM element to Markdown-structured text (headings, lists, paragraphs)
 * @param {object} webContents - Electron webContents
 * @returns {Promise<string>} Main content as Markdown
 */
async function extractMainContent(webContents) {
  const extractScript = `
    (function() {
      var contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '[data-slot="article-body"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.prose',
        '.content',
        '#content',
        '.article-body',
        '.post-body',
        '.blog-post-content',
        '.story-body',
        '[itemprop="articleBody"]',
        '.markdown'
      ];
      var excludeTags = ['nav', 'footer', 'aside', 'script', 'style'];
      var minLength = 300;

      function removeExcluded(container) {
        excludeTags.forEach(function(tag) {
          var els = container.querySelectorAll(tag);
          for (var i = els.length - 1; i >= 0; i--) {
            var el = els[i];
            if (el.parentNode) el.parentNode.removeChild(el);
          }
        });
        var banners = container.querySelectorAll('[role="banner"]');
        for (var j = banners.length - 1; j >= 0; j--) {
          var b = banners[j];
          if (b.parentNode) b.parentNode.removeChild(b);
        }
      }

      function toMarkdown(el) {
        if (!el) return '';
        var lines = [];
        var children = el.children;
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          var tag = (child.tagName || '').toLowerCase();
          var text = (child.innerText || child.textContent || '').trim();
          if (!text) continue;
          if (tag === 'h1') lines.push('\\n# ' + text + '\\n');
          else if (tag === 'h2') lines.push('\\n## ' + text + '\\n');
          else if (tag === 'h3') lines.push('\\n### ' + text + '\\n');
          else if (tag === 'h4') lines.push('\\n#### ' + text + '\\n');
          else if (tag === 'blockquote') lines.push('\\n> ' + text.replace(/\\n/g, '\\n> ') + '\\n');
          else if (tag === 'ul' || tag === 'ol') {
            var items = child.querySelectorAll('li');
            for (var k = 0; k < items.length; k++) {
              var itemText = (items[k].innerText || items[k].textContent || '').trim();
              if (itemText) lines.push('- ' + itemText);
            }
            lines.push('');
          }
          else if (tag === 'li') lines.push('- ' + text);
          else if (tag === 'p' || tag === 'div') lines.push('\\n' + text + '\\n');
          else lines.push('\\n' + text + '\\n');
        }
        return lines.join('').replace(/\\n{3,}/g, '\\n\\n').trim();
      }

      function getTextContent(el) {
        return (el.innerText || el.textContent || '').trim();
      }

      for (var s = 0; s < contentSelectors.length; s++) {
        var element = document.querySelector(contentSelectors[s]);
        if (!element) continue;
        var clone = element.cloneNode(true);
        removeExcluded(clone);
        var plainText = getTextContent(clone);
        if (plainText && plainText.length >= minLength) {
          var md = toMarkdown(clone);
          return (md && md.length >= minLength) ? md : plainText;
        }
      }

      var body = document.body;
      if (body) {
        var c = body.cloneNode(true);
        removeExcluded(c);
        var plain = getTextContent(c);
        var md = toMarkdown(c);
        return (md && md.length >= minLength) ? md : plain;
      }
      return '';
    })();
  `;

  try {
    return await webContents.executeJavaScript(extractScript);
  } catch (error) {
    console.error('[WebScraper] Error extracting main content:', error);
    return '';
  }
}

/**
 * Get page title
 * @param {object} webContents - Electron webContents
 * @returns {Promise<string>} Page title
 */
async function getPageTitle(webContents) {
  try {
    return await webContents.executeJavaScript('document.title || "Untitled"');
  } catch (error) {
    return 'Untitled';
  }
}

/**
 * Get page HTML
 * @param {object} webContents - Electron webContents
 * @returns {Promise<string>} Page HTML
 */
async function getPageHtml(webContents) {
  try {
    return await webContents.executeJavaScript('document.documentElement.outerHTML');
  } catch (error) {
    return '';
  }
}

/**
 * Scrape a URL and extract content
 * @param {string} url - URL to scrape
 * @returns {Promise<object>} Scraped data with screenshot
 */
async function scrapeUrl(url) {
  let scraperWindow = null;
  
  try {
    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
    
    console.log(`[WebScraper] Starting scrape for: ${url}`);
    
    // Create a hidden browser window (smaller size to reduce memory - 640x360)
    scraperWindow = new BrowserWindow({
      width: 640,
      height: 360,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });
    
    const webContents = scraperWindow.webContents;
    
    // Set user agent
    webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Load the URL with timeout
    const loadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Page load timeout'));
      }, LOAD_TIMEOUT);
      
      webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        // Ignore aborted loads (user navigation)
        if (errorCode === -3) {
          resolve();
        } else {
          reject(new Error(`Failed to load: ${errorDescription} (${errorCode})`));
        }
      });
    });
    
    // Start loading
    webContents.loadURL(url);
    
    // Wait for load to complete
    await loadPromise;

    // Dismiss cookie/consent banners before extraction
    await dismissCookieBanners(webContents);
    await wait(500);

    // Wait for dynamic content to load
    await wait(2000);

    // Extract data (get mainContent first - avoid loading full HTML when possible)
    const title = await getPageTitle(webContents);
    const mainContent = await extractMainContent(webContents);
    const metadata = await extractMetadata(webContents);

    let content;
    if (mainContent.length > 300) {
      content = mainContent;
    } else {
      const html = await getPageHtml(webContents);
      content = extractText(html);
      // html goes out of scope here - allows GC to reclaim memory
    }
    content = filterBoilerplate(content);

    // Generate screenshot (JPEG at 85% for smaller size, avoid OOM)
    let screenshot = null;
    let screenshotFormat = 'png';
    try {
      const image = await webContents.capturePage();
      screenshot = image.toJPEG(85).toString('base64');
      screenshotFormat = 'jpeg';
    } catch (error) {
      console.error('[WebScraper] Error generating screenshot:', error);
      try {
        const image = await webContents.capturePage();
        screenshot = image.toPNG().toString('base64');
      } catch (fallbackError) {
        console.error('[WebScraper] JPEG fallback failed:', fallbackError);
      }
    }

    const result = {
      success: true,
      url,
      title: metadata.title || title,
      content: content.substring(0, 50000), // Limit content size
      metadata: {
        ...metadata,
        url
      },
      screenshot,
      screenshotFormat,
    };
    
    console.log(`[WebScraper] Successfully scraped: ${url}`);
    
    return result;
    
  } catch (error) {
    console.error(`[WebScraper] Error scraping ${url}:`, error);
    return {
      success: false,
      url,
      error: error.message,
      title: null,
      content: null,
      metadata: { url },
      screenshot: null
    };
  } finally {
    if (scraperWindow && !scraperWindow.isDestroyed()) {
      scraperWindow.destroy();
    }
  }
}

module.exports = {
  scrapeUrl
};
