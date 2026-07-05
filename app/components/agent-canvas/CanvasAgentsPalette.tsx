'use client';

import { Bot, Plus, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ManyAgent } from '@/types';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { useTabStore } from '@/lib/store/useTabStore';
import { CanvasPaletteSectionHeader, CanvasPaletteRow } from './CanvasPaletteParts';
import { createCanvasPaletteNode, handleCanvasPaletteDragStart } from './createCanvasPaletteNode';

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
          <button
            type="button"
            onClick={onReload}
            className="shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--dome-bg)]"
            title={t('canvas.reload_agents')}
            aria-label={t('canvas.reload_agents')}
          >
            <RefreshCw
              className={`size-3 ${loadingAgents ? 'animate-spin' : ''}`}
              style={{ color: 'var(--dome-text-muted)' }}
            />
          </button>
        }
      />

      {expanded && (
        <>
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2"
              style={{ color: 'var(--dome-text-muted)' }}
            />
            <input
              type="search"
              value={agentQuery}
              onChange={(e) => onAgentQueryChange(e.target.value)}
              placeholder={t('canvas.palette_search_agents')}
              aria-label={t('canvas.palette_search_agents')}
              className="w-full rounded-lg border py-1.5 pl-7 pr-2 text-[11px] outline-none transition-colors focus:border-[var(--dome-accent)]"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                borderColor: 'var(--dome-border)',
              }}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {filteredAgents.length === 0 && !loadingAgents ? (
              <div
                className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-center"
                style={{ background: 'var(--dome-bg)', border: '1px dashed var(--dome-border)' }}
              >
                <Bot className="size-5" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} aria-hidden />
                <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                  {agentQuery ? t('canvas.no_workflow_search_results') : t('canvas.no_agents_yet')}
                </p>
                {!agentQuery ? (
                  <button
                    type="button"
                    onClick={openAgentsTab}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-opacity hover:opacity-90"
                    style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
                  >
                    <Plus className="size-3" aria-hidden />
                    {t('canvas.palette_create_agent')}
                  </button>
                ) : null}
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <CanvasPaletteRow
                  key={agent.id}
                  icon={agent.iconIndex > 0 ? undefined : Bot}
                  iconImage={agent.iconIndex > 0 ? `/agents/sprite_${agent.iconIndex}.png` : undefined}
                  label={agent.name}
                  description={agent.description || t('agents.all_tools_available')}
                  color="var(--dome-accent)"
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
