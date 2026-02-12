import { useCallback, useMemo, useEffect } from 'react';
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
    ) as unknown as Node[];
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
      if (onNodeClick) {
        onNodeClick(node.id, node);
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

  // Clean, minimal edge styling — thin lines, no arrows
  const styledEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'straight',
        animated: false,
        style: {
          stroke: 'var(--border, #e0e0e0)',
          strokeWidth: 1,
          opacity: 0.4,
        },
        // No arrow markers
        markerEnd: undefined,
        markerStart: undefined,
        // No labels by default (clean look)
        label: undefined,
        labelStyle: undefined,
        labelBgStyle: undefined,
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
    <div className="w-full h-full" style={{ background: 'var(--bg, #fafafa)' }}>
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
          padding: 0.4,
          includeHiddenNodes: false,
        }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        {/* Subtle dot grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.5}
          color="var(--border, #e5e5e5)"
        />

        {/* Minimal zoom controls */}
        <Controls
          showInteractive={false}
          showFitView={true}
          style={{
            background: 'var(--bg, #fff)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '8px',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
          }}
        />

        {/* No MiniMap — clean Obsidian style */}
      </ReactFlow>
    </div>
  );
}
