'use strict';

/** MCP tools disabled by default on filesystem servers (risk of memory/context blow-up). */
const MCP_TOOL_DENYLIST_DEFAULT = new Set(['directory_tree']);

const FILESYSTEM_SERVER_IDS = new Set(['filesystem', 'filesystem_mcp']);

/**
 * @param {string} name
 * @returns {string}
 */
function normalizeMcpId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * @param {{ name?: string; command?: string; args?: string[] }} server
 * @returns {boolean}
 */
function isFilesystemMcpServer(server) {
  if (!server) return false;
  const id = normalizeMcpId(server.name);
  if (FILESYSTEM_SERVER_IDS.has(id)) return true;
  const args = Array.isArray(server.args) ? server.args : [];
  return args.some((a) => String(a).includes('server-filesystem'));
}

/**
 * @param {string} toolName
 * @param {{ name?: string; command?: string; args?: string[] }} server
 * @returns {boolean}
 */
function isMcpToolDisabledByDefault(toolName, server) {
  if (!isFilesystemMcpServer(server)) return false;
  return MCP_TOOL_DENYLIST_DEFAULT.has(normalizeMcpId(toolName));
}

/**
 * @param {string} toolName
 * @param {{ name?: string; command?: string; args?: string[]; enabledToolIds?: string[] }} server
 * @returns {boolean}
 */
function isMcpToolAllowedForAgent(toolName, server) {
  const id = normalizeMcpId(toolName);
  if (!isMcpToolDisabledByDefault(id, server)) return true;
  const enabled = Array.isArray(server?.enabledToolIds)
    ? server.enabledToolIds.map((x) => normalizeMcpId(x))
    : [];
  return enabled.includes(id);
}

module.exports = {
  MCP_TOOL_DENYLIST_DEFAULT,
  normalizeMcpId,
  isFilesystemMcpServer,
  isMcpToolDisabledByDefault,
  isMcpToolAllowedForAgent,
};
