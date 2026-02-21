/* eslint-disable no-console */
/**
 * Deep link handler for dome:// URLs
 * Handles dome://resource/ID/TYPE and dome://studio/ID/TYPE
 * OAuth dome://mcp-auth/... is delegated to mcpOauth
 */
const mcpOauth = require('./mcp-oauth.cjs');
const { openWorkspaceForResource } = require('./ipc/window.cjs');

/**
 * Handle a dome:// URL (resource, studio, or OAuth)
 * @param {string} url - The dome:// URL
 * @param {Object} deps - { database, windowManager, nativeTheme }
 * @returns {Promise<boolean>} - true if handled, false otherwise
 */
async function handleDomeUrl(url, deps) {
  if (!url || typeof url !== 'string' || !url.startsWith('dome://')) {
    return false;
  }

  // OAuth callback - delegate to MCP OAuth
  if (url.startsWith('dome://mcp-auth/')) {
    return mcpOauth.handleOAuthCallback(url);
  }

  // dome://resource/ID/TYPE - open workspace
  const resourceMatch = url.match(/^dome:\/\/resource\/([^/]+)(?:\/([^/]+))?/);
  if (resourceMatch) {
    const resourceId = resourceMatch[1];
    const resourceType = resourceMatch[2] || 'note';
    try {
      const result = await openWorkspaceForResource(resourceId, resourceType, deps);
      if (result.success) {
        console.log('[DeepLink] Opened resource:', resourceId);
        return true;
      }
      console.warn('[DeepLink] Failed to open resource:', result.error);
      return false;
    } catch (err) {
      console.error('[DeepLink] Error opening resource:', err);
      return false;
    }
  }

  // dome://studio/ID/TYPE - broadcast to renderer to open studio output
  const studioMatch = url.match(/^dome:\/\/studio\/([^/]+)/);
  if (studioMatch) {
    const outputId = studioMatch[1];
    deps.windowManager.broadcast('dome:open-studio-output', { outputId });
    console.log('[DeepLink] Broadcast open studio output:', outputId);
    return true;
  }

  return false;
}

module.exports = { handleDomeUrl };
