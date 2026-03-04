import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Bot, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AgentNodeData } from '@/lib/canvas/types';

function AgentNode({ data }: NodeProps<AgentNodeData>) {
  const iconSrc = data.agentIcon != null
    ? `/agents/sprite_${data.agentIcon}.png`
    : undefined;

  return (
    <div className={`canvas-node canvas-node--agent ${data.status === 'running' ? 'canvas-node--running' : ''} ${data.status === 'done' ? 'canvas-node--done' : ''} ${data.status === 'error' ? 'canvas-node--error' : ''}`}>
      <Handle type="target" position={Position.Left} className="canvas-handle canvas-handle--target" />

      <div className="canvas-node__header canvas-node__header--agent">
        <div className="canvas-node__agent-icon">
          {iconSrc ? (
            <img src={iconSrc} alt={data.agentName} className="w-5 h-5 rounded-full" />
          ) : (
            <Bot size={14} />
          )}
        </div>
        <span className="flex-1 truncate">{data.label || data.agentName}</span>
        {data.status === 'running' && <Loader2 size={14} className="animate-spin text-blue-500" />}
        {data.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
        {data.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
      </div>

      <div className="canvas-node__body">
        {data.status === 'idle' && (
          <p className="canvas-node__placeholder">Esperando inputs...</p>
        )}
        {data.status === 'running' && (
          <div className="canvas-node__status">
            <Loader2 size={16} className="animate-spin" />
            <span>Procesando...</span>
          </div>
        )}
        {(data.status === 'done' || data.status === 'error') && data.output && (
          <div className="canvas-node__output-preview">
            {data.output.slice(0, 200)}
            {data.output.length > 200 && '...'}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="canvas-handle canvas-handle--source" />
    </div>
  );
}

export default memo(AgentNode);
