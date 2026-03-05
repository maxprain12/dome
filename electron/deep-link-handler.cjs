/* eslint-disable no-console */
/**
 * Deep link handler for dome:// URLs
 * Handles dome://resource/ID/TYPE and dome://studio/ID/TYPE
 * OAuth dome://mcp-auth/... is delegated to mcpOauth
 * OAuth dome://calendar-oauth/... is delegated to googleCalendarOAuth
 */
const mcpOauth = require('./mcp-oauth.cjs');
const domeOauth = require('./dome-oauth.cjs');
const googleCalendarOAuth = require('./google-calendar-service.cjs');
const { openWorkspaceForResource, openFolderForFolder } = require('./ipc/window.cjs');

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

  // Dome provider OAuth callback
  if (url.startsWith('dome://dome-auth/')) {
    return domeOauth.handleOAuthCallback(url, deps.database);
  }

  // Google Calendar OAuth callback
  if (url.startsWith('dome://calendar-oauth/')) {
    return googleCalendarOAuth.handleOAuthCallback(url);
  }

  // dome://folder/ID - open Home with folder selected
  const folderMatch = url.match(/^dome:\/\/folder\/([^/?#]+)/);
  if (folderMatch) {
    const folderId = folderMatch[1];
    try {
      const result = await openFolderForFolder(folderId, deps);
      if (result.success) {
        console.log('[DeepLink] Opened folder:', folderId);
        return true;
      }
      console.warn('[DeepLink] Failed to open folder:', result.error);
      return false;
    } catch (err) {
      console.error('[DeepLink] Error opening folder:', err);
      return false;
    }
  }

  // dome://resolve/SLUG - resolve by title or ID, then open workspace
  const resolveMatch = url.match(/^dome:\/\/resolve\/(.+)$/);
  if (resolveMatch) {
    const slug = decodeURIComponent(resolveMatch[1]);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const queries = deps.database.getQueries();
    let resourceId = null;
    let resourceType = 'note';

    if (UUID_REGEX.test(slug)) {
      const r = queries.getResourceById.get(slug);
      if (r) {
        resourceId = r.id;
        resourceType = r.type || 'note';
      }
    }
    if (!resourceId) {
      const altSlug = slug.replace(/^Ver:\s*/i, '').trim();
      const searchSlug = altSlug || slug;
      const searchTerm = `%${searchSlug}%`;
      const results = queries.searchForMention.all(searchTerm, searchTerm);
      const match =
        results.find((x) => (x.title || '').toLowerCase() === searchSlug.toLowerCase()) ??
        results.find((x) => (x.title || '').toLowerCase() === slug.toLowerCase()) ??
        results[0];
      if (match) {
        resourceId = match.id;
        resourceType = match.type || 'note';
      }
    }
    if (resourceId) {
      try {
        const result = await openWorkspaceForResource(resourceId, resourceType, {}, deps);
        if (result.success) {
          console.log('[DeepLink] Opened resource via resolve:', resourceId);
          return true;
        }
      } catch (err) {
        console.error('[DeepLink] Error opening resolved resource:', err);
      }
    }
    console.warn('[DeepLink] Could not resolve slug:', slug);
    return false;
  }

  // dome://resource/ID/TYPE or dome://resource/ID/TYPE?page=N - open workspace
  const resourceMatch = url.match(/^dome:\/\/resource\/([^/]+)(?:\/([^?#]+))?(?:\?([^#]*))?/);
  if (resourceMatch) {
    const resourceId = resourceMatch[1];
    let resourceType = resourceMatch[2] || 'note';
    const queryString = resourceMatch[3] || '';
    let options = {};
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const pageVal = params.get('page');
      if (pageVal) {
        const page = parseInt(pageVal, 10);
        if (!Number.isNaN(page) && page >= 1) {
          options = { page };
        }
      }
    }
    try {
      const result = await openWorkspaceForResource(resourceId, resourceType, options, deps);
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
