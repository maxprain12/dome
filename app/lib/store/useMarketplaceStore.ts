/**
 * Marketplace Store - Unified Zustand store for marketplace items
 * 
 * Manages state for:
 * - Agents from GitHub repositories
 * - Workflows from GitHub repositories
 * - MCP servers from GitHub repositories
 * - Skills from GitHub and skills.sh
 * - Plugins from local directory
 */

import { create } from 'zustand';
import type { MarketplaceAgent } from '@/types';

interface MarketplaceSource {
  type: 'github' | 'skills_sh' | 'local';
  sourceId: string;
  owner?: string;
  repo?: string;
  url?: string | null;
  dir?: string;
}

export interface MarketplaceWorkflow {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  nodes: unknown[];
  edges: unknown[];
  category?: string;
  author: string;
  version: string;
  tags: string[];
  featured: boolean;
  downloads: number;
  createdAt?: number;
  _source?: MarketplaceSource;
}

export interface MCPServerConfig {
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
  _source?: MarketplaceSource;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string[];
  category?: string;
  installs?: number;
  repo?: string;
  _source?: MarketplaceSource;
}

export interface MarketplacePlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  type?: string;
  sprites?: unknown;
  entry?: string;
  permissions?: string[];
  enabled?: boolean;
  dir?: string;
  _source?: MarketplaceSource;
}

export interface MarketplaceConfig {
  agents: {
    sources: Array<{
      id: string;
      type: string;
      owner?: string;
      repo?: string;
      path?: string;
      ref?: string;
      enabled: boolean;
    }>;
  };
  workflows: {
    sources: Array<{
      id: string;
      type: string;
      owner?: string;
      repo?: string;
      path?: string;
      ref?: string;
      enabled: boolean;
    }>;
  };
  mcp: {
    sources: Array<{
      id: string;
      type: string;
      owner?: string;
      repo?: string;
      path?: string;
      ref?: string;
      enabled: boolean;
    }>;
  };
  skills: {
    sources: Array<{
      id: string;
      type: string;
      category?: string;
      owner?: string;
      repo?: string;
      path?: string;
      ref?: string;
      enabled: boolean;
    }>;
  };
  plugins: {
    sources: Array<{
      id: string;
      type: string;
      path?: string;
      enabled: boolean;
    }>;
  };
}

interface MarketplaceState {
  // Data
  agents: MarketplaceAgent[];
  workflows: MarketplaceWorkflow[];
  mcpServers: MCPServerConfig[];
  skills: MarketplaceSkill[];
  plugins: MarketplacePlugin[];
  
  // Config
  config: MarketplaceConfig | null;
  
  // UI State
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  
  // Actions
  fetchAll: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  fetchMcp: () => Promise<void>;
  fetchSkills: () => Promise<void>;
  fetchPlugins: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  // Initial state
  agents: [],
  workflows: [],
  mcpServers: [],
  skills: [],
  plugins: [],
  config: null,
  loading: false,
  error: null,
  lastUpdated: null,

  // Fetch all marketplace items
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-all');
      if (result.success) {
        set({
          agents: result.data.agents || [],
          workflows: result.data.workflows || [],
          mcpServers: result.data.mcp || [],
          skills: result.data.skills || [],
          plugins: result.data.plugins || [],
          lastUpdated: result.data.lastUpdated || Date.now(),
          loading: false
        });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch agents only
  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-agents');
      if (result.success) {
        set({ agents: result.data || [], loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch workflows only
  fetchWorkflows: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-workflows');
      if (result.success) {
        set({ workflows: result.data || [], loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch MCP servers only
  fetchMcp: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-mcp');
      if (result.success) {
        set({ mcpServers: result.data || [], loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch skills only
  fetchSkills: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-skills');
      if (result.success) {
        set({ skills: result.data || [], loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch plugins only
  fetchPlugins: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:fetch-plugins');
      if (result.success) {
        set({ plugins: result.data || [], loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Fetch configuration
  fetchConfig: async () => {
    try {
      const result = await window.electron.invoke('marketplace:get-config');
      if (result.success) {
        set({ config: result.data });
      }
    } catch (err) {
      console.error('[MarketplaceStore] Failed to fetch config:', err);
    }
  },

  // Refresh all data (clear cache and re-fetch)
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.invoke('marketplace:refresh');
      if (result.success) {
        set({
          agents: result.data.agents || [],
          workflows: result.data.workflows || [],
          mcpServers: result.data.mcp || [],
          skills: result.data.skills || [],
          plugins: result.data.plugins || [],
          lastUpdated: result.data.lastUpdated || Date.now(),
          loading: false
        });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },

  // Clear error
  clearError: () => set({ error: null })
}));
