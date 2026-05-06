/* eslint-disable no-console */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function serializeArtifact(row, resource) {
  if (!row) return null;
  let state = {};
  try {
    state = JSON.parse(row.state);
  } catch {
    // keep empty
  }
  return {
    id: row.id,
    resourceId: row.resource_id,
    artifactType: row.artifact_type,
    template: row.template || null,
    state,
    linkedResourceId: row.linked_resource_id || null,
    version: row.version,
    title: resource?.title ?? '',
    projectId: resource?.project_id ?? 'default',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function register({ ipcMain, windowManager, database }) {
  const fs = require('fs');
  const { dialog } = require('electron');

  ipcMain.handle('artifact:create', (event, { title, artifactType, template, state, linkedResourceId, projectId, folderId }) => {
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

      const tx = db.transaction(() => {
        queries.createResource.run(
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
        queries.createArtifact.run(
          artifactId,
          resourceId,
          artifactType || 'custom',
          template ?? null,
          stateStr,
          linkedResourceId ?? null,
          now,
          now,
        );
      });
      tx();

      const resource = queries.getResourceById.get(resourceId);
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      const serialized = serializeArtifact(artifact, resource);

      windowManager.broadcast('resource:created', resource);
      windowManager.broadcast('artifact:created', serialized);

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error creating:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:get', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      if (!artifact) return { success: false, error: 'Artifact not found' };
      const resource = queries.getResourceById.get(resourceId);
      return { success: true, data: serializeArtifact(artifact, resource) };
    } catch (error) {
      console.error('[Artifact] Error getting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:update', (event, { resourceId, state, artifactType, linkedResourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const now = Date.now();
      const existing = queries.getArtifactByResourceId.get(resourceId);
      if (!existing) return { success: false, error: 'Artifact not found' };

      if (artifactType !== undefined || linkedResourceId !== undefined) {
        queries.updateArtifact.run(
          artifactType ?? existing.artifact_type,
          existing.template,
          state !== undefined ? JSON.stringify(state) : existing.state,
          linkedResourceId !== undefined ? (linkedResourceId ?? null) : (existing.linked_resource_id ?? null),
          now,
          resourceId,
        );
      } else if (state !== undefined) {
        queries.updateArtifactState.run(JSON.stringify(state), now, resourceId);
      }

      const updated = queries.getArtifactByResourceId.get(resourceId);
      const resource = queries.getResourceById.get(resourceId);
      const serialized = serializeArtifact(updated, resource);
      windowManager.broadcast('artifact:updated', serialized);
      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error updating:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('artifact:delete', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      queries.deleteArtifact.run(resourceId);
      windowManager.broadcast('artifact:deleted', { resourceId });
      return { success: true };
    } catch (error) {
      console.error('[Artifact] Error deleting:', error);
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
        return serializeArtifact(row, resource);
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

      const bundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        artifact: {
          title: resource?.title ?? 'Untitled',
          artifact_type: artifact.artifact_type,
          template: artifact.template ?? null,
          state: JSON.parse(artifact.state || '{}'),
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

  ipcMain.handle('artifact:import', async (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB();

      let raw;
      if (filePath) {
        raw = fs.readFileSync(filePath, 'utf8');
      } else {
        const result = await dialog.showOpenDialog({
          filters: [{ name: 'Dome Artifact', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true };
        raw = fs.readFileSync(result.filePaths[0], 'utf8');
      }

      const bundle = JSON.parse(raw);
      if (!bundle?.artifact?.artifact_type) {
        return { success: false, error: 'Invalid artifact bundle' };
      }

      const { title, artifact_type, template, state } = bundle.artifact;
      const now = Date.now();
      const resourceId = generateId();
      const artifactId = generateId();

      const tx = db.transaction(() => {
        queries.createResource.run(
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
        queries.createArtifact.run(
          artifactId,
          resourceId,
          artifact_type,
          template ?? null,
          JSON.stringify(state ?? {}),
          null,
          now,
          now,
        );
      });
      tx();

      const resource = queries.getResourceById.get(resourceId);
      const artifact = queries.getArtifactByResourceId.get(resourceId);
      const serialized = serializeArtifact(artifact, resource);

      windowManager.broadcast('resource:created', resource);
      windowManager.broadcast('artifact:created', serialized);

      return { success: true, data: serialized };
    } catch (error) {
      console.error('[Artifact] Error importing:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
