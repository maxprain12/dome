
import { useState, useCallback, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import type { MindMapData } from '@/types';

interface MindMapProps {
  data: MindMapData;
  title?: string;
  onClose?: () => void;
  onExport?: () => void;
}

// Layout algorithm: simple tree layout
function layoutNodes(data: MindMapData) {
  // Build adjacency from edges
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of data.edges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    hasParent.add(edge.target);
  }

  // Find root nodes (no incoming edges)
  const roots = data.nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0 && data.nodes.length > 0 && data.nodes[0]) {
    roots.push(data.nodes[0]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const nodeWidth = 160;
  const nodeHeight = 50;
  const hGap = 60;
  const vGap = 30;

  let currentY = 0;

  function layoutSubtree(nodeId: string, depth: number): number {
    const kids = children.get(nodeId) || [];

    if (kids.length === 0) {
      positions.set(nodeId, { x: depth * (nodeWidth + hGap), y: currentY });
      const height = nodeHeight;
      currentY += nodeHeight + vGap;
      return height;
    }

    const startY = currentY;
    let totalHeight = 0;
    for (const kid of kids) {
      totalHeight += layoutSubtree(kid, depth + 1);
    }

    // Center parent vertically among children
    const midY = startY + (currentY - startY - vGap) / 2 - nodeHeight / 2;
    positions.set(nodeId, { x: depth * (nodeWidth + hGap), y: Math.max(startY, midY) });

    return totalHeight;
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
  const svgRef = useRef<SVGSVGElement>(null);

  const positions = layoutNodes(data);
  const nodeWidth = 160;
  const nodeHeight = 50;

  // Calculate SVG viewBox bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  });

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300; }

  const padding = 40;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Node colors by depth
  const depthColors = ['#596037', '#7B8A4A', '#9AA55E', '#B8BF78', '#D4D99A'];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          {title || 'Mind Map'}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="btn btn-ghost p-1.5" title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="btn btn-ghost p-1.5" title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 50, y: 50 }); }} className="btn btn-ghost p-1.5" title="Reset view">
            <Maximize2 size={16} />
          </button>
          {onExport && (
            <button onClick={onExport} className="btn btn-ghost p-1.5" title="Export">
              <Download size={16} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-ghost p-1.5" title="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="flex-1 overflow-hidden"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ userSelect: 'none' }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {data.edges.map(edge => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) return null;

              const x1 = from.x + nodeWidth - minX + padding;
              const y1 = from.y + nodeHeight / 2 - minY + padding;
              const x2 = to.x - minX + padding;
              const y2 = to.y + nodeHeight / 2 - minY + padding;
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

              return (
                <g key={node.id}>
                  <rect
                    x={x}
                    y={y}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={8}
                    fill="var(--bg-secondary)"
                    stroke={color}
                    strokeWidth={2}
                  />
                  <text
                    x={x + nodeWidth / 2}
                    y={y + nodeHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={500}
                    fill="var(--primary-text)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
