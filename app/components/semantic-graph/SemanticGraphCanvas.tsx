import { useEffect, useRef } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
} from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';

export interface GraphNodeDatum {
  id: string;
  label: string;
  resourceType: string;
  connectionCount: number;
  isCurrentNote: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

export interface GraphEdgeDatum {
  id: string;
  source: string;
  target: string;
  similarity: number;
  relation_type: string;
  label?: string | null;
  sourceName?: string;
  targetName?: string;
}

type SimEdge = GraphEdgeDatum & SimulationLinkDatum<GraphNodeDatum>;

/** Fill by resource type (CSS variables from `globals.css` — avoid hardcoded hex). */
export const SEMANTIC_RESOURCE_TYPE_FILL: Record<string, string> = {
  note: 'var(--dome-accent)',
  pdf: 'var(--error)',
  url: 'var(--info)',
  document: 'var(--dome-text-secondary)',
  notebook: 'var(--warning)',
  ppt: 'var(--success)',
  excel: 'color-mix(in srgb, var(--info) 65%, var(--dome-accent))',
};

function linkEndCoord(end: GraphNodeDatum | string | number, axis: 'x' | 'y'): number {
  if (typeof end === 'object' && end !== null) {
    const v = end[axis];
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}

function curvedEdgePath(d: SimEdge): string {
  const x1 = linkEndCoord(d.source, 'x');
  const y1 = linkEndCoord(d.source, 'y');
  const x2 = linkEndCoord(d.target, 'x');
  const y2 = linkEndCoord(d.target, 'y');
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const curve = Math.min(36, dist * 0.22);
  const nx = (-dy / dist) * curve;
  const ny = (dx / dist) * curve;
  const c = 0.38;
  const cx1 = x1 + dx * c + nx;
  const cy1 = y1 + dy * c + ny;
  const cx2 = x2 - dx * c + nx;
  const cy2 = y2 - dy * c + ny;
  return `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;
}

interface SemanticGraphCanvasProps {
  nodes: GraphNodeDatum[];
  edges: GraphEdgeDatum[];
  onEdgeClick?: (edge: GraphEdgeDatum, clientX: number, clientY: number) => void;
  onNodeDoubleClick?: (node: GraphNodeDatum) => void;
}

export default function SemanticGraphCanvas({
  nodes,
  edges,
  onEdgeClick,
  onNodeDoubleClick,
}: SemanticGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onEdgeClickRef = useRef(onEdgeClick);
  const onNodeDblRef = useRef(onNodeDoubleClick);
  onEdgeClickRef.current = onEdgeClick;
  onNodeDblRef.current = onNodeDoubleClick;

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || nodes.length === 0) return undefined;

    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 600;

    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const root = svg.append('g');

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        root.attr('transform', event.transform.toString());
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svg as any).call(zoomBehavior).call(zoomBehavior.transform as any, zoomIdentity);

    const simNodes: GraphNodeDatum[] = nodes.map((n) => ({ ...n }));
    const simLinks: SimEdge[] = edges.map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    const linkForce = forceLink<GraphNodeDatum, SimEdge>(simLinks)
      .id((d) => d.id)
      .distance((d) => 180 - (d.similarity ?? 0.5) * 100)
      .strength((d) => (d.similarity ?? 0.5) * 0.5);

    const simulation = forceSimulation(simNodes)
      .force('link', linkForce)
      .force('charge', forceManyBody<GraphNodeDatum>().strength(-320))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'collide',
        forceCollide<GraphNodeDatum>().radius(
          (d) => 14 + Math.min(10, (d.connectionCount ?? 0) * 0.9),
        ),
      );

    const link = root
      .append('g')
      .attr('stroke-linecap', 'round')
      .selectAll('path')
      .data(simLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        d.relation_type === 'auto' ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
      )
      .attr('stroke-opacity', (d) => 0.2 + (d.similarity ?? 0) * 0.65)
      .attr('stroke-width', (d) => Math.max(0.9, (d.similarity ?? 0.3) * 3))
      .attr('stroke-dasharray', (d) => (d.relation_type === 'manual' ? '6,4' : ''))
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        onEdgeClickRef.current?.(d, event.clientX, event.clientY);
      })
      .on('mouseenter', function mouseEnter(_event, d) {
        const base = Math.max(0.9, (d.similarity ?? 0.3) * 3);
        select(this)
          .attr('stroke-width', base + 1.1)
          .attr('stroke-opacity', Math.min(1, 0.35 + (d.similarity ?? 0) * 0.75));
      })
      .on('mouseleave', function mouseLeave(_event, d) {
        const base = Math.max(0.9, (d.similarity ?? 0.3) * 3);
        select(this)
          .attr('stroke-width', base)
          .attr('stroke-opacity', 0.2 + (d.similarity ?? 0) * 0.65);
      });

    link.append('title').text((d) => `${(d.similarity * 100).toFixed(0)}%`);

    const node = root
      .append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'grab')
      .call(
        (
          d3Drag<SVGGElement, GraphNodeDatum>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.35).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      )
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        onNodeDblRef.current?.(d);
      });

    node
      .append('circle')
      .attr('class', 'semantic-graph-halo')
      .attr('r', (d) => {
        const r = 8 + Math.min(8, d.connectionCount ?? 0);
        return d.isCurrentNote ? r + 7 : 0;
      })
      .attr('fill', 'color-mix(in srgb, var(--dome-accent) 16%, transparent)')
      .attr('stroke', 'none')
      .attr('opacity', (d) => (d.isCurrentNote ? 1 : 0))
      .style('pointer-events', 'none');

    node
      .append('circle')
      .attr('r', (d) => 8 + Math.min(8, d.connectionCount ?? 0))
      .attr('fill', (d) => {
        if (d.isCurrentNote) return 'var(--dome-accent)';
        const rt = d.resourceType || 'note';
        return SEMANTIC_RESOURCE_TYPE_FILL[rt] ?? 'var(--dome-bg-hover)';
      })
      .attr('stroke', (d) => (d.isCurrentNote ? 'var(--dome-accent)' : 'var(--dome-border)'))
      .attr('stroke-width', (d) => (d.isCurrentNote ? 2 : 1.2));

    node
      .append('text')
      .text((d) => (d.label.length > 22 ? `${d.label.slice(0, 20)}…` : d.label))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => 20 + Math.min(8, d.connectionCount ?? 0))
      .attr('font-size', 11)
      .attr('font-weight', '500')
      .attr('fill', 'var(--dome-text-secondary)')
      .attr('paint-order', 'stroke fill')
      .attr('stroke', 'var(--dome-surface)')
      .attr('stroke-width', 5)
      .attr('stroke-linejoin', 'round');

    simulation.on('tick', () => {
      link.attr('d', (d) => curvedEdgePath(d));
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full min-h-[420px] touch-none select-none semantic-graph-svg"
      role="img"
      aria-label="Semantic graph"
    />
  );
}
