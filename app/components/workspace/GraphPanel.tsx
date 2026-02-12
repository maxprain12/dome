import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react';
import { X, Loader2, AlertCircle, RefreshCw, GitBranch } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import GraphViewer from '@/components/graph/GraphViewer';
import GraphToolbar from '@/components/graph/GraphToolbar';
import { generateGraph } from '@/lib/graph';
import type { Resource, GraphViewState, GraphLayoutType, GraphFilterOptions } from '@/types';

interface GraphPanelProps {
  resource: Resource;
}

export default function GraphPanel({ resource }: GraphPanelProps) {
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const toggleGraphPanel = useAppStore((s) => s.toggleGraphPanel);
  const currentProject = useAppStore((s) => s.currentProject);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<GraphViewState | null>(null);
  const [, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [layout, setLayout] = useState<GraphLayoutType>('force');
  const [filters, setFilters] = useState<GraphFilterOptions>({});
  const [depth, setDepth] = useState(3);

  // Track whether we've generated for the current panel open session
  const hasGeneratedRef = useRef(false);

  // Generate graph function
  const generateKnowledgeGraph = useCallback(async () => {
    const projectId = currentProject?.id || resource?.project_id;
    if (!projectId || !resource?.id) {
      setError('No project associated with this resource. Please open the resource from within a project.');
      return;
    }

    try {
      setIsGenerating(true);
      setLoading(true);
      setError(null);

      console.log('Generating graph for resource:', resource.id);

      const graphData = await generateGraph({
        projectId,
        focusResourceId: resource.id,
        maxDepth: depth,
        strategies: ['mentions', 'links', 'semantic', 'tags'],
        maxNodes: 500,
        minWeight: filters.minWeight || 0.3,
      });

      startTransition(() => {
        setGraphState(graphData);
      });
    } catch (err) {
      console.error('Error generating graph:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate knowledge graph');
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [currentProject?.id, resource?.id, resource?.project_id, depth, filters.minWeight]);

  // Demo graph for fallback
  const createDemoGraph = (): GraphViewState => ({
    nodes: [
      {
        id: resource.id,
        data: {
          id: resource.id,
          label: resource.title,
          type: 'resource',
          resourceId: resource.id,
          resourceType: resource.type,
        },
        position: { x: 0, y: 0 },
        type: 'custom',
      },
      {
        id: 'concept-1',
        data: {
          id: 'concept-1',
          label: 'Machine Learning',
          type: 'concept',
        },
        position: { x: 200, y: -100 },
        type: 'custom',
      },
      {
        id: 'concept-2',
        data: {
          id: 'concept-2',
          label: 'Neural Networks',
          type: 'concept',
        },
        position: { x: 200, y: 100 },
        type: 'custom',
      },
      {
        id: 'person-1',
        data: {
          id: 'person-1',
          label: 'Alan Turing',
          type: 'person',
        },
        position: { x: -200, y: -100 },
        type: 'custom',
      },
      {
        id: 'location-1',
        data: {
          id: 'location-1',
          label: 'Stanford University',
          type: 'location',
        },
        position: { x: -200, y: 100 },
        type: 'custom',
      },
    ],
    edges: [
      {
        id: 'e1',
        source: resource.id,
        target: 'concept-1',
        label: 'mentions',
        data: {
          id: 'e1',
          source: resource.id,
          target: 'concept-1',
          label: 'mentions',
          relation: 'mentions',
          weight: 0.8,
        },
      },
      {
        id: 'e2',
        source: resource.id,
        target: 'concept-2',
        label: 'discusses',
        data: {
          id: 'e2',
          source: resource.id,
          target: 'concept-2',
          label: 'discusses',
          relation: 'discusses',
          weight: 0.6,
        },
      },
      {
        id: 'e3',
        source: resource.id,
        target: 'person-1',
        label: 'references',
        data: {
          id: 'e3',
          source: resource.id,
          target: 'person-1',
          label: 'references',
          relation: 'references',
          weight: 0.9,
        },
      },
      {
        id: 'e4',
        source: resource.id,
        target: 'location-1',
        label: 'mentions',
        data: {
          id: 'e4',
          source: resource.id,
          target: 'location-1',
          label: 'mentions',
          relation: 'mentions',
          weight: 0.5,
        },
      },
      {
        id: 'e5',
        source: 'concept-1',
        target: 'concept-2',
        label: 'related',
        data: {
          id: 'e5',
          source: 'concept-1',
          target: 'concept-2',
          label: 'related',
          relation: 'related',
          weight: 0.7,
        },
      },
    ],
    focusNodeId: resource.id,
    depth: 3,
    strategies: ['demo'],
    layout: 'force',
    filters: {},
  });

  // Auto-generate graph when panel opens
  useEffect(() => {
    if (graphPanelOpen && !graphState && !isGenerating && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      generateKnowledgeGraph();
    }
    if (!graphPanelOpen) {
      hasGeneratedRef.current = false;
    }
  }, [graphPanelOpen, graphState, isGenerating, generateKnowledgeGraph]);

  // Regenerate when depth changes
  useEffect(() => {
    if (graphState && graphPanelOpen) {
      generateKnowledgeGraph();
    }
    // Only trigger on depth changes, not on graphState/graphPanelOpen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  // Filter graph state based on filters
  const filteredGraphState = useMemo(() => {
    if (!graphState) return null;

    let filteredNodes = graphState.nodes;
    let filteredEdges = graphState.edges;

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchingNodeIds = new Set(
        filteredNodes
          .filter(n => n.data.label.toLowerCase().includes(query))
          .map(n => n.id)
      );
      filteredNodes = filteredNodes.filter(n => matchingNodeIds.has(n.id));
      filteredEdges = filteredEdges.filter(
        e => matchingNodeIds.has(e.source) && matchingNodeIds.has(e.target)
      );
    }

    // Filter by node types
    if (filters.nodeTypes && filters.nodeTypes.length > 0) {
      filteredNodes = filteredNodes.filter(n =>
        filters.nodeTypes!.includes(n.data.type)
      );
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = filteredEdges.filter(
        e => nodeIds.has(e.source) && nodeIds.has(e.target)
      );
    }

    // Filter by relation types
    if (filters.relationTypes && filters.relationTypes.length > 0) {
      filteredEdges = filteredEdges.filter(e =>
        filters.relationTypes!.includes(e.data?.relation || e.label || '')
      );
    }

    // Filter by minimum weight
    if (filters.minWeight !== undefined && filters.minWeight > 0) {
      filteredEdges = filteredEdges.filter(
        e => (e.data?.weight || 0.5) >= filters.minWeight!
      );
    }

    return {
      ...graphState,
      nodes: filteredNodes,
      edges: filteredEdges,
      layout,
      filters,
    };
  }, [graphState, filters, layout]);

  // Handle node click
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const handleNodeClick = async (nodeId: string, node?: { data?: { resourceId?: string; metadata?: { isStudioOutput?: boolean } } }) => {
    const data = node?.data;

    // Studio output node (study material) - nodeId is "studio-{outputId}"
    if (data?.metadata?.isStudioOutput) {
      const outputId = nodeId.startsWith('studio-') ? nodeId.slice(7) : (data.resourceId ?? nodeId);
      try {
        const result = await window.electron.db.studio.getById(outputId);
        if (result.success && result.data) {
          setActiveStudioOutput(result.data as Parameters<typeof setActiveStudioOutput>[0]);
          useAppStore.getState().toggleStudioPanel();
        }
      } catch (err) {
        console.error('Failed to open studio output:', err);
      }
      return;
    }

    // Resource node
    const resourceId = data?.resourceId ?? nodeId;
    const resourceType = (data as any)?.resourceType ?? 'note';
    if (typeof window !== 'undefined' && window.electron?.workspace) {
      try {
        await window.electron.workspace.open(resourceId, resourceType);
      } catch (err) {
        console.error('Failed to open resource:', err);
      }
    }
  };

  // Handle node hover
  const handleNodeHover = (nodeId: string | null) => {
    // TODO: Show tooltip with resource preview
    if (nodeId) {
      console.log('Hovering node:', nodeId);
    }
  };

  // Handle export PNG
  const handleExportPNG = () => {
    console.log('Export PNG - TODO: Implement with React Flow getViewport');
    // TODO: Use React Flow's getViewport and toBlob
  };

  // Handle export JSON
  const handleExportJSON = () => {
    if (!graphState) return;
    const data = JSON.stringify(graphState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${resource.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!graphPanelOpen) return null;

  return (
    <div
      className="flex flex-col h-full border-l shrink-0 transition-all duration-300 ease-out"
      style={{
        width: 'min(50vw, 600px)',
        minWidth: '360px',
        background: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-2.5 flex-1">
          <GitBranch size={18} style={{ color: 'var(--secondary-text)' }} />
          <div>
            <h2 className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
              Graph
              <span className="text-xs font-normal ml-2" style={{ color: 'var(--tertiary-text)' }}>
                {graphState?.nodes.length || 0} · {graphState?.edges.length || 0}
              </span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateKnowledgeGraph}
            disabled={isGenerating}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ color: 'var(--secondary-text)' }}
            title="Regenerate graph"
          >
            <RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleGraphPanel}
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 flex items-center justify-center"
            style={{ color: 'var(--secondary-text)' }}
            title="Close graph panel"
            aria-label="Close graph panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                Generating knowledge graph...
              </p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
              <AlertCircle size={48} style={{ color: 'var(--error)' }} />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
                  {error}
                </p>
                <button
                  onClick={generateKnowledgeGraph}
                  className="text-sm px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && graphState && filteredGraphState && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <GraphToolbar
              layout={layout}
              onLayoutChange={setLayout}
              filters={filters}
              onFiltersChange={setFilters}
              depth={depth}
              onDepthChange={setDepth}
              nodeCount={filteredGraphState.nodes.length}
              edgeCount={filteredGraphState.edges.length}
              onExportPNG={handleExportPNG}
              onExportJSON={handleExportJSON}
            />
            <div className="flex-1 overflow-hidden">
              <GraphViewer
                graphState={filteredGraphState}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
              />
            </div>
          </div>
        )}

        {!loading && !error && !graphState && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
              <GitBranch size={40} style={{ color: 'var(--secondary-text)', opacity: 0.3 }} />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
                  No Graph Data
                </p>
                <p className="text-xs mb-4" style={{ color: 'var(--secondary-text)' }}>
                  Generate a knowledge graph to see connections between documents.
                </p>
                <button
                  onClick={generateKnowledgeGraph}
                  className="text-sm px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                  }}
                >
                  Generate Graph
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
