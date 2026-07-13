'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Plug02Icon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';

type Subview = null | { kind: 'mcp'; serverId: string };

export function AgentChatPlusAgentSlot({
  mcpServerIds,
  disabledMcpIds,
  onToggleMcp,
  hasMcp,
}: {
  mcpServerIds: string[];
  disabledMcpIds: Set<string>;
  onToggleMcp: (id: string) => void;
  hasMcp: boolean;
}) {
  const { t } = useTranslation();
  const [subview, setSubview] = useState<Subview>(null);

  const backRow = (
    <button
      type="button"
      onClick={() => setSubview(null)}
      className="mb-1 flex w-full items-center gap-2 rounded-xl p-2.5 text-left transition-colors hover:bg-accent"
    >
      <HugeiconsIcon icon={ChevronLeftIcon} className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="text-[13px] font-medium text-foreground">{t('agent.back')}</span>
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

  if (!hasMcp) return null;

  return (
    <div className="space-y-1">
      <div className="px-0">
        <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                className="flex w-full items-center justify-between gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <HugeiconsIcon icon={Plug02Icon} className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[13px] font-medium text-foreground" title={id}>
                    {id}
                  </span>
                </span>
                <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
