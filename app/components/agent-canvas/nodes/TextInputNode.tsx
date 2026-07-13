'use client';

import {
  TextFontIcon as TypeIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import type { TextInputNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

export default function TextInputNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: TextInputNodeData;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const updateNode = useCanvasStore((s) => s.updateNode);

  return (
    <div
      className="wf-node-card workflow-node-card rounded-xl overflow-hidden transition-[box-shadow,border-color]"
      style={{
        width: 220,
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent)' : 'none',
        background: 'var(--card)',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="size-6 rounded-lg flex items-center justify-center shrink-0 bg-primary"
        >
          <HugeiconsIcon icon={TypeIcon} className="size-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold leading-tight truncate text-foreground">
          {data.label}
        </span>
      </div>

      <div className="p-3">
        <textarea
          value={data.value}
          onChange={(e) => updateNode(id, { value: e.target.value } as Partial<TextInputNodeData>)}
          placeholder={t('canvas.text_placeholder')}
          aria-label={t('canvas.text_placeholder')}
          rows={2}
          className="nodrag nowheel w-full text-xs resize-none rounded-lg outline-none transition-all leading-snug"
          style={{
            background: 'var(--background)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            padding: '8px 10px',
            lineHeight: 1.45,
          }}
        />
      </div>
    </div>
  );
}
