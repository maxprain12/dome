import dagre from 'dagre';
import type { GraphLayoutType } from '@/types';

interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  [key: string]: any;
}

interface LayoutEdge {
  source: string;
  target: string;
  [key: string]: any;
}

/**
 * Apply layout algorithm to graph nodes
 */
export function applyLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  layout: GraphLayoutType,
  focusNodeId?: string
): LayoutNode[] {
  switch (layout) {
    case 'hierarchical':
      return applyHierarchicalLayout(nodes, edges, focusNodeId);
    case 'circular':
      return applyCircularLayout(nodes, focusNodeId);
    case 'radial':
      return applyRadialLayout(nodes, edges, focusNodeId);
    case 'force':
    default:
      return applyForceLayout(nodes, focusNodeId);
  }
}

/**
 * Hierarchical layout using Dagre
 */
function applyHierarchicalLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  focusNodeId?: string
): LayoutNode[] {
  const graph = new dagre.graphlib.Graph();

  // Configure graph
  graph.setGraph({
    rankdir: 'TB', // Top to bottom
    align: 'UL', // Upper left
    nodesep: 80, // Horizontal space between nodes
    ranksep: 100, // Vertical space between ranks
    marginx: 50,
    marginy: 50,
  });

  graph.setDefaultEdgeLabel(() => ({}));

  // Add nodes with dimensions
  nodes.forEach(node => {
    graph.setNode(node.id, {
      width: 180,
      height: 60,
    });
  });

  // Add edges
  edges.forEach(edge => {
    graph.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(graph);

  // Apply positions
  return nodes.map(node => {
    const dagreNode = graph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - 90, // Center node (half width)
        y: dagreNode.y - 30, // Center node (half height)
      },
    };
  });
}

/**
 * Circular layout - arrange nodes in a circle
 */
function applyCircularLayout(
  nodes: LayoutNode[],
  focusNodeId?: string
): LayoutNode[] {
  const centerX = 0;
  const centerY = 0;
  const radius = Math.max(300, nodes.length * 30);

  // Separate focus node from others
  const focusNode = nodes.find(n => n.id === focusNodeId);
  const otherNodes = nodes.filter(n => n.id !== focusNodeId);

  const result: LayoutNode[] = [];

  // Place focus node at center
  if (focusNode) {
    result.push({
      ...focusNode,
      position: { x: centerX, y: centerY },
    });
  }

  // Arrange other nodes in circle
  const angleStep = (2 * Math.PI) / otherNodes.length;
  otherNodes.forEach((node, i) => {
    const angle = i * angleStep;
    result.push({
      ...node,
      position: {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      },
    });
  });

  return result.length > 0 ? result : nodes;
}

/**
 * Radial layout - concentric circles based on distance from focus
 */
function applyRadialLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  focusNodeId?: string
): LayoutNode[] {
  if (!focusNodeId) {
    return applyCircularLayout(nodes);
  }

  const centerX = 0;
  const centerY = 0;

  // Calculate distances from focus node using BFS
  const distances = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; dist: number }> = [{ id: focusNodeId, dist: 0 }];

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    distances.set(id, dist);

    // Find neighbors
    edges.forEach(edge => {
      if (edge.source === id && !visited.has(edge.target)) {
        queue.push({ id: edge.target, dist: dist + 1 });
      }
      if (edge.target === id && !visited.has(edge.source)) {
        queue.push({ id: edge.source, dist: dist + 1 });
      }
    });
  }

  // Handle disconnected nodes
  nodes.forEach(node => {
    if (!distances.has(node.id)) {
      distances.set(node.id, 999);
    }
  });

  // Group nodes by distance
  const maxDist = Math.max(...Array.from(distances.values()).filter(d => d < 999));
  const layers: Map<number, LayoutNode[]> = new Map();

  nodes.forEach(node => {
    const dist = distances.get(node.id) || 999;
    if (!layers.has(dist)) {
      layers.set(dist, []);
    }
    layers.get(dist)!.push(node);
  });

  // Position nodes in concentric circles
  const result: LayoutNode[] = [];
  const radiusStep = 200;

  for (let i = 0; i <= maxDist; i++) {
    const layerNodes = layers.get(i) || [];
    const radius = i * radiusStep;

    if (i === 0) {
      // Center node
      layerNodes.forEach(node => {
        result.push({
          ...node,
          position: { x: centerX, y: centerY },
        });
      });
    } else {
      // Circle of nodes
      const angleStep = (2 * Math.PI) / layerNodes.length;
      layerNodes.forEach((node, j) => {
        const angle = j * angleStep;
        result.push({
          ...node,
          position: {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          },
        });
      });
    }
  }

  // Handle disconnected nodes (place them far away)
  const disconnected = layers.get(999) || [];
  if (disconnected.length > 0) {
    const farRadius = (maxDist + 2) * radiusStep;
    const angleStep = (2 * Math.PI) / disconnected.length;
    disconnected.forEach((node, i) => {
      const angle = i * angleStep;
      result.push({
        ...node,
        position: {
          x: centerX + Math.cos(angle) * farRadius,
          y: centerY + Math.sin(angle) * farRadius,
        },
      });
    });
  }

  return result;
}

/**
 * Simple force-directed layout (circular for now)
 */
function applyForceLayout(
  nodes: LayoutNode[],
  focusNodeId?: string
): LayoutNode[] {
  // For now, just use circular layout
  // Real force-directed is handled by React Flow's auto-layout
  return applyCircularLayout(nodes, focusNodeId);
}

/**
 * Cache for layout calculations
 */
class LayoutCache {
  private cache = new Map<string, { nodes: LayoutNode[]; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes

  getCacheKey(nodes: LayoutNode[], edges: LayoutEdge[], layout: GraphLayoutType): string {
    const nodeIds = nodes.map(n => n.id).sort().join(',');
    const edgeIds = edges.map(e => `${e.source}-${e.target}`).sort().join(',');
    return `${layout}:${nodeIds}:${edgeIds}`;
  }

  get(key: string): LayoutNode[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.nodes;
  }

  set(key: string, nodes: LayoutNode[]): void {
    this.cache.set(key, {
      nodes,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const layoutCache = new LayoutCache();
