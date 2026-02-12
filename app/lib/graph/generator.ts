import type {
  GraphViewState,
  GraphNodeData,
  GraphEdgeData,
  GraphGenerationOptions,
  Resource,
  GraphNode,
  GraphEdge,
  ResourceLink,
} from '@/types';

/**
 * Generate a complete knowledge graph using multiple strategies
 */
export async function generateGraph(options: GraphGenerationOptions): Promise<GraphViewState> {
  const {
    projectId,
    focusResourceId,
    maxDepth = 3,
    strategies = ['mentions', 'links', 'semantic', 'tags', 'studio'],
    maxNodes = 500,
    minWeight = 0.3,
  } = options;

  const nodesMap = new Map<string, any>();
  const edgesMap = new Map<string, any>();

  // Strategy 1: Resource Mentions (@links in editor)
  if (strategies.includes('mentions')) {
    const mentionData = await generateGraphFromMentions(focusResourceId, maxDepth);
    mergeMaps(nodesMap, mentionData.nodes);
    mergeMaps(edgesMap, mentionData.edges);
  }

  // Strategy 2: Resource Links (backlinks table)
  if (strategies.includes('links')) {
    const linksData = await generateGraphFromLinks(focusResourceId, maxDepth);
    mergeMaps(nodesMap, linksData.nodes);
    mergeMaps(edgesMap, linksData.edges);
  }

  // Strategy 3: Semantic Similarity (LanceDB)
  if (strategies.includes('semantic')) {
    const semanticData = await generateGraphFromSemantics(focusResourceId, maxDepth, minWeight);
    mergeMaps(nodesMap, semanticData.nodes);
    mergeMaps(edgesMap, semanticData.edges);
  }

  // Strategy 4: Shared Tags
  if (strategies.includes('tags')) {
    const tagsData = await generateGraphFromTags(focusResourceId, projectId, minWeight);
    mergeMaps(nodesMap, tagsData.nodes);
    mergeMaps(edgesMap, tagsData.edges);
  }

  // Strategy 5: Studio outputs (study materials generated from resources)
  if (strategies.includes('studio')) {
    const studioData = await generateGraphFromStudioOutputs(focusResourceId, projectId);
    mergeMaps(nodesMap, studioData.nodes);
    mergeMaps(edgesMap, studioData.edges);
  }

  // Convert maps to arrays
  let nodes = Array.from(nodesMap.values());
  let edges = Array.from(edgesMap.values());

  // Apply node limit
  if (nodes.length > maxNodes) {
    console.warn(`Graph has ${nodes.length} nodes, limiting to ${maxNodes}`);
    // Keep focus node and highest weighted connections
    nodes = limitNodes(nodes, edges, focusResourceId, maxNodes);
    // Filter edges to only include remaining nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  // Apply layout
  const positionedNodes = applyForceLayout(nodes, edges);

  return {
    nodes: positionedNodes,
    edges,
    focusNodeId: focusResourceId,
    depth: maxDepth,
    strategies,
    layout: 'force',
    filters: {},
  };
}

/**
 * Strategy 1: Parse ResourceMention extensions from resource content
 */
async function generateGraphFromMentions(
  focusResourceId?: string,
  maxDepth: number = 3
): Promise<{ nodes: Map<string, any>; edges: Map<string, any> }> {
  const nodes = new Map();
  const edges = new Map();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  if (!focusResourceId || typeof window === 'undefined' || !window.electron) {
    return { nodes, edges };
  }

  queue.push({ id: focusResourceId, depth: 0 });

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    try {
      // Get resource
      const result = await window.electron.db.resources.getById(id);
      if (!result.success || !result.data) continue;

      const resource = result.data;

      // Add node
      if (!nodes.has(id)) {
        nodes.set(id, createResourceNode(resource, depth === 0));
      }

      // Parse content for resource mentions
      const mentions = parseResourceMentions(resource.content || '');

      for (const mentionedId of mentions) {
        // Add edge
        const edgeId = `mention-${id}-${mentionedId}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, createEdge(edgeId, id, mentionedId, 'mentions', 0.9));
        }

        // Queue for traversal
        if (depth < maxDepth) {
          queue.push({ id: mentionedId, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.error(`Error processing resource ${id}:`, err);
    }
  }

  return { nodes, edges };
}

/**
 * Strategy 2: Query resource_links table for backlinks
 */
async function generateGraphFromLinks(
  focusResourceId?: string,
  maxDepth: number = 3
): Promise<{ nodes: Map<string, any>; edges: Map<string, any> }> {
  const nodes = new Map();
  const edges = new Map();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  if (!focusResourceId || typeof window === 'undefined' || !window.electron) {
    return { nodes, edges };
  }

  queue.push({ id: focusResourceId, depth: 0 });

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    try {
      // Get resource
      const resourceResult = await window.electron.db.resources.getById(id);
      if (!resourceResult.success || !resourceResult.data) continue;

      const resource = resourceResult.data;

      // Add node
      if (!nodes.has(id)) {
        nodes.set(id, createResourceNode(resource, depth === 0));
      }

      // Get outgoing links
      const outgoingResult = await window.electron.db.links.getBySource(id);
      if (outgoingResult.success && outgoingResult.data) {
        for (const link of outgoingResult.data) {
          const edgeId = `link-${link.source_id}-${link.target_id}`;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, createEdge(
              edgeId,
              link.source_id,
              link.target_id,
              link.link_type || 'related',
              link.weight || 0.7
            ));
          }

          // Queue target for traversal
          if (depth < maxDepth) {
            queue.push({ id: link.target_id, depth: depth + 1 });
          }
        }
      }

      // Get incoming links (backlinks)
      const incomingResult = await window.electron.db.links.getByTarget(id);
      if (incomingResult.success && incomingResult.data) {
        for (const link of incomingResult.data) {
          const edgeId = `link-${link.source_id}-${link.target_id}`;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, createEdge(
              edgeId,
              link.source_id,
              link.target_id,
              link.link_type || 'related',
              link.weight || 0.7
            ));
          }

          // Queue source for traversal
          if (depth < maxDepth) {
            queue.push({ id: link.source_id, depth: depth + 1 });
          }
        }
      }
    } catch (err) {
      console.error(`Error processing links for ${id}:`, err);
    }
  }

  return { nodes, edges };
}

/**
 * Strategy 3: Semantic similarity via LanceDB vector search
 */
async function generateGraphFromSemantics(
  focusResourceId?: string,
  maxDepth: number = 3,
  minWeight: number = 0.7
): Promise<{ nodes: Map<string, any>; edges: Map<string, any> }> {
  const nodes = new Map();
  const edges = new Map();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  if (!focusResourceId || typeof window === 'undefined' || !window.electron) {
    return { nodes, edges };
  }

  queue.push({ id: focusResourceId, depth: 0 });

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    try {
      // Get resource
      const resourceResult = await window.electron.db.resources.getById(id);
      if (!resourceResult.success || !resourceResult.data) continue;

      const resource = resourceResult.data;

      // Add node
      if (!nodes.has(id)) {
        nodes.set(id, createResourceNode(resource, depth === 0));
      }

      // Find semantically similar resources
      // TODO: This requires vector search IPC endpoint
      // For now, skip if depth > 1 to avoid too many calls
      if (depth > 1) continue;

      try {
        const similarResult = await window.electron.invoke('vector:semanticSearch', {
          resourceId: id,
          limit: 5,
          minScore: minWeight,
        });

        if (similarResult && Array.isArray(similarResult)) {
          for (const similar of similarResult) {
            const similarId = similar.resource_id || similar.id;
            const score = similar.score || similar.similarity || 0.5;

            if (score < minWeight) continue;

            const edgeId = `semantic-${id}-${similarId}`;
            if (!edges.has(edgeId)) {
              edges.set(edgeId, createEdge(edgeId, id, similarId, 'similar', score));
            }

            // Queue for traversal (but only if high similarity)
            if (depth < maxDepth && score > 0.8) {
              queue.push({ id: similarId, depth: depth + 1 });
            }
          }
        }
      } catch (err) {
        console.warn('Semantic search not available:', err);
      }
    } catch (err) {
      console.error(`Error processing semantic search for ${id}:`, err);
    }
  }

  return { nodes, edges };
}

/**
 * Strategy 4: Connect resources with shared tags
 */
async function generateGraphFromTags(
  focusResourceId?: string,
  projectId?: string,
  minWeight: number = 0.3
): Promise<{ nodes: Map<string, any>; edges: Map<string, any> }> {
  const nodes = new Map();
  const edges = new Map();

  if (!focusResourceId || typeof window === 'undefined' || !window.electron) {
    return { nodes, edges };
  }

  try {
    // Get focus resource
    const resourceResult = await window.electron.db.resources.getById(focusResourceId);
    if (!resourceResult.success || !resourceResult.data) {
      return { nodes, edges };
    }

    const resource = resourceResult.data;
    nodes.set(focusResourceId, createResourceNode(resource, true));

    // Get tags for focus resource
    const tagsResult = await window.electron.db.tags.getByResource(focusResourceId);
    if (!tagsResult.success || !tagsResult.data || tagsResult.data.length === 0) {
      return { nodes, edges };
    }

    const focusTags = tagsResult.data;

    // Find other resources with shared tags
    const allResourcesResult = projectId
      ? await window.electron.db.resources.getByProject(projectId)
      : await window.electron.db.resources.getAll(100);

    if (!allResourcesResult.success || !allResourcesResult.data) {
      return { nodes, edges };
    }

    for (const otherResource of allResourcesResult.data) {
      if (otherResource.id === focusResourceId) continue;

      // Get tags for other resource
      const otherTagsResult = await window.electron.db.tags.getByResource(otherResource.id);
      if (!otherTagsResult.success || !otherTagsResult.data) continue;

      const otherTags = otherTagsResult.data;

      // Find shared tags
      const sharedTags = focusTags.filter(tag =>
        otherTags.some(t => t.id === tag.id)
      );

      if (sharedTags.length === 0) continue;

      // Calculate weight based on tag rarity
      // Rare tags = higher weight
      const weight = Math.min(1.0, sharedTags.length * 0.3);

      if (weight < minWeight) continue;

      // Add node
      if (!nodes.has(otherResource.id)) {
        nodes.set(otherResource.id, createResourceNode(otherResource, false));
      }

      // Add edge
      const edgeId = `tag-${focusResourceId}-${otherResource.id}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, createEdge(
          edgeId,
          focusResourceId,
          otherResource.id,
          'shared_tags',
          weight
        ));
      }
    }
  } catch (err) {
    console.error('Error generating tag-based graph:', err);
  }

  return { nodes, edges };
}

/**
 * Strategy 5: Studio outputs linked to their source resources
 */
async function generateGraphFromStudioOutputs(
  focusResourceId?: string,
  projectId?: string
): Promise<{ nodes: Map<string, any>; edges: Map<string, any> }> {
  const nodes = new Map();
  const edges = new Map();

  if (!focusResourceId || typeof window === 'undefined' || !window.electron) {
    return { nodes, edges };
  }

  try {
    const studioResult = await window.electron.db.studio.getByProject(projectId || 'default');
    if (!studioResult.success || !studioResult.data) return { nodes, edges };

    const studioOutputs = studioResult.data as Array<{
      id: string;
      title: string;
      type: string;
      resource_id?: string | null;
      source_ids?: string | null;
    }>;

    for (const output of studioOutputs) {
      const sourceIds: string[] = [];
      if (output.resource_id) sourceIds.push(output.resource_id);
      if (output.source_ids) {
        try {
          const parsed = typeof output.source_ids === 'string'
            ? JSON.parse(output.source_ids) : output.source_ids;
          if (Array.isArray(parsed)) sourceIds.push(...parsed);
        } catch {
          /* ignore */
        }
      }
      const uniqueSourceIds = [...new Set(sourceIds)];
      if (!uniqueSourceIds.includes(focusResourceId)) continue;

      const nodeId = `studio-${output.id}`;
      nodes.set(nodeId, {
        id: nodeId,
        data: {
          id: nodeId,
          label: output.title,
          type: 'study_material' as const,
          resourceId: output.id,
          metadata: {
            studioType: output.type,
            isStudioOutput: true,
            isFocus: false,
          },
        },
        position: { x: 0, y: 0 },
        type: 'custom',
      });

      for (const srcId of uniqueSourceIds) {
        const edgeId = `studio-${srcId}-${output.id}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, createEdge(edgeId, srcId, nodeId, 'generated_from', 0.8));
        }
        if (!nodes.has(srcId)) {
          const resResult = await window.electron.db.resources.getById(srcId);
          if (resResult.success && resResult.data) {
            nodes.set(srcId, createResourceNode(resResult.data, srcId === focusResourceId));
          }
        }
      }
    }
  } catch (err) {
    console.error('Error generating studio graph:', err);
  }

  return { nodes, edges };
}

// Helper Functions

function createResourceNode(resource: Resource, isFocus: boolean): any {
  return {
    id: resource.id,
    data: {
      id: resource.id,
      label: resource.title,
      type: 'resource' as const,
      resourceId: resource.id,
      resourceType: resource.type,
      metadata: {
        updatedAt: resource.updated_at,
        isFocus,
      },
    },
    position: { x: 0, y: 0 },
    type: 'custom',
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  relation: string,
  weight: number
): any {
  return {
    id,
    source,
    target,
    label: relation,
    data: {
      id,
      source,
      target,
      label: relation,
      relation,
      weight,
    },
  };
}

function parseResourceMentions(content: string): string[] {
  const mentions: string[] = [];
  const regex = /data-resource-id="([^"]+)"/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return [...new Set(mentions)]; // Remove duplicates
}

function mergeMaps(target: Map<string, any>, source: Map<string, any>) {
  for (const [key, value] of source) {
    if (!target.has(key)) {
      target.set(key, value);
    }
  }
}

function limitNodes(
  nodes: any[],
  edges: any[],
  focusId?: string,
  maxNodes: number = 500
): any[] {
  // Always keep focus node
  const focusNode = nodes.find(n => n.id === focusId);
  const otherNodes = nodes.filter(n => n.id !== focusId);

  // Calculate node importance (degree + weight)
  const importance = new Map<string, number>();

  for (const node of otherNodes) {
    const connectedEdges = edges.filter(
      e => e.source === node.id || e.target === node.id
    );
    const degree = connectedEdges.length;
    const totalWeight = connectedEdges.reduce((sum, e) => sum + (e.data?.weight || 0.5), 0);
    importance.set(node.id, degree * 10 + totalWeight);
  }

  // Sort by importance
  otherNodes.sort((a, b) => (importance.get(b.id) || 0) - (importance.get(a.id) || 0));

  // Take top nodes
  const limitedNodes = otherNodes.slice(0, maxNodes - 1);

  return focusNode ? [focusNode, ...limitedNodes] : limitedNodes;
}

function applyForceLayout(nodes: any[], edges: any[]): any[] {
  // Simple force-directed layout
  // For now, use a circular layout around focus node
  const focusNode = nodes.find(n => n.data?.metadata?.isFocus);

  if (!focusNode) {
    // No focus, arrange in grid
    const cols = Math.ceil(Math.sqrt(nodes.length));
    return nodes.map((node, i) => ({
      ...node,
      position: {
        x: (i % cols) * 200,
        y: Math.floor(i / cols) * 150,
      },
    }));
  }

  // Place focus at center
  const result = nodes.map(node => {
    if (node.id === focusNode.id) {
      return { ...node, position: { x: 0, y: 0 } };
    }
    return node;
  });

  // Arrange others in concentric circles
  const otherNodes = result.filter(n => n.id !== focusNode.id);
  const radius = 250;
  const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);

  otherNodes.forEach((node, i) => {
    const angle = i * angleStep;
    node.position = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  return result;
}
