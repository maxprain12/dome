import { useMemo } from 'react';
import type { DiagramArtifactV } from '@/lib/chat/artifactSchemas';

const LANE_GAP = 160;
const NODE_H = 36;
const PAD = 24;

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default function DiagramArtifact({ artifact }: { artifact: DiagramArtifactV }) {
  const layout = artifact.layout ?? 'horizontal';
  const title = artifact.title ?? 'Diagram';
  const description = `${artifact.nodes.length} node${artifact.nodes.length === 1 ? '' : 's'}, ${artifact.edges.length} edge${artifact.edges.length === 1 ? '' : 's'}.`;

  const { positions, width, height } = useMemo(() => {
    const nodes = artifact.nodes;
    const lanes = new Map<string, number>();
    let laneIdx = 0;
    for (const n of nodes) {
      const lane = n.lane ?? 'default';
      if (!lanes.has(lane)) {
        lanes.set(lane, laneIdx++);
      }
    }
    const pos = new Map<string, { x: number; y: number }>();

    if (layout === 'free') {
      let maxX = 0;
      let maxY = 0;
      for (const n of nodes) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        pos.set(n.id, { x: x + PAD, y: y + PAD });
        maxX = Math.max(maxX, x + 200);
        maxY = Math.max(maxY, y + NODE_H);
      }
      return { positions: pos, width: maxX + PAD * 2, height: maxY + PAD * 2 };
    }

    if (layout === 'vertical') {
      nodes.forEach((n, i) => {
        const lx = lanes.get(n.lane ?? 'default') ?? 0;
        pos.set(n.id, { x: PAD + lx * LANE_GAP, y: PAD + i * (NODE_H + 16) });
      });
      const h = PAD * 2 + nodes.length * (NODE_H + 16);
      const w = PAD * 2 + laneIdx * LANE_GAP;
      return { positions: pos, width: w, height: h };
    }

    // horizontal
    nodes.forEach((n, i) => {
      const ly = lanes.get(n.lane ?? 'default') ?? 0;
      pos.set(n.id, { x: PAD + i * (LANE_GAP + 40), y: PAD + ly * (NODE_H + 24) });
    });
    const w = PAD * 2 + Math.max(nodes.length, 1) * (LANE_GAP + 40);
    const h = PAD * 2 + laneIdx * (NODE_H + 24);
    return { positions: pos, width: w, height: h };
  }, [artifact.nodes, artifact.edges, layout]);

  const nodeLabelById = new Map(artifact.nodes.map((n) => [n.id, n.label] as const));

  return (
    <div style={{ padding: 12, overflow: 'auto', position: 'relative' }}>
      <svg
        width={width}
        height={height}
        style={{ minWidth: '100%' }}
        role="img"
        aria-labelledby="dome-diagram-title dome-diagram-desc"
      >
        <title id="dome-diagram-title">{title}</title>
        <desc id="dome-diagram-desc">{description}</desc>
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="var(--secondary-text)" opacity={0.6} />
          </marker>
        </defs>
        {artifact.edges.map((e, idx) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + 70;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          return (
            <g key={`${e.from}-${e.to}-${idx}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--border)"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
              {e.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--tertiary-text)"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {artifact.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <rect
                width={140}
                height={NODE_H}
                rx={8}
                fill="var(--bg-tertiary)"
                stroke="var(--accent)"
                strokeWidth={1}
              />
              <text x={10} y={22} fontSize={12} fill="var(--primary-text)">
                {n.label}
              </text>
              {n.lane && (
                <text x={10} y={-6} fontSize={9} fill="var(--tertiary-text)">
                  {n.lane}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul aria-label={`${title} — nodes and edges`} style={SR_ONLY}>
        {artifact.nodes.map((n) => (
          <li key={`node-${n.id}`}>
            Node: {n.label}
            {n.lane ? ` (lane: ${n.lane})` : ''}
          </li>
        ))}
        {artifact.edges.map((e, idx) => {
          const fromLabel = nodeLabelById.get(e.from) ?? e.from;
          const toLabel = nodeLabelById.get(e.to) ?? e.to;
          return (
            <li key={`edge-${idx}`}>
              Edge: {fromLabel} → {toLabel}
              {e.label ? ` (${e.label})` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
