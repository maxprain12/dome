'use client';

import { useState, useEffect } from 'react';
import { Type, FileText, Image, Bot, Terminal, ChevronDown, ChevronRight, RefreshCw, Search, BookOpen, PenTool, BarChart2, Presentation, FolderKanban } from 'lucide-react';
import type { ManyAgent } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { generateId } from '@/lib/utils';
import type { CanvasNodeData, TextInputNodeData, DocumentNodeData, ImageNodeData, AgentNodeData, OutputNodeData, SystemAgentRole } from '@/types/canvas';
import { SYSTEM_AGENT_LIST } from '@/lib/agent-canvas/system-agents';
import type { Node } from 'reactflow';

const INPUT_NODES = [
  {
    type: 'text-input',
    label: 'Texto',
    description: 'Input de texto manual',
    color: 'var(--dome-accent)',
    bg: 'var(--dome-accent-bg)',
    icon: Type,
  },
  {
    type: 'document',
    label: 'Documento',
    description: 'Recurso de tu biblioteca',
    color: 'var(--success)',
    bg: 'var(--success-bg)',
    icon: FileText,
  },
  {
    type: 'image',
    label: 'Imagen',
    description: 'Imagen de tu biblioteca',
    color: 'var(--warning)',
    bg: 'var(--warning-bg)',
    icon: Image,
  },
];

interface CanvasSidebarProps {
  onAddNode: (node: Node<CanvasNodeData>) => void;
}

const SYSTEM_AGENT_ICONS: Record<SystemAgentRole, React.ElementType> = {
  research: Search,
  library: BookOpen,
  writer: PenTool,
  data: BarChart2,
  presenter: Presentation,
  curator: FolderKanban,
};

export default function CanvasSidebar({ onAddNode }: CanvasSidebarProps) {
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [systemAgentsExpanded, setSystemAgentsExpanded] = useState(true);
  const [inputsExpanded, setInputsExpanded] = useState(true);
  const [outputsExpanded, setOutputsExpanded] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const loadAgents = async () => {
    setLoadingAgents(true);
    const result = await getManyAgents();
    setAgents(result);
    setLoadingAgents(false);
  };

  useEffect(() => {
    loadAgents();
    const handler = () => loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, []);

  const createNode = (type: string, agentData?: ManyAgent, extra?: string): Node<CanvasNodeData> => {
    const id = generateId();
    const position = { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 };

    if (type === 'text-input') {
      return {
        id,
        type: 'textInput',
        position,
        data: { type: 'text-input', label: 'Texto de Entrada', value: '' } as TextInputNodeData,
      };
    }
    if (type === 'document') {
      return {
        id,
        type: 'document',
        position,
        data: { type: 'document', label: 'Documento', resourceId: null, resourceTitle: null, resourceContent: null } as DocumentNodeData,
      };
    }
    if (type === 'image') {
      return {
        id,
        type: 'image',
        position,
        data: { type: 'image', label: 'Imagen', resourceId: null, resourceTitle: null, resourceUrl: null } as ImageNodeData,
      };
    }
    if (type === 'agent' && agentData) {
      return {
        id,
        type: 'agent',
        position,
        data: {
          type: 'agent',
          label: agentData.name,
          agentId: agentData.id,
          agentName: agentData.name,
          agentIconIndex: agentData.iconIndex,
          status: 'idle',
          outputText: null,
          errorMessage: null,
        } as AgentNodeData,
      };
    }
    if (type === 'system-agent') {
      const sysRole = extra as SystemAgentRole;
      const sysAgent = SYSTEM_AGENT_LIST.find((a) => a.role === sysRole);
      return {
        id,
        type: 'agent',
        position,
        data: {
          type: 'agent',
          label: sysAgent?.name ?? 'System Agent',
          agentId: null,
          systemAgentRole: sysRole,
          agentName: sysAgent?.name ?? null,
          agentIconIndex: 0,
          status: 'idle',
          outputText: null,
          errorMessage: null,
        } as AgentNodeData,
      };
    }
    // output
    return {
      id,
      type: 'output',
      position,
      data: { type: 'output', label: 'Resultado', content: null, status: 'idle' } as OutputNodeData,
    };
  };

  const handleDragStart = (e: React.DragEvent, type: string, agent?: ManyAgent, systemRole?: SystemAgentRole) => {
    e.dataTransfer.setData('application/x-canvas-node-type', type);
    if (agent) {
      e.dataTransfer.setData('application/x-canvas-agent', JSON.stringify(agent));
    }
    if (systemRole) {
      e.dataTransfer.setData('application/x-canvas-system-role', systemRole);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  const NodeChip = ({
    icon: Icon,
    label,
    description,
    color,
    bg,
    onAdd,
    onDragStart,
  }: {
    icon: React.ElementType;
    label: string;
    description: string;
    color: string;
    bg: string;
    onAdd: () => void;
    onDragStart: (e: React.DragEvent) => void;
  }) => (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-md select-none"
      style={{
        background: bg,
        border: '1px solid var(--dome-border)',
      }}
      title={description}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: color }}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color }}>
          {label}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--dome-text-muted)' }}>
          {description}
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col h-full overflow-y-auto shrink-0"
      style={{
        width: 220,
        background: 'var(--dome-surface)',
        borderRight: '1px solid var(--dome-border)',
        scrollbarWidth: 'none',
      }}
    >
      {/* Inputs section */}
      <div className="p-3">
        <button
          onClick={() => setInputsExpanded((v) => !v)}
          className="w-full flex items-center gap-1.5 mb-2.5 text-left"
        >
          {inputsExpanded ? (
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          ) : (
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          )}
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            Inputs
          </span>
        </button>
        {inputsExpanded && (
          <div className="space-y-2">
            {INPUT_NODES.map((n) => (
              <NodeChip
                key={n.type}
                icon={n.icon}
                label={n.label}
                description={n.description}
                color={n.color}
                bg={n.bg}
                onAdd={() => onAddNode(createNode(n.type))}
                onDragStart={(e) => handleDragStart(e, n.type)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      {/* Output section */}
      <div className="p-3">
        <button
          onClick={() => setOutputsExpanded((v) => !v)}
          className="w-full flex items-center gap-1.5 mb-2.5 text-left"
        >
          {outputsExpanded ? (
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          ) : (
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          )}
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            Outputs
          </span>
        </button>
        {outputsExpanded && (
          <NodeChip
            icon={Terminal}
            label="Resultado"
            description="Muestra el output"
            color="var(--dome-accent)"
            bg="var(--dome-accent-bg)"
            onAdd={() => onAddNode(createNode('output'))}
            onDragStart={(e) => handleDragStart(e, 'output')}
          />
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      {/* Dome System Agents section */}
      <div className="p-3">
        <button
          onClick={() => setSystemAgentsExpanded((v) => !v)}
          className="w-full flex items-center gap-1.5 mb-2.5 text-left"
        >
          {systemAgentsExpanded ? (
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          ) : (
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
          )}
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            Dome Agents
          </span>
        </button>
        {systemAgentsExpanded && (
          <div className="space-y-2">
            {SYSTEM_AGENT_LIST.map((sysAgent) => {
              const RoleIcon = SYSTEM_AGENT_ICONS[sysAgent.role];
              return (
                <div
                  key={sysAgent.role}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'system-agent', undefined, sysAgent.role)}
                  onClick={() => onAddNode(createNode('system-agent', undefined, sysAgent.role))}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-md select-none"
                  style={{
                    background: sysAgent.bg,
                    border: `1px solid ${sysAgent.color}22`,
                  }}
                  title={sysAgent.description}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: sysAgent.color }}
                  >
                    <RoleIcon className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: sysAgent.color }}>
                      {sysAgent.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: `${sysAgent.color}99` }}>
                      {sysAgent.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      {/* Agents section */}
      <div className="p-3 flex-1">
        <div className="flex items-center gap-1.5 mb-2.5">
          <button
            onClick={() => setAgentsExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left flex-1"
          >
            {agentsExpanded ? (
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
            ) : (
              <ChevronRight className="w-3 h-3" style={{ color: 'var(--dome-text-muted)' }} />
            )}
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              Agentes
            </span>
          </button>
          <button
            onClick={loadAgents}
            className="p-1 rounded transition-colors hover:bg-[var(--dome-accent-bg)]"
            title="Recargar agentes"
          >
            <RefreshCw
              className={`w-3 h-3 ${loadingAgents ? 'animate-spin' : ''}`}
              style={{ color: 'var(--dome-text-muted)' }}
            />
          </button>
        </div>

        {agentsExpanded && (
          <div className="space-y-2">
            {agents.length === 0 && !loadingAgents ? (
              <p className="text-xs text-center py-4" style={{ color: 'var(--dome-text-muted)' }}>
                No tienes agentes.<br />Crea uno primero.
              </p>
            ) : (
              agents.map((agent) => (
                <div
                  key={agent.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'agent', agent)}
                  onClick={() => onAddNode(createNode('agent', agent))}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-md select-none"
                  style={{
                    background: 'var(--dome-accent-bg)',
                    border: '1px solid rgba(89, 96, 55, 0.2)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: 'var(--dome-accent)' }}
                  >
                    {agent.iconIndex > 0 ? (
                      <img
                        src={`/agents/sprite_${agent.iconIndex}.png`}
                        alt={agent.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--dome-accent)' }}>
                      {agent.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--dome-text-secondary)' }}>
                      {agent.description.slice(0, 32)}...
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
