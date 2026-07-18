'use client';

import {
  BotIcon as BotIcon,
  PlusSignIcon as PlusIcon,
  RefreshIcon as RefreshCwIcon,
  Search01Icon as SearchIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
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
  const hasAgents = filteredAgents.length > 0;
  const showSearch = hasAgents || Boolean(agentQuery.trim()) || loadingAgents;

  return (
    <div className="flex flex-col">
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
            <HugeiconsIcon
              icon={RefreshCwIcon}
              className={loadingAgents ? 'animate-spin' : undefined}
            />
          </Button>
        }
      />

      {expanded ? (
        <div className="flex flex-col gap-2">
          {showSearch ? (
            <InputGroup className="h-8">
              <InputGroupAddon>
                <HugeiconsIcon icon={SearchIcon} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={agentQuery}
                onChange={(e) => onAgentQueryChange(e.target.value)}
                placeholder={t('canvas.palette_search_agents')}
                aria-label={t('canvas.palette_search_agents')}
              />
            </InputGroup>
          ) : null}

          {!hasAgents && !loadingAgents ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3">
              <p className="text-[11px] leading-snug text-muted-foreground">
                {agentQuery ? t('canvas.no_workflow_search_results') : t('canvas.no_agents_yet')}
              </p>
              {!agentQuery ? (
                <Button type="button" size="sm" variant="outline" onClick={openAgentsTab}>
                  <HugeiconsIcon icon={PlusIcon} data-icon="inline-start" aria-hidden />
                  {t('canvas.palette_create_agent')}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {filteredAgents.map((agent) => (
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
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
