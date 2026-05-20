/**
 * IPC Handlers for Marketplace - Handles all marketplace-related IPC channels
 * 
 * Provides:
 * - Fetching agents, workflows, MCPs from GitHub repositories
 * - Managing marketplace configuration
 * - Cache management
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const marketplaceConfig = require('../marketplace-config.cjs');
const githubClient = require('../github-client.cjs');
const skillInstall = require('../skills/install.cjs');
const { userSkillsDir } = require('../skills/index.cjs');

// ---------------------------------------------------------------------------
// Helpers for skill-from-URL installation
// ---------------------------------------------------------------------------

/**
 * Fetch text content from a URL, returning null on non-200 or error.
 * @param {string} urlStr
 * @param {Record<string,string>} [extraHeaders]
 * @returns {Promise<string|null>}
 */
function fetchText(urlStr, extraHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const protocol = parsed.protocol === 'https:' ? https : http;
      const req = protocol.get(
        urlStr,
        { headers: { 'User-Agent': 'Dome-Marketplace/1.0', 'Accept': 'text/plain,application/json', ...extraHeaders } },
        (res) => {
          if (res.statusCode !== 200) { res.resume(); return resolve(null); }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      req.setTimeout(10000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Parse YAML-style frontmatter from a SKILL.md string.
 * Returns an object with the frontmatter key/value pairs.
 * @param {string} content
 * @returns {{ name?: string; description?: string; when_to_use?: string }}
 */
function parseSkillMdFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*"?([^"]*)"?\s*$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

/**
 * Given any GitHub URL pointing to a skill, return candidate raw content URLs to try.
 * @param {string} url
 * @returns {string[]}
 */
function resolveSkillRawUrls(url) {
  // Already a raw URL
  if (url.includes('raw.githubusercontent.com')) return [url];

  // Direct URL to a SKILL.md on github.com
  if (url.includes('github.com') && url.endsWith('SKILL.md')) {
    return [url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/').replace('/tree/', '/')];
  }

  // github.com/user/repo/tree/branch/subdir  OR  github.com/user/repo
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
  if (!treeMatch) return [url];

  const [, owner, repo, branch = 'main', subdir] = treeMatch;
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

  const candidates = subdir
    ? [`${base}/${subdir}/SKILL.md`, `${base}/${subdir}/skill.md`]
    : [`${base}/SKILL.md`, `${base}/skill.md`];

  // Also try main/master if branch not explicit
  if (!treeMatch[3]) {
    candidates.push(
      `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/master/skill.md`,
    );
  }
  return candidates;
}

/**
 * Parse a GitHub repo URL into its components.
 * @param {string} url
 * @returns {{ owner: string; repo: string; branch: string; subdir: string } | null}
 */
function parseGitHubRepoUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ''), branch: m[3] || 'main', subdir: m[4] || '' };
}

// ---------------------------------------------------------------------------

/**
 * Fetch items from a GitHub source
 */
async function fetchFromGitHubSource(source) {
  const { owner, repo, path: sourcePath, ref = 'main' } = source;
  
  try {
    const items = await githubClient.fetchDirectoryItems(
      owner,
      repo,
      sourcePath,
      ref,
      'agent' // Default, will be determined by category
    );
    
    return items.map(item => ({
      ...item,
      _source: {
        type: 'github',
        sourceId: source.id,
        owner,
        repo,
        url: `https://github.com/${owner}/${repo}`
      }
    }));
  } catch (err) {
    console.error(`[Marketplace] Failed to fetch from ${owner}/${repo}:`, err.message);
    return [];
  }
}

/**
 * Fetch skills from skills.sh API
 * API endpoint: https://skills.sh/api/skills
 * Returns JSON with skills array
 */
async function fetchFromSkillsSh(category = 'all') {
  return new Promise((resolve, reject) => {
    // Try alternative endpoints if the main one fails
    const endpoints = [
      'https://skills.sh/api/skills',
      'https://skills.sh/api/search',
      'https://api.skills.sh/v1/skills'
    ];
    
    let currentIndex = 0;
    
    function tryEndpoint(urlStr) {
      const url = new URL(urlStr);
      if (category && category !== 'all') {
        url.searchParams.set('category', category);
      }
      
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, { headers: { 'User-Agent': 'Dome-Marketplace/1.0', 'Accept': 'application/json' } }, (res) => {
        if (res.statusCode !== 200) {
          // Try next endpoint
          if (currentIndex < endpoints.length - 1) {
            currentIndex++;
            tryEndpoint(endpoints[currentIndex]);
            return;
          }
          // All endpoints failed, resolve with empty array instead of rejecting
          console.warn(`[Marketplace] skills.sh returned ${res.statusCode}, using fallback`);
          resolve([]);
          return;
        }
        
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            // Handle different response formats
            if (Array.isArray(data)) {
              resolve(data);
            } else if (data.skills && Array.isArray(data.skills)) {
              resolve(data.skills);
            } else if (data.results && Array.isArray(data.results)) {
              resolve(data.results);
            } else {
              console.warn('[Marketplace] Unknown skills.sh response format:', Object.keys(data));
              resolve([]);
            }
          } catch (err) {
            console.warn('[Marketplace] Failed to parse skills.sh response:', err.message);
            resolve([]);
          }
        });
      });
      
      req.on('error', (err) => {
        // Try next endpoint on error
        if (currentIndex < endpoints.length - 1) {
          currentIndex++;
          tryEndpoint(endpoints[currentIndex]);
        } else {
          console.warn('[Marketplace] All skills.sh endpoints failed:', err.message);
          resolve([]);
        }
      });
      
      req.setTimeout(10000, () => {
        req.destroy();
        // Try next endpoint on timeout
        if (currentIndex < endpoints.length - 1) {
          currentIndex++;
          tryEndpoint(endpoints[currentIndex]);
        } else {
          resolve([]);
        }
      });
    }
    
    tryEndpoint(endpoints[0]);
  });
}

/**
 * Fetch local plugins
 */
async function fetchLocalPlugins() {
  const pluginsDir = marketplaceConfig.getPluginsDir();
  
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }
  
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) continue;
    
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      
      const validation = marketplaceConfig.validateItem('plugin', manifest);
      if (validation.valid) {
        plugins.push({
          ...manifest,
          _source: {
            type: 'local',
            sourceId: 'local-plugins',
            dir: pluginDir,
            url: null
          }
        });
      }
    } catch (err) {
      console.warn(`[Marketplace] Failed to load plugin ${entry.name}:`, err.message);
    }
  }
  
  return plugins;
}

/**
 * Fetch local skills
 */
async function fetchLocalSkills() {
  const skillsDir = userSkillsDir();
  
  if (!fs.existsSync(skillsDir)) {
    return [];
  }
  
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills = [];
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const skillDir = path.join(skillsDir, entry.name);
    
    // Try to find SKILL.md or skill.json
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const skillJsonPath = path.join(skillDir, 'skill.json');
    const manifestPath = path.join(skillDir, 'manifest.json');

    let skillData = { id: entry.name, name: entry.name };

    try {
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const man = JSON.parse(raw);
        const instr = typeof man.instructions === 'string' ? man.instructions : '';
        const pr = typeof man.prompt === 'string' ? man.prompt : '';
        skillData = {
          ...skillData,
          ...man,
          prompt: pr || instr || skillData.prompt || '',
        };
      } else if (fs.existsSync(skillJsonPath)) {
        const raw = fs.readFileSync(skillJsonPath, 'utf8');
        const j = JSON.parse(raw);
        const instr = typeof j.instructions === 'string' ? j.instructions : '';
        const pr = typeof j.prompt === 'string' ? j.prompt : '';
        skillData = { ...skillData, ...j, prompt: pr || instr || skillData.prompt || '' };
      } else if (fs.existsSync(skillMdPath)) {
        const raw = fs.readFileSync(skillMdPath, 'utf8');
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          skillData.name = titleMatch[1];
        }
        const body = raw.replace(/^#\s+[^\n]*\n?/m, '').trim();
        skillData.prompt = body || skillData.prompt || '';
        skillData.description = body.split('\n').slice(0, 2).join(' ').substring(0, 200);
      }
      
      skills.push({
        ...skillData,
        _source: {
          type: 'local',
          sourceId: 'local-skills',
          dir: skillDir,
          url: null
        }
      });
    } catch (err) {
      console.warn(`[Marketplace] Failed to load skill ${entry.name}:`, err.message);
    }
  }
  
  return skills;
}

/**
 * Fetch all agents from configured sources
 */
async function fetchAgents(config) {
  const sources = config.agents?.sources || [];
  const agents = [];
  
  for (const source of sources) {
    if (!source.enabled) continue;
    
    if (source.type === 'github') {
      const items = await fetchFromGitHubSource(source);
      agents.push(...items);
    }
  }
  
  return agents;
}

/**
 * Fetch all workflows from configured sources
 */
async function fetchWorkflows(config) {
  const sources = config.workflows?.sources || [];
  const workflows = [];
  
  for (const source of sources) {
    if (!source.enabled) continue;
    
    if (source.type === 'github') {
      const items = await fetchFromGitHubSource(source);
      workflows.push(...items);
    }
  }
  
  return workflows;
}

/**
 * Fetch all MCPs from configured sources
 */
async function fetchMCPs(config) {
  const sources = config.mcp?.sources || [];
  const mcps = [];
  
  for (const source of sources) {
    if (!source.enabled) continue;
    
    if (source.type === 'github') {
      const items = await fetchFromGitHubSource(source);
      mcps.push(...items);
    }
  }
  
  return mcps;
}

/**
 * Fetch all skills from configured sources
 */
async function fetchSkills(config) {
  const sources = config.skills?.sources || [];
  const skills = [];
  
  for (const source of sources) {
    if (!source.enabled) continue;
    
    if (source.type === 'github') {
      const items = await fetchFromGitHubSource(source);
      skills.push(...items);
    } else if (source.type === 'skills_sh') {
      try {
        const items = await fetchFromSkillsSh(source.category);
        skills.push(...items.map(item => ({
          ...item,
          _source: {
            type: 'skills_sh',
            sourceId: 'skills-sh',
            url: item.repo ? `https://github.com/${item.repo}` : null
          }
        })));
      } catch (err) {
        console.warn('[Marketplace] Failed to fetch from skills.sh:', err.message);
      }
    }
  }
  
  // Also add local skills
  const localSkills = await fetchLocalSkills();
  skills.push(...localSkills);
  
  return skills;
}

/**
 * Register IPC handlers
 */
function register({ ipcMain, windowManager, validateSender }) {
  /**
   * Fetch all marketplace items from all sources
   */
  ipcMain.handle('marketplace:fetch-all', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const config = marketplaceConfig.DEFAULT_SOURCES;
      
      const [agents, workflows, mcp, skills, plugins] = await Promise.all([
        fetchAgents(config),
        fetchWorkflows(config),
        fetchMCPs(config),
        fetchSkills(config),
        fetchLocalPlugins()
      ]);
      
      return {
        success: true,
        data: {
          agents,
          workflows,
          mcp,
          skills,
          plugins,
          lastUpdated: Date.now()
        }
      };
    } catch (err) {
      console.error('[Marketplace] fetch-all error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch agents only
   */
  ipcMain.handle('marketplace:fetch-agents', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const config = marketplaceConfig.DEFAULT_SOURCES;
      const agents = await fetchAgents(config);
      return { success: true, data: agents };
    } catch (err) {
      console.error('[Marketplace] fetch-agents error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch workflows only
   */
  ipcMain.handle('marketplace:fetch-workflows', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const config = marketplaceConfig.DEFAULT_SOURCES;
      const workflows = await fetchWorkflows(config);
      return { success: true, data: workflows };
    } catch (err) {
      console.error('[Marketplace] fetch-workflows error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch MCPs only
   */
  ipcMain.handle('marketplace:fetch-mcp', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const config = marketplaceConfig.DEFAULT_SOURCES;
      const mcp = await fetchMCPs(config);
      return { success: true, data: mcp };
    } catch (err) {
      console.error('[Marketplace] fetch-mcp error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch skills only
   */
  ipcMain.handle('marketplace:fetch-skills', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const config = marketplaceConfig.DEFAULT_SOURCES;
      const skills = await fetchSkills(config);
      return { success: true, data: skills };
    } catch (err) {
      console.error('[Marketplace] fetch-skills error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch plugins only
   */
  ipcMain.handle('marketplace:fetch-plugins', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      const plugins = await fetchLocalPlugins();
      return { success: true, data: plugins };
    } catch (err) {
      console.error('[Marketplace] fetch-plugins error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Get marketplace configuration
   */
  ipcMain.handle('marketplace:get-config', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    return { success: true, data: marketplaceConfig.DEFAULT_SOURCES };
  });

  /**
   * Update marketplace configuration (for user-added sources)
   */
  ipcMain.handle('marketplace:update-config', async (event, userConfig) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      // Merge user config with defaults
      const merged = marketplaceConfig.mergeConfig(userConfig);
      // In a full implementation, this would persist to a database or file
      return { success: true, data: merged };
    } catch (err) {
      console.error('[Marketplace] update-config error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Refresh cache and fetch fresh data
   */
  ipcMain.handle('marketplace:refresh', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    try {
      // Clear GitHub cache
      githubClient.clearCache();
      
      // Re-fetch all data
      const config = marketplaceConfig.DEFAULT_SOURCES;
      
      const [agents, workflows, mcp, skills, plugins] = await Promise.all([
        fetchAgents(config),
        fetchWorkflows(config),
        fetchMCPs(config),
        fetchSkills(config),
        fetchLocalPlugins()
      ]);
      
      return {
        success: true,
        data: {
          agents,
          workflows,
          mcp,
          skills,
          plugins,
          lastUpdated: Date.now()
        }
      };
    } catch (err) {
      console.error('[Marketplace] refresh error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Get GitHub API rate limit status
   */
  ipcMain.handle('marketplace:rate-limit', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    return { success: true, data: githubClient.getRateLimitStatus() };
  });

  /**
   * Install a plugin from GitHub repo - simplified version
   * Opens folder selection dialog instead of downloading
   */
  ipcMain.handle('marketplace:install-plugin', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No window' };
    }
    
    try {
      const { filePaths } = await dialog.showOpenDialog(win, {
        title: 'Select plugin folder',
        properties: ['openDirectory'],
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const sourceDir = sanitizePath(filePaths[0], true);
      const pluginLoader = require('../plugin-loader.cjs');
      const result = pluginLoader.installFromDir(sourceDir);
      return result;
    } catch (err) {
      console.error('[Marketplace] install-plugin error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Install a skill from GitHub repo - simplified version  
   * Opens folder selection dialog instead of downloading
   */
  ipcMain.handle('marketplace:install-skill', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No window' };
    }
    
    try {
      const { filePaths } = await dialog.showOpenDialog(win, {
        title: 'Select skill folder (SKILL.md, skill.json, or manifest.json)',
        properties: ['openDirectory'],
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const sourceDir = sanitizePath(filePaths[0], true);
      const skillsDir = userSkillsDir();
      
      // Read skill.json or SKILL.md from selected folder
      const skillJsonPath = path.join(sourceDir, 'skill.json');
      const skillMdPath = path.join(sourceDir, 'SKILL.md');
      const manifestPath = path.join(sourceDir, 'manifest.json');

      let skillData = {};

      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const man = JSON.parse(raw);
        const instr = typeof man.instructions === 'string' ? man.instructions : '';
        const pr = typeof man.prompt === 'string' ? man.prompt : '';
        skillData = { ...man, prompt: pr || instr };
      } else if (fs.existsSync(skillJsonPath)) {
        const raw = fs.readFileSync(skillJsonPath, 'utf8');
        const j = JSON.parse(raw);
        const instr = typeof j.instructions === 'string' ? j.instructions : '';
        const pr = typeof j.prompt === 'string' ? j.prompt : '';
        skillData = { ...j, prompt: pr || instr };
      } else if (fs.existsSync(skillMdPath)) {
        const raw = fs.readFileSync(skillMdPath, 'utf8');
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        skillData.name = titleMatch ? titleMatch[1] : path.basename(sourceDir);
        skillData.id = path.basename(sourceDir).toLowerCase().replace(/\s+/g, '-');
        skillData.prompt = raw.replace(/^#\s+[^\n]*\n?/m, '').trim();
      } else {
        return {
          success: false,
          error: 'Selected folder must contain SKILL.md, skill.json, or manifest.json',
        };
      }
      
      const skillId = skillData.id || path.basename(sourceDir).toLowerCase().replace(/\s+/g, '-');
      const destDir = path.join(skillsDir, skillId);
      
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true });
      }
      
      // Copy files recursively
      const copyRecursive = (src, dest) => {
        const st = fs.statSync(src);
        if (st.isDirectory()) {
          fs.mkdirSync(dest, { recursive: true });
          for (const name of fs.readdirSync(src)) {
            copyRecursive(path.join(src, name), path.join(dest, name));
          }
        } else {
          fs.copyFileSync(src, dest);
        }
      };
      
      copyRecursive(sourceDir, destDir);
      
      return { success: true, data: { id: skillId, dir: destDir } };
    } catch (err) {
      console.error('[Marketplace] install-skill error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Fetch a skill folder from a GitHub URL and install to ~/.dome/skills/
   */
  ipcMain.handle('marketplace:install-skill-from-url', async (event, { url }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL' };
    }

    try {
      const data = await skillInstall.installSkillFromUrl(url.trim());
      return { success: true, data };
    } catch (err) {
      console.error('[Marketplace] install-skill-from-url error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Browse a GitHub repo for available skills (delegates to skills/install.cjs).
   */
  ipcMain.handle('marketplace:browse-skill-repo', async (event, { repoUrl }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!repoUrl || typeof repoUrl !== 'string') {
      return { success: false, error: 'Invalid URL' };
    }

    try {
      const { skills } = await skillInstall.discoverSkillsInRepo(repoUrl.trim());
      const data = skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        skillUrl: s.skillUrl,
      }));
      return { success: true, data };
    } catch (err) {
      console.error('[Marketplace] browse-skill-repo error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Uninstall a skill from ~/.dome/skills/
   */
  ipcMain.handle('marketplace:uninstall-skill', async (event, skillId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!skillId || typeof skillId !== 'string') {
      return { success: false, error: 'Invalid skillId' };
    }

    try {
      skillInstall.removeSkill(skillId);
      return { success: true };
    } catch (err) {
      console.error('[Marketplace] uninstall-skill error:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, fetchAgents, fetchWorkflows };
