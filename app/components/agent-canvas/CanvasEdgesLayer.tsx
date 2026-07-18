'use client';

import { useMemo } from 'react';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { bezierPath, anchorForNode, type NodeMetrics } from './canvas-workspace-utils';

interface CanvasEdgesLayerProps {
  arrowMarkerId: string;
  canvasSize: { w: number; h: number };
  nodes: WorkflowNode<CanvasNodeData>[];
  edges: { id: string; source: string; target: string }[];
  nodeMetrics: NodeMetrics;
  connectDraft: { sourceId: string; x: number; y: number } | null;
}

export default function CanvasEdgesLayer({
  arrowMarkerId,
  canvasSize,
  nodes,
  edges,
  nodeMetrics,
  connectDraft,
}: CanvasEdgesLayerProps) {
  const edgePaths = useMemo(() => {
    return edges.map((edge) => {
      const sNode = nodes.find((n) => n.id === edge.source);
      const tNode = nodes.find((n) => n.id === edge.target);
      if (!sNode || !tNode) return null;
      const a = anchorForNode(sNode, nodeMetrics, 'out');
      const b = anchorForNode(tNode, nodeMetrics, 'in');
      return { id: edge.id, d: bezierPath(a.x, a.y, b.x, b.y) };
    });
  }, [edges, nodes, nodeMetrics]);

  let draftPath: string | null = null;
  if (connectDraft) {
    const sNode = nodes.find((n) => n.id === connectDraft.sourceId);
    if (sNode) {
      const a = anchorForNode(sNode, nodeMetrics, 'out');
      draftPath = bezierPath(a.x, a.y, connectDraft.x, connectDraft.y);
    }
  }

  return (
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
          <path d="M0,0 L0,6 L9,3 z" fill="var(--muted-foreground)" opacity="0.55" />
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
  );
}
