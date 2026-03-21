import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { FileText, FileImage, Video, Music, Globe, Folder, BookOpen, Tag, Zap, User, MapPin, Calendar } from 'lucide-react';
import type { GraphNodeData } from '@/types';

interface GraphNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

interface NodeStyle {
  color: string;
  bg: string;
}

function getNodeStyle(nodeType: GraphNodeData['type'], resourceType?: string): NodeStyle {
  if (nodeType === 'resource' || nodeType === 'study_material') {
    switch (resourceType) {
      case 'pdf':
        return { color: '#e85d4a', bg: '#fff1f0' };
      case 'video':
        return { color: '#f59e0b', bg: '#fffbeb' };
      case 'audio':
        return { color: '#10b981', bg: '#f0fdf4' };
      case 'image':
        return { color: '#3b82f6', bg: '#eff6ff' };
      case 'url':
        return { color: '#6366f1', bg: '#eef2ff' };
      case 'folder':
        return { color: '#f59e0b', bg: '#fffbeb' };
      default:
        if (nodeType === 'study_material') return { color: '#059669', bg: '#f0fdf4' };
        return { color: '#7b76d0', bg: '#f5f3ff' };
    }
  }
  switch (nodeType) {
    case 'concept':
    case 'topic':
      return { color: '#10b981', bg: '#f0fdf4' };
    case 'person':
      return { color: '#f59e0b', bg: '#fffbeb' };
    case 'location':
      return { color: '#3b82f6', bg: '#eff6ff' };
    case 'event':
      return { color: '#a855f7', bg: '#faf5ff' };
    default:
      return { color: '#6b7280', bg: '#f9fafb' };
  }
}

function getNodeIcon(nodeType: GraphNodeData['type'], resourceType?: string) {
  const size = 11;
  if (nodeType === 'resource') {
    switch (resourceType) {
      case 'pdf':
        return <FileText size={size} />;
      case 'video':
        return <Video size={size} />;
      case 'audio':
        return <Music size={size} />;
      case 'image':
        return <FileImage size={size} />;
      case 'url':
        return <Globe size={size} />;
      case 'folder':
        return <Folder size={size} />;
      default:
        return <FileText size={size} />;
    }
  }
  switch (nodeType) {
    case 'study_material':
      return <BookOpen size={size} />;
    case 'concept':
    case 'topic':
      return <Tag size={size} />;
    case 'person':
      return <User size={size} />;
    case 'location':
      return <MapPin size={size} />;
    case 'event':
      return <Calendar size={size} />;
    default:
      return <Zap size={size} />;
  }
}

function GraphNode({ data, selected }: GraphNodeProps) {
  const { label, type } = data;
  const isFocus = data.metadata?.isFocus;
  const style = getNodeStyle(type, data.resourceType);

  const displayLabel = label.length > 22 ? `${label.slice(0, 22)}…` : label;
  const nodeSize = isFocus ? 38 : selected ? 32 : 27;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '5px',
        cursor: 'pointer',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: 'transparent',
          border: 'none',
          width: nodeSize,
          height: 1,
          opacity: 0,
          top: 0,
        }}
      />

      {/* Node circle with icon */}
      <div
        style={{
          width: nodeSize,
          height: nodeSize,
          borderRadius: '50%',
          background: isFocus ? style.color : style.bg,
          border: `${isFocus ? 2.5 : 1.5}px solid ${style.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          boxShadow: isFocus
            ? `0 0 0 4px ${style.color}22, 0 2px 10px ${style.color}40`
            : selected
            ? `0 0 0 3px ${style.color}30, 0 1px 6px ${style.color}25`
            : '0 1px 3px rgba(0,0,0,0.08)',
          color: isFocus ? 'white' : style.color,
          flexShrink: 0,
        }}
      >
        {getNodeIcon(type, data.resourceType)}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: isFocus ? '11px' : '10px',
          fontWeight: selected || isFocus ? 600 : 400,
          color: selected || isFocus
            ? 'var(--primary-text, #333)'
            : 'var(--secondary-text, #888)',
          textAlign: 'center',
          maxWidth: '110px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
          opacity: selected || isFocus ? 1 : 0.85,
          transition: 'all 0.15s ease',
        }}
        title={label}
      >
        {displayLabel}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'transparent',
          border: 'none',
          width: nodeSize,
          height: 1,
          opacity: 0,
          bottom: 0,
        }}
      />
    </div>
  );
}

export default memo(GraphNode);
