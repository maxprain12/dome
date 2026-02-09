import { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
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
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
}

export default function GraphViewer({ graphState, onNodeClick, onNodeHover }: GraphViewerProps) {
  // Apply layout when layout type changes
  const layoutedNodes = useMemo(() => {
    if (!graphState.layout || graphState.layout === 'force') {
      return graphState.nodes;
    }

    return applyLayout(
      graphState.nodes,
      graphState.edges,
      graphState.layout,
      graphState.focusNodeId
    );
  }, [graphState.nodes, graphState.edges, graphState.layout, graphState.focusNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphState.edges);

  // Update nodes when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  // Define custom node types
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      custom: GraphNode,
    }),
    []
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick && node.data.resourceId) {
        onNodeClick(node.data.resourceId);
      }
    },
    [onNodeClick]
  );

  // Handle node mouse enter
  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeHover) {
        onNodeHover(node.id);
      }
    },
    [onNodeHover]
  );

  // Handle node mouse leave
  const handleNodeMouseLeave = useCallback(() => {
    if (onNodeHover) {
      onNodeHover(null);
    }
  }, [onNodeHover]);

  // Transform edges to include styling
  const styledEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'var(--border)',
          strokeWidth: Math.max(1, (edge.data?.weight || 0.5) * 3),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: 'var(--border)',
        },
        label: edge.label || edge.data?.relation || '',
        labelStyle: {
          fontSize: 10,
          fill: 'var(--tertiary-text)',
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: 'var(--bg)',
          fillOpacity: 0.9,
        },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      })),
    [edges]
  );

  // Transform nodes to use custom type
  const styledNodes: Node[] = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        type: 'custom',
      })),
    [nodes]
  );

  return (
    <div className="w-full h-full" style={{ background: 'var(--bg-secondary)' }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
        }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        attributionPosition="bottom-right"
      >
        {/* Background grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="var(--border)"
        />

        {/* Zoom/pan controls */}
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        />

        {/* Minimap */}
        <MiniMap
          nodeColor={(node) => {
            const type = node.data?.type;
            switch (type) {
              case 'resource':
                return 'var(--accent)';
              case 'concept':
              case 'topic':
                return '#10b981';
              case 'person':
                return '#f59e0b';
              case 'location':
                return '#3b82f6';
              case 'event':
                return '#a855f7';
              default:
                return 'var(--secondary-text)';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}
