'use client';

import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Type } from 'lucide-react';
import type { TextInputNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

export default function TextInputNode({ id, data, selected }: NodeProps<TextInputNodeData>) {
  const updateNode = useCanvasStore((s) => s.updateNode);

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden transition-all"
      style={{
        width: 260,
        background: 'var(--dome-surface)',
        border: `1.5px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        boxShadow: selected ? '0 0 0 3px var(--dome-accent-bg)' : '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: 'var(--dome-accent-bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--dome-accent)' }}
        >
          <Type className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--dome-accent)' }}>
          {data.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-3">
        <textarea
          value={data.value}
          onChange={(e) => updateNode(id, { value: e.target.value } as Partial<TextInputNodeData>)}
          placeholder="Escribe tu texto aquí..."
          rows={3}
          className="nodrag nowheel w-full text-xs resize-none rounded-lg outline-none transition-all"
          style={{
            background: 'var(--dome-bg)',
            color: 'var(--dome-text)',
            border: '1px solid var(--dome-border)',
            padding: '8px 10px',
            lineHeight: 1.6,
          }}
        />
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: 'var(--dome-accent)',
          border: '2px solid white',
          boxShadow: '0 0 0 1px var(--dome-accent)',
        }}
      />
    </div>
  );
}
