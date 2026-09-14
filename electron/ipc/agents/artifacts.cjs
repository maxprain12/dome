/* eslint-disable no-console */
const { serializeArtifactRecord, parseJsonState } = require('../../artifacts/artifact-serialize.cjs');
const { syncLinkedArtifactsForResource } = require('../../artifacts/artifact-link-sync.cjs');
const vaultStore = require('../../storage/vault-store.cjs');
const { createArtifactService, inlineJson, escapeHtml } = require('../../artifacts/artifact-service.cjs');
const { EXPORT_THEME } = require('../../artifacts/artifact-vault-mirror.cjs');
const frameRegistry = require('../../artifacts/artifact-frame-registry.cjs');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mirrorArtifactToVault(resourceId, deps) {
  const mirror = vaultStore.writeArtifactHtmlMirror({ id: resourceId }, deps);
  if (!mirror.success) {
    console.warn('[Artifact] vault mirror write failed:', mirror.error);
  }
  return mirror;
}

function register({ ipcMain, windowManager, database, fileStorage }) {
  const vaultDeps = { database, fileStorage };
  const fs = require('fs');
  const { dialog } = require('electron');

  const service = createArtifactService({ database, fileStorage, windowManager });
  const mutation = (event, operation, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try { return operation(args); } catch (error) { return { success: false, error: error.message }; }
  };
  ipcMain.handle('artifact:create', (event, args) => mutation(event, service.create, args));
  ipcMain.handle('artifact:update', (event, args) => mutation(event, service.update, args));
  ipcMain.handle('artifact:delete', (event, resourceId) => mutation(event, service.remove, resourceId));

  ipcMain.handle('artifact:get', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      vaultStore.readArtifactHtmlMirror({ id: resourceId, reconcile: true }, vaultDeps);
      const queries = database.getQueries();
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = queries.getResourceById.get(resourceId);
      return { success: true, data: serializeArtifactRecord(artifact, resource, queries) };
    } catch (error) {
      console.error('[Artifact] Error getting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:list', (event, projectId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const rows = queries.listArtifactsByProject.all(projectId || 'default');
      const results = rows.map((row) => {
        const resource = queries.getResourceById.get(row.resource_id);
        return serializeArtifactRecord(row, resource, queries);
      });
      return { success: true, data: results };
    } catch (error) {
      console.error('[Artifact] Error listing:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:export', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = queries.getResourceById.get(resourceId);
      const mergedState = serializeArtifactRecord(artifact, resource, queries)?.state ?? parseJsonState(artifact.state);

      const bundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        artifact: {
          title: resource?.title ?? 'Untitled',
          artifact_type: artifact.artifact_type,
          template: artifact.template ?? null,
          state: mergedState,
          linked_resource_id: artifact.linked_resource_id ?? null,
        },
      };

      const result = await dialog.showSaveDialog({
        defaultPath: `${resource?.title ?? 'artifact'}.dome-artifact.json`,
        filters: [{ name: 'Dome Artifact', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, cancelled: true };

      fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error('[Artifact] Error exporting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:exportHtml', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = queries.getResourceById.get(resourceId);
      const mergedState = serializeArtifactRecord(artifact, resource, queries)?.state ?? parseJsonState(artifact.state);
      const stateObj = isPlainObject(mergedState) ? mergedState : {};
      const title = resource?.title ?? 'Untitled';
      const html = typeof stateObj.html === 'string' ? stateObj.html : '';
      const css = typeof stateObj.css === 'string' ? stateObj.css : '';
      const data = stateObj.data !== undefined ? stateObj.data : {};

      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${EXPORT_THEME}\n${css || ''}</style></head><body><script>window.DOME_DATA = ${inlineJson(data)};window.__dome_updateState = function(next){window.DOME_DATA=next};</script>${html || ''}</body></html>`;

      const result = await dialog.showSaveDialog({
        defaultPath: `${title}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, cancelled: true };

      fs.writeFileSync(result.filePath, doc, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error('[Artifact] Error exporting HTML:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:import', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Dome Artifact', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true };
      const raw = fs.readFileSync(result.filePaths[0], 'utf8');

      const bundle = JSON.parse(raw);
      if (!bundle?.artifact?.artifact_type) {
        return { success: false, error: 'Invalid artifact bundle' };
      }

      const { title, artifact_type, template, state } = bundle.artifact;
      return service.create({ title, artifactType: artifact_type, template, state });
    } catch (error) {
      console.error('[Artifact] Error importing:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:set-linked-resource', async (event, { resourceId, linkedResourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId || typeof resourceId !== 'string') {
      return { success: false, error: 'resourceId required' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB();
      const now = Date.now();
      const existing = queries.getArtifactByResourceId.get(resourceId);
      if (!existing) return { success: false, error: 'Artifact not found' };

      db.prepare(
        'UPDATE artifacts SET linked_resource_id = ?, version = version + 1, updated_at = ? WHERE resource_id = ?',
      ).run(linkedResourceId ?? null, now, resourceId);

      const updated = queries.getArtifactByResourceId.get(resourceId);
      const resource = queries.getResourceById.get(resourceId);
      const serialized = serializeArtifactRecord(updated, resource, queries);
      windowManager.broadcast('artifact:updated', serialized);

      // Immediately sync Excel data into the artifact if a resource is being linked
      if (linkedResourceId) {
        await syncLinkedArtifactsForResource(database, windowManager, linkedResourceId, undefined, fileStorage);
      }

      mirrorArtifactToVault(resourceId, vaultDeps);

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error setting linked resource:', error);
      return { success: false, error: error.message };
    }
  });

  // Sandboxed artifact frames (issue #465): the renderer registers the frame
  // document here and points the iframe at app://artifact/<token>, which is
  // served with its own CSP (srcdoc would inherit the strict renderer CSP and
  // block every inline script in packaged builds).
  ipcMain.handle('artifact:frame:register', (event, { html } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, error: 'html required' };
    }
    if (html.length > 8 * 1024 * 1024) {
      return { success: false, error: 'Frame html too large (8MB max)' };
    }
    try {
      return { success: true, data: frameRegistry.registerFrameHtml(html) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:frame:release', (event, token) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    return { success: true, data: { released: frameRegistry.releaseFrame(token) } };
  });

  ipcMain.handle('artifact:refresh-linked', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId || typeof resourceId !== 'string') {
      return { success: false, error: 'resourceId required' };
    }
    try {
      const queries = database.getQueries();
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      if (!artifact.linked_resource_id) return { success: false, error: 'No linked resource' };

      await syncLinkedArtifactsForResource(database, windowManager, artifact.linked_resource_id, undefined, fileStorage);
      mirrorArtifactToVault(resourceId, vaultDeps);
      return { success: true };
    } catch (error) {
      console.error('[Artifact] Error refreshing linked data:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
