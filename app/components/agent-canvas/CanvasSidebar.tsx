'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Type,
  FileText,
  Image,
  Bot,
  Terminal,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  BookOpen,
  PenTool,
  BarChart2,
  Presentation,
  FolderKanban,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ManyAgent } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import { useAppStore } from '@/lib/store/useAppStore';
import { generateId } from '@/lib/utils';
import type {
  CanvasNodeData,
  TextInputNodeData,
  DocumentNodeData,
  ImageNodeData,
  AgentNodeData,
  OutputNodeData,
  SystemAgentRole,
} from '@/types/canvas';
import { SYSTEM_AGENT_LIST } from '@/lib/agent-canvas/system-agents';
import {
  CANVAS_PALETTE_WIDTH_PX,
  canvasSystemAgentNameKey,
  canvasSystemAgentDescKey,
} from '@/lib/agent-canvas/canvas-layout';
import type { Node } from 'reactflow';

const INPUT_NODE_CONFIG = [
  {
    type: 'text-input' as const,
    color: 'var(--dome-accent)',
    icon: Type,
    labelKey: 'canvas.input_text_label',
    descKey: 'canvas.input_text_desc',
  },
  {
    type: 'document' as const,
    color: 'var(--success)',
    icon: FileText,
    labelKey: 'canvas.input_document_label',
    descKey: 'canvas.input_document_desc',
  },
  {
    type: 'image' as const,
    color: 'var(--warning)',
    icon: Image,
    labelKey: 'canvas.input_image_label',
    descKey: 'canvas.input_image_desc',
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
  const { t } = useTranslation();
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [agentQuery, setAgentQuery] = useState('');
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [systemAgentsExpanded, setSystemAgentsExpanded] = useState(true);
  const [inputsExpanded, setInputsExpanded] = useState(true);
  const [outputsExpanded, setOutputsExpanded] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const loadAgents = async () => {
    setLoadingAgents(true);
    const result = await getManyAgents(hubProjectId);
    setAgents(result);
    setLoadingAgents(false);
  };

  useEffect(() => {
    void loadAgents();
    const handler = () => void loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [hubProjectId]);

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || (a.description && a.description.toLowerCase().includes(q))
    );
  }, [agents, agentQuery]);

  const createNode = (type: string, agentData?: ManyAgent, extra?: string): Node<CanvasNodeData> => {
    const id = generateId();
    const position = { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 };

    if (type === 'text-input') {
      return {
        id,
        type: 'textInput',
        position,
        data: {
          type: 'text-input',
          label: t('canvas.default_text_input_label'),
          value: '',
        } as TextInputNodeData,
      };
    }
    if (type === 'document') {
      return {
        id,
        type: 'document',
        position,
        data: {
          type: 'document',
          label: t('canvas.default_document_label'),
          resourceId: null,
          resourceTitle: null,
          resourceContent: null,
        } as DocumentNodeData,
      };
    }
    if (type === 'image') {
      return {
        id,
        type: 'image',
        position,
        data: {
          type: 'image',
          label: t('canvas.default_image_label'),
          resourceId: null,
          resourceTitle: null,
          resourceUrl: null,
        } as ImageNodeData,
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
      const sysName = t(canvasSystemAgentNameKey(sysRole));
      return {
        id,
        type: 'agent',
        position,
        data: {
          type: 'agent',
          label: sysName,
          agentId: null,
          systemAgentRole: sysRole,
          agentName: sysName,
          agentIconIndex: 0,
          status: 'idle',
          outputText: null,
          errorMessage: null,
        } as AgentNodeData,
      };
    }
    return {
      id,
      type: 'output',
      position,
      data: {
        type: 'output',
        label: t('canvas.default_output_label'),
        content: null,
        status: 'idle',
      } as OutputNodeData,
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

  const SectionHeader = ({
    expanded,
    onToggle,
    label,
  }: {
    expanded: boolean;
    onToggle: () => void;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 mb-2 text-left"
    >
      {expanded ? (
        <ChevronDown className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
      ) : (
        <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
      )}
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
        {label}
      </span>
    </button>
  );

  const PaletteRow = ({
    icon: Icon,
    label,
    description,
    color,
    onAdd,
    onDragStart,
    title,
  }: {
    icon: React.ElementType;
    label: string;
    description: string;
    color: string;
    onAdd: () => void;
    onDragStart: (e: React.DragEvent) => void;
    title?: string;
  }) => (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)]"
      title={title ?? description}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: color }}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-tight" style={{ color: 'var(--dome-text)' }}>
          {label}
        </p>
        <p className="text-[11px] truncate leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
          {description}
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col h-full overflow-y-auto shrink-0"
      style={{
        width: CANVAS_PALETTE_WIDTH_PX,
        background: 'var(--dome-surface)',
        borderRight: '1px solid var(--dome-border)',
        scrollbarWidth: 'none',
      }}
    >
      <div className="px-3 pt-3 pb-2">
        <SectionHeader
          expanded={inputsExpanded}
          onToggle={() => setInputsExpanded((v) => !v)}
          label={t('canvas.palette_inputs')}
        />
        {inputsExpanded && (
          <div className="space-y-2">
            {INPUT_NODE_CONFIG.map((n) => (
              <PaletteRow
                key={n.type}
                icon={n.icon}
                label={t(n.labelKey)}
                description={t(n.descKey)}
                color={n.color}
                onAdd={() => onAddNode(createNode(n.type))}
                onDragStart={(e) => handleDragStart(e, n.type)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      <div className="px-3 py-3">
        <SectionHeader
          expanded={outputsExpanded}
          onToggle={() => setOutputsExpanded((v) => !v)}
          label={t('canvas.palette_outputs')}
        />
        {outputsExpanded && (
          <PaletteRow
            icon={Terminal}
            label={t('canvas.output_result_label')}
            description={t('canvas.output_result_desc')}
            color="var(--dome-accent)"
            onAdd={() => onAddNode(createNode('output'))}
            onDragStart={(e) => handleDragStart(e, 'output')}
          />
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      <div className="px-3 py-3">
        <SectionHeader
          expanded={systemAgentsExpanded}
          onToggle={() => setSystemAgentsExpanded((v) => !v)}
          label={t('canvas.palette_system_agents')}
        />
        {systemAgentsExpanded && (
          <div className="space-y-2">
            {SYSTEM_AGENT_LIST.map((sysAgent) => {
              const RoleIcon = SYSTEM_AGENT_ICONS[sysAgent.role];
              const name = t(canvasSystemAgentNameKey(sysAgent.role));
              const desc = t(canvasSystemAgentDescKey(sysAgent.role));
              return (
                <div
                  key={sysAgent.role}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'system-agent', undefined, sysAgent.role)}
                  onClick={() => onAddNode(createNode('system-agent', undefined, sysAgent.role))}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)]"
                  title={desc}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: sysAgent.color }}
                  >
                    <RoleIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate leading-tight" style={{ color: sysAgent.color }}>
                      {name}
                    </p>
                    <p className="text-[11px] truncate leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mx-3 h-px" style={{ background: 'var(--dome-border)' }} />

      <div className="px-3 py-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setAgentsExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left flex-1 min-w-0"
          >
            {agentsExpanded ? (
              <ChevronDown className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            )}
            <span className="text-[11px] font-semibold tracking-wide truncate" style={{ color: 'var(--dome-text-muted)' }}>
              {t('canvas.palette_my_agents')}
            </span>
          </button>
          <button
            type="button"
            onClick={loadAgents}
            className="p-1 rounded-md transition-colors hover:bg-[var(--dome-bg)] shrink-0"
            title={t('canvas.reload_agents')}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingAgents ? 'animate-spin' : ''}`}
              style={{ color: 'var(--dome-text-muted)' }}
            />
          </button>
        </div>

        {agentsExpanded && (
          <>
            <div className="relative mb-2">
              <Search
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                style={{ color: 'var(--dome-text-muted)' }}
              />
              <input
                type="search"
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                placeholder={t('canvas.palette_search_agents')}
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
                    <div
                      key={agent.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'agent', agent)}
                      onClick={() => onAddNode(createNode('agent', agent))}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)]"
                    >
                      <div
                        className="w-7 h-7 rounded-md overflow-hidden shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
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
                          <Bot className="w-3.5 h-3.5" />
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
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
