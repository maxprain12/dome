'use client';

import {
  BotIcon as BotIcon,
  PlusSignIcon as PlusIcon,
  RefreshIcon as RefreshCwIcon,
  Search01Icon as SearchIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useTranslation } from 'react-i18next';
import type { ManyAgent } from '@/types';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { useTabStore } from '@/lib/store/useTabStore';
import { CanvasPaletteSectionHeader, CanvasPaletteRow } from './CanvasPaletteParts';
import { createCanvasPaletteNode, handleCanvasPaletteDragStart } from './createCanvasPaletteNode';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);

export function CanvasAgentsPalette({
  expanded,
  onToggle,
  onAddNode,
  filteredAgents,
  agentQuery,
  onAgentQueryChange,
  loadingAgents,
  onReload,
}: {
  expanded: boolean;
  onToggle: () => void;
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
  filteredAgents: ManyAgent[];
  agentQuery: string;
  onAgentQueryChange: (query: string) => void;
  loadingAgents: boolean;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const openAgentsTab = useTabStore((s) => s.openAgentsTab);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
      <CanvasPaletteSectionHeader
        expanded={expanded}
        onToggle={onToggle}
        label={t('canvas.palette_my_agents')}
        count={filteredAgents.length}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onReload}
            title={t('canvas.reload_agents')}
            aria-label={t('canvas.reload_agents')}
          >
            <HugeiconsIcon icon={RefreshCwIcon}
              className={loadingAgents ? 'animate-spin' : undefined}
            />
          </Button>
        }
      />

      {expanded && (
        <>
          <InputGroup className="mb-2 h-8">
            <InputGroupAddon><HugeiconsIcon icon={SearchIcon} /></InputGroupAddon>
            <InputGroupInput
              type="search"
              value={agentQuery}
              onChange={(e) => onAgentQueryChange(e.target.value)}
              placeholder={t('canvas.palette_search_agents')}
              aria-label={t('canvas.palette_search_agents')}
            />
          </InputGroup>
          <div className="min-h-0 flex-1 flex flex-col gap-1.5 overflow-y-auto">
            {filteredAgents.length === 0 && !loadingAgents ? (
              <Empty className="border border-dashed py-4">
                <EmptyMedia variant="icon"><HugeiconsIcon icon={BotIcon} aria-hidden /></EmptyMedia>
                <EmptyDescription>
                  {agentQuery ? t('canvas.no_workflow_search_results') : t('canvas.no_agents_yet')}
                </EmptyDescription>
                {!agentQuery ? (
                  <EmptyContent><Button
                    type="button"
                    size="sm"
                    onClick={openAgentsTab}
                  >
                    <HugeiconsIcon icon={PlusIcon} data-icon="inline-start" aria-hidden />
                    {t('canvas.palette_create_agent')}
                  </Button></EmptyContent>
                ) : null}
              </Empty>
            ) : (
              filteredAgents.map((agent) => (
                <CanvasPaletteRow
                  key={agent.id}
                  icon={agent.iconIndex > 0 ? undefined : Bot}
                  iconImage={agent.iconIndex > 0 ? `/agents/sprite_${agent.iconIndex}.png` : undefined}
                  label={agent.name}
                  description={agent.description || t('agents.all_tools_available')}
                  color="var(--primary)"
                  onAdd={() => onAddNode(createCanvasPaletteNode(t, 'agent', agent))}
                  onDragStart={(e) => handleCanvasPaletteDragStart(e, 'agent', agent)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
