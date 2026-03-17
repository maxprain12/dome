/**
 * GitHub API Client - Handles all GitHub API interactions for marketplace
 * 
 * Features:
 * - Repository content listing and file fetching
 * - Release downloading for plugins/MCPs
 * - In-memory caching with TTL
 * - Automatic rate limiting handling
 * - Input sanitization for security
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

/**
 * Simple cache implementation
 */
class Cache {
  constructor(ttl = CACHE_TTL) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Rate limiter for GitHub API
 */
class RateLimiter {
  constructor() {
    this.remaining = 60;
    this.reset = 0;
    this.used = 0;
  }

  update(headers) {
    const remaining = parseInt(headers['x-ratelimit-remaining'] || '60', 10);
    const reset = parseInt(headers['x-ratelimit-reset'] || '0', 10);
    const used = parseInt(headers['x-ratelimit-used'] || '0', 10);
    
    this.remaining = remaining;
    this.reset = reset;
    this.used = used;
  }

  isLimited() {
    return this.remaining <= 0;
  }

  getWaitTime() {
    if (this.reset > 0) {
      return Math.max(0, this.reset * 1000 - Date.now());
    }
    return 0;
  }
}

const cache = new Cache();
const rateLimiter = new RateLimiter();

/**
 * Make an HTTP/HTTPS request with Promise
 */
function request(options, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Dome-Marketplace/1.0',
        ...options.headers
      }
    };

    const req = client.request(reqOptions, (res) => {
      // Update rate limiter
      rateLimiter.update(res.headers);
      
      // Handle rate limiting
      if (res.statusCode === 403 && rateLimiter.isLimited()) {
        const waitTime = rateLimiter.getWaitTime();
        if (retries > 0 && waitTime > 0) {
          console.log(`[GitHub] Rate limited. Waiting ${waitTime}ms before retry...`);
          setTimeout(() => {
            request(options, retries - 1, backoff * 2).then(resolve).catch(reject);
          }, waitTime);
          return;
        }
      }

      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, options.url).href;
        request({ ...options, url: redirectUrl }, retries, backoff)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Collect response data
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else if (res.statusCode === 404) {
          reject(new Error(`Not found: ${options.url}`));
        } else {
          try {
            const error = JSON.parse(data);
            reject(new Error(error.message || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      if (retries > 0) {
        console.log(`[GitHub] Request failed, retrying (${retries} left)...`, err.message);
        setTimeout(() => {
          request(options, retries - 1, backoff * 2).then(resolve).catch(reject);
        }, backoff);
      } else {
        reject(err);
      }
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Sanitize GitHub owner/repo/path to prevent injection
 */
function sanitizePathComponent(component) {
  // Only allow alphanumeric, hyphens, underscores, and periods
  return component.replace(/[^a-zA-Z0-9\-_.]/g, '');
}

/**
 * Fetch repository contents at a specific path
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - Path within repository
 * @param {string} ref - Branch, tag, or commit SHA
 * @returns {Promise<Array>} Array of file/folder entries
 */
async function getRepoContents(owner, repo, path = '', ref = 'main') {
  const sanitizedOwner = sanitizePathComponent(owner);
  const sanitizedRepo = sanitizePathComponent(repo);
  const sanitizedPath = sanitizePathComponent(path);
  
  const cacheKey = `contents:${sanitizedOwner}:${sanitizedRepo}:${sanitizedPath}:${ref}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${sanitizedOwner}/${sanitizedRepo}/contents/${sanitizedPath}?ref=${ref}`;
  const result = await request({ url });
  
  cache.set(cacheKey, result);
  return result;
}

/**
 * Fetch a single file's content
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - Path to file within repository
 * @param {string} ref - Branch, tag, or commit SHA
 * @returns {Promise<string>} File content (base64 decoded if needed)
 */
async function getFileContent(owner, repo, path, ref = 'main') {
  const sanitizedOwner = sanitizePathComponent(owner);
  const sanitizedRepo = sanitizePathComponent(repo);
  const sanitizedPath = sanitizePathComponent(path);
  
  const cacheKey = `file:${sanitizedOwner}:${sanitizedRepo}:${sanitizedPath}:${ref}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${sanitizedOwner}/${sanitizedRepo}/contents/${sanitizedPath}?ref=${ref}`;
  const result = await request({ url });
  
  let content;
  if (result.content) {
    // File is base64 encoded
    content = Buffer.from(result.content, 'base64').toString('utf8');
  } else if (result.type === 'dir') {
    content = JSON.stringify(result);
  } else {
    content = result;
  }
  
  cache.set(cacheKey, content);
  return content;
}

/**
 * Fetch repository metadata
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<object>} Repository info
 */
async function getRepoInfo(owner, repo) {
  const sanitizedOwner = sanitizePathComponent(owner);
  const sanitizedRepo = sanitizePathComponent(repo);
  
  const cacheKey = `repo:${sanitizedOwner}:${sanitizedRepo}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${sanitizedOwner}/${sanitizedRepo}`;
  const result = await request({ url });
  
  cache.set(cacheKey, result);
  return result;
}

/**
 * Get the latest release from a repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<object>} Latest release info
 */
async function getLatestRelease(owner, repo) {
  const sanitizedOwner = sanitizePathComponent(owner);
  const sanitizedRepo = sanitizePathComponent(repo);
  
  const cacheKey = `release:latest:${sanitizedOwner}:${sanitizedRepo}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${GITHUB_API_BASE}/repos/${sanitizedOwner}/${sanitizedRepo}/releases/latest`;
    const result = await request({ url });
    
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    // If no release, try getting tags
    const tags = await getRepoTags(owner, repo);
    if (tags && tags.length > 0) {
      return { tag_name: tags[0].name, zipball_url: tags[0].zipball_url };
    }
    throw err;
  }
}

/**
 * Get repository tags
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Array>} List of tags
 */
async function getRepoTags(owner, repo) {
  const sanitizedOwner = sanitizePathComponent(owner);
  const sanitizedRepo = sanitizePathComponent(repo);
  
  const cacheKey = `tags:${sanitizedOwner}:${sanitizedRepo}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${sanitizedOwner}/${sanitizedRepo}/tags?per_page=10`;
  const result = await request({ url });
  
  cache.set(cacheKey, result);
  return result;
}

/**
 * Search for repositories
 * @param {string} query - Search query
 * @param {string} [type] - Repository type: all, owner, member
 * @returns {Promise<Array>} Search results
 */
async function searchRepositories(query, type = 'all') {
  const cacheKey = `search:${query}:${type}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&type=${type}`;
  const result = await request({ url });
  
  cache.set(cacheKey, result.items);
  return result.items;
}

/**
 * Clear the cache
 */
function clearCache() {
  cache.clear();
}

/**
 * Get rate limit status
 */
function getRateLimitStatus() {
  return {
    remaining: rateLimiter.remaining,
    reset: rateLimiter.reset,
    used: rateLimiter.used,
    isLimited: rateLimiter.isLimited()
  };
}

/**
 * Fetch multiple items from a source directory
 * Loads each JSON file in the directory as a marketplace item
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - Directory path
 * @param {string} ref - Branch, tag, or commit SHA
 * @param {string} itemType - Type of item (agent, workflow, mcp, skill)
 * @returns {Promise<Array>} Array of parsed marketplace items
 */
async function fetchDirectoryItems(owner, repo, path, ref = 'main', itemType = 'agent') {
  try {
    const contents = await getRepoContents(owner, repo, path, ref);
    
    if (!Array.isArray(contents)) {
      return [];
    }

    const items = [];
    for (const item of contents) {
      if (item.type === 'file' && (item.name.endsWith('.json') || item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
        try {
          const content = await getFileContent(owner, repo, item.path, ref);
          const parsed = item.name.endsWith('.json') ? JSON.parse(content) : content;
          
          // Add source metadata
          if (typeof parsed === 'object' && parsed !== null) {
            parsed._source = {
              type: 'github',
              owner,
              repo,
              path: item.path,
              ref,
              url: item.html_url
            };
            items.push(parsed);
          }
        } catch (parseErr) {
          console.warn(`[GitHub] Failed to parse ${item.path}:`, parseErr.message);
        }
      }
    }

    return items;
  } catch (err) {
    console.error(`[GitHub] Failed to fetch directory ${owner}/${repo}/${path}:`, err.message);
    return [];
  }
}

module.exports = {
  getRepoContents,
  getFileContent,
  getRepoInfo,
  getLatestRelease,
  getRepoTags,
  searchRepositories,
  clearCache,
  getRateLimitStatus,
  fetchDirectoryItems,
  sanitizePathComponent
};
