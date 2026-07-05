'use client';

import { useTranslation } from 'react-i18next';
import { Type, Search, Terminal, ArrowRight, Wand2, MousePointerClick } from 'lucide-react';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';
import { generateId } from '@/lib/utils';
import { createCanvasPaletteNode } from './createCanvasPaletteNode';

function StepChip({
  index,
  icon: Icon,
  label,
  color,
}: {
  index: number;
  icon: typeof Type;
  label: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
        style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
        aria-hidden
      >
        {index}
      </span>
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
        aria-hidden
      >
        <Icon className="size-3.5" style={{ color }} strokeWidth={1.75} />
      </span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--dome-text)' }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Guided empty state for a blank canvas: a 3-step recipe (input → agent →
 * output) plus a one-click seeder that builds a ready-to-run example flow
 * (text input → research agent → result, already connected).
 */
export default function AgentCanvasEmptyState() {
  const { t } = useTranslation();
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const seedExampleFlow = () => {
    const input = createCanvasPaletteNode(t, 'text-input');
    const agent = createCanvasPaletteNode(t, 'system-agent', undefined, 'research');
    const output = createCanvasPaletteNode(t, 'output');
    input.position = { x: 80, y: 200 };
    agent.position = { x: 420, y: 190 };
    output.position = { x: 760, y: 200 };
    setNodes([input, agent, output]);
    setEdges([
      { id: generateId(), source: input.id, target: agent.id, sourceHandle: 'out', targetHandle: 'in' },
      { id: generateId(), source: agent.id, target: output.id, sourceHandle: 'out', targetHandle: 'in' },
    ]);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      style={{ left: CANVAS_PALETTE_WIDTH_PX, top: 56 }}
    >
      <div className="flex max-w-md flex-col items-center gap-5 px-6 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
        >
          <MousePointerClick className="size-7" strokeWidth={1.5} aria-hidden />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('canvas.empty_canvas_title')}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            {t('canvas.empty_canvas_subtitle')}
          </p>
        </div>

        {/* Recipe: input → agent → output */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <StepChip index={1} icon={Type} label={t('canvas.empty_step_input')} color="var(--dome-accent)" />
          <ArrowRight className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
          <StepChip index={2} icon={Search} label={t('canvas.empty_step_agent')} color="var(--success)" />
          <ArrowRight className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
          <StepChip index={3} icon={Terminal} label={t('canvas.empty_step_output')} color="var(--info)" />
        </div>

        <button
          type="button"
          onClick={seedExampleFlow}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
        >
          <Wand2 className="size-3.5" aria-hidden />
          {t('canvas.empty_quick_start')}
        </button>
      </div>
    </div>
  );
}
