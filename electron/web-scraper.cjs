/* eslint-disable no-console */
/**
 * Web Scraper Module - Main Process
 * Uses Playwright to scrape web content and generate screenshots
 */

const { chromium } = require('playwright');
const path = require('path');

// Timeout configuration
const SCRAPE_TIMEOUT = 30000; // 30 seconds
const SCREENSHOT_TIMEOUT = 10000; // 10 seconds

/**
 * Extract text content from HTML
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function extractText(html) {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Extract metadata from page
 * @param {object} page - Playwright page object
 * @returns {Promise<object>} Metadata object
 */
async function extractMetadata(page) {
  const metadata = {};
  
  try {
    // Open Graph tags
    metadata.title = await page.$eval('meta[property="og:title"]', el => el.content).catch(() => null) ||
                    await page.title().catch(() => null);
    
    metadata.description = await page.$eval('meta[property="og:description"]', el => el.content).catch(() => null) ||
                          await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    
    metadata.image = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
    
    // Author
    metadata.author = await page.$eval('meta[name="author"]', el => el.content).catch(() => null) ||
                     await page.$eval('meta[property="article:author"]', el => el.content).catch(() => null);
    
    // Published date
    metadata.published_date = await page.$eval('meta[property="article:published_time"]', el => el.content).catch(() => null) ||
                             await page.$eval('time[datetime]', el => el.getAttribute('datetime')).catch(() => null);
    
    // Extract images from page
    const images = await page.$$eval('img', imgs => 
      imgs
        .map(img => img.src || img.getAttribute('data-src'))
        .filter(src => src && (src.startsWith('http') || src.startsWith('//')))
        .slice(0, 10) // Limit to first 10 images
    ).catch(() => []);
    
    metadata.images = images;
    
  } catch (error) {
    console.error('[WebScraper] Error extracting metadata:', error);
  }
  
  return metadata;
}

/**
 * Extract main content from page
 * @param {object} page - Playwright page object
 * @returns {Promise<string>} Main content text
 */
async function extractMainContent(page) {
  try {
    // Try to find main content areas
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '#content',
      '.entry-content'
    ];
    
    for (const selector of contentSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim().length > 200) {
            return text.trim();
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // Fallback: extract from body
    const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
    return bodyText.trim();
    
  } catch (error) {
    console.error('[WebScraper] Error extracting main content:', error);
    return '';
  }
}

/**
 * Scrape a URL and extract content
 * @param {string} url - URL to scrape
 * @returns {Promise<object>} Scraped data with screenshot
 */
async function scrapeUrl(url) {
  let browser = null;
  
  try {
    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
    
    console.log(`[WebScraper] Starting scrape for: ${url}`);
    
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: SCRAPE_TIMEOUT
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);
    
    // Extract data
    const title = await page.title().catch(() => 'Untitled');
    const html = await page.content().catch(() => '');
    const mainContent = await extractMainContent(page);
    const metadata = await extractMetadata(page);
    
    // Generate screenshot
    let screenshot = null;
    try {
      screenshot = await page.screenshot({
        type: 'png',
        fullPage: false, // Viewport only for better performance
        timeout: SCREENSHOT_TIMEOUT
      });
    } catch (error) {
      console.error('[WebScraper] Error generating screenshot:', error);
      // Continue without screenshot
    }
    
    // Clean HTML to plain text if main content is too short
    const content = mainContent.length > 200 ? mainContent : extractText(html);
    
    const result = {
      success: true,
      url,
      title: metadata.title || title,
      content: content.substring(0, 50000), // Limit content size
      metadata: {
        ...metadata,
        url
      },
      screenshot: screenshot ? screenshot.toString('base64') : null
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
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  scrapeUrl
};
