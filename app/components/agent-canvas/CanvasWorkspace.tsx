'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './workflow-canvas.css';
import type { CanvasNodeData, TextInputNodeData, DocumentNodeData, ImageNodeData, AgentNodeData, OutputNodeData, SystemAgentRole } from '@/types/canvas';
import { canvasSystemAgentNameKey } from '@/lib/agent-canvas/canvas-layout';
import { generateId } from '@/lib/utils';
import type { ManyAgent } from '@/types';
import TextInputNode from './nodes/TextInputNode';
import DocumentNode from './nodes/DocumentNode';
import ImageNode from './nodes/ImageNode';
import AgentNode from './nodes/AgentNode';
import OutputNode from './nodes/OutputNode';

const NODE_TYPES: NodeTypes = {
  textInput: TextInputNode,
  document: DocumentNode,
  image: ImageNode,
  agent: AgentNode,
  output: OutputNode,
};

interface CanvasWorkspaceProps {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection | Edge) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onNodesUpdate: (nodes: Node<CanvasNodeData>[]) => void;
  onEdgesUpdate: (edges: Edge[]) => void;
}

function getNodeTypeKey(type: string): string {
  switch (type) {
    case 'text-input': return 'textInput';
    case 'document': return 'document';
    case 'image': return 'image';
    case 'agent': return 'agent';
    case 'output': return 'output';
    default: return 'textInput';
  }
}

export default function CanvasWorkspace({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onNodesUpdate,
  onEdgesUpdate,
}: CanvasWorkspaceProps) {
  const { t } = useTranslation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/x-canvas-node-type');
      if (!nodeType) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = {
        x: e.clientX - reactFlowBounds.left - 130,
        y: e.clientY - reactFlowBounds.top - 40,
      };

      const id = generateId();
      let data: CanvasNodeData;

      if (nodeType === 'text-input') {
        data = { type: 'text-input', label: t('canvas.default_text_input_label'), value: '' } as TextInputNodeData;
      } else if (nodeType === 'document') {
        data = {
          type: 'document',
          label: t('canvas.default_document_label'),
          resourceId: null,
          resourceTitle: null,
          resourceContent: null,
        } as DocumentNodeData;
      } else if (nodeType === 'image') {
        data = {
          type: 'image',
          label: t('canvas.default_image_label'),
          resourceId: null,
          resourceTitle: null,
          resourceUrl: null,
        } as ImageNodeData;
      } else if (nodeType === 'agent') {
        const agentRaw = e.dataTransfer.getData('application/x-canvas-agent');
        const agent = agentRaw ? (JSON.parse(agentRaw) as ManyAgent) : null;
        const fallback = t('canvas.default_agent_fallback');
        data = {
          type: 'agent',
          label: agent?.name ?? fallback,
          agentId: agent?.id ?? null,
          agentName: agent?.name ?? null,
          agentIconIndex: agent?.iconIndex ?? 0,
          status: 'idle',
          outputText: null,
          errorMessage: null,
        } as AgentNodeData;
      } else if (nodeType === 'system-agent') {
        const systemRole = e.dataTransfer.getData('application/x-canvas-system-role') as SystemAgentRole;
        const sysName = t(canvasSystemAgentNameKey(systemRole));
        data = {
          type: 'agent',
          label: sysName,
          agentId: null,
          systemAgentRole: systemRole,
          agentName: sysName,
          agentIconIndex: 0,
          status: 'idle',
          outputText: null,
          errorMessage: null,
        } as AgentNodeData;
      } else {
        data = {
          type: 'output',
          label: t('canvas.default_output_label'),
          content: null,
          status: 'idle',
        } as OutputNodeData;
      }

      const resolvedNodeTypeKey = nodeType === 'system-agent' ? 'agent' : getNodeTypeKey(nodeType);
      const newNode: Node<CanvasNodeData> = {
        id,
        type: resolvedNodeTypeKey,
        position,
        data,
      };

      onNodesUpdate([...nodes, newNode]);
    },
    [nodes, onNodesUpdate, t]
  );

  /* Bezier edges — smoother than smoothstep “stairs”; muted stroke reads lighter on the grid */
  const edgeStyle = useMemo(
    () => ({
      stroke: 'var(--dome-text-muted)',
      strokeWidth: 1.35,
      opacity: 0.55,
    }),
    []
  );

  const styledEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'default',
        animated: false,
        style: edgeStyle,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--dome-text-muted)',
          width: 12,
          height: 12,
        },
      })),
    [edges, edgeStyle]
  );

  const connectionLineStyle = useMemo(
    () => ({
      stroke: 'var(--dome-text-muted)',
      strokeWidth: 1.35,
      opacity: 0.55,
    }),
    []
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="workflow-canvas flex-1 h-full min-h-0"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        connectionMode={ConnectionMode.Loose}
        nodeDragThreshold={0}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        style={{ background: 'transparent' }}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={connectionLineStyle}
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={32}
          size={1}
          color="var(--dome-border)"
          style={{ opacity: 0.35 }}
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        />
      </ReactFlow>
    </div>
  );
}
