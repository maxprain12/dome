/**
 * Marketplace Configuration - Centralized source configuration for marketplace items
 * 
 * This file defines the configurable sources for:
 * - Agents: Loaded from GitHub repositories
 * - Workflows: Loaded from GitHub repositories  
 * - MCPs: Loaded from GitHub repositories (Model Context Protocol servers)
 * - Skills: Loaded from GitHub repositories AND skills.sh
 * - Plugins: Loaded from local plugins directory
 * 
 * Users can add custom sources via the settings UI.
 */

const path = require('path');
const { app } = require('electron');

const PLUGINS_DIR = 'plugins';
const SKILLS_DIR = 'skills';
const CACHE_DIR = 'marketplace-cache';

/**
 * Get the plugins directory path
 */
function getPluginsDir() {
  return path.join(app.getPath('userData'), PLUGINS_DIR);
}

/**
 * Get the skills directory path
 */
function getSkillsDir() {
  return path.join(app.getPath('userData'), SKILLS_DIR);
}

/**
 * Get the cache directory path
 */
function getCacheDir() {
  return path.join(app.getPath('userData'), CACHE_DIR);
}

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  const fs = require('fs');
  [getPluginsDir(), getSkillsDir(), getCacheDir()].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Default marketplace sources configuration
 * These are the default sources that come with Dome
 * 
 * IMPORTANT: Repos must exist in GitHub for them to work
 * For now, we leave them empty and rely on hardcoded fallbacks
 */
const DEFAULT_SOURCES = {
  agents: {
    sources: [
      // No default GitHub sources - using hardcoded fallbacks
      // Users can add their own via Settings
    ]
  },
  workflows: {
    sources: [
      // No default GitHub sources - using hardcoded fallbacks
    ]
  },
  mcp: {
    sources: [
      // Users can add MCP repos via Settings
    ]
  },
  skills: {
    sources: [
      // Skills will be loaded from installed local directory
    ]
  },
  plugins: {
    sources: [
      // Plugins will be loaded from local plugins directory
    ]
  }
};

/**
 * Source type definitions
 * @typedef {Object} GitHubSource
 * @property {string} id - Unique identifier for this source
 * @property {string} type - 'github'
 * @property {string} owner - GitHub repository owner
 * @property {string} repo - GitHub repository name
 * @property {string} path - Path within the repository
 * @property {string} ref - Branch, tag, or commit SHA
 * @property {boolean} enabled - Whether this source is active
 * 
 * @typedef {Object} SkillsShSource
 * @property {string} id - Unique identifier for this source
 * @property {string} type - 'skills_sh'
 * @property {string} category - Category filter (optional)
 * @property {boolean} enabled - Whether this source is active
 * 
 * @typedef {Object} LocalSource
 * @property {string} id - Unique identifier for this source
 * @property {string} type - 'local'
 * @property {string} path - Relative path within userData
 * @property {boolean} enabled - Whether this source is active
 * 
 * @typedef {GitHubSource|SkillsShSource|LocalSource} MarketplaceSource
 */

/**
 * Schema definitions for different marketplace item types
 */
const SCHEMAS = {
  agent: {
    required: ['id', 'name', 'description'],
    optional: ['longDescription', 'systemInstructions', 'toolIds', 'mcpServerIds', 'skillIds', 'iconIndex', 'author', 'version', 'tags', 'featured', 'downloads', 'createdAt']
  },
  workflow: {
    required: ['id', 'name', 'description'],
    optional: ['longDescription', 'nodes', 'edges', 'category', 'author', 'version', 'tags', 'featured', 'downloads', 'createdAt']
  },
  mcp: {
    required: ['id', 'name', 'description'],
    optional: ['command', 'args', 'env', 'author', 'version', 'tags', 'repository']
  },
  skill: {
    required: ['id', 'name', 'description'],
    optional: ['author', 'version', 'tags', 'category', 'installs', 'repo']
  },
  plugin: {
    required: ['id', 'name', 'author', 'description', 'version'],
    optional: ['type', 'sprites', 'entry', 'permissions']
  }
};

/**
 * Validate a marketplace item against its schema
 * @param {string} type - Item type (agent, workflow, mcp, skill, plugin)
 * @param {object} item - Item to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateItem(type, item) {
  const schema = SCHEMAS[type];
  if (!schema) {
    return { valid: false, errors: [`Unknown type: ${type}`] };
  }

  const errors = [];
  for (const field of schema.required) {
    if (!item[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge user configuration with defaults
 * @param {object} userConfig - User-provided configuration
 * @returns {object} Merged configuration
 */
function mergeConfig(userConfig = {}) {
  return {
    agents: {
      sources: [...(DEFAULT_SOURCES.agents.sources || []), ...(userConfig.agents?.sources || [])]
    },
    workflows: {
      sources: [...(DEFAULT_SOURCES.workflows.sources || []), ...(userConfig.workflows?.sources || [])]
    },
    mcp: {
      sources: [...(DEFAULT_SOURCES.mcp.sources || []), ...(userConfig.mcp?.sources || [])]
    },
    skills: {
      sources: [...(DEFAULT_SOURCES.skills.sources || []), ...(userConfig.skills?.sources || [])]
    },
    plugins: {
      sources: [...(DEFAULT_SOURCES.plugins.sources || []), ...(userConfig.plugins?.sources || [])]
    }
  };
}

module.exports = {
  DEFAULT_SOURCES,
  SCHEMAS,
  getPluginsDir,
  getSkillsDir,
  getCacheDir,
  ensureDirectories,
  validateItem,
  mergeConfig
};
