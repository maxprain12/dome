import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Type } from 'lucide-react';
import type { TextInputData } from '@/lib/canvas/types';

function TextInputNode({ data, id }: NodeProps<TextInputData>) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const event = new CustomEvent('canvas:node-data-change', {
      detail: { nodeId: id, field: 'text', value: e.target.value },
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className="canvas-node canvas-node--input">
      <div className="canvas-node__header canvas-node__header--text">
        <Type size={14} />
        <span>{data.label || 'Text Input'}</span>
      </div>
      <div className="canvas-node__body">
        <textarea
          className="canvas-node__textarea"
          value={data.text}
          onChange={handleChange}
          placeholder="Escribe tu texto aquí..."
          rows={3}
        />
      </div>
      <Handle type="source" position={Position.Right} className="canvas-handle canvas-handle--source" />
    </div>
  );
}

export default memo(TextInputNode);
