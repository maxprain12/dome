/* eslint-disable no-console */
/**
 * Load marketplace agent/workflow manifests shipped under public/ (dev) or dist/ (packaged).
 * GitHub-configured sources in marketplace-config remain available via ipc/marketplace fetchers.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[MarketplaceBundled] read failed:', filePath, e.message);
    return null;
  }
}

function getCandidatesBaseDirs() {
  const bases = [];
  if (app?.isPackaged) {
    bases.push(path.join(process.resourcesPath, 'app.asar', 'dist'));
    bases.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist'));
  } else {
    bases.push(path.join(__dirname, '../dist'));
    bases.push(path.join(__dirname, '../public'));
  }
  return bases;
}

function resolveExisting(...segments) {
  for (const base of getCandidatesBaseDirs()) {
    const full = path.join(base, ...segments);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * @returns {{ id: string, name: string, description: string, author?: string, version?: string, tags?: string[], systemInstructions?: string, toolIds?: string[], mcpServerIds?: string[], skillIds?: string[], iconIndex?: number, [k: string]: unknown }[]}
 */
function loadBundledAgentsFull() {
  const indexPath = resolveExisting('agents.json');
  if (!indexPath) return [];
  const index = tryReadJson(indexPath);
  if (!Array.isArray(index)) return [];

  const baseDir = path.dirname(indexPath);
  const out = [];
  for (const entry of index) {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    if (!id) continue;
    const manifestPath = path.join(baseDir, 'agents', id, 'manifest.json');
    const full = tryReadJson(manifestPath);
    if (full && typeof full === 'object') {
      out.push({
        ...entry,
        ...full,
        id: full.id || id,
        source: full.source || 'official',
      });
    } else {
      out.push({
        ...entry,
        systemInstructions: entry.systemInstructions || '',
        toolIds: Array.isArray(entry.toolIds) ? entry.toolIds : [],
        mcpServerIds: [],
        skillIds: [],
        iconIndex: typeof entry.iconIndex === 'number' ? entry.iconIndex : 1,
        author: entry.author || 'Unknown',
        version: entry.version || '1.0.0',
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        featured: entry.featured !== false,
        downloads: typeof entry.downloads === 'number' ? entry.downloads : 0,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
      });
    }
  }
  return out;
}

/**
 * @returns {Array<Record<string, unknown>>}
 */
function loadBundledWorkflowsFull() {
  const indexPath = resolveExisting('workflows.json');
  if (!indexPath) return [];
  const index = tryReadJson(indexPath);
  if (!Array.isArray(index)) return [];

  const baseDir = path.dirname(indexPath);
  const out = [];
  for (const entry of index) {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    if (!id) continue;
    const manifestPath = path.join(baseDir, 'workflows', id, 'manifest.json');
    const full = tryReadJson(manifestPath);
    if (full && typeof full === 'object') {
      out.push({
        ...entry,
        ...full,
        id: full.id || id,
        nodes: Array.isArray(full.nodes) ? full.nodes : [],
        edges: Array.isArray(full.edges) ? full.edges : [],
        source: full.source || 'official',
      });
    } else {
      out.push({
        ...entry,
        nodes: [],
        edges: [],
        author: entry.author || 'Unknown',
        version: entry.version || '1.0.0',
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        featured: entry.featured !== false,
        downloads: typeof entry.downloads === 'number' ? entry.downloads : 0,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
      });
    }
  }
  return out;
}

module.exports = {
  loadBundledAgentsFull,
  loadBundledWorkflowsFull,
  resolveExisting,
};
