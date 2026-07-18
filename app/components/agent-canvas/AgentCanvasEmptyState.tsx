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
import { generateId } from '@/lib/utils';
import { createCanvasPaletteNode } from './createCanvasPaletteNode';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

function StepChip({
  index,
  icon,
  label,
  tone,
}: {
  index: number;
  icon: typeof TypeIcon;
  label: string;
  tone: 'mint' | 'lime' | 'lavender';
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-none">
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
        {index}
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-primary',
          tone === 'mint' && 'bg-brand-mint',
          tone === 'lime' && 'bg-brand-lime',
          tone === 'lavender' && 'bg-brand-lavender',
        )}
        aria-hidden
      >
        <HugeiconsIcon icon={icon} className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="text-[11px] font-medium text-foreground">{label}</span>
    </div>
  );
}

/**
 * Guided empty state for a blank canvas: a 3-step recipe (input → agent →
 * output) plus a one-click seeder that builds a ready-to-run example flow.
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
    <Empty className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center border-0 bg-background/75 px-4">
      <EmptyMedia variant="icon">
        <HugeiconsIcon icon={MousePointerClickIcon} className="size-6" strokeWidth={1.5} aria-hidden />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle className="text-sm font-semibold tracking-tight">
          {t('canvas.empty_canvas_title')}
        </EmptyTitle>
        <EmptyDescription>{t('canvas.empty_canvas_subtitle')}</EmptyDescription>
      </EmptyHeader>

      <EmptyContent className="max-w-md">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <StepChip index={1} icon={TypeIcon} label={t('canvas.empty_step_input')} tone="mint" />
          <HugeiconsIcon icon={ArrowRightIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <StepChip index={2} icon={SearchIcon} label={t('canvas.empty_step_agent')} tone="lime" />
          <HugeiconsIcon icon={ArrowRightIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <StepChip index={3} icon={TerminalIcon} label={t('canvas.empty_step_output')} tone="lavender" />
        </div>

        <Button type="button" onClick={seedExampleFlow} className="pointer-events-auto" size="sm">
          <HugeiconsIcon icon={Wand2Icon} data-icon="inline-start" aria-hidden />
          {t('canvas.empty_quick_start')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
