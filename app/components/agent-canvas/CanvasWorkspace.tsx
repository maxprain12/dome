'use client';

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pointer, select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import './workflow-canvas.css';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { canvasSystemAgentNameKey } from '@/lib/agent-canvas/canvas-layout';
import {
  workflowNodeEstimatedHeight,
  workflowNodeWidthForType,
} from '@/lib/agent-canvas/canvas-layout';
import { generateId } from '@/lib/utils';
import type { ManyAgent } from '@/types';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import TextInputNode from './nodes/TextInputNode';
import DocumentNode from './nodes/DocumentNode';
import ImageNode from './nodes/ImageNode';
import AgentNode from './nodes/AgentNode';
import OutputNode from './nodes/OutputNode';
import type { SystemAgentRole } from '@/types/canvas';

type NodeMetrics = Record<string, { w: number; h: number }>;

function getNodeTypeKey(type: string): string {
  switch (type) {
    case 'text-input':
      return 'textInput';
    case 'document':
      return 'document';
    case 'image':
      return 'image';
    case 'agent':
      return 'agent';
    case 'output':
      return 'output';
    default:
      return 'textInput';
  }
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.max(40, Math.abs(y2 - y1) * 0.5);
  return `M ${x1},${y1} C ${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}

interface CanvasWorkspaceProps {
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

type DragState = {
  id: string;
  startX: number;
  startY: number;
  cx: number;
  cy: number;
};

export default function CanvasWorkspace({ selectedNodeId, onNodeSelect }: CanvasWorkspaceProps) {
  const { t } = useTranslation();
  const markerSuffix = useId().replace(/:/g, '');
  const arrowMarkerId = `wf-arrow-${markerSuffix}`;

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const addEdge = useCanvasStore((s) => s.addEdge);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetrics>({});
  const [connectDraft, setConnectDraft] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);

  const updateMetricsForNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) {
      nodeElementsRef.current.delete(id);
      return;
    }
    nodeElementsRef.current.set(id, el);
    const { width, height } = el.getBoundingClientRect();
    setNodeMetrics((prev) => {
      const cur = prev[id];
      if (cur && Math.abs(cur.w - width) < 0.5 && Math.abs(cur.h - height) < 0.5) return prev;
      return { ...prev, [id]: { w: width, h: height } };
    });
  }, []);

  const nodeIdsKey = useMemo(() => nodes.map((n) => n.id).join(','), [nodes]);
  const nodePositionsKey = useMemo(
    () => nodes.map((n) => `${n.position.x},${n.position.y}`).join('|'),
    [nodes],
  );

  useLayoutEffect(() => {
    const observers: ResizeObserver[] = [];
    for (const id of nodeElementsRef.current.keys()) {
      const el = nodeElementsRef.current.get(id);
      if (!el) continue;
      const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        setNodeMetrics((prev) => ({ ...prev, [id]: { w: r.width, h: r.height } }));
      });
      ro.observe(el);
      observers.push(ro);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [nodeIdsKey, nodePositionsKey]);

  const canvasSize = useMemo(() => {
    let maxX = 880;
    let maxY = 640;
    for (const n of nodes) {
      const m = nodeMetrics[n.id] ?? {
        w: workflowNodeWidthForType(n.type ?? ''),
        h: workflowNodeEstimatedHeight(n.type ?? ''),
      };
      maxX = Math.max(maxX, n.position.x + m.w + 80);
      maxY = Math.max(maxY, n.position.y + m.h + 80);
    }
    return { w: maxX, h: maxY };
  }, [nodes, nodeMetrics]);

  const anchorForNode = useCallback(
    (node: WorkflowNode<CanvasNodeData>, end: 'in' | 'out') => {
      const m = nodeMetrics[node.id] ?? {
        w: workflowNodeWidthForType(node.type ?? ''),
        h: workflowNodeEstimatedHeight(node.type ?? ''),
      };
      const { x, y } = node.position;
      if (end === 'in') {
        return { x: x + m.w / 2, y };
      }
      return { x: x + m.w / 2, y: y + m.h };
    },
    [nodeMetrics],
  );

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return undefined;

    const zoomed = (event: { transform: { x: number; y: number; k: number } }) => {
      const tr = event.transform;
      transformRef.current = { x: tr.x, y: tr.y, k: tr.k };
      viewport.style.transform = `translate(${tr.x}px,${tr.y}px) scale(${tr.k})`;
    };

    const zoomBehavior = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.2, 2])
      .filter((event) => {
        const el = event.target as HTMLElement;
        if (el.closest('.wf-no-zoom-pan')) return false;
        if (el.closest('.nodrag') || el.closest('textarea') || el.closest('input')) {
          return event.type === 'wheel';
        }
        if (event.type === 'wheel' && el.closest('.nowheel')) return false;
        if (event.type === 'mousedown' && (event as MouseEvent).button !== 0) return false;
        return true;
      })
      .on('zoom', zoomed);

    const sel = select(container);
    sel.call(zoomBehavior as never);
    sel.call(zoomBehavior.transform as never, zoomIdentity);

    return () => {
      sel.on('.zoom', null);
    };
  }, []);

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: WorkflowNode<CanvasNodeData>) => {
      const target = e.target as HTMLElement;
      if (target.closest('.nodrag') || target.closest('.wf-handle')) return;
      e.stopPropagation();
      onNodeSelect(node.id);
      dragRef.current = {
        id: node.id,
        startX: node.position.x,
        startY: node.position.y,
        cx: e.clientX,
        cy: e.clientY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onNodeSelect],
  );

  const onNodePointerMove = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      const d = dragRef.current;
      if (!d || d.id !== nodeId) return;
      const k = transformRef.current.k;
      const dx = (e.clientX - d.cx) / k;
      const dy = (e.clientY - d.cy) / k;
      moveNode(nodeId, { x: d.startX + dx, y: d.startY + dy });
    },
    [moveNode],
  );

  const onNodePointerUp = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (dragRef.current?.id === nodeId) {
      dragRef.current = null;
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/x-canvas-node-type');
      if (!nodeType) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const tr = transformRef.current;
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const x = (clientX - tr.x) / tr.k - 110;
      const y = (clientY - tr.y) / tr.k - 40;

      const id = generateId();
      let data: CanvasNodeData;

      if (nodeType === 'text-input') {
        data = {
          type: 'text-input',
          label: t('canvas.default_text_input_label'),
          value: '',
        };
      } else if (nodeType === 'document') {
        data = {
          type: 'document',
          label: t('canvas.default_document_label'),
          resourceId: null,
          resourceTitle: null,
          resourceContent: null,
        };
      } else if (nodeType === 'image') {
        data = {
          type: 'image',
          label: t('canvas.default_image_label'),
          resourceId: null,
          resourceTitle: null,
          resourceUrl: null,
        };
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
        };
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
        };
      } else {
        data = {
          type: 'output',
          label: t('canvas.default_output_label'),
          content: null,
          status: 'idle',
        };
      }

      const resolvedNodeTypeKey = nodeType === 'system-agent' ? 'agent' : getNodeTypeKey(nodeType);
      const newNode: WorkflowNode<CanvasNodeData> = {
        id,
        type: resolvedNodeTypeKey,
        position: { x, y },
        data,
      };

      setNodes([...useCanvasStore.getState().nodes, newNode]);
    },
    [setNodes, t],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onHandleOutPointerDown = useCallback(
    (e: React.PointerEvent, sourceId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const v = viewportRef.current;
      if (!v) return;
      const pt = pointer(e.nativeEvent, v);
      setConnectDraft({ sourceId, x: pt[0], y: pt[1] });

      const onMove = (ev: PointerEvent) => {
        const p = pointer(ev, v);
        setConnectDraft((d) => (d ? { ...d, x: p[0], y: p[1] } : null));
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const inHandle = target?.closest?.('[data-wf-handle="in"]') as HTMLElement | null;
        const targetId = inHandle?.dataset.wfNodeId;
        setConnectDraft(null);
        if (!targetId || targetId === sourceId) return;
        addEdge({
          id: generateId(),
          source: sourceId,
          target: targetId,
          sourceHandle: 'out',
          targetHandle: 'in',
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    },
    [addEdge],
  );

  const renderNode = (node: WorkflowNode<CanvasNodeData>) => {
    const selected = node.id === selectedNodeId;
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
        key={node.id}
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
  };

  const edgePaths = useMemo(() => {
    return edges.map((edge) => {
      const sNode = nodes.find((n) => n.id === edge.source);
      const tNode = nodes.find((n) => n.id === edge.target);
      if (!sNode || !tNode) return null;
      const a = anchorForNode(sNode, 'out');
      const b = anchorForNode(tNode, 'in');
      return { id: edge.id, d: bezierPath(a.x, a.y, b.x, b.y) };
    });
  }, [edges, nodes, anchorForNode]);

  let draftPath: string | null = null;
  if (connectDraft) {
    const sNode = nodes.find((n) => n.id === connectDraft.sourceId);
    if (sNode) {
      const a = anchorForNode(sNode, 'out');
      draftPath = bezierPath(a.x, a.y, connectDraft.x, connectDraft.y);
    }
  }

  return (
    <div
      ref={containerRef}
      className="workflow-canvas wf-canvas flex-1 h-full min-h-0 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={viewportRef} className="wf-viewport absolute left-0 top-0 z-[1] origin-top-left will-change-transform">
        <svg
          className="wf-edges-svg block"
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker
              id={arrowMarkerId}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="var(--dome-text-muted)" opacity="0.55" />
            </marker>
          </defs>
          <g className="wf-edges-group">
            {edgePaths.map(
              (item) =>
                item && (
                  <path
                    key={item.id}
                    d={item.d}
                    className="wf-edge-path"
                    fill="none"
                    markerEnd={`url(#${arrowMarkerId})`}
                  />
                ),
            )}
            {draftPath ? (
              <path
                d={draftPath}
                className="wf-edge-path wf-edge-draft"
                fill="none"
                markerEnd={`url(#${arrowMarkerId})`}
              />
            ) : null}
          </g>
        </svg>
        <div
          className="wf-nodes-layer relative"
          style={{ width: canvasSize.w, height: canvasSize.h }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              onNodeSelect(null);
            }
          }}
        >
          {nodes.map(renderNode)}
        </div>
      </div>
    </div>
  );
}
