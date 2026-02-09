import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from 'agentlang';
import { generateGraph } from '@/lib/graph';
import { jsonResult, errorResult } from './common';

/**
 * Create all graph-related tools for Many assistant
 */
export function createGraphTools(): AnyAgentTool[] {
  return [
    createGenerateKnowledgeGraphTool(),
    createGetRelatedResourcesTool(),
    createResourceLinkTool(),
    createAnalyzeGraphStructureTool(),
  ];
}

/**
 * Tool 1: Generate Knowledge Graph
 * Generates a complete knowledge graph for a resource or project
 */
function createGenerateKnowledgeGraphTool(): AnyAgentTool {
  return {
    label: 'Generate Knowledge Graph',
    name: 'generate_knowledge_graph',
    description: `Generate a knowledge graph showing connections between documents. The graph uses multiple strategies: mentions (@links), backlinks, semantic similarity, and shared tags. Returns nodes and edges with relationship information. Useful for visualizing how documents relate to each other and discovering hidden connections.`,
    parameters: Type.Object({
      focus_resource_id: Type.Optional(Type.String({
        description: 'ID of the resource to focus on (center of the graph)'
      })),
      project_id: Type.Optional(Type.String({
        description: 'ID of the project to generate graph for (all project resources)'
      })),
      max_depth: Type.Optional(Type.Number({
        description: 'Maximum depth of graph traversal (1-5). Default: 3. Higher = more connections but slower.',
        minimum: 1,
        maximum: 5
      })),
      strategies: Type.Optional(Type.Array(Type.String({
        description: "Strategies to use: 'mentions', 'links', 'semantic', 'tags', 'ai'. Default: all except 'ai'"
      }))),
      max_nodes: Type.Optional(Type.Number({
        description: 'Maximum number of nodes to return. Default: 500.',
        minimum: 10,
        maximum: 1000
      })),
      min_weight: Type.Optional(Type.Number({
        description: 'Minimum edge weight (0-1). Default: 0.3. Higher = fewer but stronger connections.',
        minimum: 0,
        maximum: 1
      })),
    }),
    execute: async (_toolCallId, args) => {
      try {
        if (!args.focus_resource_id && !args.project_id) {
          return errorResult('Must provide either focus_resource_id or project_id');
        }

        const graphState = await generateGraph({
          focusResourceId: args.focus_resource_id,
          projectId: args.project_id,
          maxDepth: args.max_depth || 3,
          strategies: args.strategies as any || ['mentions', 'links', 'semantic', 'tags'],
          maxNodes: args.max_nodes || 500,
          minWeight: args.min_weight || 0.3,
        });

        return jsonResult({
          status: 'success',
          graph: {
            node_count: graphState.nodes.length,
            edge_count: graphState.edges.length,
            focus_node: graphState.focusNodeId,
            depth: graphState.depth,
            strategies_used: graphState.strategies,
            nodes: graphState.nodes.map(n => ({
              id: n.id,
              label: n.data.label,
              type: n.data.type,
              resource_id: n.data.resourceId,
            })),
            edges: graphState.edges.map(e => ({
              source: e.source,
              target: e.target,
              relation: e.data?.relation || e.label,
              weight: e.data?.weight || 0.5,
            })),
          },
        });
      } catch (error) {
        return errorResult(`Failed to generate knowledge graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Tool 2: Get Related Resources
 * Find resources related to a given resource via graph traversal
 */
function createGetRelatedResourcesTool(): AnyAgentTool {
  return {
    label: 'Get Related Resources',
    name: 'get_related_resources',
    description: `Find resources related to a given resource by traversing the knowledge graph. Returns a ranked list of related resources with relationship information. Useful for finding relevant documents, discovering connections, and building context.`,
    parameters: Type.Object({
      resource_id: Type.String({
        description: 'ID of the resource to find relations for'
      }),
      max_depth: Type.Optional(Type.Number({
        description: 'Maximum depth of graph traversal (1-3). Default: 2.',
        minimum: 1,
        maximum: 3
      })),
      relation_types: Type.Optional(Type.Array(Type.String({
        description: "Filter by relation types: 'mentions', 'related', 'similar', 'shared_tags', etc."
      }))),
      min_weight: Type.Optional(Type.Number({
        description: 'Minimum relationship strength (0-1). Default: 0.3.',
        minimum: 0,
        maximum: 1
      })),
      limit: Type.Optional(Type.Number({
        description: 'Maximum number of related resources to return. Default: 10.',
        minimum: 1,
        maximum: 50
      })),
    }),
    execute: async (_toolCallId, args) => {
      try {
        if (typeof window === 'undefined' || !window.electron) {
          return errorResult('Window or electron not available');
        }

        // Generate graph for the resource
        const graphState = await generateGraph({
          focusResourceId: args.resource_id,
          maxDepth: args.max_depth || 2,
          strategies: ['mentions', 'links', 'semantic', 'tags'],
          maxNodes: 100,
          minWeight: args.min_weight || 0.3,
        });

        // Filter edges by relation type if specified
        let edges = graphState.edges;
        if (args.relation_types && args.relation_types.length > 0) {
          edges = edges.filter(e => {
            const relation = e.data?.relation || e.label || '';
            return args.relation_types!.includes(relation);
          });
        }

        // Find all resources connected to focus
        const connectedResourceIds = new Set<string>();
        const relationInfo = new Map<string, { relations: string[]; weight: number }>();

        for (const edge of edges) {
          const otherId = edge.source === args.resource_id ? edge.target : edge.source;
          if (otherId === args.resource_id) continue;

          connectedResourceIds.add(otherId);

          const info = relationInfo.get(otherId) || { relations: [], weight: 0 };
          const relation = edge.data?.relation || edge.label || 'related';
          if (!info.relations.includes(relation)) {
            info.relations.push(relation);
          }
          info.weight += edge.data?.weight || 0.5;
          relationInfo.set(otherId, info);
        }

        // Get resource details
        const relatedResources = [];
        for (const resourceId of connectedResourceIds) {
          const result = await window.electron.db.resources.getById(resourceId);
          if (result.success && result.data) {
            const info = relationInfo.get(resourceId)!;
            relatedResources.push({
              id: result.data.id,
              title: result.data.title,
              type: result.data.type,
              relations: info.relations,
              strength: info.weight,
              updated_at: result.data.updated_at,
            });
          }
        }

        // Sort by strength (weight)
        relatedResources.sort((a, b) => b.strength - a.strength);

        // Apply limit
        const limited = relatedResources.slice(0, args.limit || 10);

        return jsonResult({
          status: 'success',
          resource_id: args.resource_id,
          related_count: limited.length,
          related_resources: limited,
        });
      } catch (error) {
        return errorResult(`Failed to get related resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Tool 3: Create Resource Link
 * Manually create a link between two resources
 */
function createResourceLinkTool(): AnyAgentTool {
  return {
    label: 'Create Resource Link',
    name: 'create_resource_link',
    description: `Create a link between two resources to establish a relationship. The link will appear in the knowledge graph and can have a custom relation type and weight. Useful for manually connecting related documents, creating references, or organizing knowledge.`,
    parameters: Type.Object({
      source_id: Type.String({
        description: 'ID of the source resource'
      }),
      target_id: Type.String({
        description: 'ID of the target resource'
      }),
      relation_type: Type.Optional(Type.String({
        description: "Type of relationship: 'related', 'references', 'contradicts', 'supports', etc. Default: 'related'"
      })),
      weight: Type.Optional(Type.Number({
        description: 'Strength of the relationship (0-1). Default: 0.7.',
        minimum: 0,
        maximum: 1
      })),
      bidirectional: Type.Optional(Type.Boolean({
        description: 'If true, creates links in both directions. Default: false.'
      })),
      metadata: Type.Optional(Type.Object({}, { additionalProperties: true })),
    }),
    execute: async (_toolCallId, args) => {
      try {
        if (typeof window === 'undefined' || !window.electron) {
          return errorResult('Window or electron not available');
        }

        const links = [];

        // Create forward link
        const forwardResult = await window.electron.db.links.create({
          source_id: args.source_id,
          target_id: args.target_id,
          link_type: args.relation_type || 'related',
          weight: args.weight || 0.7,
          metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
        });

        if (!forwardResult.success) {
          return errorResult(`Failed to create link: ${forwardResult.error || 'Unknown error'}`);
        }

        links.push({
          id: forwardResult.data.id,
          source: args.source_id,
          target: args.target_id,
          relation: args.relation_type || 'related',
        });

        // Create backward link if bidirectional
        if (args.bidirectional) {
          const backwardResult = await window.electron.db.links.create({
            source_id: args.target_id,
            target_id: args.source_id,
            link_type: args.relation_type || 'related',
            weight: args.weight || 0.7,
            metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
          });

          if (backwardResult.success) {
            links.push({
              id: backwardResult.data.id,
              source: args.target_id,
              target: args.source_id,
              relation: args.relation_type || 'related',
            });
          }
        }

        return jsonResult({
          status: 'success',
          links_created: links.length,
          links,
        });
      } catch (error) {
        return errorResult(`Failed to create resource link: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Tool 4: Analyze Graph Structure
 * Analyze the knowledge graph to find hubs, clusters, and isolated nodes
 */
function createAnalyzeGraphStructureTool(): AnyAgentTool {
  return {
    label: 'Analyze Graph Structure',
    name: 'analyze_graph_structure',
    description: `Analyze the structure of the knowledge graph to identify important patterns: hub nodes (highly connected), clusters (groups of related documents), isolated nodes (disconnected documents), and overall statistics. Useful for understanding the knowledge base structure and finding gaps.`,
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({
        description: 'ID of the project to analyze. If not provided, analyzes current project.'
      })),
      analysis_type: Type.Optional(Type.String({
        description: "Type of analysis: 'hubs', 'clusters', 'isolated', or 'all'. Default: 'all'"
      })),
      min_hub_degree: Type.Optional(Type.Number({
        description: 'Minimum number of connections to be considered a hub. Default: 5.',
        minimum: 2
      })),
    }),
    execute: async (_toolCallId, args) => {
      try {
        if (typeof window === 'undefined' || !window.electron) {
          return errorResult('Window or electron not available');
        }

        const analysisType = args.analysis_type || 'all';
        const minHubDegree = args.min_hub_degree || 5;

        // Generate graph for the project
        const graphState = await generateGraph({
          projectId: args.project_id,
          maxDepth: 2,
          strategies: ['mentions', 'links', 'tags'],
          maxNodes: 500,
        });

        // Calculate degree for each node
        const degree = new Map<string, number>();
        for (const node of graphState.nodes) {
          degree.set(node.id, 0);
        }
        for (const edge of graphState.edges) {
          degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
          degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
        }

        const result: any = {
          status: 'success',
          stats: {
            node_count: graphState.nodes.length,
            edge_count: graphState.edges.length,
            avg_degree: graphState.nodes.length > 0
              ? Array.from(degree.values()).reduce((a, b) => a + b, 0) / graphState.nodes.length
              : 0,
            density: graphState.nodes.length > 1
              ? (2 * graphState.edges.length) / (graphState.nodes.length * (graphState.nodes.length - 1))
              : 0,
          },
        };

        // Find hubs
        if (analysisType === 'hubs' || analysisType === 'all') {
          const hubs = graphState.nodes
            .filter(n => (degree.get(n.id) || 0) >= minHubDegree)
            .map(n => ({
              id: n.id,
              label: n.data.label,
              type: n.data.type,
              degree: degree.get(n.id) || 0,
            }))
            .sort((a, b) => b.degree - a.degree);

          result.hubs = hubs;
        }

        // Find isolated nodes
        if (analysisType === 'isolated' || analysisType === 'all') {
          const isolated = graphState.nodes
            .filter(n => (degree.get(n.id) || 0) === 0)
            .map(n => ({
              id: n.id,
              label: n.data.label,
              type: n.data.type,
            }));

          result.isolated = isolated;
        }

        // Find clusters (simplified: connected components)
        if (analysisType === 'clusters' || analysisType === 'all') {
          const visited = new Set<string>();
          const clusters: string[][] = [];

          for (const node of graphState.nodes) {
            if (visited.has(node.id)) continue;

            // BFS to find connected component
            const cluster: string[] = [];
            const queue = [node.id];

            while (queue.length > 0) {
              const current = queue.shift()!;
              if (visited.has(current)) continue;

              visited.add(current);
              cluster.push(current);

              // Find neighbors
              for (const edge of graphState.edges) {
                if (edge.source === current && !visited.has(edge.target)) {
                  queue.push(edge.target);
                }
                if (edge.target === current && !visited.has(edge.source)) {
                  queue.push(edge.source);
                }
              }
            }

            if (cluster.length > 1) {
              clusters.push(cluster);
            }
          }

          result.clusters = clusters.map((cluster, i) => ({
            id: i + 1,
            size: cluster.length,
            nodes: cluster.slice(0, 5), // Show first 5
            total_nodes: cluster.length,
          }));
        }

        return jsonResult(result);
      } catch (error) {
        return errorResult(`Failed to analyze graph structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}
