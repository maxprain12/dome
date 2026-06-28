'use client';

import { Bot, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ManyAgent } from '@/types';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
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

  return (
    <div className="p-3 flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-left flex-1 min-w-0"
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
          ) : (
            <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
          )}
          <span className="text-[11px] font-semibold tracking-wide truncate" style={{ color: 'var(--dome-text-muted)' }}>
            {t('canvas.palette_my_agents')}
          </span>
        </button>
        <button
          type="button"
          onClick={onReload}
          className="p-1 rounded-md transition-colors hover:bg-[var(--dome-bg)] shrink-0"
          title={t('canvas.reload_agents')}
        >
          <RefreshCw
            className={`size-3.5 ${loadingAgents ? 'animate-spin' : ''}`}
            style={{ color: 'var(--dome-text-muted)' }}
          />
        </button>
      </div>

      {expanded && (
        <>
          <div className="relative mb-2">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none"
              style={{ color: 'var(--dome-text-muted)' }}
            />
            <input
              type="search"
              value={agentQuery}
              onChange={(e) => onAgentQueryChange(e.target.value)}
              placeholder={t('canvas.palette_search_agents')}
              aria-label={t('canvas.palette_search_agents')}
              className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-lg outline-none border transition-colors"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                borderColor: 'var(--dome-border)',
              }}
            />
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
            {filteredAgents.length === 0 && !loadingAgents ? (
              <p className="text-[11px] text-center py-3 leading-relaxed px-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_agents_yet')}
              </p>
            ) : (
              filteredAgents.map((agent) => {
                const descSnippet =
                  agent.description.length > 40 ? `${agent.description.slice(0, 40)}…` : agent.description;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    draggable
                    onDragStart={(e) => handleCanvasPaletteDragStart(e, 'agent', agent)}
                    onClick={() => onAddNode(createCanvasPaletteNode(t, 'agent', agent))}
                    className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1"
                  >
                    <div
                      className="size-7 rounded-md overflow-hidden shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ background: 'var(--dome-accent)' }}
                    >
                      {agent.iconIndex > 0 ? (
                        <img
                          src={`/agents/sprite_${agent.iconIndex}.png`}
                          alt={agent.name}
                          className="size-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Bot className="size-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate leading-tight" style={{ color: 'var(--dome-text)' }}>
                        {agent.name}
                      </p>
                      <p className="text-[11px] truncate leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                        {descSnippet}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
