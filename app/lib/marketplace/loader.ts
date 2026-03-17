/**
 * Marketplace Data Loader - Loads and processes marketplace data from IPC
 *
 * Provides:
 * - Loads from JSON files (agents.json, workflows.json, skills.json, plugins.json)
 * - Data transformation and normalization
 * - Error handling with graceful degradation
 */

import { useMarketplaceStore, type MarketplaceAgent, type MarketplaceWorkflow, type MCPServerConfig, type MarketplaceSkill, type MarketplacePlugin } from '../store/useMarketplaceStore';

// Source type labels for display
export const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  skills_sh: 'skills.sh',
  local: 'Local',
  'dome-team': 'Dome Team'
};

/**
 * Interface for available marketplace items (from public JSON files)
 */
export interface AvailablePlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  repo?: string;
}

export interface AvailableSkill {
  id: string;
  name: string;
  author: string;
  description: string;
  repo?: string;
}

/**
 * Fetch available plugins from public JSON
 */
export async function loadAvailablePlugins(): Promise<AvailablePlugin[]> {
  try {
    const response = await fetch('/plugins.json');
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to load available plugins:', err);
  }
  return [];
}

/**
 * Fetch available skills from public JSON
 */
export async function loadAvailableSkills(): Promise<AvailableSkill[]> {
  try {
    const response = await fetch('/skills.json');
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to load available skills:', err);
  }
  return [];
}

/**
 * Get display label for a source
 */
export function getSourceLabel(source: { type?: string; sourceId?: string; owner?: string } | undefined): string {
  if (!source) return 'Unknown';
  
  if (source.type === 'github' && source.owner) {
    return source.owner;
  }
  
  return SOURCE_LABELS[source.type || ''] || SOURCE_LABELS[source.sourceId || ''] || 'Unknown';
}

/**
 * Add source metadata to hardcoded items
 */
function addSourceMetadata<T extends { _source?: unknown }>(items: T[], sourceType: string, sourceId: string): T[] {
  return items.map(item => ({
    ...item,
    _source: {
      type: sourceType,
      sourceId
    }
  }));
}

/**
 * Load all marketplace data with fallback
 */
export async function loadMarketplaceData(): Promise<{
  agents: MarketplaceAgent[];
  workflows: MarketplaceWorkflow[];
  mcpServers: MCPServerConfig[];
  skills: MarketplaceSkill[];
  plugins: MarketplacePlugin[];
}> {
  const store = useMarketplaceStore.getState();
  
  try {
    // Try to fetch from GitHub/sources first
    await store.fetchAll();
    
    // Return data from store
    return {
      agents: useMarketplaceStore.getState().agents,
      workflows: useMarketplaceStore.getState().workflows,
      mcpServers: useMarketplaceStore.getState().mcpServers,
      skills: useMarketplaceStore.getState().skills,
      plugins: useMarketplaceStore.getState().plugins
    };
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch from sources:', err);

    // Return empty arrays - no hardcoded fallbacks
    return {
      agents: [],
      workflows: [],
      mcpServers: [],
      skills: [],
      plugins: []
    };
  }
}

/**
 * Load agents with fallback
 */
export async function loadAgents(): Promise<MarketplaceAgent[]> {
  try {
    await useMarketplaceStore.getState().fetchAgents();
    const agents = useMarketplaceStore.getState().agents;

    if (agents.length > 0) {
      return agents;
    }
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch agents:', err);
  }

  // Return empty array - no hardcoded fallback
  return [];
}

/**
 * Load workflows with fallback
 */
export async function loadWorkflows(): Promise<MarketplaceWorkflow[]> {
  try {
    await useMarketplaceStore.getState().fetchWorkflows();
    const workflows = useMarketplaceStore.getState().workflows;

    if (workflows.length > 0) {
      return workflows;
    }
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch workflows:', err);
  }

  // Return empty array - no hardcoded fallback
  return [];
}

/**
 * Load MCP servers
 */
export async function loadMcpServers(): Promise<MCPServerConfig[]> {
  try {
    await useMarketplaceStore.getState().fetchMcp();
    return useMarketplaceStore.getState().mcpServers;
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch MCP servers:', err);
    return [];
  }
}

/**
 * Load skills
 */
export async function loadSkills(): Promise<MarketplaceSkill[]> {
  try {
    await useMarketplaceStore.getState().fetchSkills();
    return useMarketplaceStore.getState().skills;
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch skills:', err);
    return [];
  }
}

/**
 * Load plugins
 */
export async function loadPlugins(): Promise<MarketplacePlugin[]> {
  try {
    await useMarketplaceStore.getState().fetchPlugins();
    return useMarketplaceStore.getState().plugins;
  } catch (err) {
    console.warn('[MarketplaceLoader] Failed to fetch plugins:', err);
    return [];
  }
}

/**
 * Refresh all marketplace data
 */
export async function refreshMarketplace(): Promise<void> {
  await useMarketplaceStore.getState().refresh();
}

/**
 * Filter items by source type
 */
export function filterBySource<T extends { _source?: { type?: string; sourceId?: string } }>(
  items: T[],
  sourceType: string
): T[] {
  return items.filter(item => item._source?.type === sourceType);
}

/**
 * Filter items by source ID
 */
export function filterBySourceId<T extends { _source?: { sourceId?: string } }>(
  items: T[],
  sourceId: string
): T[] {
  return items.filter(item => item._source?.sourceId === sourceId);
}

/**
 * Search items by query
 */
export function searchItems<T extends { name?: string; description?: string; tags?: string[] }>(
  items: T[],
  query: string
): T[] {
  const lowerQuery = query.toLowerCase();
  
  return items.filter(item => {
    const name = item.name?.toLowerCase() || '';
    const description = item.description?.toLowerCase() || '';
    const tags = item.tags?.join(' ').toLowerCase() || '';
    
    return name.includes(lowerQuery) || description.includes(lowerQuery) || tags.includes(lowerQuery);
  });
}

/**
 * Sort items by various criteria
 */
export function sortItems<T extends { downloads?: number; featured?: boolean; installs?: number }>(
  items: T[],
  sortBy: 'downloads' | 'name' | 'featured' | 'recent' = 'downloads',
  descending = true
): T[] {
  const sorted = [...items];
  
  switch (sortBy) {
    case 'downloads':
    case 'installs':
      sorted.sort((a, b) => (b.downloads || b.installs || 0) - (a.downloads || a.installs || 0));
      break;
    case 'name':
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'featured':
      sorted.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
      break;
    case 'recent':
      sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
  }
  
  if (!descending && sortBy !== 'name') {
    sorted.reverse();
  }
  
  return sorted;
}
