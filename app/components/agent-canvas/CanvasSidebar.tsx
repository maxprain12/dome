'use client';

import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { BlocksIcon as BlocksIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { useAppStore } from '@/lib/store/useAppStore';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';
import { CanvasInputsPalette, CanvasOutputsPalette } from './CanvasInputsOutputsPalette';
import { CanvasSystemAgentsPalette } from './CanvasSystemAgentsPalette';
import { CanvasAgentsPalette } from './CanvasAgentsPalette';
import { useCanvasSidebarAgents } from './useCanvasSidebarAgents';
import { initialPaletteUiState, paletteUiReducer } from './paletteUiReducer';
import { Separator } from '@/components/ui/separator';

interface CanvasSidebarProps {
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
}

function PaletteHeader() {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 border-b bg-muted px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={BlocksIcon} className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs font-semibold text-foreground">
          {t('canvas.palette_title')}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {t('canvas.palette_hint')}
      </p>
    </div>
  );
}

export default function CanvasSidebar({ onAddNode }: CanvasSidebarProps) {
  const { t } = useTranslation();
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [paletteUi, dispatchPaletteUi] = useReducer(paletteUiReducer, initialPaletteUiState);
  const {
    agentQuery,
    loadingAgents,
    filteredAgents,
    loadAgents,
    setAgentQuery,
  } = useCanvasSidebarAgents(hubProjectId);

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden border-r bg-background"
      style={{ width: CANVAS_PALETTE_WIDTH_PX }}
      aria-label={t('canvas.palette_title')}
    >
      <PaletteHeader />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <CanvasInputsPalette
          expanded={paletteUi.inputsExpanded}
          onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'inputs' })}
          onAddNode={onAddNode}
        />

        <Separator className="mx-3 w-auto" />

        <CanvasOutputsPalette
          expanded={paletteUi.outputsExpanded}
          onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'outputs' })}
          onAddNode={onAddNode}
        />

        <Separator className="mx-3 w-auto" />

        <CanvasSystemAgentsPalette
          expanded={paletteUi.systemAgentsExpanded}
          onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'systemAgents' })}
          onAddNode={onAddNode}
        />

        <Separator className="mx-3 w-auto" />

        <div className="px-3 py-2 pb-3">
          <CanvasAgentsPalette
            expanded={paletteUi.agentsExpanded}
            onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'agents' })}
            onAddNode={onAddNode}
            filteredAgents={filteredAgents}
            agentQuery={agentQuery}
            onAgentQueryChange={setAgentQuery}
            loadingAgents={loadingAgents}
            onReload={loadAgents}
          />
        </div>
      </div>
    </aside>
  );
}
