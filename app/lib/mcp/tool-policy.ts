/** MCP tools disabled by default on filesystem servers (memory/context risk). */
export const MCP_TOOL_DENYLIST_DEFAULT = new Set(['directory_tree']);

const FILESYSTEM_SERVER_IDS = new Set(['filesystem', 'filesystem_mcp']);

export function normalizeMcpPolicyId(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function isFilesystemMcpServer(server: {
  name?: string;
  command?: string;
  args?: string[];
}): boolean {
  const id = normalizeMcpPolicyId(server.name ?? '');
  if (FILESYSTEM_SERVER_IDS.has(id)) return true;
  const args = Array.isArray(server.args) ? server.args : [];
  return args.some((a) => String(a).includes('server-filesystem'));
}

export function isMcpToolDisabledByDefault(
  toolName: string,
  server: { name?: string; command?: string; args?: string[] },
): boolean {
  if (!isFilesystemMcpServer(server)) return false;
  return MCP_TOOL_DENYLIST_DEFAULT.has(normalizeMcpPolicyId(toolName));
}

export function isDirectoryTreeTool(toolName: string): boolean {
  return normalizeMcpPolicyId(toolName) === 'directory_tree';
}
