'use client';

import { useTranslation } from 'react-i18next';
import {
  TextFontIcon as TypeIcon,
  Search01Icon as SearchIcon,
  TerminalIcon as TerminalIcon,
  ArrowRight02Icon as ArrowRightIcon,
  MagicWand01Icon as Wand2Icon,
  Tap01Icon as MousePointerClickIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';
import { generateId } from '@/lib/utils';
import { createCanvasPaletteNode } from './createCanvasPaletteNode';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

const Type = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TypeIcon} {...props} />
);
const Search = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={SearchIcon} {...props} />
);
const Terminal = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TerminalIcon} {...props} />
);

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
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
        style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}
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
      <span className="text-[11px] font-medium text-foreground">
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
    <Empty
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      style={{ left: CANVAS_PALETTE_WIDTH_PX, top: 56 }}
    >
      <EmptyMedia variant="icon">
          <HugeiconsIcon icon={MousePointerClickIcon} className="size-7" strokeWidth={1.5} aria-hidden />
      </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {t('canvas.empty_canvas_title')}
          </EmptyTitle>
          <EmptyDescription>
            {t('canvas.empty_canvas_subtitle')}
          </EmptyDescription>
        </EmptyHeader>

      <EmptyContent>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <StepChip index={1} icon={Type} label={t('canvas.empty_step_input')} color="var(--primary)" />
          <HugeiconsIcon icon={ArrowRightIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <StepChip index={2} icon={Search} label={t('canvas.empty_step_agent')} color="var(--success)" />
          <HugeiconsIcon icon={ArrowRightIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <StepChip index={3} icon={Terminal} label={t('canvas.empty_step_output')} color="var(--info)" />
        </div>

        <Button
          type="button"
          onClick={seedExampleFlow}
          className="pointer-events-auto"
          size="sm"
        >
          <HugeiconsIcon icon={Wand2Icon} className="size-3.5" aria-hidden />
          {t('canvas.empty_quick_start')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
