import { db } from '@/lib/db/client';
import type { MCPServerConfig, MCPToolConfig } from '@/types';

export function normalizeMcpServerId(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeMcpToolId(idOrName: string): string {
  return normalizeMcpServerId(idOrName);
}

function normalizeTool(tool: unknown): MCPToolConfig | null {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  const candidate = tool as Record<string, unknown>;
  const rawName =
    typeof candidate.name === 'string'
      ? candidate.name
      : typeof candidate.id === 'string'
        ? candidate.id
        : '';
  const name = rawName.trim();

  if (!name) {
    return null;
  }

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? normalizeMcpToolId(candidate.id)
        : normalizeMcpToolId(name),
    name,
    description:
      typeof candidate.description === 'string' && candidate.description.trim()
        ? candidate.description
        : undefined,
    enabled: candidate.enabled !== false,
    inputSchema:
      candidate.inputSchema && typeof candidate.inputSchema === 'object' && !Array.isArray(candidate.inputSchema)
        ? (candidate.inputSchema as Record<string, unknown>)
        : undefined,
  };
}

function normalizeServer(server: unknown): MCPServerConfig | null {
  if (!server || typeof server !== 'object') {
    return null;
  }

  const candidate = server as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';

  if (!name) {
    return null;
  }

  const type = candidate.type === 'http' || candidate.type === 'sse' ? candidate.type : 'stdio';
  const tools = Array.isArray(candidate.tools)
    ? candidate.tools
        .map((tool) => normalizeTool(tool))
        .filter((tool): tool is MCPToolConfig => tool !== null)
    : undefined;
  const enabledToolIds = Array.isArray(candidate.enabledToolIds)
    ? candidate.enabledToolIds
        .map((id) => (typeof id === 'string' ? normalizeMcpToolId(id) : ''))
        .filter(Boolean)
    : undefined;

  return {
    name,
    type,
    command: typeof candidate.command === 'string' ? candidate.command : undefined,
    args: Array.isArray(candidate.args)
      ? candidate.args.map((arg) => String(arg)).filter(Boolean)
      : undefined,
    url: typeof candidate.url === 'string' ? candidate.url : undefined,
    headers:
      candidate.headers && typeof candidate.headers === 'object' && !Array.isArray(candidate.headers)
        ? (candidate.headers as Record<string, string>)
        : undefined,
    env:
      candidate.env && typeof candidate.env === 'object' && !Array.isArray(candidate.env)
        ? (candidate.env as Record<string, string>)
        : undefined,
    enabled: candidate.enabled !== false,
    tools,
    enabledToolIds,
    lastDiscoveryAt:
      typeof candidate.lastDiscoveryAt === 'number' ? candidate.lastDiscoveryAt : undefined,
    lastDiscoveryError:
      typeof candidate.lastDiscoveryError === 'string'
        ? candidate.lastDiscoveryError
        : candidate.lastDiscoveryError === null
          ? null
          : undefined,
  };
}

export function parseMcpServersSetting(raw: string | null | undefined): MCPServerConfig[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((server) => normalizeServer(server))
        .filter((server): server is MCPServerConfig => server !== null);
    }

    if (parsed && typeof parsed === 'object' && 'mcpServers' in parsed) {
      const mcpServers = (parsed as { mcpServers?: Record<string, unknown> }).mcpServers;
      if (!mcpServers || typeof mcpServers !== 'object') {
        return [];
      }

      return Object.entries(mcpServers)
        .map(([name, config]) => normalizeServer({ ...(config as Record<string, unknown>), name }))
        .filter((server): server is MCPServerConfig => server !== null);
    }

    return [];
  } catch {
    return [];
  }
}

export async function loadMcpServersSetting(): Promise<MCPServerConfig[]> {
  if (!db.isAvailable()) {
    return [];
  }

  const result = await db.getMcpServers();
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function saveMcpServersSetting(servers: MCPServerConfig[]): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) {
    return { success: false, error: 'Database API not available' };
  }

  const result = await db.replaceMcpServers(servers);
  return result.success ? { success: true } : { success: false, error: result.error };
}

export function getEnabledMcpToolIds(server: MCPServerConfig): string[] {
  if (Array.isArray(server.enabledToolIds) && server.enabledToolIds.length > 0) {
    return server.enabledToolIds.map((id) => normalizeMcpToolId(id));
  }

  if (Array.isArray(server.tools) && server.tools.length > 0) {
    return server.tools
      .filter((tool) => tool.enabled !== false)
      .map((tool) => normalizeMcpToolId(tool.id || tool.name));
  }

  return [];
}

export function findMcpServerByName(servers: MCPServerConfig[], serverName: string): MCPServerConfig | undefined {
  const targetId = normalizeMcpServerId(serverName);
  return servers.find((server) => normalizeMcpServerId(server.name) === targetId);
}

export function inferMcpServerForTool(
  servers: MCPServerConfig[],
  toolName: string
): MCPServerConfig | undefined {
  const normalizedToolId = normalizeMcpToolId(toolName);
  return servers.find((server) =>
    (server.tools ?? []).some((tool) => normalizeMcpToolId(tool.id || tool.name) === normalizedToolId)
  );
}

export function areAllServerToolsEnabled(server: MCPServerConfig): boolean {
  if (!Array.isArray(server.tools) || server.tools.length === 0) {
    return true;
  }

  const enabledIds = new Set(getEnabledMcpToolIds(server));
  return server.tools.every((tool) => enabledIds.has(normalizeMcpToolId(tool.id || tool.name)));
}

export function updateServerTools(
  server: MCPServerConfig,
  tools: MCPToolConfig[],
  error?: string | null
): MCPServerConfig {
  const normalizedTools = tools
    .map((tool) => normalizeTool(tool))
    .filter((tool): tool is MCPToolConfig => tool !== null);
  const currentEnabled = new Set(getEnabledMcpToolIds(server));
  const nextEnabled = normalizedTools.length > 0
    ? normalizedTools
        .filter((tool) => currentEnabled.size === 0 || currentEnabled.has(normalizeMcpToolId(tool.id || tool.name)))
        .map((tool) => normalizeMcpToolId(tool.id || tool.name))
    : [];

  return {
    ...server,
    tools: normalizedTools.map((tool) => ({
      ...tool,
      enabled: nextEnabled.length === 0 ? tool.enabled !== false : nextEnabled.includes(normalizeMcpToolId(tool.id || tool.name)),
    })),
    enabledToolIds:
      normalizedTools.length > 0
        ? (nextEnabled.length > 0
            ? Array.from(new Set(nextEnabled))
            : normalizedTools.map((tool) => normalizeMcpToolId(tool.id || tool.name)))
        : [],
    lastDiscoveryAt: Date.now(),
    lastDiscoveryError: error ?? null,
  };
}

export function toggleGlobalMcpTool(
  server: MCPServerConfig,
  toolId: string,
  enabled: boolean
): MCPServerConfig {
  const normalizedToolId = normalizeMcpToolId(toolId);
  const enabledIds = new Set(getEnabledMcpToolIds(server));

  if (enabled) {
    enabledIds.add(normalizedToolId);
  } else {
    enabledIds.delete(normalizedToolId);
  }

  const nextEnabledIds = Array.from(enabledIds);

  return {
    ...server,
    enabledToolIds: nextEnabledIds,
    tools: server.tools?.map((tool) => ({
      ...tool,
      enabled: nextEnabledIds.includes(normalizeMcpToolId(tool.id || tool.name)),
    })),
  };
}

export function toggleAllGlobalMcpTools(server: MCPServerConfig, enabled: boolean): MCPServerConfig {
  const allToolIds = (server.tools ?? []).map((tool) => normalizeMcpToolId(tool.id || tool.name));

  return {
    ...server,
    enabledToolIds: enabled ? allToolIds : [],
    tools: server.tools?.map((tool) => ({
      ...tool,
      enabled,
    })),
  };
}
