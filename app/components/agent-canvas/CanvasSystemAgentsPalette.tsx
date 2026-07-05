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
import { CanvasPaletteSectionHeader, CanvasPaletteRow } from './CanvasPaletteParts';
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
    <div className="px-3 py-2">
      <CanvasPaletteSectionHeader
        expanded={expanded}
        onToggle={onToggle}
        label={t('canvas.palette_system_agents')}
        count={SYSTEM_AGENT_LIST.length}
      />
      {expanded && (
        <div className="space-y-1.5">
          {SYSTEM_AGENT_LIST.map((sysAgent) => (
            <CanvasPaletteRow
              key={sysAgent.role}
              icon={SYSTEM_AGENT_ICONS[sysAgent.role]}
              label={t(canvasSystemAgentNameKey(sysAgent.role))}
              description={t(canvasSystemAgentDescKey(sysAgent.role))}
              color={sysAgent.color}
              onAdd={() => onAddNode(createCanvasPaletteNode(t, 'system-agent', undefined, sysAgent.role))}
              onDragStart={(e) => handleCanvasPaletteDragStart(e, 'system-agent', undefined, sysAgent.role)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
