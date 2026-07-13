'use client';

import {
  Search01Icon as SearchIcon,
  BookOpen01Icon as BookOpenIcon,
  PenTool03Icon as PenToolIcon,
  BarChartIcon as BarChart2Icon,
  Presentation01Icon as PresentationIcon,
  FolderKanbanIcon as FolderKanbanIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import type { CanvasNodeData, SystemAgentRole, WorkflowNode } from '@/types/canvas';
import { SYSTEM_AGENT_LIST } from '@/lib/agent-canvas/system-agents';
import { canvasSystemAgentNameKey, canvasSystemAgentDescKey } from '@/lib/agent-canvas/canvas-layout';
import { CanvasPaletteSectionHeader, CanvasPaletteRow } from './CanvasPaletteParts';
import { createCanvasPaletteNode, handleCanvasPaletteDragStart } from './createCanvasPaletteNode';

const Search = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={SearchIcon} {...props} />
);
const BookOpen = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BookOpenIcon} {...props} />
);
const PenTool = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={PenToolIcon} {...props} />
);
const BarChart2 = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BarChart2Icon} {...props} />
);
const Presentation = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={PresentationIcon} {...props} />
);
const FolderKanban = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={FolderKanbanIcon} {...props} />
);

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
        <div className="flex flex-col gap-1.5">
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
