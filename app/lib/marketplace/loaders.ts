/**
 * Dynamic marketplace loaders — fetch catalogs from public JSON indexes
 * and load full definitions from subfolders (agents/, workflows/, mcp/, skills/).
 *
 * Architecture:
 *  - Root JSON  (e.g. /agents.json)       → index with minimal display info
 *  - Subfolder  (e.g. /agents/<id>/manifest.json) → full definition
 *  - Plugins    (/plugins.json)            → GitHub repos catalog (install flow only)
 */

import type { MarketplaceAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';

// ─── Type definitions ───────────────────────────────────────────────────────

export interface MCPManifest {
  id: string;
  name: string;
  description: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  author?: string;
  version?: string;
  tags?: string[];
  repository?: string;
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  author?: string;
  version?: string;
  tags?: string[];
  category?: string;
  instructions?: string;
}

export interface AgentIndexEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  featured: boolean;
  iconIndex: number;
}

export interface WorkflowIndexEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  featured: boolean;
  estimatedTime?: string;
  difficulty?: string;
  category?: string;
  useCases?: string[];
}

// ─── Validators ─────────────────────────────────────────────────────────────

function isValidMarketplaceAgent(raw: unknown): raw is MarketplaceAgent {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.description === 'string' &&
    typeof o.systemInstructions === 'string' &&
    Array.isArray(o.toolIds) &&
    Array.isArray(o.mcpServerIds) &&
    Array.isArray(o.skillIds) &&
    typeof o.iconIndex === 'number' &&
    typeof o.author === 'string' &&
    typeof o.version === 'string' &&
    Array.isArray(o.tags) &&
    typeof o.featured === 'boolean' &&
    typeof o.downloads === 'number' &&
    typeof o.createdAt === 'number'
  );
}

function isValidWorkflowTemplate(raw: unknown): raw is WorkflowTemplate {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.description === 'string' &&
    typeof o.author === 'string' &&
    typeof o.version === 'string' &&
    Array.isArray(o.tags) &&
    typeof o.featured === 'boolean' &&
    typeof o.downloads === 'number' &&
    typeof o.createdAt === 'number' &&
    Array.isArray(o.nodes) &&
    Array.isArray(o.edges)
  );
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let agentsCache: MarketplaceAgent[] | null = null;
let workflowsCache: WorkflowTemplate[] | null = null;
let mcpCache: MCPManifest[] | null = null;
let skillsCache: SkillManifest[] | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch full manifests from subfolders in parallel.
 * For each entry in the index, tries to GET /<type>/<id>/manifest.json.
 * Falls back to the index entry itself if the manifest is missing.
 */
async function loadManifests<Index, Full>(
  indexUrl: string,
  manifestPath: (id: string) => string,
  merge: (index: Index, full: Full | null) => Full | null
): Promise<Full[]> {
  const index = await fetchJson<Index[]>(indexUrl);
  if (!Array.isArray(index) || index.length === 0) return [];

  const results = await Promise.all(
    index.map(async (entry) => {
      const id = (entry as Record<string, unknown>).id as string;
      const full = await fetchJson<Full>(manifestPath(id));
      return merge(entry, full);
    })
  );

  return results.filter((r) => r != null) as Full[];
}

// ─── Public loaders ──────────────────────────────────────────────────────────

/**
 * Load marketplace agents: reads index from /agents.json,
 * then fetches full manifests from /agents/<id>/manifest.json.
 */
export async function loadMarketplaceAgents(): Promise<MarketplaceAgent[]> {
  if (agentsCache) return agentsCache;

  const agents = await loadManifests<AgentIndexEntry, MarketplaceAgent>(
    '/agents.json',
    (id) => `/agents/${id}/manifest.json`,
    (index, full) => {
      // Full manifest is authoritative; fall back to index fields if missing
      const candidate = full ?? { ...index, systemInstructions: '', toolIds: [], mcpServerIds: [], skillIds: [], downloads: 0, createdAt: Date.now() };
      return isValidMarketplaceAgent(candidate) ? candidate : null;
    }
  );

  agentsCache = agents.map((a) => ({ ...a, source: 'community' as const }));
  return agentsCache;
}

/**
 * Load marketplace workflows: reads index from /workflows.json,
 * then fetches full manifests from /workflows/<id>/manifest.json.
 */
export async function loadMarketplaceWorkflows(): Promise<WorkflowTemplate[]> {
  if (workflowsCache) return workflowsCache;

  const workflows = await loadManifests<WorkflowIndexEntry, WorkflowTemplate>(
    '/workflows.json',
    (id) => `/workflows/${id}/manifest.json`,
    (index, full) => {
      const candidate = full ?? { ...index, nodes: [], edges: [], downloads: 0, createdAt: Date.now() };
      return isValidWorkflowTemplate(candidate) ? candidate : null;
    }
  );

  workflowsCache = workflows.map((w) => ({ ...w, source: 'community' as const }));
  return workflowsCache;
}

/**
 * Load MCP server catalog: reads index from /mcp.json,
 * then fetches full manifests from /mcp/<id>/manifest.json.
 */
export async function loadMarketplaceMcp(): Promise<MCPManifest[]> {
  if (mcpCache) return mcpCache;

  const mcps = await loadManifests<MCPManifest, MCPManifest>(
    '/mcp.json',
    (id) => `/mcp/${id}/manifest.json`,
    (_index, full) => full ?? _index
  );

  mcpCache = mcps;
  return mcpCache;
}

/**
 * Load skills catalog: reads index from /skills.json,
 * then fetches full manifests from /skills/<id>/manifest.json.
 */
export async function loadMarketplaceSkills(): Promise<SkillManifest[]> {
  if (skillsCache) return skillsCache;

  const skills = await loadManifests<SkillManifest, SkillManifest>(
    '/skills.json',
    (id) => `/skills/${id}/manifest.json`,
    (_index, full) => full ?? _index
  );

  skillsCache = skills;
  return skillsCache;
}

/** Clear in-memory cache (e.g. for testing or manual refresh) */
export function clearMarketplaceCache(): void {
  agentsCache = null;
  workflowsCache = null;
  mcpCache = null;
  skillsCache = null;
}
