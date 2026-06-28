'use client';

import { useTranslation } from 'react-i18next';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';

export default function AgentCanvasEmptyState() {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      style={{ left: CANVAS_PALETTE_WIDTH_PX, top: 56 }}
    >
      <div className="text-center space-y-3 max-w-sm px-6 opacity-50">
        <div
          className="size-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: 'var(--dome-accent-bg)' }}
        >
          <svg
            className="size-7"
            style={{ color: 'var(--dome-accent)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
            />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
          {t('canvas.empty_canvas_title')}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
          {t('canvas.empty_canvas_subtitle')}
        </p>
      </div>
    </div>
  );
}
