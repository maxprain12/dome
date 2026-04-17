import { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ConnectionMode,
} from 'reactflow';
import type { Node, Edge, NodeTypes } from 'reactflow';
import 'reactflow/dist/style.css';
import GraphNode from './GraphNode';
import { applyLayout } from '@/lib/graph';
import type { GraphViewState } from '@/types';

interface GraphViewerProps {
  graphState: GraphViewState;
  onNodeClick?: (nodeId: string, node?: Node) => void;
  onNodeHover?: (nodeId: string | null) => void;
}

// Color per relation type — subtle but distinct
const RELATION_COLORS: Record<string, string> = {
  mentions: '#7b76d0',
  references: '#3b82f6',
  similar: '#10b981',
  related: '#9ca3af',
  shared_tags: '#f59e0b',
  generated_from: '#059669',
  contradicts: '#ef4444',
  supports: '#22c55e',
  cites: '#6366f1',
  cited_by: '#6366f1',
  depends_on: '#f59e0b',
  expands: '#0ea5e9',
};

function getEdgeColor(relation?: string): string {
  if (!relation) return '#c4c4d0';
  return RELATION_COLORS[relation] ?? '#c4c4d0';
}

interface HoverTooltip {
  nodeId: string;
  label: string;
  type: string;
  resourceType?: string;
  x: number;
  y: number;
}

export default function GraphViewer({ graphState, onNodeClick, onNodeHover }: GraphViewerProps) {
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const layoutedNodes = useMemo(() => {
    if (!graphState.layout || graphState.layout === 'force') {
      return graphState.nodes;
    }
    return applyLayout(
      graphState.nodes,
      graphState.edges,
      graphState.layout,
      graphState.focusNodeId
    ) as unknown as Node[];
  }, [graphState.nodes, graphState.edges, graphState.layout, graphState.focusNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(graphState.edges);

  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  const nodeTypes: NodeTypes = useMemo(() => ({ custom: GraphNode }), []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) onNodeClick(node.id, node);
    },
    [onNodeClick]
  );

  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (onNodeHover) onNodeHover(node.id);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltip({
        nodeId: node.id,
        label: node.data?.label ?? node.id,
        type: node.data?.type ?? 'resource',
        resourceType: node.data?.resourceType,
        x: rect.left,
        y: rect.top,
      });
    },
    [onNodeHover]
  );

  const handleNodeMouseLeave = useCallback(() => {
    if (onNodeHover) onNodeHover(null);
    setTooltip(null);
  }, [onNodeHover]);

  // Styled edges — colored by relation type, more visible
  const styledEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const relation = edge.data?.relation ?? edge.label;
        const color = getEdgeColor(typeof relation === 'string' ? relation : undefined);
        const isHovered = hoveredEdgeId === edge.id;
        return {
          ...edge,
          type: 'straight',
          animated: false,
          style: {
            stroke: color,
            strokeWidth: isHovered ? 2.5 : 1.5,
            opacity: isHovered ? 1 : 0.55,
            transition: 'opacity 0.15s ease, stroke-width 0.15s ease',
          },
          markerEnd: undefined,
          markerStart: undefined,
          // Show relation label as small text on the edge
          label: typeof relation === 'string' ? relation : undefined,
          labelStyle: {
            fontSize: '9px',
            fill: color,
            fontWeight: 500,
            opacity: 0.8,
          },
          labelBgStyle: {
            fill: 'var(--bg, #fff)',
            fillOpacity: 0.85,
          },
          labelBgPadding: [3, 4] as [number, number],
          labelBgBorderRadius: 3,
        };
      }),
    [edges, hoveredEdgeId]
  );

  const styledNodes: Node[] = useMemo(
    () => nodes.map((node) => ({ ...node, type: 'custom' })),
    [nodes]
  );

  return (
    <div className="w-full h-full relative" style={{ background: 'var(--bg, #fafafa)' }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onEdgeMouseEnter={(_e, edge) => setHoveredEdgeId(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdgeId(null)}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.4, includeHiddenNodes: false }}
        minZoom={0.1}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.5}
          color="var(--border, #e5e5e5)"
        />
        <Controls
          showInteractive={false}
          showFitView={true}
          style={{
            background: 'var(--bg, #fff)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '8px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        />

        {/* Edge legend — bottom right */}
        <EdgeLegend />
      </ReactFlow>

      {/* Hover tooltip */}
      {tooltip && (
        <NodeTooltip tooltip={tooltip} />
      )}
    </div>
  );
}

function NodeTooltip({ tooltip }: { tooltip: HoverTooltip }) {
  const typeLabel = tooltip.resourceType
    ? `${tooltip.type} · ${tooltip.resourceType}`
    : tooltip.type;

  return (
    <div
      className="pointer-events-none absolute z-50 px-3 py-2 rounded-lg shadow-lg text-xs"
      style={{
        top: 8,
        left: 8,
        background: 'var(--bg-secondary, #f5f5f5)',
        border: '1px solid var(--border, #e5e5e5)',
        color: 'var(--primary-text, #333)',
        maxWidth: 200,
      }}
    >
      <div className="font-semibold truncate" style={{ maxWidth: 180 }}>{tooltip.label}</div>
      <div className="mt-0.5 capitalize" style={{ color: 'var(--tertiary-text, #999)' }}>{typeLabel}</div>
    </div>
  );
}

function EdgeLegend() {
  const entries = [
    { label: 'Mentions', color: '#7b76d0' },
    { label: 'References', color: '#3b82f6' },
    { label: 'Similar', color: '#10b981' },
    { label: 'Shared Tags', color: '#f59e0b' },
    { label: 'Related', color: '#9ca3af' },
  ];

  return (
    <div
      className="absolute bottom-2 left-2 flex flex-col gap-1 px-2.5 py-2 rounded-lg z-10"
      style={{
        background: 'var(--bg, #fff)',
        border: '1px solid var(--border, #e5e5e5)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-1.5">
          <div
            style={{
              width: 16,
              height: 2,
              background: e.color,
              borderRadius: 1,
              opacity: 0.8,
            }}
          />
          <span style={{ fontSize: '9px', color: 'var(--secondary-text, #888)' }}>
            {e.label}
          </span>
        </div>
      ))}
    </div>
  );
}
