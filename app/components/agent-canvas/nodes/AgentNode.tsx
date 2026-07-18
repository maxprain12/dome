'use client';

import { useState, useRef } from 'react';
import {
  BotIcon as BotIcon,
  Loading03Icon as Loader2Icon,
  CheckmarkCircle02Icon as CheckCircle2Icon,
  AlertCircleIcon as AlertCircleIcon,
  ChevronRightIcon as ChevronRightIcon,
  Search01Icon as SearchIcon,
  BookOpen01Icon as BookOpenIcon,
  PenTool03Icon as PenToolIcon,
  BarChartIcon as BarChart2Icon,
  Presentation01Icon as PresentationIcon,
  FolderKanbanIcon as FolderKanbanIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import type { AgentNodeData, SystemAgentRole } from '@/types/canvas';
import { SYSTEM_AGENTS } from '@/lib/agent-canvas/system-agents';
import { canvasSystemAgentDescKey } from '@/lib/agent-canvas/canvas-layout';

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

const SYSTEM_ROLE_ICONS: Record<SystemAgentRole, React.ElementType> = {
  research: Search,
  library: BookOpen,
  writer: PenTool,
  data: BarChart2,
  presenter: Presentation,
  curator: FolderKanban,
};

const STATUS_COLORS = {
  idle: { header: 'var(--background)', textColor: 'var(--primary)' },
  running: { header: 'color-mix(in srgb, var(--primary) 12%, transparent)', textColor: 'var(--primary)' },
  done: { header: 'var(--success-bg)', textColor: 'var(--success)' },
  error: { header: 'color-mix(in srgb, var(--destructive) 12%, transparent)', textColor: 'var(--destructive)' },
};

function AgentNodeStatusIcon({
  status,
  systemColor,
}: {
  status: AgentNodeData['status'];
  systemColor: string;
}) {
  switch (status) {
    case 'running':
      return <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" style={{ color: systemColor }} />;
    case 'done':
      return <HugeiconsIcon icon={CheckCircle2Icon} className="size-3.5 text-[var(--success)]" />;
    case 'error':
      return <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 text-destructive" />;
    default:
      return null;
  }
}


function resolveNodeBorderColor(
  selected: boolean,
  isSystemAgent: boolean,
  systemDef: (typeof SYSTEM_AGENTS)[SystemAgentRole] | null | undefined,
): string {
  if (selected && isSystemAgent && systemDef) return systemDef.color;
  if (selected) return 'var(--primary)';
  return 'var(--border)';
}

function AgentNodeAvatar({
  isSystemAgent,
  RoleIcon,
  agentIconIndex,
  iconLoadFailed,
  agentName,
  agentInitials,
  onIconError,
}: {
  isSystemAgent: boolean;
  RoleIcon: React.ElementType | null;
  agentIconIndex: number;
  iconLoadFailed: boolean;
  agentName?: string;
  agentInitials: string;
  onIconError: () => void;
}) {
  if (isSystemAgent && RoleIcon) {
    return <RoleIcon className="size-3.5 text-white" />;
  }
  if (agentIconIndex > 0 && !iconLoadFailed) {
    return (
      <img
        src={`/agents/sprite_${agentIconIndex}.png`}
        alt={agentName ?? 'Agent'}
        className="size-full object-contain rounded-lg"
        onError={onIconError}
      />
    );
  }
  return <>{agentInitials}</>;
}

function AgentNodeSubtitle({
  isSystemAgent,
  systemDef,
  agentName,
  colors,
  systemBadge,
}: {
  isSystemAgent: boolean;
  systemDef: (typeof SYSTEM_AGENTS)[SystemAgentRole] | null | undefined;
  agentName?: string;
  colors: (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS];
  systemBadge: string;
}) {
  if (isSystemAgent && systemDef) {
    return (
      <span className="text-[10px] truncate block opacity-60 leading-tight" style={{ color: systemDef.color }}>
        {systemDef.emoji} {systemBadge}
      </span>
    );
  }
  if (agentName) {
    return (
      <span className="text-[10px] truncate block opacity-70 leading-tight" style={{ color: colors.textColor }}>
        {agentName}
      </span>
    );
  }
  return null;
}

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
  const agentIconKey = `${data.agentId ?? ''}:${data.agentIconIndex ?? ''}`;
  const prevAgentIconKeyRef = useRef(agentIconKey);
  if (agentIconKey !== prevAgentIconKeyRef.current) {
    prevAgentIconKeyRef.current = agentIconKey;
    setIconLoadFailed(false);
  }

  const isSystemAgent = !data.agentId && !!data.systemAgentRole;
  const systemDef = data.systemAgentRole ? SYSTEM_AGENTS[data.systemAgentRole] : null;
  const systemColor = systemDef?.color ?? 'var(--primary)';

  const agentInitials = data.agentName ? data.agentName.slice(0, 2).toUpperCase() : '?';

  const RoleIcon = data.systemAgentRole ? SYSTEM_ROLE_ICONS[data.systemAgentRole] : null;

  const systemDesc = data.systemAgentRole != null ? t(canvasSystemAgentDescKey(data.systemAgentRole)) : '';

  const headerBg =
    isSystemAgent && systemDef
      ? `color-mix(in srgb, ${systemDef.color} 10%, var(--background))`
      : colors.header;

  const borderColor = resolveNodeBorderColor(selected, isSystemAgent, systemDef);

  return (
    <div
      className="wf-node-card workflow-node-card rounded-xl overflow-hidden transition-[box-shadow,border-color]"
      style={{
        width: 220,
        border: `1px solid ${borderColor}`,
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${isSystemAgent && systemDef ? systemDef.color : 'var(--primary)'} 18%, transparent)`
          : 'none',
        background: 'var(--card)',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{
          background: headerBg,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="size-6 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
          style={{ background: systemColor }}
        >
          <AgentNodeAvatar
            isSystemAgent={isSystemAgent}
            RoleIcon={RoleIcon}
            agentIconIndex={data.agentIconIndex}
            iconLoadFailed={iconLoadFailed}
            agentName={data.agentName}
            agentInitials={agentInitials}
            onIconError={() => setIconLoadFailed(true)}
          />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-semibold leading-tight truncate block"
            style={{ color: isSystemAgent && systemDef ? systemDef.color : colors.textColor }}
          >
            {data.label}
          </span>
          <AgentNodeSubtitle
            isSystemAgent={isSystemAgent}
            systemDef={systemDef}
            agentName={data.agentName}
            colors={colors}
            systemBadge={t('canvas.system_agent_badge')}
          />
        </div>
        <AgentNodeStatusIcon status={data.status} systemColor={systemColor} />
      </div>

      <div className="p-3 min-h-[48px]">
        {data.status === 'idle' && !data.agentId && !data.systemAgentRole && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={BotIcon} className="size-4 opacity-40 shrink-0" />
            <span className="italic leading-snug">{t('canvas.no_agent_assigned')}</span>
          </div>
        )}
        {data.status === 'idle' && isSystemAgent && systemDef && data.systemAgentRole && (
          <div className="text-xs leading-snug" style={{ color: systemDef.color }}>
            <span className="opacity-70">{systemDesc}</span>
          </div>
        )}

        {data.status === 'idle' && data.agentId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={ChevronRightIcon} className="size-3.5 opacity-40 shrink-0" />
            <span className="italic leading-snug">{t('canvas.ready_to_execute')}</span>
          </div>
        )}

        {data.status === 'running' && (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 rounded-full overflow-hidden bg-background">
              <div
                className="size-full rounded-full animate-pulse"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, var(--primary) 50%, transparent 100%)',
                }}
              />
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              {t('canvas.processing')}
            </p>
            {data.outputText && (
              <p className="text-xs line-clamp-3 mt-0.5 leading-snug text-muted-foreground">
                {data.outputText}
              </p>
            )}
          </div>
        )}

        {data.status === 'done' && data.outputText && (
          <p className="text-xs line-clamp-4 leading-snug" style={{ color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
            {data.outputText}
          </p>
        )}

        {data.status === 'error' && (
          <p className="text-xs leading-snug text-destructive">
            {data.errorMessage ?? t('canvas.unknown_error')}
          </p>
        )}
      </div>
    </div>
  );
}
