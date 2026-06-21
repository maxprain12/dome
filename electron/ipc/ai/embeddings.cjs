/* eslint-disable no-console */
'use strict';

const { z } = require('zod');

const EmbeddingsTestSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    api_key: z.string().optional(),
    apiKey: z.string().optional(),
    base_url: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .optional();

const EmbeddingsListModelsSchema = z
  .object({
    provider: z.string().optional(),
    api_key: z.string().optional(),
    apiKey: z.string().optional(),
    base_url: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .optional();

const database = require('../../core/database.cjs');
const embeddingsService = require('../../services/embeddings.service.cjs');
const { clearContextCache } = require('../../services/embedding-context.cjs');
const { listEmbeddingModels, clearDiscoveryCache } = require('../../services/embedding-discovery.cjs');
const lancedbSemantic = require('../../services/lancedb-semantic.cjs');
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');
const { resolveSettingSecretForApi } = require('../../core/settings-secrets.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  semanticIndexScheduler.init(database);

  ipcMain.handle('embeddings:getStatus', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const cfg = embeddingsService.readEmbeddingsSettings(queries);
      const configured = embeddingsService.isConfigured(queries);
      let chunksTotal = 0;
      let indexedResourceCount = 0;
      try {
        chunksTotal = await lancedbSemantic.countChunksForModel();
        indexedResourceCount = await lancedbSemantic.countIndexedResources();
      } catch {
        /* Lance not ready */
      }
      return {
        success: true,
        data: {
          configured,
          provider: cfg.provider || null,
          model: cfg.model || null,
          modelVersion: embeddingsService.getActiveModelVersion(),
          dimensions: embeddingsService.getActiveDimensions(),
          chunksTotal,
          indexedResourceCount,
        },
      };
    } catch (error) {
      console.error('[embeddings:getStatus]', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('embeddings:test', async (event, override) => {
    try {
      validateSender(event, windowManager);
      const parsed = EmbeddingsTestSchema.safeParse(override);
      if (!parsed.success) {
        return { success: false, error: 'Invalid payload' };
      }
      const queries = database.getQueries();
      let cfg;
      if (parsed.data && parsed.data.provider && parsed.data.model) {
        const candidate = String(parsed.data.api_key ?? parsed.data.apiKey ?? '');
        cfg = {
          provider: String(parsed.data.provider),
          model: String(parsed.data.model),
          apiKey: resolveSettingSecretForApi(queries, 'embeddings_api_key', candidate),
          baseUrl: String(parsed.data.base_url ?? parsed.data.baseUrl ?? 'http://127.0.0.1:11434'),
        };
      } else {
        const saved = embeddingsService.readEmbeddingsSettings(queries);
        cfg = {
          provider: saved.provider,
          model: saved.model,
          apiKey: saved.apiKey,
          baseUrl: saved.baseUrl,
        };
      }
      const data = await embeddingsService.testConfig(cfg);
      return { success: true, data };
    } catch (error) {
      console.error('[embeddings:test]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('embeddings:listModels', async (event, params) => {
    try {
      validateSender(event, windowManager);
      const parsed = EmbeddingsListModelsSchema.safeParse(params);
      if (!parsed.success) {
        return { success: false, error: 'Invalid payload' };
      }
      const queries = database.getQueries();
      const provider = String(parsed.data?.provider || '').toLowerCase();
      const candidate = String(parsed.data?.api_key ?? parsed.data?.apiKey ?? '').trim();
      let apiKey = resolveSettingSecretForApi(queries, 'embeddings_api_key', candidate);
      let baseUrl = String(parsed.data?.base_url ?? parsed.data?.baseUrl ?? '').trim();
      if (!baseUrl) {
        baseUrl = String(
          (await queries.getSetting.get('embeddings_base_url'))?.value || 'http://127.0.0.1:11434',
        ).replace(/\/$/, '');
      }

      const { models, source } = await listEmbeddingModels({ provider, apiKey, baseUrl });
      return { success: true, data: { models, source } };
    } catch (error) {
      console.error('[embeddings:listModels]', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('embeddings:apply', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!embeddingsService.isConfigured(queries)) {
        return { success: false, error: 'Embeddings not configured' };
      }
      clearContextCache();
      clearDiscoveryCache();
      embeddingsService.invalidateCache();
      await embeddingsService.probeDimensions(() => queries);
      await lancedbSemantic.wipeAllVectors();
      embeddingsService.invalidateCache();
      await embeddingsService.probeDimensions(() => queries);
      const result = await semanticIndexScheduler.getIndexer().reindexAll({
        skipSemanticRelations: true,
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
      console.error('[embeddings:apply]', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
