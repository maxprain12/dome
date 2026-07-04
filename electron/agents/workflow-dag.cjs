/* eslint-disable no-console */
/**
 * Workflow DAG helpers (04/T05 — extracted from run-engine.cjs).
 * Pure functions: no Electron, no database — unit-tested in
 * electron/__tests__/workflow-dag.test.mjs.
 */

function buildAdjacency(nodes, edges) {
  const inDegree = {};
  const adjacency = {};
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    adjacency[edge.source]?.push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] ?? 0) + 1;
  }
  return { inDegree, adjacency };
}

function advanceLevel(currentLevel, nodes, inDegree, adjacency) {
  const nextLevel = [];
  for (const node of currentLevel) {
    for (const neighborId of adjacency[node.id] ?? []) {
      inDegree[neighborId] = (inDegree[neighborId] ?? 1) - 1;
      if (inDegree[neighborId] !== 0) continue;
      const neighbor = nodes.find((candidate) => candidate.id === neighborId);
      if (neighbor) nextLevel.push(neighbor);
    }
  }
  return nextLevel;
}

function topologicalLevels(nodes, edges) {
  const { inDegree, adjacency } = buildAdjacency(nodes, edges);
  const levels = [];
  let currentLevel = nodes.filter((node) => inDegree[node.id] === 0);
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    currentLevel = advanceLevel(currentLevel, nodes, inDegree, adjacency);
  }
  const processedCount = levels.reduce((count, level) => count + level.length, 0);
  if (processedCount !== nodes.length) {
    throw new Error('El workflow contiene ciclos o dependencias inválidas');
  }
  return levels;
}

function mergePayloads(payloads) {
  const resources = payloads.flatMap((payload) => payload.resources ?? []);
  const uniqueResources = resources.filter(
    (resource, index) =>
      resources.findIndex(
        (candidate) =>
          candidate.resourceId === resource.resourceId &&
          candidate.resourceType === resource.resourceType,
      ) === index,
  );
  return {
    kind: payloads.length > 1 ? 'bundle' : payloads[0]?.kind ?? 'text',
    text: payloads.map((payload) => payload.text).filter(Boolean).join('\n\n---\n\n'),
    resources: uniqueResources.length > 0 ? uniqueResources : undefined,
  };
}

function getInputPayloads(targetNodeId, edges, resolvedPayloads) {
  return edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => resolvedPayloads[edge.source])
    .filter(Boolean);
}

module.exports = {
  topologicalLevels,
  mergePayloads,
  getInputPayloads,
};
