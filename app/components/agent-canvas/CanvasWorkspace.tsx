'use client';

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pointer } from 'd3-selection';
import './workflow-canvas.css';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { canvasSystemAgentNameKey } from '@/lib/agent-canvas/canvas-layout';
import { generateId } from '@/lib/utils';
import { lazyRef } from '@/lib/utils/lazyRef';
import type { ManyAgent } from '@/types';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import type { SystemAgentRole } from '@/types/canvas';
import {
  computeCanvasSize,
  getNodeTypeKey,
  installWorkflowCanvasZoom,
  type NodeMetrics,
} from './canvas-workspace-utils';
import CanvasEdgesLayer from './CanvasEdgesLayer';
import CanvasNodesLayer from './CanvasNodesLayer';

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
  const nodeElementsRef = useRef<Map<string, HTMLDivElement> | null>(null);
  const nodeElements = lazyRef(nodeElementsRef, () => new Map());
  const dragRef = useRef<DragState | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetrics>({});
  const [connectDraft, setConnectDraft] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);

  const updateMetricsForNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) {
      nodeElements.delete(id);
      return;
    }
    nodeElements.set(id, el);
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
    for (const id of nodeElements.keys()) {
      const el = nodeElements.get(id);
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

  const canvasSize = useMemo(
    () => computeCanvasSize(nodes, nodeMetrics),
    [nodes, nodeMetrics],
  );

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return undefined;
    return installWorkflowCanvasZoom(container, viewport, transformRef);
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
    },
    [addEdge],
  );

  return (
    <div
      ref={containerRef}
      className="workflow-canvas wf-canvas flex-1 h-full min-h-0 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={viewportRef} className="wf-viewport absolute left-0 top-0 z-[1] origin-top-left will-change-transform">
        <CanvasEdgesLayer
          arrowMarkerId={arrowMarkerId}
          canvasSize={canvasSize}
          nodes={nodes}
          edges={edges}
          nodeMetrics={nodeMetrics}
          connectDraft={connectDraft}
        />
        <CanvasNodesLayer
          nodes={nodes}
          canvasSize={canvasSize}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
          updateMetricsForNode={updateMetricsForNode}
          onNodePointerDown={onNodePointerDown}
          onNodePointerMove={onNodePointerMove}
          onNodePointerUp={onNodePointerUp}
          onHandleOutPointerDown={onHandleOutPointerDown}
        />
      </div>
    </div>
  );
}
