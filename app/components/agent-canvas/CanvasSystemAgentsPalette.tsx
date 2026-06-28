'use client';

import {
  Search,
  BookOpen,
  PenTool,
  BarChart2,
  Presentation,
  FolderKanban,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CanvasNodeData, SystemAgentRole, WorkflowNode } from '@/types/canvas';
import { SYSTEM_AGENT_LIST } from '@/lib/agent-canvas/system-agents';
import { canvasSystemAgentNameKey, canvasSystemAgentDescKey } from '@/lib/agent-canvas/canvas-layout';
import { CanvasPaletteSectionHeader } from './CanvasPaletteParts';
import { createCanvasPaletteNode, handleCanvasPaletteDragStart } from './createCanvasPaletteNode';

const SYSTEM_AGENT_ICONS: Record<SystemAgentRole, React.ElementType> = {
  research: Search,
  library: BookOpen,
  writer: PenTool,
  data: BarChart2,
  presenter: Presentation,
  curator: FolderKanban,
};

export function CanvasSystemAgentsPalette({
  expanded,
  onToggle,
  onAddNode,
}: {
  expanded: boolean;
  onToggle: () => void;
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="p-3">
      <CanvasPaletteSectionHeader
        expanded={expanded}
        onToggle={onToggle}
        label={t('canvas.palette_system_agents')}
      />
      {expanded && (
        <div className="space-y-2">
          {SYSTEM_AGENT_LIST.map((sysAgent) => {
            const RoleIcon = SYSTEM_AGENT_ICONS[sysAgent.role];
            const name = t(canvasSystemAgentNameKey(sysAgent.role));
            const desc = t(canvasSystemAgentDescKey(sysAgent.role));
            return (
              <button
                key={sysAgent.role}
                type="button"
                draggable
                onDragStart={(e) =>
                  handleCanvasPaletteDragStart(e, 'system-agent', undefined, sysAgent.role)
                }
                onClick={() => onAddNode(createCanvasPaletteNode(t, 'system-agent', undefined, sysAgent.role))}
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1"
                title={desc}
              >
                <div
                  className="size-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: sysAgent.color }}
                >
                  <RoleIcon className="size-3.5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight" style={{ color: sysAgent.color }}>
                    {name}
                  </p>
                  <p className="text-[11px] truncate leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                    {desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
