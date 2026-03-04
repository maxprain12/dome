import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { FileText, Search } from 'lucide-react';
import type { DocumentInputData } from '@/lib/canvas/types';

const TYPE_ICONS: Record<string, string> = {
  note: '📝',
  pdf: '📄',
  url: '🔗',
  video: '🎬',
  audio: '🎵',
  image: '🖼️',
  ppt: '📊',
  notebook: '📓',
};

function DocumentInputNode({ data, id }: NodeProps<DocumentInputData>) {
  const handleSelectResource = useCallback(() => {
    const event = new CustomEvent('canvas:select-resource', {
      detail: { nodeId: id, type: 'document' },
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className="canvas-node canvas-node--input">
      <div className="canvas-node__header canvas-node__header--document">
        <FileText size={14} />
        <span>{data.label || 'Document'}</span>
      </div>
      <div className="canvas-node__body">
        {data.resourceId ? (
          <button
            type="button"
            className="canvas-node__resource-badge"
            onClick={handleSelectResource}
          >
            <span className="text-base">{TYPE_ICONS[data.resourceType || ''] || '📄'}</span>
            <span className="canvas-node__resource-title">{data.resourceTitle}</span>
          </button>
        ) : (
          <button
            type="button"
            className="canvas-node__upload-btn"
            onClick={handleSelectResource}
          >
            <Search size={16} />
            <span>Seleccionar recurso</span>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="canvas-handle canvas-handle--source" />
    </div>
  );
}

export default memo(DocumentInputNode);
