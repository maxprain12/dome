import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import {
  workflowNodeEstimatedHeight,
  workflowNodeWidthForType,
} from '@/lib/agent-canvas/canvas-layout';

export type NodeMetrics = Record<string, { w: number; h: number }>;

export function getNodeTypeKey(type: string): string {
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

export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.max(40, Math.abs(y2 - y1) * 0.5);
  return `M ${x1},${y1} C ${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}

export function installWorkflowCanvasZoom(
  container: HTMLDivElement,
  viewport: HTMLDivElement,
  transformRef: { current: { x: number; y: number; k: number } },
): () => void {
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

  return function cleanupWorkflowCanvasZoom() {
    zoomBehavior.on('zoom', null);
    sel.on('.zoom', null);
  };
}

export function anchorForNode(
  node: WorkflowNode<CanvasNodeData>,
  nodeMetrics: NodeMetrics,
  end: 'in' | 'out',
) {
  const m = nodeMetrics[node.id] ?? {
    w: workflowNodeWidthForType(node.type ?? ''),
    h: workflowNodeEstimatedHeight(node.type ?? ''),
  };
  const { x, y } = node.position;
  if (end === 'in') {
    return { x: x + m.w / 2, y };
  }
  return { x: x + m.w / 2, y: y + m.h };
}

export function computeCanvasSize(nodes: WorkflowNode<CanvasNodeData>[], nodeMetrics: NodeMetrics) {
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
}
