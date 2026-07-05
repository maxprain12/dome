'use client';

import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Blocks } from 'lucide-react';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { useAppStore } from '@/lib/store/useAppStore';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';
import { CanvasInputsPalette, CanvasOutputsPalette } from './CanvasInputsOutputsPalette';
import { CanvasSystemAgentsPalette } from './CanvasSystemAgentsPalette';
import { CanvasAgentsPalette } from './CanvasAgentsPalette';
import { useCanvasSidebarAgents } from './useCanvasSidebarAgents';
import { initialPaletteUiState, paletteUiReducer } from './paletteUiReducer';

interface CanvasSidebarProps {
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
}

function PaletteHeader() {
  const { t } = useTranslation();
  return (
    <div
      className="sticky top-0 z-10 shrink-0 px-4 pb-2.5 pt-3"
      style={{ background: 'var(--dome-surface)', borderBottom: '1px solid var(--dome-border)' }}
    >
      <div className="flex items-center gap-1.5">
        <Blocks className="size-3.5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
        <span className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('canvas.palette_title')}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
        {t('canvas.palette_hint')}
      </p>
    </div>
  );
}

export default function CanvasSidebar({ onAddNode }: CanvasSidebarProps) {
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
    <div
      className="flex flex-col h-full overflow-y-auto shrink-0"
      style={{
        width: CANVAS_PALETTE_WIDTH_PX,
        background: 'var(--dome-surface)',
        borderRight: '1px solid var(--dome-border)',
        scrollbarWidth: 'none',
      }}
    >
      <PaletteHeader />

      <CanvasInputsPalette
        expanded={paletteUi.inputsExpanded}
        onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'inputs' })}
        onAddNode={onAddNode}
      />

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      <CanvasOutputsPalette
        expanded={paletteUi.outputsExpanded}
        onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'outputs' })}
        onAddNode={onAddNode}
      />

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      <CanvasSystemAgentsPalette
        expanded={paletteUi.systemAgentsExpanded}
        onToggle={() => dispatchPaletteUi({ type: 'TOGGLE_SECTION', section: 'systemAgents' })}
        onAddNode={onAddNode}
      />

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

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
  );
}
