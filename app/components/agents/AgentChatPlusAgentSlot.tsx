'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plug2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';
import { ChatInputToggle } from '@/components/chat/ChatInputToggle';
import { getToolById, getToolGroupsForAgentMenu, type ToolGroupId } from '@/lib/agents/catalog';

type Subview = null | { kind: 'mcp'; serverId: string } | { kind: 'tools'; group: ToolGroupId };

function toolGroupLabelKey(group: ToolGroupId): string {
  return `agent.tool_group_${group}`;
}

export function AgentChatPlusAgentSlot({
  isOpen,
  mcpServerIds,
  disabledMcpIds,
  onToggleMcp,
  toolIds,
  disabledToolIds,
  onToggleTool,
  hasMcp,
  hasTools,
}: {
  isOpen: boolean;
  mcpServerIds: string[];
  disabledMcpIds: Set<string>;
  onToggleMcp: (id: string) => void;
  toolIds: string[];
  disabledToolIds: Set<string>;
  onToggleTool: (id: string) => void;
  hasMcp: boolean;
  hasTools: boolean;
}) {
  const { t } = useTranslation();
  const [subview, setSubview] = useState<Subview>(null);

  useEffect(() => {
    if (!isOpen) setSubview(null);
  }, [isOpen]);

  const toolGroups = useMemo(() => getToolGroupsForAgentMenu(toolIds), [toolIds]);

  const backRow = (
    <button
      type="button"
      onClick={() => setSubview(null)}
      className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--tertiary-text)]" strokeWidth={1.75} />
      <span className="text-[13px] font-medium text-[var(--primary-text)]">{t('agent.back')}</span>
    </button>
  );

  if (subview?.kind === 'mcp') {
    return (
      <div className="space-y-0.5">
        {backRow}
        <McpCapabilitiesSection
          serverIds={[subview.serverId]}
          disabledServerIds={disabledMcpIds}
          onToggleServer={onToggleMcp}
        />
      </div>
    );
  }

  if (subview?.kind === 'tools') {
    const ids = toolGroups.find((g) => g.group === subview.group)?.ids ?? [];
    return (
      <div className="space-y-0.5">
        {backRow}
        <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--tertiary-text)]">
          {t(toolGroupLabelKey(subview.group))}
        </p>
        <div className="space-y-0.5">
          {ids.map((id) => {
            const enabled = !disabledToolIds.has(id);
            const entry = getToolById(id);
            const label = entry?.label ?? id;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                    enabled ? 'text-[var(--primary-text)]' : 'text-[var(--tertiary-text)]'
                  }`}
                >
                  {label}
                </span>
                <ChatInputToggle checked={enabled} onChange={() => onToggleTool(id)} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {hasMcp ? (
        <div className="px-0">
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--tertiary-text)]">
            {t('agent.mcp_servers')}
          </p>
          {mcpServerIds.length === 1 ? (
            <McpCapabilitiesSection
              serverIds={mcpServerIds}
              disabledServerIds={disabledMcpIds}
              onToggleServer={onToggleMcp}
            />
          ) : (
            <div className="space-y-0.5">
              {mcpServerIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSubview({ kind: 'mcp', serverId: id })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Plug2 className="h-3.5 w-3.5 shrink-0 text-[var(--tertiary-text)]" />
                    <span className="truncate text-[13px] font-medium text-[var(--primary-text)]" title={id}>
                      {id}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--tertiary-text)]" strokeWidth={1.75} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {hasMcp && hasTools ? <div className="mx-0 my-2 h-px bg-[var(--border)]" role="separator" /> : null}

      {hasTools ? (
        <div className="px-0">
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--tertiary-text)]">
            {t('chat.tools_section')}
          </p>
          <div className="space-y-0.5">
            {toolGroups.map(({ group, ids }) => {
              if (ids.length === 1) {
                const id = ids[0]!;
                const enabled = !disabledToolIds.has(id);
                const entry = getToolById(id);
                const label = entry?.label ?? id;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                        enabled ? 'text-[var(--primary-text)]' : 'text-[var(--tertiary-text)]'
                      }`}
                    >
                      {label}
                    </span>
                    <ChatInputToggle checked={enabled} onChange={() => onToggleTool(id)} />
                  </div>
                );
              }
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => setSubview({ kind: 'tools', group })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--primary-text)]">
                    {t(toolGroupLabelKey(group))}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--tertiary-text)]" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
