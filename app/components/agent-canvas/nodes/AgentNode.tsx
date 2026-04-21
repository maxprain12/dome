'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Search,
  BookOpen,
  PenTool,
  BarChart2,
  Presentation,
  FolderKanban,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentNodeData, SystemAgentRole } from '@/types/canvas';
import { SYSTEM_AGENTS } from '@/lib/agent-canvas/system-agents';
import { canvasSystemAgentDescKey } from '@/lib/agent-canvas/canvas-layout';

const SYSTEM_ROLE_ICONS: Record<SystemAgentRole, React.ElementType> = {
  research: Search,
  library: BookOpen,
  writer: PenTool,
  data: BarChart2,
  presenter: Presentation,
  curator: FolderKanban,
};

const STATUS_COLORS = {
  idle: { header: 'var(--dome-bg)', textColor: 'var(--dome-accent)' },
  running: { header: 'var(--dome-accent-bg)', textColor: 'var(--dome-accent)' },
  done: { header: 'var(--success-bg)', textColor: 'var(--success)' },
  error: { header: 'var(--error-bg)', textColor: 'var(--error)' },
};

export default function AgentNode({
  data,
  selected,
}: {
  id: string;
  data: AgentNodeData;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const colors = STATUS_COLORS[data.status];

  useEffect(() => {
    setIconLoadFailed(false);
  }, [data.agentIconIndex, data.agentId]);

  const isSystemAgent = !data.agentId && !!data.systemAgentRole;
  const systemDef = data.systemAgentRole ? SYSTEM_AGENTS[data.systemAgentRole] : null;
  const systemColor = systemDef?.color ?? 'var(--dome-accent)';

  const StatusIcon = () => {
    switch (data.status) {
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: systemColor }} />;
      case 'done':
        return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />;
      default:
        return null;
    }
  };

  const agentInitials = data.agentName ? data.agentName.slice(0, 2).toUpperCase() : '?';

  const RoleIcon = data.systemAgentRole ? SYSTEM_ROLE_ICONS[data.systemAgentRole] : null;

  const systemDesc = data.systemAgentRole != null ? t(canvasSystemAgentDescKey(data.systemAgentRole)) : '';

  const headerBg =
    isSystemAgent && systemDef
      ? `color-mix(in srgb, ${systemDef.color} 10%, var(--dome-bg))`
      : colors.header;

  const borderColor =
    selected && isSystemAgent && systemDef
      ? systemDef.color
      : selected
        ? 'var(--dome-accent)'
        : 'var(--dome-border)';

  return (
    <div
      className="wf-node-card workflow-node-card rounded-xl overflow-hidden transition-[box-shadow,border-color]"
      style={{
        width: 220,
        border: `1px solid ${borderColor}`,
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${isSystemAgent && systemDef ? systemDef.color : 'var(--dome-accent)'} 18%, transparent)`
          : 'none',
        background: 'var(--dome-surface)',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{
          background: headerBg,
          borderBottom: '1px solid var(--dome-border)',
        }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
          style={{ background: systemColor }}
        >
          {isSystemAgent && RoleIcon ? (
            <RoleIcon className="w-3.5 h-3.5 text-white" />
          ) : data.agentIconIndex > 0 && !iconLoadFailed ? (
            <img
              src={`/agents/sprite_${data.agentIconIndex}.png`}
              alt={data.agentName ?? 'Agent'}
              className="w-full h-full object-contain rounded-lg"
              onError={() => setIconLoadFailed(true)}
            />
          ) : (
            agentInitials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-semibold leading-tight truncate block"
            style={{ color: isSystemAgent && systemDef ? systemDef.color : colors.textColor }}
          >
            {data.label}
          </span>
          {isSystemAgent && systemDef ? (
            <span className="text-[10px] truncate block opacity-60 leading-tight" style={{ color: systemDef.color }}>
              {systemDef.emoji} {t('canvas.system_agent_badge')}
            </span>
          ) : data.agentName ? (
            <span className="text-[10px] truncate block opacity-70 leading-tight" style={{ color: colors.textColor }}>
              {data.agentName}
            </span>
          ) : null}
        </div>
        <StatusIcon />
      </div>

      <div className="p-3 min-h-[48px]">
        {data.status === 'idle' && !data.agentId && !data.systemAgentRole && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <Bot className="w-4 h-4 opacity-40 shrink-0" />
            <span className="italic leading-snug">{t('canvas.no_agent_assigned')}</span>
          </div>
        )}
        {data.status === 'idle' && isSystemAgent && systemDef && data.systemAgentRole && (
          <div className="text-xs leading-snug" style={{ color: systemDef.color }}>
            <span className="opacity-70">{systemDesc}</span>
          </div>
        )}

        {data.status === 'idle' && data.agentId && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0" />
            <span className="italic leading-snug">{t('canvas.ready_to_execute')}</span>
          </div>
        )}

        {data.status === 'running' && (
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <div
                className="h-full w-full rounded-full animate-pulse"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, var(--dome-accent) 50%, transparent 100%)',
                }}
              />
            </div>
            <p className="text-xs leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
              {t('canvas.processing')}
            </p>
            {data.outputText && (
              <p className="text-xs line-clamp-3 mt-0.5 leading-snug" style={{ color: 'var(--dome-text-secondary)' }}>
                {data.outputText}
              </p>
            )}
          </div>
        )}

        {data.status === 'done' && data.outputText && (
          <p className="text-xs line-clamp-4 leading-snug" style={{ color: 'var(--dome-text-secondary)', lineHeight: 1.45 }}>
            {data.outputText}
          </p>
        )}

        {data.status === 'error' && (
          <p className="text-xs leading-snug" style={{ color: 'var(--error)' }}>
            {data.errorMessage ?? t('canvas.unknown_error')}
          </p>
        )}
      </div>
    </div>
  );
}
