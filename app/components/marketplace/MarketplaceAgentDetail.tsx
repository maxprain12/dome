'use client';

import { X, Download, CheckCircle2, Star, Wrench, Tag } from 'lucide-react';
import type { MarketplaceAgent } from '@/types';

interface MarketplaceAgentDetailProps {
  agent: MarketplaceAgent;
  isInstalled: boolean;
  hasUpdate?: boolean;
  isInstalling: boolean;
  onInstall: (agent: MarketplaceAgent) => void;
  onClose: () => void;
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  research: { bg: 'var(--info-bg)', text: 'var(--info)' },
  writing: { bg: 'var(--success-bg)', text: 'var(--success)' },
  coding: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  data: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  education: { bg: 'var(--success-bg)', text: 'var(--success)' },
  productivity: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  content: { bg: 'var(--info-bg)', text: 'var(--info)' },
  language: { bg: 'var(--success-bg)', text: 'var(--success)' },
  marketing: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  academic: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  web: { bg: 'var(--dome-bg)', text: 'var(--dome-text-muted)' },
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web search',
  web_fetch: 'Web fetch',
  deep_research: 'Deep research',
  resource_search: 'Library search',
  resource_get: 'Open resource',
  resource_create: 'Create resource',
  resource_update: 'Update resource',
  resource_list: 'List resources',
  resource_semantic_search: 'Semantic search',
  resource_get_library_overview: 'Library overview',
  flashcard_create: 'Flashcards',
  generate_quiz: 'Quiz',
  generate_mindmap: 'Mind map',
  generate_knowledge_graph: 'Knowledge graph',
  create_resource_link: 'Link resources',
  get_related_resources: 'Related resources',
  analyze_graph_structure: 'Graph analysis',
  calendar_create_event: 'Calendar',
  calendar_get_upcoming: 'Upcoming events',
  calendar_list: 'Calendar list',
  calendar_update_event: 'Update event',
  get_current_project: 'Current project',
  excel_get: 'Excel read',
  excel_set_cell: 'Excel cell',
  excel_set_range: 'Excel range',
  excel_add_row: 'Excel row',
  excel_add_sheet: 'Excel sheet',
  excel_create: 'Excel create',
  excel_export: 'Excel export',
  ppt_create: 'PowerPoint',
  ppt_get_slides: 'Slides',
  ppt_export: 'Export PPT',
  generate_audio_script: 'Audio script',
};

export default function MarketplaceAgentDetail({
  agent,
  isInstalled,
  hasUpdate = false,
  isInstalling,
  onInstall,
  onClose,
}: MarketplaceAgentDetailProps) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,1000)] flex items-center justify-center"
      style={{ backgroundColor: 'var(--translucent, rgba(0,0,0,0.4))', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{
          background: 'var(--dome-surface)',
          border: '1px solid var(--dome-border)',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-all z-10"
          style={{
            color: 'var(--dome-text-muted)',
            background: 'var(--dome-bg)',
          }}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto" style={{ maxHeight: '85vh' }}>
          {/* Header */}
          <div className="p-6 pb-0">
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden"
                style={{ background: 'var(--dome-accent-bg)' }}
              >
                <img
                  src={`/agents/sprite_${agent.iconIndex}.png`}
                  alt={agent.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2">
                  <h2
                    className="text-lg font-bold leading-tight"
                    style={{ color: 'var(--dome-text)' }}
                  >
                    {agent.name}
                  </h2>
                  {agent.featured && (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: 'var(--dome-accent-bg)',
                        color: 'var(--dome-accent)',
                      }}
                    >
                      <Star className="w-3 h-3" />
                      Dome Team
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  by {agent.author} · v{agent.version}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 flex flex-col gap-5">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--dome-text)' }}>
              {agent.longDescription ?? agent.description}
            </p>

            {/* Tags */}
            <div>
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                <Tag className="w-3.5 h-3.5" />
                Categories
              </h4>
              <div className="flex flex-wrap gap-2">
                {agent.tags.map((tag) => {
                  const style = TAG_COLORS[tag] ?? { bg: 'var(--dome-bg)', text: 'var(--dome-text-muted)' };
                  return (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: style.bg, color: style.text }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Tools */}
            {agent.toolIds.length > 0 && (
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Tools
                </h4>
                <div className="flex flex-wrap gap-2">
                  {agent.toolIds.map((toolId) => (
                    <span
                      key={toolId}
                      className="px-2.5 py-1 rounded-lg text-xs"
                      style={{
                        background: 'var(--dome-bg)',
                        color: 'var(--dome-text)',
                        border: '1px solid var(--dome-border)',
                      }}
                    >
                      {TOOL_LABELS[toolId] ?? toolId}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* System instructions preview */}
            <div>
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                System instructions
              </h4>
              <div
                className="text-xs leading-relaxed p-3 rounded-xl line-clamp-4"
                style={{
                  background: 'var(--dome-bg)',
                  color: 'var(--dome-text-secondary, var(--dome-text-muted))',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {agent.systemInstructions}
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderTop: '1px solid var(--dome-border)' }}
          >
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if ((!isInstalled || hasUpdate) && !isInstalling) onInstall(agent);
              }}
              disabled={(isInstalled && !hasUpdate) || isInstalling}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: isInstalled
                  ? 'var(--dome-accent-bg)'
                  : isInstalling
                    ? 'var(--dome-border)'
                    : 'var(--dome-accent)',
                color: isInstalled
                  ? 'var(--dome-accent)'
                  : isInstalling
                    ? 'var(--dome-text-muted)'
                    : 'white',
                cursor: (isInstalled && !hasUpdate) || isInstalling ? 'default' : 'pointer',
              }}
            >
              {isInstalling ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Installing…
                </>
              ) : isInstalled && !hasUpdate ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Installed
                </>
              ) : hasUpdate ? (
                <>
                  <Download className="w-4 h-4" />
                  Update agent
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Install agent
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
