'use client';

import { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Bot, Loader2, CheckCircle2, AlertCircle, ChevronRight, Search, BookOpen, PenTool, BarChart2 } from 'lucide-react';
import type { AgentNodeData, SystemAgentRole } from '@/types/canvas';
import { SYSTEM_AGENTS } from '@/lib/agent-canvas/system-agents';

const SYSTEM_ROLE_ICONS: Record<SystemAgentRole, React.ElementType> = {
  research: Search,
  library: BookOpen,
  writer: PenTool,
  data: BarChart2,
};

const STATUS_COLORS = {
  idle: { border: 'var(--dome-border)', glow: 'transparent', header: 'var(--dome-accent-bg)', headerBorder: 'var(--border)', textColor: 'var(--dome-accent)', dot: 'var(--dome-accent)' },
  running: { border: 'var(--dome-accent)', glow: 'var(--dome-accent-bg)', header: 'var(--dome-accent-bg)', headerBorder: 'var(--border)', textColor: 'var(--dome-accent)', dot: 'var(--dome-accent)' },
  done: { border: 'var(--success)', glow: 'var(--success-bg)', header: 'var(--success-bg)', headerBorder: 'var(--border)', textColor: 'var(--success)', dot: 'var(--success)' },
  error: { border: 'var(--error)', glow: 'var(--error-bg)', header: 'var(--error-bg)', headerBorder: 'var(--border)', textColor: 'var(--error)', dot: 'var(--error)' },
};

export default function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
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
        return <Loader2 className="w-3 h-3 animate-spin" style={{ color: systemColor }} />;
      case 'done':
        return <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />;
      case 'error':
        return <AlertCircle className="w-3 h-3" style={{ color: 'var(--error)' }} />;
      default:
        return null;
    }
  };

  const agentInitials = data.agentName
    ? data.agentName.slice(0, 2).toUpperCase()
    : '?';

  const RoleIcon = data.systemAgentRole ? SYSTEM_ROLE_ICONS[data.systemAgentRole] : null;

  return (
    <div
      className="rounded-xl shadow-sm transition-all"
      style={{
        width: 260,
        background: 'var(--dome-surface)',
        border: `1.5px solid ${selected ? 'var(--dome-accent)' : colors.border}`,
        boxShadow: selected
          ? '0 0 0 3px var(--dome-accent-bg)'
          : data.status !== 'idle'
          ? `0 0 0 3px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.06)`
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: systemColor,
          border: '2px solid white',
          boxShadow: `0 0 0 1px ${systemColor}`,
        }}
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: isSystemAgent && systemDef ? systemDef.bg : colors.header,
          borderBottom: `1px solid ${isSystemAgent && systemDef ? `${systemDef.color}30` : colors.headerBorder}`,
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0"
          style={{ background: systemColor }}
        >
          {isSystemAgent && RoleIcon ? (
            <RoleIcon className="w-3.5 h-3.5 text-white" />
          ) : data.agentIconIndex > 0 && !iconLoadFailed ? (
            <img
              src={`/agents/sprite_${data.agentIconIndex}.png`}
              alt={data.agentName ?? 'Agent'}
              className="w-full h-full object-contain rounded-md"
              onError={() => setIconLoadFailed(true)}
            />
          ) : (
            agentInitials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-semibold truncate block"
            style={{ color: isSystemAgent && systemDef ? systemDef.color : colors.textColor }}
          >
            {data.label}
          </span>
          {isSystemAgent && systemDef ? (
            <span className="text-xs truncate block opacity-60" style={{ color: systemDef.color }}>
              {systemDef.emoji} Sistema Dome
            </span>
          ) : data.agentName ? (
            <span className="text-xs truncate block opacity-70" style={{ color: colors.textColor }}>
              {data.agentName}
            </span>
          ) : null}
        </div>
        <StatusIcon />
      </div>

      {/* Body — shows output or placeholder */}
      <div className="p-3 min-h-[60px]">
        {data.status === 'idle' && !data.agentId && !data.systemAgentRole && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <Bot className="w-4 h-4 opacity-40" />
            <span className="italic">Sin agente asignado</span>
          </div>
        )}
        {data.status === 'idle' && isSystemAgent && systemDef && (
          <div className="flex items-center gap-2 text-xs" style={{ color: systemDef.color }}>
            <span className="opacity-60">{systemDef.description}</span>
          </div>
        )}

        {data.status === 'idle' && data.agentId && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <ChevronRight className="w-3.5 h-3.5 opacity-40" />
            <span className="italic">Listo para ejecutar</span>
          </div>
        )}

        {data.status === 'running' && (
          <div className="space-y-1.5">
            <div
              className="h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--dome-bg)' }}
        >
          <div
            className="h-full rounded-full animate-pulse"
            style={{ width: '60%', background: 'var(--dome-accent)' }}
          />
            </div>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Procesando...
            </p>
            {data.outputText && (
              <p
                className="text-xs line-clamp-3 mt-1"
                style={{ color: 'var(--dome-text-secondary)' }}
              >
                {data.outputText}
              </p>
            )}
          </div>
        )}

        {data.status === 'done' && data.outputText && (
          <p
            className="text-xs line-clamp-4"
            style={{ color: 'var(--dome-text-secondary)', lineHeight: 1.6 }}
          >
            {data.outputText}
          </p>
        )}

        {data.status === 'error' && (
          <p className="text-xs" style={{ color: 'var(--error)' }}>
            {data.errorMessage ?? 'Error desconocido'}
          </p>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: systemColor,
          border: '2px solid white',
          boxShadow: `0 0 0 1px ${systemColor}`,
        }}
      />
    </div>
  );
}
