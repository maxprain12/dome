/* eslint-disable no-console */
const crypto = require('crypto');
const { serializeArtifactRecord, parseJsonState } = require('../../artifacts/artifact-serialize.cjs');
const { afterArtifactMutation } = require('../../artifacts/artifact-index-sync.cjs');
const { syncLinkedArtifactsForResource } = require('../../artifacts/artifact-link-sync.cjs');

function generateId() {
  return crypto.randomUUID();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function syncRuntimeDataFromState(queries, artifactRow, stateObj, now) {
  if (!artifactRow || !isPlainObject(stateObj?.data)) return;
  const dataStr = JSON.stringify(stateObj.data);
  const existing = await queries.getArtifactRuntimeDataByArtifactSlot.get(artifactRow.id, 'default');
  await queries.upsertArtifactRuntimeData.run(
    existing?.id || crypto.randomUUID(),
    artifactRow.id,
    'default',
    dataStr,
    existing?.schema_version ?? 1,
    existing?.last_run_id ?? null,
    existing?.last_automation_id ?? null,
    now,
  );
}

function register({ ipcMain, windowManager, database }) {
  const fs = require('fs');
  const { dialog } = require('electron');

  ipcMain.handle('artifact:create', async (event, { title, artifactType, template, state, linkedResourceId, projectId, folderId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB();
      const now = Date.now();
      const resourceId = generateId();
      const artifactId = generateId();
      const stateStr = JSON.stringify(state ?? {});

      await db.transaction(async (tx) => {
        await queries.createResource.run(
          resourceId,
          projectId || 'default',
          'artifact',
          title || 'Untitled Artifact',
          null,
          null,
          folderId ?? null,
          null,
          now,
          now,
        );
        await queries.createArtifact.run(
          artifactId,
          resourceId,
          artifactType || 'custom',
          template ?? null,
          stateStr,
          linkedResourceId ?? null,
          now,
          now,
        );
        const art = await queries.getArtifactByResourceId.get(resourceId);
        if (art) {
          await syncRuntimeDataFromState(queries, art, parseJsonState(stateStr), now);
        }
      });

      const queries2 = database.getQueries();
      const resource = await queries2.getResourceById.get(resourceId);
      const artifact = await queries2.getArtifactByResourceId.get(resourceId);
      const serialized = serializeArtifactRecord(artifact, resource, queries2);

      windowManager.broadcast('resource:created', resource);
      windowManager.broadcast('artifact:created', serialized);

      afterArtifactMutation(database, resourceId);

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error creating:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:get', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const artifact = await queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = await queries.getResourceById.get(resourceId);
      return { success: true, data: serializeArtifactRecord(artifact, resource, queries) };
    } catch (error) {
      console.error('[Artifact] Error getting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:buildDesign', (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { buildArtifactDesignLayout } = require('../../artifacts/artifact-design-layout.cjs');
      let spec = payload?.spec ?? payload?.design_spec;
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
        if (p && (p.title != null || p.tabs != null)) {
          spec = p;
        }
      }
      const built = buildArtifactDesignLayout(spec);
      if (!built.ok) {
        return { success: false, error: built.error };
      }
      return {
        success: true,
        html: built.html,
        data: built.data,
        hints:
          'Pass html and data to artifact:create with artifactType custom. Load artifact_design doc first if needed.',
      };
    } catch (error) {
      console.error('[Artifact] buildDesign error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:update', async (event, { resourceId, state, artifactType, linkedResourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB();
      const now = Date.now();
      const existing = await queries.getArtifactByResourceId.get(resourceId);
      if (!existing) return { success: false, error: 'Artifact not found' };

      await db.transaction(async (tx) => {
        if (artifactType !== undefined || linkedResourceId !== undefined) {
          await queries.updateArtifact.run(
            artifactType ?? existing.artifact_type,
            existing.template,
            state !== undefined ? JSON.stringify(state) : existing.state,
            linkedResourceId !== undefined ? (linkedResourceId ?? null) : (existing.linked_resource_id ?? null),
            now,
            resourceId,
          );
        } else if (state !== undefined) {
          await queries.updateArtifactState.run(JSON.stringify(state), now, resourceId);
        }
        const updated = await queries.getArtifactByResourceId.get(resourceId);
        if (updated && state !== undefined) {
          await syncRuntimeDataFromState(queries, updated, parseJsonState(JSON.stringify(state)), now);
        }
      });

      const updated = await queries.getArtifactByResourceId.get(resourceId);
      const resource = await queries.getResourceById.get(resourceId);
      const serialized = serializeArtifactRecord(updated, resource, queries);
      windowManager.broadcast('artifact:updated', serialized);

      afterArtifactMutation(database, resourceId);

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error updating:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:delete', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      await queries.deleteArtifact.run(resourceId);
      windowManager.broadcast('artifact:deleted', { resourceId });
      return { success: true };
    } catch (error) {
      console.error('[Artifact] Error deleting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:list', async (event, projectId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const rows = await queries.listArtifactsByProject.all(projectId || 'default');
      const results = await Promise.all(rows.map(async (row) => {
        const resource = await queries.getResourceById.get(row.resource_id);
        return serializeArtifactRecord(row, resource, queries);
      }));
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
      const artifact = await queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = await queries.getResourceById.get(resourceId);
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

  ipcMain.handle('artifact:import', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB();

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
      const now = Date.now();
      const resourceId = generateId();
      const artifactId = generateId();

      await db.transaction(async (tx) => {
        await queries.createResource.run(
          resourceId,
          'default',
          'artifact',
          title || 'Imported Artifact',
          null,
          null,
          null,
          null,
          now,
          now,
        );
        await queries.createArtifact.run(
          artifactId,
          resourceId,
          artifact_type,
          template ?? null,
          JSON.stringify(state ?? {}),
          null,
          now,
          now,
        );
        const art = await queries.getArtifactByResourceId.get(resourceId);
        if (art) {
          await syncRuntimeDataFromState(queries, art, parseJsonState(JSON.stringify(state ?? {})), now);
        }
      });

      const queries2 = database.getQueries();
      const resource = await queries2.getResourceById.get(resourceId);
      const artifact = await queries2.getArtifactByResourceId.get(resourceId);
      const serialized = serializeArtifactRecord(artifact, resource, queries2);

      windowManager.broadcast('resource:created', resource);
      windowManager.broadcast('artifact:created', serialized);

      afterArtifactMutation(database, resourceId);

      return { success: true, data: serialized };
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
      const existing = await queries.getArtifactByResourceId.get(resourceId);
      if (!existing) return { success: false, error: 'Artifact not found' };

      await db.run(
        'UPDATE artifacts SET linked_resource_id = ?, version = version + 1, updated_at = ? WHERE resource_id = ?',
        [linkedResourceId ?? null, now, resourceId],
      );

      const updated = await queries.getArtifactByResourceId.get(resourceId);
      const resource = await queries.getResourceById.get(resourceId);
      const serialized = serializeArtifactRecord(updated, resource, queries);
      windowManager.broadcast('artifact:updated', serialized);

      // Immediately sync Excel data into the artifact if a resource is being linked
      if (linkedResourceId) {
        await syncLinkedArtifactsForResource(database, windowManager, linkedResourceId);
      }

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error setting linked resource:', error);
      return { success: false, error: error.message };
    }
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
      const artifact = await queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      if (!artifact.linked_resource_id) return { success: false, error: 'No linked resource' };

      await syncLinkedArtifactsForResource(database, windowManager, artifact.linked_resource_id);
      return { success: true };
    } catch (error) {
      console.error('[Artifact] Error refreshing linked data:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
