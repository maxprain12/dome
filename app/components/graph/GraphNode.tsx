import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { GraphNodeData } from '@/types';

interface GraphNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

// Get color based on node type
function getNodeColor(nodeType: GraphNodeData['type']): string {
  switch (nodeType) {
    case 'resource':
      return 'var(--accent, #7c6fc4)';
    case 'concept':
    case 'topic':
      return '#10b981';
    case 'person':
      return '#f59e0b';
    case 'location':
      return '#3b82f6';
    case 'event':
      return '#a855f7';
    default:
      return '#888888';
  }
}

function GraphNode({ data, selected }: GraphNodeProps) {
  const { label, type } = data;
  const color = getNodeColor(type);
  const isFocus = data.metadata?.isFocus;

  // Truncate label
  const displayLabel = label.length > 25 ? `${label.slice(0, 25)}…` : label;

  // Dot size based on importance
  const dotSize = isFocus ? 14 : selected ? 11 : 8;

  return (
    <div
      className="graph-node-obsidian"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
      }}
    >
      {/* Invisible target handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: 'transparent',
          border: 'none',
          width: dotSize,
          height: 1,
          opacity: 0,
          top: 0,
        }}
      />

      {/* Dot */}
      <div
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: color,
          transition: 'all 0.2s ease',
          boxShadow: selected || isFocus
            ? `0 0 0 3px ${color}30, 0 0 8px ${color}40`
            : 'none',
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <div
        style={{
          fontSize: '10px',
          fontWeight: selected || isFocus ? 500 : 400,
          color: selected || isFocus
            ? 'var(--primary-text, #333)'
            : 'var(--secondary-text, #888)',
          textAlign: 'center',
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '1.3',
          opacity: selected || isFocus ? 1 : 0.8,
          transition: 'all 0.2s ease',
        }}
        title={label}
      >
        {displayLabel}
      </div>

      {/* Invisible source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'transparent',
          border: 'none',
          width: dotSize,
          height: 1,
          opacity: 0,
          bottom: 0,
        }}
      />
    </div>
  );
}

export default memo(GraphNode);
