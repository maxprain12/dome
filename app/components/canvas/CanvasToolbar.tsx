import { memo, useState, useEffect, useCallback } from 'react';
import { Type, ImageIcon, FileText, Bot, SquareTerminal, ChevronDown, ChevronRight } from 'lucide-react';
import { getManyAgents } from '@/lib/agents/api';
import type { ManyAgent } from '@/types';

interface DragItem {
  type: string;
  label: string;
  icon: React.ReactNode;
  data?: Record<string, unknown>;
}

const INPUT_BLOCKS: DragItem[] = [
  {
    type: 'textInput',
    label: 'Texto',
    icon: <Type size={16} />,
    data: { label: 'Text Input', text: '' },
  },
  {
    type: 'imageInput',
    label: 'Imagen',
    icon: <ImageIcon size={16} />,
    data: { label: 'Image', imageUrl: '', fileName: '' },
  },
  {
    type: 'documentInput',
    label: 'Documento',
    icon: <FileText size={16} />,
    data: { label: 'Document', resourceId: '', resourceTitle: 'Seleccionar...', resourceType: '' },
  },
];

const OUTPUT_BLOCKS: DragItem[] = [
  {
    type: 'outputNode',
    label: 'Output',
    icon: <SquareTerminal size={16} />,
    data: { label: 'Output', content: '', status: 'idle' },
  },
];

function DraggableBlock({ item }: { item: DragItem }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow-type', item.type);
    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(item.data || {}));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="canvas-toolbar__block"
      draggable
      onDragStart={onDragStart}
    >
      <div className="canvas-toolbar__block-icon">{item.icon}</div>
      <span className="canvas-toolbar__block-label">{item.label}</span>
    </div>
  );
}

function DraggableAgent({ agent }: { agent: ManyAgent }) {
  const iconSrc = agent.iconIndex != null
    ? `/agents/sprite_${agent.iconIndex}.png`
    : undefined;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow-type', 'agentNode');
    e.dataTransfer.setData('application/reactflow-data', JSON.stringify({
      label: agent.name,
      agentId: agent.id,
      agentName: agent.name,
      agentIcon: agent.iconIndex,
      systemInstructions: agent.systemInstructions,
      status: 'idle',
      output: '',
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="canvas-toolbar__agent"
      draggable
      onDragStart={onDragStart}
    >
      <div className="canvas-toolbar__agent-icon">
        {iconSrc ? (
          <img src={iconSrc} alt={agent.name} className="w-6 h-6 rounded-full" />
        ) : (
          <Bot size={16} />
        )}
      </div>
      <div className="canvas-toolbar__agent-info">
        <span className="canvas-toolbar__agent-name">{agent.name}</span>
        {agent.description && (
          <span className="canvas-toolbar__agent-desc">{agent.description.slice(0, 50)}</span>
        )}
      </div>
    </div>
  );
}

function CanvasToolbar() {
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [inputsOpen, setInputsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [outputsOpen, setOutputsOpen] = useState(true);

  const loadAgents = useCallback(async () => {
    const list = await getManyAgents();
    setAgents(list);
  }, []);

  useEffect(() => {
    loadAgents();
    const handler = () => loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [loadAgents]);

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar__header">
        <h3>Bloques</h3>
        <p>Arrastra al canvas</p>
      </div>

      <div className="canvas-toolbar__sections">
        {/* Input Blocks */}
        <div className="canvas-toolbar__section">
          <button
            type="button"
            className="canvas-toolbar__section-title"
            onClick={() => setInputsOpen(!inputsOpen)}
          >
            {inputsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Inputs</span>
          </button>
          {inputsOpen && (
            <div className="canvas-toolbar__section-content">
              {INPUT_BLOCKS.map((item) => (
                <DraggableBlock key={item.type} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Agent Blocks */}
        <div className="canvas-toolbar__section">
          <button
            type="button"
            className="canvas-toolbar__section-title"
            onClick={() => setAgentsOpen(!agentsOpen)}
          >
            {agentsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Agentes ({agents.length})</span>
          </button>
          {agentsOpen && (
            <div className="canvas-toolbar__section-content">
              {agents.length === 0 ? (
                <p className="canvas-toolbar__empty">
                  Crea agentes en la sección de Agentes para usarlos aquí.
                </p>
              ) : (
                agents.map((agent) => (
                  <DraggableAgent key={agent.id} agent={agent} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Output Blocks */}
        <div className="canvas-toolbar__section">
          <button
            type="button"
            className="canvas-toolbar__section-title"
            onClick={() => setOutputsOpen(!outputsOpen)}
          >
            {outputsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Outputs</span>
          </button>
          {outputsOpen && (
            <div className="canvas-toolbar__section-content">
              {OUTPUT_BLOCKS.map((item) => (
                <DraggableBlock key={item.type} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(CanvasToolbar);
