/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:graph:createNode', (event, node) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createGraphNode.run(
        node.id,
        node.resource_id || null,
        node.label,
        node.type,
        node.properties ? JSON.stringify(node.properties) : null,
        node.created_at,
        node.updated_at
      );
      return { success: true, data: node };
    } catch (error) {
      console.error('[DB] Error creating graph node:', error);
      return { success: false, error: error.message };
    }
  });

  // Get graph node by ID
  ipcMain.handle('db:graph:getNode', (event, nodeId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const node = queries.getGraphNodeById.get(nodeId);
      if (node && node.properties) {
        node.properties = JSON.parse(node.properties);
      }
      return { success: true, data: node };
    } catch (error) {
      console.error('[DB] Error getting graph node:', error);
      return { success: false, error: error.message };
    }
  });

  // Get nodes by type
  ipcMain.handle('db:graph:getNodesByType', (event, type) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const nodes = queries.getGraphNodesByType.all(type);
      nodes.forEach(node => {
        if (node.properties) {
          node.properties = JSON.parse(node.properties);
        }
      });
      return { success: true, data: nodes };
    } catch (error) {
      console.error('[DB] Error getting nodes by type:', error);
      return { success: false, error: error.message };
    }
  });

  // Create graph edge
  ipcMain.handle('db:graph:createEdge', (event, edge) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createGraphEdge.run(
        edge.id,
        edge.source_id,
        edge.target_id,
        edge.relation,
        edge.weight || 1.0,
        edge.metadata ? JSON.stringify(edge.metadata) : null,
        edge.created_at,
        edge.updated_at
      );
      return { success: true, data: edge };
    } catch (error) {
      console.error('[DB] Error creating graph edge:', error);
      return { success: false, error: error.message };
    }
  });

  // Get node neighbors (1-hop traversal)
  ipcMain.handle('db:graph:getNeighbors', (event, nodeId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const neighbors = queries.getNodeNeighbors.all(nodeId, nodeId, nodeId);
      neighbors.forEach(node => {
        if (node.properties) {
          node.properties = JSON.parse(node.properties);
        }
      });
      return { success: true, data: neighbors };
    } catch (error) {
      console.error('[DB] Error getting node neighbors:', error);
      return { success: false, error: error.message };
    }
  });

  // Search graph nodes
  ipcMain.handle('db:graph:searchNodes', (event, query) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const searchPattern = `%${query}%`;
      const nodes = queries.searchGraphNodes.all(searchPattern, searchPattern);
      nodes.forEach(node => {
        if (node.properties) {
          node.properties = JSON.parse(node.properties);
        }
      });
      return { success: true, data: nodes };
    } catch (error) {
      console.error('[DB] Error searching graph nodes:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
