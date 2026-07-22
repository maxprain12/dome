import { Type, type Static } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, errorResult } from './common';

interface GraphAnalysisBaseResult {
  status: 'success';
  stats: {
    node_count: number;
    edge_count: number;
    avg_degree: number;
    density: number;
  };
}

interface GraphAnalysisResult extends GraphAnalysisBaseResult {
  hubs?: Array<{ id: string; label: string; type: string; degree: number }>;
  isolated?: Array<{ id: string; label: string; type: string }>;
  clusters?: Array<{ id: number; size: number; nodes: string[]; total_nodes: number }>;
}

/**
 * Create all graph-related tools for Many assistant (semantic_relations + IPC getGraph).
 */
export function createGraphTools(): AnyAgentTool[] {
  return [
    createGenerateKnowledgeGraphTool(),
    createGetRelatedResourcesTool(),
    createResourceLinkTool(),
  ];
}

function createGenerateKnowledgeGraphTool(): AnyAgentTool {
  const parameters = Type.Object({
    focus_resource_id: Type.String({
      description: 'ID of the resource to focus on (center of the graph)',
    }),
    min_weight: Type.Optional(
      Type.Number({
        description: 'Minimum similarity for edges (0-1). Default: 0.35.',
        minimum: 0,
        maximum: 1,
      }),
    ),
  });
  return {
    label: 'Generate Knowledge Graph',
    name: 'generate_knowledge_graph',
    description: `Build a semantic similarity graph around a resource (local embeddings). Returns nodes and edges with similarity scores.`,
    parameters,
    execute: async (_toolCallId: string, args: Static<typeof parameters>) => {
      try {
        if (typeof window === 'undefined' || !window.electron?.db?.semantic) {
          return errorResult('Semantic graph API not available');
        }
        const th = args.min_weight ?? 0.35;
        const res = await window.electron.db.semantic.getGraph(args.focus_resource_id, th);
        if (!res.success || !res.data) {
          return errorResult(res.error || 'getGraph failed');
        }
        const { nodes, edges } = res.data;
        return jsonResult({
          status: 'success',
          graph: {
            node_count: nodes.length,
            edge_count: edges.length,
            focus_node: args.focus_resource_id,
            nodes: nodes.map((n: { id: string; label: string; resourceType?: string }) => ({
              id: n.id,
              label: n.label,
              type: n.resourceType ?? 'note',
            })),
            edges: edges.map(
              (e: {
                source: string;
                target: string;
                similarity: number;
                relation_type: string;
                label?: string | null;
              }) => ({
                source: e.source,
                target: e.target,
                relation: e.relation_type,
                weight: e.similarity,
                label: e.label,
              }),
            ),
          },
        });
      } catch (error) {
        return errorResult(
          `Failed to generate knowledge graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  };
}

type RelatedGraphEdge = {
  source: string;
  target: string;
  similarity: number;
  relation_type: string;
};

type RelatedResourceInfo = { relations: string[]; strength: number };

function collectRelatedResources(
  edges: RelatedGraphEdge[],
  resourceId: string,
): Map<string, RelatedResourceInfo> {
  const related = new Map<string, RelatedResourceInfo>();
  for (const edge of edges) {
    const other = edge.source === resourceId ? edge.target : edge.source;
    if (other === resourceId) continue;
    const info = related.get(other) || { relations: [], strength: 0 };
    if (!info.relations.includes(edge.relation_type)) {
      info.relations.push(edge.relation_type);
    }
    info.strength += edge.similarity;
    related.set(other, info);
  }
  return related;
}

function createGetRelatedResourcesTool(): AnyAgentTool {
  const parameters = Type.Object({
    resource_id: Type.String({
      description: 'ID of the resource to find relations for',
    }),
    min_weight: Type.Optional(
      Type.Number({
        description: 'Minimum similarity (0-1). Default: 0.3.',
        minimum: 0,
        maximum: 1,
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: 'Maximum number of related resources to return. Default: 10.',
        minimum: 1,
        maximum: 50,
      }),
    ),
  });
  return {
    label: 'Get Related Resources',
    name: 'get_related_resources',
    description: `Find resources related to a given resource via semantic relations (similarity and manual links).`,
    parameters,
    execute: async (_toolCallId: string, args: Static<typeof parameters>) => {
      try {
        if (typeof window === 'undefined' || !window.electron) {
          return errorResult('Window or electron not available');
        }
        const th = args.min_weight ?? 0.3;
        const res = await window.electron.db.semantic.getGraph(args.resource_id, th);
        if (!res.success || !res.data) {
          return errorResult(res.error || 'getGraph failed');
        }
        const edges = res.data.edges as RelatedGraphEdge[];
        const related = collectRelatedResources(edges, args.resource_id);

        const relatedResources: Array<{
          id: string;
          title: string;
          type: string;
          relations: string[];
          strength: number;
          updated_at: number;
        }> = [];

        for (const [rid, info] of related) {
          const result = await window.electron.db.resources.getById(rid);
          if (result.success && result.data) {
            relatedResources.push({
              id: result.data.id,
              title: result.data.title,
              type: result.data.type,
              relations: info.relations,
              strength: info.strength,
              updated_at: result.data.updated_at,
            });
          }
        }

        relatedResources.sort((a, b) => b.strength - a.strength);
        const limited = relatedResources.slice(0, args.limit || 10);

        return jsonResult({
          status: 'success',
          resource_id: args.resource_id,
          related_count: limited.length,
          related_resources: limited,
        });
      } catch (error) {
        return errorResult(
          `Failed to get related resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  };
}

function createResourceLinkTool(): AnyAgentTool {
  const parameters = Type.Object({
    source_id: Type.String({
      description: 'ID of the source resource',
    }),
    target_id: Type.String({
      description: 'ID of the target resource',
    }),
    relation_type: Type.Optional(
      Type.String({
        description: 'Optional label stored on the relation (legacy relation name).',
      }),
    ),
    bidirectional: Type.Optional(
      Type.Boolean({
        description: 'If true, creates manual relations in both directions. Default: false.',
      }),
    ),
  });
  return {
    label: 'Link Resources',
    name: 'link_resources',
    description: `Create a manual semantic link between two resources in the knowledge graph. Use when the user asks to connect, relate, or link two notes or documents.`,
    parameters,
    execute: async (_toolCallId: string, args: Static<typeof parameters>) => {
      try {
        if (typeof window === 'undefined' || !window.electron?.db?.semantic) {
          return errorResult('Semantic API not available');
        }

        const links: Array<{ id: string; source: string; target: string; relation: string }> = [];

        const forwardResult = await window.electron.db.semantic.createManual({
          sourceId: args.source_id,
          targetId: args.target_id,
          label: args.relation_type ?? null,
        });

        if (!forwardResult.success) {
          return errorResult(forwardResult.error || 'Failed to create link');
        }
        links.push({
          id: (forwardResult.data as { id?: string })?.id ?? `${args.source_id}__${args.target_id}`,
          source: args.source_id,
          target: args.target_id,
          relation: args.relation_type || 'manual',
        });

        if (args.bidirectional) {
          const backwardResult = await window.electron.db.semantic.createManual({
            sourceId: args.target_id,
            targetId: args.source_id,
            label: args.relation_type ?? null,
          });
          if (backwardResult.success && backwardResult.data) {
            links.push({
              id: (backwardResult.data as { id?: string }).id ?? `${args.target_id}__${args.source_id}`,
              source: args.target_id,
              target: args.source_id,
              relation: args.relation_type || 'manual',
            });
          }
        }

        return jsonResult({
          status: 'success',
          links_created: links.length,
          links,
        });
      } catch (error) {
        return errorResult(
          `Failed to create resource link: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  };
}

type GraphNode = { id: string; label: string; resourceType?: string };
type GraphEdge = { source: string; target: string };

function computeDegree(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return degree;
}

function computeStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degree: Map<string, number>,
): GraphAnalysisBaseResult['stats'] {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  return {
    node_count: nodeCount,
    edge_count: edgeCount,
    avg_degree:
      nodeCount > 0
        ? Array.from(degree.values()).reduce((a, b) => a + b, 0) / nodeCount
        : 0,
    density:
      nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0,
  };
}

function findHubs(
  nodes: GraphNode[],
  degree: Map<string, number>,
  minHubDegree: number,
): Array<{ id: string; label: string; type: string; degree: number }> {
  return nodes
    .filter((n) => (degree.get(n.id) || 0) >= minHubDegree)
    .map((n) => ({
      id: n.id,
      label: n.label,
      type: n.resourceType ?? 'note',
      degree: degree.get(n.id) || 0,
    }))
    .sort((a, b) => b.degree - a.degree);
}

function findIsolated(
  nodes: GraphNode[],
  degree: Map<string, number>,
): Array<{ id: string; label: string; type: string }> {
  return nodes
    .filter((n) => (degree.get(n.id) || 0) === 0)
    .map((n) => ({
      id: n.id,
      label: n.label,
      type: n.resourceType ?? 'note',
    }));
}

function bfsCluster(
  startId: string,
  edges: GraphEdge[],
  visited: Set<string>,
): string[] {
  const cluster: string[] = [];
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    cluster.push(current);
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        queue.push(edge.target);
      } else if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  return cluster;
}

function findClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Array<{ id: number; size: number; nodes: string[]; total_nodes: number }> {
  const visited = new Set<string>();
  const clusters: string[][] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const cluster = bfsCluster(node.id, edges, visited);
    if (cluster.length > 1) clusters.push(cluster);
  }
  return clusters.map((cluster, i) => ({
    id: i + 1,
    size: cluster.length,
    nodes: cluster.slice(0, 5),
    total_nodes: cluster.length,
  }));
}

function createAnalyzeGraphStructureTool(): AnyAgentTool {
  const parameters = Type.Object({
    focus_resource_id: Type.String({
      description: 'Resource ID whose semantic neighborhood is analyzed',
    }),
    analysis_type: Type.Optional(
      Type.String({
        description: "Type of analysis: 'hubs', 'clusters', 'isolated', or 'all'. Default: 'all'",
      }),
    ),
    min_hub_degree: Type.Optional(
      Type.Number({
        description: 'Minimum number of connections to be considered a hub. Default: 3.',
        minimum: 2,
      }),
    ),
    min_weight: Type.Optional(
      Type.Number({
        description: 'Minimum edge similarity when loading the subgraph. Default: 0.25.',
        minimum: 0,
        maximum: 1,
      }),
    ),
  });
  return {
    label: 'Analyze Graph Structure',
    name: 'analyze_graph_structure',
    description: `Analyze the semantic graph neighborhood of a resource: hubs, isolated nodes in the subgraph, and connected components.`,
    parameters,
    execute: async (_toolCallId: string, args: Static<typeof parameters>) => {
      try {
        if (typeof window === 'undefined' || !window.electron?.db?.semantic) {
          return errorResult('Semantic API not available');
        }
        const analysisType = args.analysis_type || 'all';
        const minHubDegree = args.min_hub_degree || 3;
        const th = args.min_weight ?? 0.25;

        const res = await window.electron.db.semantic.getGraph(args.focus_resource_id, th);
        if (!res.success || !res.data) {
          return errorResult(res.error || 'getGraph failed');
        }

        const nodes = res.data.nodes as GraphNode[];
        const edges = res.data.edges as GraphEdge[];
        const degree = computeDegree(nodes, edges);

        const result: GraphAnalysisResult = {
          status: 'success',
          stats: computeStats(nodes, edges, degree),
        };

        if (analysisType === 'hubs' || analysisType === 'all') {
          result.hubs = findHubs(nodes, degree, minHubDegree);
        }
        if (analysisType === 'isolated' || analysisType === 'all') {
          result.isolated = findIsolated(nodes, degree);
        }
        if (analysisType === 'clusters' || analysisType === 'all') {
          result.clusters = findClusters(nodes, edges);
        }

        return jsonResult(result);
      } catch (error) {
        return errorResult(
          `Failed to analyze graph structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  };
}
