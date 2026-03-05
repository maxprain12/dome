/**
 * Dynamic marketplace loaders — fetch community catalogs from JSON and merge with official catalogs.
 * Similar to plugins.json for the plugin system.
 */

import type { MarketplaceAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';
import { MARKETPLACE_CATALOG } from './catalog';
import { WORKFLOW_CATALOG } from './workflow-catalog';

const AGENTS_JSON = '/agents.json';
const WORKFLOWS_JSON = '/workflows.json';

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

let agentsCache: MarketplaceAgent[] | null = null;
let workflowsCache: WorkflowTemplate[] | null = null;

/**
 * Load marketplace agents: official catalog + community from /agents.json.
 * Falls back to official catalog only if fetch fails.
 */
export async function loadMarketplaceAgents(): Promise<MarketplaceAgent[]> {
  if (agentsCache) return agentsCache;

  try {
    const res = await fetch(AGENTS_JSON);
    if (!res.ok) return [...MARKETPLACE_CATALOG];

    const data = (await res.json()) as unknown;
    const community = Array.isArray(data) ? data : [];
    const valid = community.filter(isValidMarketplaceAgent);
    const officialIds = new Set(MARKETPLACE_CATALOG.map((a) => a.id));
    const merged = [...MARKETPLACE_CATALOG, ...valid.filter((a) => !officialIds.has(a.id))];
    agentsCache = merged;
    return merged;
  } catch {
    return [...MARKETPLACE_CATALOG];
  }
}

/**
 * Load marketplace workflows: official catalog + community from /workflows.json.
 * Falls back to official catalog only if fetch fails.
 */
export async function loadMarketplaceWorkflows(): Promise<WorkflowTemplate[]> {
  if (workflowsCache) return workflowsCache;

  try {
    const res = await fetch(WORKFLOWS_JSON);
    if (!res.ok) return [...WORKFLOW_CATALOG];

    const data = (await res.json()) as unknown;
    const community = Array.isArray(data) ? data : [];
    const valid = community.filter(isValidWorkflowTemplate);
    const officialIds = new Set(WORKFLOW_CATALOG.map((w) => w.id));
    const merged = [...WORKFLOW_CATALOG, ...valid.filter((w) => !officialIds.has(w.id))];
    workflowsCache = merged;
    return merged;
  } catch {
    return [...WORKFLOW_CATALOG];
  }
}

/** Clear in-memory cache (e.g. for testing or manual refresh) */
export function clearMarketplaceCache(): void {
  agentsCache = null;
  workflowsCache = null;
}
