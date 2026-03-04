import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { ImageIcon, Upload } from 'lucide-react';
import type { ImageInputData } from '@/lib/canvas/types';

function ImageInputNode({ data, id }: NodeProps<ImageInputData>) {
  const handleSelectResource = useCallback(() => {
    const event = new CustomEvent('canvas:select-resource', {
      detail: { nodeId: id, type: 'image' },
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className="canvas-node canvas-node--input">
      <div className="canvas-node__header canvas-node__header--image">
        <ImageIcon size={14} />
        <span>{data.label || 'Image Input'}</span>
      </div>
      <div className="canvas-node__body">
        {data.imageUrl ? (
          <div className="canvas-node__preview">
            <img src={data.imageUrl} alt={data.fileName || 'Preview'} className="canvas-node__image" />
            <span className="canvas-node__filename">{data.fileName}</span>
          </div>
        ) : (
          <button
            type="button"
            className="canvas-node__upload-btn"
            onClick={handleSelectResource}
          >
            <Upload size={16} />
            <span>Seleccionar imagen</span>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="canvas-handle canvas-handle--source" />
    </div>
  );
}

export default memo(ImageInputNode);
