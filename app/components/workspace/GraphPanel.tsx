import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react';
import { X, Loader2, AlertCircle, RefreshCw, GitBranch, Link2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import GraphViewer from '@/components/graph/GraphViewer';
import GraphToolbar from '@/components/graph/GraphToolbar';
import { generateGraph } from '@/lib/graph';
import type { Resource, GraphViewState, GraphLayoutType, GraphFilterOptions } from '@/types';
import type { Node } from 'reactflow';

interface GraphPanelProps {
  resource: Resource;
}

interface SelectedNodeInfo {
  id: string;
  label: string;
  type: string;
  resourceType?: string;
  resourceId?: string;
  isFocus?: boolean;
}

export default function GraphPanel({ resource }: GraphPanelProps) {
  const { t } = useTranslation();
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
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [linkingStatus, setLinkingStatus] = useState<'idle' | 'linking' | 'done' | 'error'>('idle');

  const hasGeneratedRef = useRef(false);

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
      setSelectedNode(null);

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

  useEffect(() => {
    if (graphPanelOpen && !graphState && !isGenerating && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      generateKnowledgeGraph();
    }
    if (!graphPanelOpen) {
      hasGeneratedRef.current = false;
    }
  }, [graphPanelOpen, graphState, isGenerating, generateKnowledgeGraph]);

  useEffect(() => {
    if (graphState && graphPanelOpen) {
      generateKnowledgeGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  const filteredGraphState = useMemo(() => {
    if (!graphState) return null;

    let filteredNodes = graphState.nodes;
    let filteredEdges = graphState.edges;

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

    if (filters.nodeTypes && filters.nodeTypes.length > 0) {
      filteredNodes = filteredNodes.filter(n =>
        filters.nodeTypes!.includes(n.data.type)
      );
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = filteredEdges.filter(
        e => nodeIds.has(e.source) && nodeIds.has(e.target)
      );
    }

    if (filters.relationTypes && filters.relationTypes.length > 0) {
      filteredEdges = filteredEdges.filter(e =>
        filters.relationTypes!.includes(e.data?.relation || e.label || '')
      );
    }

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

  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const handleNodeClick = async (nodeId: string, node?: Node) => {
    const data = node?.data;

    // Show selected node info
    if (data) {
      const isFocus = data.metadata?.isFocus;
      setSelectedNode({
        id: nodeId,
        label: data.label ?? nodeId,
        type: data.type ?? 'resource',
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? nodeId,
        isFocus,
      });
    }

    // Studio output node
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

    // Resource node — open on double-click logic is handled by graph, single click shows info
  };

  const handleOpenSelectedResource = async () => {
    if (!selectedNode?.resourceId) return;
    const resourceType = (selectedNode as any)?.resourceType ?? 'document';
    try {
      await window.electron.workspace.open(selectedNode.resourceId, resourceType);
    } catch (err) {
      console.error('Failed to open resource:', err);
    }
  };

  const handleLinkSelectedToCurrentResource = async () => {
    if (!selectedNode?.resourceId || selectedNode.isFocus) return;
    setLinkingStatus('linking');
    try {
      const linkId = `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await window.electron.db.links.create({
        id: linkId,
        source_id: resource.id,
        target_id: selectedNode.resourceId,
        link_type: 'related',
        weight: 0.8,
        created_at: Date.now(),
      });
      setLinkingStatus('done');
      setTimeout(() => setLinkingStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to create link:', err);
      setLinkingStatus('error');
      setTimeout(() => setLinkingStatus('idle'), 2000);
    }
  };

  const handleNodeHover = (_nodeId: string | null) => {
    // Tooltip is handled inside GraphViewer
  };

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

  const handleExportPNG = () => {
    // Capture the react-flow SVG as a PNG using browser Canvas API
    const rfEl = document.querySelector('.react-flow__viewport') as SVGElement | null;
    if (!rfEl) { handleExportJSON(); return; }
    const svgData = new XMLSerializer().serializeToString(rfEl);
    const canvas = document.createElement('canvas');
    canvas.width = rfEl.clientWidth || 1200;
    canvas.height = rfEl.clientHeight || 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) { handleExportJSON(); return; }
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `knowledge-graph-${resource.id}.png`;
      a.click();
    };
    img.onerror = () => { URL.revokeObjectURL(url); handleExportJSON(); };
    img.src = url;
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
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GitBranch size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
            {t('workspace.graph')}
          </span>
          {graphState && (
            <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--tertiary-text)' }}>
              {graphState.nodes.length} nodes · {graphState.edges.length} edges
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={generateKnowledgeGraph}
            disabled={isGenerating}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ color: 'var(--secondary-text)' }}
            title={t('graph.regenerate_graph')}
          >
            <RefreshCw size={15} className={isGenerating ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleGraphPanel}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            aria-label={t('graph.close_graph_panel')}
          >
            <X size={16} />
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
              <AlertCircle size={40} style={{ color: 'var(--error)' }} />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
                  {error}
                </p>
                <button
                  onClick={generateKnowledgeGraph}
                  className="text-sm px-4 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {t('common.retry')}
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

            {/* Graph canvas */}
            <div className="flex-1 overflow-hidden">
              <GraphViewer
                graphState={filteredGraphState}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
              />
            </div>

            {/* Selected node info bar */}
            {selectedNode && !selectedNode.isFocus && (
              <div
                className="border-t px-4 py-3 flex items-center gap-3 shrink-0"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-secondary)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                    {selectedNode.label}
                  </p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
                    {selectedNode.resourceType ?? selectedNode.type}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleLinkSelectedToCurrentResource}
                    disabled={linkingStatus === 'linking'}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors font-medium focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                    style={{
                      background: linkingStatus === 'done'
                        ? 'var(--success, #10b981)'
                        : linkingStatus === 'error'
                        ? 'var(--error, #ef4444)'
                        : 'var(--accent)',
                      color: 'white',
                      opacity: linkingStatus === 'linking' ? 0.7 : 1,
                    }}
                    title={t('graph.link_resource')}
                  >
                    <Link2 size={12} />
                    {linkingStatus === 'done' ? t('common.done') : linkingStatus === 'error' ? t('common.error') : t('graph.link_resource')}
                  </button>
                  <button
                    onClick={handleOpenSelectedResource}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                    style={{ color: 'var(--secondary-text)' }}
                    title={t('graph.open_resource')}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--tertiary-text)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
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
                  style={{ background: 'var(--accent)', color: 'white' }}
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
