/* eslint-disable no-console */
/**
 * Deep link handler for dome:// URLs
 * Handles dome://resource/ID/TYPE and dome://studio/ID/TYPE
 * OAuth dome://mcp-auth/... is delegated to mcpOauth
 * OAuth dome://calendar-oauth/... is delegated to googleCalendarOAuth
 */
const mcpOauth = require('../mcp/mcp-oauth.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const googleCalendarOAuth = require('../calendar/google-calendar-service.cjs');
const { openWorkspaceForResource, openFolderForFolder } = require('../ipc/core/window.cjs');

const SETTINGS_PATH_REGEX = /^dome:\/\/settings\/([^/?#]+)/;
const FOLDER_REGEX = /^dome:\/\/folder\/([^/?#]+)/;
const RESOLVE_REGEX = /^dome:\/\/resolve\/(.+)$/;
const RESOURCE_REGEX = /^dome:\/\/resource\/([^/]+)(?:\/([^?#]+))?(?:\?([^#]*))?/;
const STUDIO_REGEX = /^dome:\/\/studio\/([^/]+)/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the optional section name from a dome://settings[...] URL. */
function extractSettingsSection(url) {
  let section;
  try {
    const parsed = new URL(url);
    const path = (parsed.pathname || '').replace(/^\/+/, '');
    if (path && path !== 'settings') section = path;
    const q = parsed.searchParams.get('section');
    if (q) section = q;
  } catch {
    /* ignore */
  }
  if (!section && SETTINGS_PATH_REGEX.test(url)) {
    section = url.match(SETTINGS_PATH_REGEX)?.[1];
  }
  return section;
}

/** Restore + focus the first non-destroyed window so deep links land visibly. */
function focusFirstAvailableWindow(windowManager) {
  const windows = windowManager.getAll?.() || [];
  for (const win of windows) {
    if (!win || win.isDestroyed()) continue;
    if (typeof win.isMinimized === 'function' && win.isMinimized()) win.restore();
    win.focus();
    return;
  }
}

async function handleSettingsDomeUrl(url, deps) {
  const section = extractSettingsSection(url);
  try {
    focusFirstAvailableWindow(deps.windowManager);
    deps.windowManager.broadcast('dome:open-settings-in-tab', {
      section: section || 'ai',
    });
    console.log('[DeepLink] Opened settings tab', section || 'ai');
    return true;
  } catch (err) {
    console.error('[DeepLink] Error opening settings:', err);
    return false;
  }
}

async function handleFolderDomeUrl(url, deps) {
  const folderMatch = url.match(FOLDER_REGEX);
  if (!folderMatch) return false;
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

/** Find a resource id+type for a free-form slug by ID or by title within the active project. */
function resolveSlugToResource(slug, queries) {
  let resourceId = null;
  let resourceType = 'note';

  if (UUID_REGEX.test(slug)) {
    const r = queries.getResourceById.get(slug);
    if (r) {
      resourceId = r.id;
      resourceType = r.type || 'note';
    }
  }
  if (resourceId) return { resourceId, resourceType };

  const altSlug = slug.replace(/^Ver:\s*/i, '').trim();
  const searchSlug = altSlug || slug;
  const searchTerm = `%${searchSlug}%`;
  // Resolve titles only within the active project (never cross-project).
  const activeProjectId = queries.getSetting.get('last_project_id')?.value;
  const results = activeProjectId
    ? queries.searchForMentionByProject.all(searchTerm, searchTerm, activeProjectId)
    : queries.searchForMention.all(searchTerm, searchTerm);
  const match =
    results.find((x) => (x.title || '').toLowerCase() === searchSlug.toLowerCase()) ??
    results.find((x) => (x.title || '').toLowerCase() === slug.toLowerCase()) ??
    results[0];
  if (match) {
    resourceId = match.id;
    resourceType = match.type || 'note';
  }
  return { resourceId, resourceType };
}

async function handleResolveDomeUrl(url, deps) {
  const resolveMatch = url.match(RESOLVE_REGEX);
  if (!resolveMatch) return false;
  const slug = decodeURIComponent(resolveMatch[1]);
  const queries = deps.database.getQueries();
  const { resourceId, resourceType } = resolveSlugToResource(slug, queries);
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

/** Parse the optional `?page=N` query string from a dome://resource match. */
function parseResourceOptions(queryString) {
  if (!queryString) return {};
  const params = new URLSearchParams(queryString);
  const pageVal = params.get('page');
  if (!pageVal) return {};
  const page = parseInt(pageVal, 10);
  if (Number.isNaN(page) || page < 1) return {};
  return { page };
}

async function handleResourceDomeUrl(url, deps) {
  const resourceMatch = url.match(RESOURCE_REGEX);
  if (!resourceMatch) return false;
  const resourceId = resourceMatch[1];
  const resourceType = resourceMatch[2] || 'note';
  const options = parseResourceOptions(resourceMatch[3] || '');
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

async function handleStudioDomeUrl(url, deps) {
  const studioMatch = url.match(STUDIO_REGEX);
  if (!studioMatch) return false;
  const outputId = studioMatch[1];
  deps.windowManager.broadcast('dome:open-studio-output', { outputId });
  console.log('[DeepLink] Broadcast open studio output:', outputId);
  return true;
}

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

  // Dome provider: connect (dashboard-initiated) vs OAuth callback (desktop-initiated)
  if (url.startsWith('dome://dome-auth/connect')) {
    return domeOauth.handleConnectCallback(url, deps.database, deps.windowManager);
  }
  if (url.startsWith('dome://dome-auth/')) {
    return domeOauth.handleOAuthCallback(url, deps.database, deps.windowManager);
  }

  // Google Calendar OAuth callback
  if (url.startsWith('dome://calendar-oauth/')) {
    return googleCalendarOAuth.handleOAuthCallback(url);
  }

  // dome://settings or dome://settings/ai — focus app + open Settings tab
  // Used as OAuth success backlink from localhost callback pages.
  if (url.startsWith('dome://settings')) {
    return handleSettingsDomeUrl(url, deps);
  }

  if (FOLDER_REGEX.test(url)) return handleFolderDomeUrl(url, deps);
  if (RESOLVE_REGEX.test(url)) return handleResolveDomeUrl(url, deps);
  if (RESOURCE_REGEX.test(url)) return handleResourceDomeUrl(url, deps);
  if (STUDIO_REGEX.test(url)) return handleStudioDomeUrl(url, deps);

  return false;
}

module.exports = { handleDomeUrl };
