'use client';

import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TextInputNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

export default function TextInputNode({ id, data, selected }: NodeProps<TextInputNodeData>) {
  const { t } = useTranslation();
  const updateNode = useCanvasStore((s) => s.updateNode);

  return (
    <div
      className="workflow-node-card rounded-lg overflow-hidden transition-colors"
      style={{
        width: 220,
        border: `1px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
      }}
    >
      <div className="workflow-node-header flex items-center gap-1.5 px-2 py-1.5">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'var(--dome-accent)' }}
        >
          <Type className="w-3 h-3 text-white" />
        </div>
        <span className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--dome-text)' }}>
          {data.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-2">
        <textarea
          value={data.value}
          onChange={(e) => updateNode(id, { value: e.target.value } as Partial<TextInputNodeData>)}
          placeholder={t('canvas.text_placeholder')}
          rows={2}
          className="nodrag nowheel w-full text-[11px] resize-none rounded-md outline-none transition-all leading-snug"
          style={{
            background: 'var(--dome-bg)',
            color: 'var(--dome-text)',
            border: '1px solid var(--dome-border)',
            padding: '6px 8px',
            lineHeight: 1.45,
          }}
        />
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="workflow-node-handle"
        style={{ background: 'var(--dome-accent)' }}
      />
    </div>
  );
}
