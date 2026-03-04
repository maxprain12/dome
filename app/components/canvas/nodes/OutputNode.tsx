import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { SquareTerminal, Loader2, CheckCircle2, Copy } from 'lucide-react';
import type { OutputNodeData } from '@/lib/canvas/types';

function OutputNode({ data }: NodeProps<OutputNodeData>) {
  const handleCopy = () => {
    if (data.content) {
      navigator.clipboard.writeText(data.content).catch(() => {});
    }
  };

  return (
    <div className={`canvas-node canvas-node--output ${data.status === 'done' ? 'canvas-node--done' : ''}`}>
      <Handle type="target" position={Position.Left} className="canvas-handle canvas-handle--target" />

      <div className="canvas-node__header canvas-node__header--output">
        <SquareTerminal size={14} />
        <span className="flex-1">{data.label || 'Output'}</span>
        {data.status === 'waiting' && <Loader2 size={14} className="animate-spin text-blue-500" />}
        {data.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
        {data.content && (
          <button
            type="button"
            onClick={handleCopy}
            className="canvas-node__copy-btn"
            title="Copiar"
          >
            <Copy size={12} />
          </button>
        )}
      </div>

      <div className="canvas-node__body canvas-node__body--output">
        {!data.content && data.status !== 'waiting' && (
          <p className="canvas-node__placeholder">El resultado aparecerá aquí</p>
        )}
        {data.status === 'waiting' && (
          <div className="canvas-node__status">
            <Loader2 size={16} className="animate-spin" />
            <span>Esperando resultado...</span>
          </div>
        )}
        {data.content && (
          <div className="canvas-node__output-content">
            {data.content}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(OutputNode);
