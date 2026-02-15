/* eslint-disable no-console */

/**
 * Generate embedding using Ollama or cloud provider (OpenAI, Anthropic, Google)
 * @returns {{ embedding: number[]|null, dimension: number }}
 */
async function getEmbedding(database, ollamaService, text) {
  const queries = database.getQueries();
  const isOllamaAvailable = await ollamaService.checkAvailability();

  if (isOllamaAvailable) {
    const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
    const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
    const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
    const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
    const embedding = await ollamaService.generateEmbedding(text, embeddingModel, baseUrl);
    return { embedding, dimension: embedding?.length || 1024 };
  }

  const aiApiKey = queries.getSetting.get('ai_api_key');
  const aiProvider = queries.getSetting.get('ai_provider');
  const aiEmbeddingModel = queries.getSetting.get('ai_embedding_model')?.value;

  if (!aiApiKey?.value || !['openai', 'anthropic', 'google'].includes(aiProvider?.value)) {
    return { embedding: null, dimension: 1024 };
  }

  const aiCloudService = require('../ai-cloud-service.cjs');
  const defaultModels = { openai: 'text-embedding-3-small', anthropic: 'voyage-multimodal-3', google: 'text-embedding-004' };
  const model = aiEmbeddingModel || defaultModels[aiProvider.value];

  try {
    const embeddings = await aiCloudService.embeddings(aiProvider.value, [text], aiApiKey.value, model);
    const embedding = embeddings?.[0] || null;
    return { embedding, dimension: embedding?.length || 1024 };
  } catch (err) {
    console.error('[Vector] Cloud embedding failed:', err);
    return { embedding: null, dimension: 1024 };
  }
}

function register({ ipcMain, windowManager, database, ollamaService, initModule }) {
  /**
   * Index annotation in LanceDB
   */
  ipcMain.handle('vector:annotations:index', async (event, annotationData) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar annotationData
      if (!annotationData || typeof annotationData !== 'object' || Array.isArray(annotationData)) {
        throw new Error('AnnotationData must be an object');
      }
      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) {
        throw new Error('Vector database not initialized');
      }

      const {
        annotationId,
        resourceId,
        text,
        metadata,
      } = annotationData;

      // Validar campos requeridos
      if (!annotationId || typeof annotationId !== 'string' || annotationId.length > 200) {
        throw new Error('annotationId must be a non-empty string with max 200 characters');
      }
      if (!resourceId || typeof resourceId !== 'string' || resourceId.length > 200) {
        throw new Error('resourceId must be a non-empty string with max 200 characters');
      }
      if (typeof text !== 'string') {
        throw new Error('text must be a string');
      }
      if (text.length > 100000) {
        throw new Error('text too long. Maximum 100000 characters');
      }
      if (metadata !== undefined && (typeof metadata !== 'object' || Array.isArray(metadata))) {
        throw new Error('metadata must be an object');
      }

      // Generate embedding using Ollama or cloud (OpenAI, Anthropic, Google)
      let embedding = null;
      let embeddingDimension = 1024;
      try {
        const result = await getEmbedding(database, ollamaService, text);
        embedding = result.embedding;
        embeddingDimension = result.dimension;
        if (embedding && !(await ollamaService.checkAvailability())) {
          console.log('[Vector] Using cloud embeddings (Ollama unavailable)');
        }
      } catch (error) {
        console.error('[Vector] Error generating embedding:', error);
        // Continue without embedding - annotation will still be saved in SQLite
      }

      if (embedding) {
        // Get annotation embeddings table, create if needed with correct dimension
        let table;
        let tableCreated = false;
        try {
          table = await vectorDB.openTable('annotation_embeddings');
        } catch (error) {
          // Table might not exist, create it with correct dimension
          await initModule.createAnnotationEmbeddingsTable(embeddingDimension);
          table = await vectorDB.openTable('annotation_embeddings');
          tableCreated = true;
        }

        // Insert into LanceDB
        const embeddingData = {
          id: `${annotationId}-0`, // chunk_index is 0 for simple annotations
          resource_id: resourceId,
          annotation_id: annotationId,
          chunk_index: 0,
          text: text,
          vector: embedding,
          metadata: {
            ...metadata,
            created_at: Date.now(),
          },
        };

        try {
          await table.add([embeddingData]);
          console.log(`[Vector] Indexed annotation: ${annotationId}`);
        } catch (addError) {
          // If error is about schema/dimension mismatch, recreate table and retry
          const errorMessage = addError.message || '';
          const isSchemaError = errorMessage.includes('dictionary') ||
                               errorMessage.includes('Schema') ||
                               errorMessage.includes('schema') ||
                               errorMessage.includes('dimension');

          if (isSchemaError && !tableCreated) {
            console.log('[Vector] Schema/dimension mismatch detected, recreating table...');

            // Recreate table with correct dimension (forceRecreate = true)
            await initModule.createAnnotationEmbeddingsTable(embeddingDimension, true);
            table = await vectorDB.openTable('annotation_embeddings');

            // Retry insertion
            await table.add([embeddingData]);
            console.log(`[Vector] Indexed annotation: ${annotationId} (after table recreation)`);
          } else {
            // Re-throw if it's a different error or table was just created
            console.error('[Vector] Error adding annotation to table:', addError);
            throw addError;
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[Vector] Error indexing annotation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Search annotations in LanceDB
   */
  ipcMain.handle('vector:annotations:search', async (event, queryData) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar queryData
      if (!queryData || typeof queryData !== 'object' || Array.isArray(queryData)) {
        throw new Error('QueryData must be an object');
      }
      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) {
        throw new Error('Vector database not initialized');
      }

      const { queryText, queryVector, limit = 10, resourceId } = queryData;

      // Validar campos
      if (queryText !== undefined && (typeof queryText !== 'string' || queryText.length > 1000)) {
        throw new Error('queryText must be a string with max 1000 characters');
      }
      if (queryVector !== undefined && (!Array.isArray(queryVector) || queryVector.length > 10000)) {
        throw new Error('queryVector must be an array with max 10000 elements');
      }
      if (typeof limit !== 'number' || limit < 1 || limit > 100) {
        throw new Error('limit must be a number between 1 and 100');
      }
      if (resourceId !== undefined && (typeof resourceId !== 'string' || resourceId.length > 200)) {
        throw new Error('resourceId must be a string with max 200 characters');
      }

      // Generate query embedding if not provided
      let searchVector = queryVector;
      if (!searchVector && queryText) {
        try {
          const result = await getEmbedding(database, ollamaService, queryText);
          searchVector = result.embedding;
          if (!searchVector) {
            return { success: false, error: 'No embedding provider available (Ollama offline, no cloud provider configured)' };
          }
        } catch (error) {
          console.error('[Vector] Error generating query embedding:', error);
          return { success: false, error: error.message };
        }
      }

      if (!searchVector) {
        return { success: false, error: 'No query vector provided' };
      }

      // Open table and search
      const table = await vectorDB.openTable('annotation_embeddings');

      // Build filter if resourceId provided
      let filter = null;
      if (resourceId) {
        filter = `resource_id = "${resourceId}"`;
      }

      const results = await table.search(searchVector)
        .limit(limit)
        .where(filter)
        .execute();

      return {
        success: true,
        data: results.map((result) => ({
          annotationId: result.annotation_id,
          resourceId: result.resource_id,
          text: result.text,
          score: result._distance || 0,
          metadata: result.metadata,
        })),
      };
    } catch (error) {
      console.error('[Vector] Error searching annotations:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Semantic search by resource ID - finds similar resources via vector search
   */
  ipcMain.handle('vector:semanticSearch', async (event, { resourceId, limit = 5, minScore = 0.3 }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return [];
    }

    try {
      if (!resourceId || typeof resourceId !== 'string') return [];

      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) return [];

      // Build query text from resource content
      let queryText = resource.title || '';
      if (resource.content && typeof resource.content === 'string') {
        queryText += ' ' + (resource.content.slice(0, 2000) || '');
      }
      try {
        const metadata = resource.metadata ? JSON.parse(resource.metadata || '{}') : {};
        if (metadata.summary) queryText += ' ' + metadata.summary;
        if (metadata.transcription) queryText += ' ' + (metadata.transcription.slice(0, 1000) || '');
      } catch (e) { /* ignore */ }

      queryText = queryText.trim();
      if (!queryText) return [];

      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) return [];

      let queryVector;
      try {
        const result = await getEmbedding(database, ollamaService, queryText);
        queryVector = result.embedding;
        if (!queryVector) return [];
      } catch (err) {
        console.warn('[Vector] semanticSearch embedding failed:', err);
        return [];
      }

      const tableNames = await vectorDB.tableNames();
      if (!tableNames.includes('resource_embeddings')) return [];

      try {
        const table = await vectorDB.openTable('resource_embeddings');
        const searchResults = await table.search(queryVector).limit(limit + 5).execute();

        return searchResults
          .filter((r) => r.resource_id !== resourceId && (!minScore || (1 - r._distance) >= minScore))
          .slice(0, limit)
          .map((r) => ({
            id: r.id,
            resource_id: r.resource_id,
            text: r.text,
            score: 1 - (r._distance || 0),
            similarity: 1 - (r._distance || 0),
          }));
      } catch (searchErr) {
        const msg = searchErr?.message || '';
        if (msg.includes('No vector column found') || msg.includes('vector column')) {
          console.warn('[Vector] Schema error in resource_embeddings, recreating table...');
          const embeddingDim = Array.isArray(queryVector) ? queryVector.length : 1024;
          await initModule.createResourceEmbeddingsTable(embeddingDim, true);
          console.log('[Vector] Table resource_embeddings recreated. Re-index resources to enable semantic search.');
        } else {
          console.error('[Vector] semanticSearch error:', searchErr);
        }
        return [];
      }
    } catch (error) {
      console.error('[Vector] semanticSearch error:', error);
      return [];
    }
  });

  /**
   * Generic vector search across all embedding tables
   */
  ipcMain.handle('vector:search:generic', async (event, query, options = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar query
      if (!query || typeof query !== 'string' || query.length > 1000) {
        throw new Error('Query must be a non-empty string with max 1000 characters');
      }

      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) {
        console.warn('[Vector] Vector database not available, returning empty results');
        return { success: true, data: [] };
      }

      const { limit = 10, threshold = 0.3, filter = null } = options;

      // Generate query embedding
      let queryVector;
      try {
        const result = await getEmbedding(database, ollamaService, query);
        queryVector = result.embedding;
        if (!queryVector) {
          console.warn('[Vector] No embedding provider available');
          return { success: true, data: [] };
        }
      } catch (error) {
        console.error('[Vector] Error generating query embedding:', error);
        return { success: true, data: [] }; // Fail gracefully
      }

      // Try to search in resource_embeddings table first
      let results = [];
      try {
        const tableNames = await vectorDB.tableNames();

        // Search resource embeddings if available
        if (tableNames.includes('resource_embeddings')) {
          let table = await vectorDB.openTable('resource_embeddings');
          try {
            const searchResults = await table.search(queryVector)
              .limit(limit)
              .execute();

            results = searchResults
              .filter(r => !threshold || (1 - r._distance) >= threshold)
              .map((result) => ({
                id: result.id,
                resource_id: result.resource_id,
                text: result.text,
                score: 1 - (result._distance || 0), // Convert distance to similarity score
                _distance: result._distance,
                metadata: result.metadata,
              }));
          } catch (searchErr) {
            const msg = searchErr?.message || '';
            if (msg.includes('No vector column found') || msg.includes('vector column')) {
              console.warn('[Vector] Schema error in resource_embeddings, recreating table...');
              const embeddingDim = Array.isArray(queryVector) ? queryVector.length : 1024;
              await initModule.createResourceEmbeddingsTable(embeddingDim, true);
              console.log('[Vector] Table resource_embeddings recreated. Re-index resources to enable semantic search.');
            } else {
              throw searchErr;
            }
          }
        }
      } catch (error) {
        console.error('[Vector] Error searching resource embeddings:', error);
      }

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      console.error('[Vector] Error in generic search:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete resource embeddings by resource_id (for when resource is deleted)
   */
  ipcMain.handle('vector:resource:delete', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!resourceId || typeof resourceId !== 'string' || resourceId.length > 200) {
        throw new Error('resourceId must be a non-empty string with max 200 characters');
      }

      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) {
        return { success: true };
      }

      const tableNames = await vectorDB.tableNames();
      if (!tableNames.includes('resource_embeddings')) {
        return { success: true };
      }

      const table = await vectorDB.openTable('resource_embeddings');
      const safeId = String(resourceId).replace(/"/g, '""');
      await table.delete(`resource_id = "${safeId}"`);

      console.log(`[Vector] Deleted resource embeddings: ${resourceId}`);
      return { success: true };
    } catch (error) {
      console.error('[Vector] Error deleting resource embeddings:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete annotation from LanceDB
   */
  ipcMain.handle('vector:annotations:delete', async (event, annotationId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar annotationId
      if (!annotationId || typeof annotationId !== 'string' || annotationId.length > 200) {
        throw new Error('annotationId must be a non-empty string with max 200 characters');
      }
      const vectorDB = initModule.getVectorDB();
      if (!vectorDB) {
        throw new Error('Vector database not initialized');
      }

      const table = await vectorDB.openTable('annotation_embeddings');
      await table.delete(`annotation_id = "${annotationId}"`);

      console.log(`[Vector] Deleted annotation: ${annotationId}`);
      return { success: true };
    } catch (error) {
      console.error('[Vector] Error deleting annotation:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
