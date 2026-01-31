/**
 * Graph Service - Main Process
 * Handles Knowledge Graph operations
 */

const { getQueries, getDB } = require('./database.cjs');
const crypto = require('crypto');

/**
 * Add a relationship between two nodes (or resources)
 * If ids provided are resource_ids, it resolves them to node_ids first.
 * @param {string} sourceId - Node ID or Resource ID
 * @param {string} targetId - Node ID or Resource ID
 * @param {string} relationType - e.g. 'MENTIONS', 'RELATED_TO'
 * @param {object} metadata - Optional metadata
 */
function addRelation(sourceId, targetId, relationType, metadata = {}) {
  const db = getDB();
  const queries = getQueries();

  // Helper to resolve ID
  const resolveNodeId = (id) => {
    // Check if it's a node ID
    const node = queries.getGraphNodeById.get(id);
    if (node) return node.id;
    
    // Check if it's a resource ID
    const nodeFromRes = queries.getGraphNodeByResourceId.get(id);
    if (nodeFromRes) return nodeFromRes.id;

    throw new Error(`Node not found for ID: ${id}`);
  };

  const sourceNodeId = resolveNodeId(sourceId);
  const targetNodeId = resolveNodeId(targetId);

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    queries.createGraphEdge.run(
      id,
      sourceNodeId,
      targetNodeId,
      relationType,
      1.0, // Default weight
      JSON.stringify(metadata),
      now
    );
    console.log(`[Graph] Added edge: ${sourceNodeId} -[${relationType}]-> ${targetNodeId}`);
    return { id, sourceNodeId, targetNodeId, relationType };
  } catch (err) {
    console.error('[Graph] Error adding relation:', err.message);
    throw err;
  }
}

/**
 * Create a conceptual node (not linked to a file)
 * @param {string} label - Name of the concept
 * @param {string} type - 'concept', 'person', etc.
 * @param {object} properties - Additional data
 */
function createConceptNode(label, type = 'concept', properties = {}) {
  const queries = getQueries();
  
  // Check if exists first (simple check by label for now)
  const existing = queries.findGraphNodesByLabel.get(label);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    queries.createGraphNode.run(
      id,
      null, // No resource_id
      label,
      type,
      JSON.stringify(properties),
      now,
      now
    );
    return { id, label, type };
  } catch (err) {
    console.error('[Graph] Error creating concept node:', err.message);
    throw err;
  }
}

/**
 * Get neighbors of a node (resource or concept)
 * @param {string} id - Node ID or Resource ID
 */
function getNeighbors(id) {
  const queries = getQueries();
  
  // Resolve ID
  let nodeId = id;
  const nodeFromRes = queries.getGraphNodeByResourceId.get(id);
  if (nodeFromRes) nodeId = nodeFromRes.id;

  return queries.getGraphNeighbors.all(nodeId, nodeId).map(row => ({
    ...row,
    properties: row.properties ? JSON.parse(row.properties) : {}
  }));
}

module.exports = {
  addRelation,
  createConceptNode,
  getNeighbors
};
