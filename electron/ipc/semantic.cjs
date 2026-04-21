/* eslint-disable no-console */
'use strict';

const path = require('path');
const { app } = require('electron');
const database = require('../database.cjs');
const {
  configureTransformersEnv,
  MODEL_VERSION,
} = require('../services/embeddings.service.cjs');
const semanticIndexScheduler = require('../semantic-index-scheduler.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  const modelsDir = path.join(app.getPath('userData'), 'transformers-cache');
  configureTransformersEnv({ modelsDir });
  semanticIndexScheduler.init(database);

  ipcMain.handle('db:semantic:getGraph', (event, resourceId, threshold = 0.45) => {
    try {
      validateSender(event, windowManager);
      if (typeof resourceId !== 'string' || !resourceId) {
        return { success: false, error: 'resourceId required' };
      }
      const th = Math.max(0, Math.min(1, Number(threshold) || 0.45));
      const center = resourceId;
      const db = database.getDB();
      const queries = database.getQueries();

      const nodes = db
        .prepare(
          `
        SELECT r.id, r.title AS label, r.type AS resourceType,
          (SELECT COUNT(*) FROM semantic_relations sr
           WHERE (sr.source_id = r.id OR sr.target_id = r.id)
           AND sr.similarity >= @th
           AND sr.relation_type != 'rejected') AS connectionCount,
          CASE WHEN r.id = @center THEN 1 ELSE 0 END AS isCurrentNote
        FROM resources r
        WHERE r.id IN (
          SELECT source_id FROM semantic_relations
          WHERE target_id = @center AND similarity >= @th AND relation_type != 'rejected'
          UNION
          SELECT target_id FROM semantic_relations
          WHERE source_id = @center AND similarity >= @th AND relation_type != 'rejected'
          UNION SELECT @center
        )
      `,
        )
        .all({ th, center });

      const edges = db
        .prepare(
          `
        SELECT id,
               source_id AS source,
               target_id AS target,
               similarity,
               relation_type,
               label
        FROM semantic_relations
        WHERE (source_id = @center OR target_id = @center)
          AND similarity >= @th
          AND relation_type != 'rejected'
        ORDER BY similarity DESC
        LIMIT 60
      `,
        )
        .all({ center, th });

      for (const e of edges) {
        const s = queries.getResourceById.get(e.source);
        const t = queries.getResourceById.get(e.target);
        e.sourceName = s?.title || e.source;
        e.targetName = t?.title || e.target;
        e.sourceType = s?.type;
        e.targetType = t?.type;
      }

      return {
        success: true,
        data: {
          nodes: nodes.map((n) => ({
            id: n.id,
            label: n.label || 'Untitled',
            resourceType: n.resourceType || 'note',
            connectionCount: n.connectionCount ?? 0,
            isCurrentNote: Boolean(n.isCurrentNote),
          })),
          edges,
        },
      };
    } catch (error) {
      console.error('[DB] semantic getGraph:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:confirm', (event, edgeId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.updateSemanticRelationState.run('confirmed', now, edgeId);
      return { success: true };
    } catch (error) {
      console.error('[DB] semantic confirm:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:delete', (event, edgeId) => {
    try {
      validateSender(event, windowManager);
      if (typeof edgeId !== 'string' || !edgeId) {
        return { success: false, error: 'edgeId required' };
      }
      database.getQueries().deleteSemanticRelationById.run(edgeId);
      return { success: true };
    } catch (error) {
      console.error('[DB] semantic delete:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:reject', (event, edgeId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.updateSemanticRelationState.run('rejected', null, edgeId);
      return { success: true };
    } catch (error) {
      console.error('[DB] semantic reject:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:createManual', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const sourceId = payload?.sourceId ?? payload?.source_id;
      const targetId = payload?.targetId ?? payload?.target_id;
      const label = payload?.label ?? null;
      if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
        return { success: false, error: 'sourceId and targetId required' };
      }
      if (sourceId === targetId) {
        return { success: false, error: 'Cannot relate a resource to itself' };
      }
      const queries = database.getQueries();
      const now = Date.now();
      const id = `${sourceId}__${targetId}`;
      const existing = queries.getSemanticRelationByPair.get(sourceId, targetId);
      if (existing) {
        if (existing.relation_type === 'rejected') {
          database
            .getDB()
            .prepare(
              `
            UPDATE semantic_relations
            SET relation_type = 'manual', similarity = 1.0, detected_at = ?, label = COALESCE(?, label), confirmed_at = NULL
            WHERE id = ?
          `,
            )
            .run(now, label, existing.id);
          return { success: true, data: { id: existing.id } };
        }
        if (existing.relation_type === 'manual' || existing.relation_type === 'confirmed') {
          return { success: true, data: { id: existing.id, duplicate: true } };
        }
        if (existing.relation_type === 'auto') {
          database
            .getDB()
            .prepare(
              `
            UPDATE semantic_relations
            SET relation_type = 'manual', similarity = 1.0, detected_at = ?, label = COALESCE(?, label)
            WHERE id = ?
          `,
            )
            .run(now, label, existing.id);
          return { success: true, data: { id: existing.id } };
        }
      }
      try {
        queries.insertSemanticRelation.run(id, sourceId, targetId, 1.0, 'manual', label, now, null);
      } catch (e) {
        if (!String(e.message || e).includes('UNIQUE')) throw e;
        return { success: true, data: { id, duplicate: true } };
      }
      return { success: true, data: { id } };
    } catch (error) {
      console.error('[DB] semantic createManual:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:indexResource', async (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      if (typeof resourceId !== 'string' || !resourceId) {
        return { success: false, error: 'resourceId required' };
      }
      const result = await semanticIndexScheduler.getIndexer().indexResourceImmediate(resourceId);
      return { success: true, data: result };
    } catch (error) {
      console.error('[DB] semantic indexResource:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:resourceHasChunks', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      if (typeof resourceId !== 'string' || !resourceId) {
        return { success: false, error: 'resourceId required' };
      }
      const queries = database.getQueries();
      const rows = queries.getChunksByResource.all(resourceId);
      return { success: true, data: { count: rows.length, hasChunks: rows.length > 0 } };
    } catch (error) {
      console.error('[DB] semantic resourceHasChunks:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:reindexAll', async (event) => {
    try {
      validateSender(event, windowManager);
      const result = await semanticIndexScheduler.getIndexer().reindexAll({
        onProgress: (p) => {
          try {
            windowManager.broadcast('semantic:progress', p);
          } catch {
            /* ignore */
          }
        },
      });
      return { success: true, data: result };
    } catch (error) {
      console.error('[DB] semantic reindexAll:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:getIndexingStatus', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const indexableRow = queries.countSemanticIndexableResources.get();
      const withChunksRow = queries.countResourcesWithSemanticChunks.get(MODEL_VERSION);
      const chunksRow = queries.countSemanticChunksForModel.get(MODEL_VERSION);
      const indexableTotal = Number(indexableRow?.c ?? 0);
      const indexedResourceCount = Number(withChunksRow?.c ?? 0);
      const chunksTotal = Number(chunksRow?.c ?? 0);
      const pendingCount = Math.max(0, indexableTotal - indexedResourceCount);
      const allIndexed = indexableTotal === 0 || indexedResourceCount >= indexableTotal;
      return {
        success: true,
        data: {
          modelVersion: MODEL_VERSION,
          indexableTotal,
          indexedResourceCount,
          pendingCount,
          chunksTotal,
          allIndexed,
        },
      };
    } catch (error) {
      console.error('[DB] semantic getIndexingStatus:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:semantic:search', async (event, query, limit, filter) => {
    try {
      validateSender(event, windowManager);
      if (typeof query !== 'string' || !query.trim()) {
        return { success: false, error: 'query required' };
      }
      const lim = limit === undefined || limit === null ? 20 : Number(limit);
      const filt =
        filter && typeof filter === 'object' && Array.isArray(filter.type)
          ? { type: filter.type.filter((x) => typeof x === 'string') }
          : undefined;
      const hits = await semanticIndexScheduler.getIndexer().searchSemantic(query, {
        limit: lim,
        filter: filt,
      });
      return { success: true, data: hits };
    } catch (error) {
      console.error('[DB] semantic search:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
