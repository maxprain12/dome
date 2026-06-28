'use client';

import { useTranslation } from 'react-i18next';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import TextInputNode from './nodes/TextInputNode';
import DocumentNode from './nodes/DocumentNode';
import ImageNode from './nodes/ImageNode';
import AgentNode from './nodes/AgentNode';
import OutputNode from './nodes/OutputNode';

interface CanvasNodesLayerProps {
  nodes: WorkflowNode<CanvasNodeData>[];
  canvasSize: { w: number; h: number };
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  updateMetricsForNode: (id: string, el: HTMLDivElement | null) => void;
  onNodePointerDown: (e: React.PointerEvent, node: WorkflowNode<CanvasNodeData>) => void;
  onNodePointerMove: (e: React.PointerEvent, nodeId: string) => void;
  onNodePointerUp: (e: React.PointerEvent, nodeId: string) => void;
  onHandleOutPointerDown: (e: React.PointerEvent, sourceId: string) => void;
}

function CanvasNodeItem({
  node,
  selected,
  t,
  updateMetricsForNode,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onHandleOutPointerDown,
}: {
  node: WorkflowNode<CanvasNodeData>;
  selected: boolean;
  t: (key: string, opts?: Record<string, string>) => string;
  updateMetricsForNode: (id: string, el: HTMLDivElement | null) => void;
  onNodePointerDown: (e: React.PointerEvent, node: WorkflowNode<CanvasNodeData>) => void;
  onNodePointerMove: (e: React.PointerEvent, nodeId: string) => void;
  onNodePointerUp: (e: React.PointerEvent, nodeId: string) => void;
  onHandleOutPointerDown: (e: React.PointerEvent, sourceId: string) => void;
}) {
  const showIn = node.data.type === 'agent' || node.data.type === 'output';
  const showOut =
    node.data.type === 'text-input' ||
    node.data.type === 'document' ||
    node.data.type === 'image' ||
    node.data.type === 'agent';

  const accent =
    node.data.type === 'document'
      ? 'var(--success)'
      : node.data.type === 'image'
        ? 'var(--warning)'
        : 'var(--dome-accent)';

  return (
    <div
      className="wf-node-wrapper wf-no-zoom-pan absolute left-0 top-0"
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
      }}
      ref={(el) => updateMetricsForNode(node.id, el)}
      onPointerDown={(e) => onNodePointerDown(e, node)}
      onPointerMove={(e) => onNodePointerMove(e, node.id)}
      onPointerUp={(e) => onNodePointerUp(e, node.id)}
      onPointerCancel={(e) => onNodePointerUp(e, node.id)}
      data-node-id={node.id}
    >
      {showIn ? (
        <div
          className="wf-handle wf-handle-in wf-no-zoom-pan"
          data-wf-handle="in"
          data-wf-node-id={node.id}
          title={t('canvas.connect_input')}
        />
      ) : null}
      <div className="wf-node-card-inner">
        {node.type === 'textInput' && (
          <TextInputNode id={node.id} data={node.data as never} selected={selected} />
        )}
        {node.type === 'document' && (
          <DocumentNode id={node.id} data={node.data as never} selected={selected} />
        )}
        {node.type === 'image' && (
          <ImageNode id={node.id} data={node.data as never} selected={selected} />
        )}
        {node.type === 'agent' && (
          <AgentNode id={node.id} data={node.data as never} selected={selected} />
        )}
        {node.type === 'output' && (
          <OutputNode id={node.id} data={node.data as never} selected={selected} />
        )}
      </div>
      {showOut ? (
        <button
          type="button"
          aria-label={t('canvas.connect_from_node', { defaultValue: 'Conectar desde este nodo' })}
          className="wf-handle wf-handle-out wf-no-zoom-pan"
          data-wf-handle="out"
          data-wf-node-id={node.id}
          title={t('canvas.connect_output')}
          onPointerDown={(e) => onHandleOutPointerDown(e, node.id)}
          style={{ ['--wf-handle-color' as string]: accent }}
        />
      ) : null}
    </div>
  );
}

export default function CanvasNodesLayer({
  nodes,
  canvasSize,
  selectedNodeId,
  onNodeSelect,
  updateMetricsForNode,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onHandleOutPointerDown,
}: CanvasNodesLayerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="wf-nodes-layer relative"
      style={{ width: canvasSize.w, height: canvasSize.h }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onNodeSelect(null);
        }
      }}
    >
      {nodes.map((node) => (
        <CanvasNodeItem
          key={node.id}
          node={node}
          selected={node.id === selectedNodeId}
          t={t}
          updateMetricsForNode={updateMetricsForNode}
          onNodePointerDown={onNodePointerDown}
          onNodePointerMove={onNodePointerMove}
          onNodePointerUp={onNodePointerUp}
          onHandleOutPointerDown={onHandleOutPointerDown}
        />
      ))}
    </div>
  );
}
