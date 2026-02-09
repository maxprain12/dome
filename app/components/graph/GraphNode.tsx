import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { FileText, Video, Music, Image, File, Folder, Link as LinkIcon, User, MapPin, Calendar, Lightbulb } from 'lucide-react';
import type { GraphNodeData } from '@/types';

interface GraphNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

// Get icon based on node type and resource type
function getNodeIcon(nodeType: GraphNodeData['type'], resourceType?: GraphNodeData['resourceType']) {
  // For resource nodes, use resource type icon
  if (nodeType === 'resource' && resourceType) {
    switch (resourceType) {
      case 'note':
        return <FileText size={16} />;
      case 'pdf':
      case 'document':
        return <File size={16} />;
      case 'video':
        return <Video size={16} />;
      case 'audio':
        return <Music size={16} />;
      case 'image':
        return <Image size={16} />;
      case 'url':
        return <LinkIcon size={16} />;
      case 'folder':
        return <Folder size={16} />;
      default:
        return <File size={16} />;
    }
  }

  // For entity nodes, use entity type icon
  switch (nodeType) {
    case 'person':
      return <User size={16} />;
    case 'location':
      return <MapPin size={16} />;
    case 'event':
      return <Calendar size={16} />;
    case 'concept':
    case 'topic':
      return <Lightbulb size={16} />;
    default:
      return <File size={16} />;
  }
}

// Get color based on node type
function getNodeColor(nodeType: GraphNodeData['type']): string {
  switch (nodeType) {
    case 'resource':
      return 'var(--accent)';
    case 'concept':
    case 'topic':
      return '#10b981'; // emerald
    case 'person':
      return '#f59e0b'; // amber
    case 'location':
      return '#3b82f6'; // blue
    case 'event':
      return '#a855f7'; // purple
    default:
      return 'var(--secondary-text)';
  }
}

function GraphNode({ data, selected }: GraphNodeProps) {
  const { label, type, resourceType } = data;
  const color = getNodeColor(type);

  // Truncate label if too long
  const displayLabel = label.length > 30 ? `${label.slice(0, 30)}...` : label;

  return (
    <div
      className="px-4 py-2.5 rounded-lg border-2 transition-all duration-200 cursor-pointer"
      style={{
        background: 'var(--bg)',
        borderColor: selected ? color : 'var(--border)',
        boxShadow: selected
          ? `0 0 0 2px ${color}20, 0 4px 12px rgba(0, 0, 0, 0.15)`
          : '0 2px 8px rgba(0, 0, 0, 0.08)',
        minWidth: '140px',
        maxWidth: '200px',
      }}
    >
      {/* Top handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: color,
          width: 8,
          height: 8,
          border: '2px solid var(--bg)',
        }}
      />

      {/* Node content */}
      <div className="flex items-center gap-2">
        <div style={{ color, display: 'flex', alignItems: 'center' }}>
          {getNodeIcon(type, resourceType)}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-medium truncate"
            style={{ color: 'var(--primary-text)' }}
            title={label}
          >
            {displayLabel}
          </div>
          <div
            className="text-[10px] capitalize"
            style={{ color: 'var(--tertiary-text)' }}
          >
            {type}
          </div>
        </div>
      </div>

      {/* Bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: color,
          width: 8,
          height: 8,
          border: '2px solid var(--bg)',
        }}
      />
    </div>
  );
}

export default memo(GraphNode);
