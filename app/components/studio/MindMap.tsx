
import { useState, useCallback, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import type { MindMapData } from '@/types';

interface MindMapProps {
  data: MindMapData;
  title?: string;
  onClose?: () => void;
  onExport?: () => void;
}

const MIN_NODE_WIDTH = 140;
const MIN_NODE_HEIGHT = 44;
const MAX_NODE_WIDTH = 240;
const PADDING_X = 12;
const PADDING_Y = 8;
const LINE_HEIGHT = 16;
const FONT_SIZE = 12;

/** Estimate node dimensions from label (rough: ~8px per char at 12px font) */
function estimateNodeSize(label: string): { w: number; h: number } {
  const charsPerLine = Math.floor((MAX_NODE_WIDTH - PADDING_X * 2) / 8);
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  const w = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, label.length * 6 + PADDING_X * 2));
  const h = Math.max(MIN_NODE_HEIGHT, lines * LINE_HEIGHT + PADDING_Y * 2);
  return { w, h };
}

// Layout algorithm: tree layout with variable node sizes
function layoutNodes(data: MindMapData) {
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of data.edges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    hasParent.add(edge.target);
  }

  const roots = data.nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0 && data.nodes.length > 0 && data.nodes[0]) {
    roots.push(data.nodes[0]);
  }

  const nodeSizes = new Map<string, { w: number; h: number }>();
  for (const node of data.nodes) {
    nodeSizes.set(node.id, estimateNodeSize(node.label));
  }

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const hGap = 50;
  const vGap = 20;

  let currentY = 0;

  function layoutSubtree(nodeId: string, depth: number): { w: number; h: number } {
    const kids = children.get(nodeId) || [];
    const size = nodeSizes.get(nodeId) || { w: MIN_NODE_WIDTH, h: MIN_NODE_HEIGHT };

    if (kids.length === 0) {
      positions.set(nodeId, { x: depth * (MAX_NODE_WIDTH + hGap), y: currentY, ...size });
      currentY += size.h + vGap;
      return size;
    }

    const startY = currentY;
    let maxChildW = 0;
    let totalChildH = 0;
    for (const kid of kids) {
      const childSize = layoutSubtree(kid, depth + 1);
      maxChildW = Math.max(maxChildW, childSize.w);
      totalChildH += childSize.h + vGap;
    }
    totalChildH -= vGap;

    const midY = startY + totalChildH / 2 - size.h / 2;
    positions.set(nodeId, {
      x: depth * (MAX_NODE_WIDTH + hGap),
      y: Math.max(startY, midY),
      ...size,
    });

    return { w: size.w, h: totalChildH };
  }

  for (const root of roots) {
    layoutSubtree(root.id, 0);
  }

  return positions;
}

export default function MindMap({ data, title, onClose, onExport }: MindMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const positions = layoutNodes(data);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach((pos) => {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.w);
    maxY = Math.max(maxY, pos.y + pos.h);
  });

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 300;
  }

  const padding = 40;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-mindmap-node]')) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId((id) => (id === nodeId ? null : nodeId));
  }, []);

  const depthColors = ['#596037', '#7B8A4A', '#9AA55E', '#B8BF78', '#D4D99A'];

  const selectedNode = selectedNodeId ? data.nodes.find((n) => n.id === selectedNodeId) : null;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          {title || 'Mind Map'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
            className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
            className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 50, y: 50 });
            }}
            className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Reset view"
            title="Reset view"
          >
            <Maximize2 size={16} />
          </button>
          {onExport && (
            <button
              onClick={onExport}
              className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              aria-label="Export"
              title="Export"
            >
              <Download size={16} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              aria-label="Close"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main area: canvas + detail panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* SVG Canvas */}
        <div
          className="flex-1 min-w-0 overflow-hidden"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg ref={svgRef} width="100%" height="100%" style={{ userSelect: 'none' }}>
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {data.edges.map((edge) => {
                const from = positions.get(edge.source);
                const to = positions.get(edge.target);
                if (!from || !to) return null;

                const x1 = from.x + from.w - minX + padding;
                const y1 = from.y + from.h / 2 - minY + padding;
                const x2 = to.x - minX + padding;
                const y2 = to.y + to.h / 2 - minY + padding;
                const cx = (x1 + x2) / 2;

                return (
                  <path
                    key={edge.id}
                    d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth={2}
                    opacity={0.6}
                  />
                );
              })}

              {/* Nodes */}
              {data.nodes.map((node, i) => {
                const pos = positions.get(node.id);
                if (!pos) return null;

                const x = pos.x - minX + padding;
                const y = pos.y - minY + padding;
                const color = depthColors[Math.min(i % depthColors.length, depthColors.length - 1)];
                const isSelected = selectedNodeId === node.id;

                return (
                  <g
                    key={node.id}
                    data-mindmap-node
                    onClick={(e) => handleNodeClick(e, node.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={pos.w}
                      height={pos.h}
                      rx={8}
                      fill="var(--bg-secondary)"
                      stroke={color}
                      strokeWidth={isSelected ? 3 : 2}
                      opacity={isSelected ? 1 : 1}
                    />
                    <foreignObject
                      x={x}
                      y={y}
                      width={pos.w}
                      height={pos.h}
                      style={{ overflow: 'hidden', pointerEvents: 'none' }}
                    >
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: `${PADDING_Y}px ${PADDING_X}px`,
                          fontSize: FONT_SIZE,
                          fontWeight: 500,
                          color: 'var(--primary-text)',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          textAlign: 'center',
                          lineHeight: 1.25,
                        }}
                      >
                        {node.label}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div
            className="w-72 shrink-0 flex flex-col border-l overflow-hidden"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-secondary)',
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--secondary-text)' }}
              >
                Detalle del nodo
              </span>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="btn btn-ghost p-1.5 rounded"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X size={14} style={{ color: 'var(--secondary-text)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <h4
                className="text-sm font-semibold mb-2"
                style={{ color: 'var(--primary-text)' }}
              >
                {selectedNode.label}
              </h4>
              {selectedNode.description ? (
                <p
                  className="text-xs leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--secondary-text)' }}
                >
                  {selectedNode.description}
                </p>
              ) : (
                <p
                  className="text-xs italic"
                  style={{ color: 'var(--tertiary-text)' }}
                >
                  Sin descripción adicional
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
