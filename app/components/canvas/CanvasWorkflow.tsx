import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Connection,
  type NodeTypes,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, Save, Trash2, RotateCcw, ArrowLeft, LayoutGrid } from 'lucide-react';
import TextInputNode from './nodes/TextInputNode';
import ImageInputNode from './nodes/ImageInputNode';
import DocumentInputNode from './nodes/DocumentInputNode';
import AgentNodeComponent from './nodes/AgentNode';
import OutputNode from './nodes/OutputNode';
import CanvasToolbar from './CanvasToolbar';
import WorkflowTemplateModal from './WorkflowTemplateModal';
import type { CanvasNode, CanvasEdge, AgentNodeData } from '@/lib/canvas/types';
import { getAgentTeamById, updateAgentTeam } from '@/lib/agent-team/api';

const NODE_TYPES: NodeTypes = {
  textInput: TextInputNode,
  imageInput: ImageInputNode,
  documentInput: DocumentInputNode,
  agentNode: AgentNodeComponent,
  outputNode: OutputNode,
};

let idCounter = 0;
function getNodeId() {
  return `node_${Date.now()}_${idCounter++}`;
}

interface CanvasWorkflowProps {
  teamId: string;
  onBack: () => void;
}

export default function CanvasWorkflow({ teamId, onBack }: CanvasWorkflowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode['data']>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [teamName, setTeamName] = useState('Workflow');
  const [isRunning, setIsRunning] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      const team = await getAgentTeamById(teamId);
      if (!team) return;
      setTeamName(team.name);

      const meta = team as Record<string, unknown>;
      const savedNodes = meta.canvasNodes as CanvasNode[] | undefined;
      const savedEdges = meta.canvasEdges as CanvasEdge[] | undefined;

      if (savedNodes && savedNodes.length > 0) {
        setNodes(savedNodes);
        setEdges(savedEdges || []);
      }
    };
    loadTeam();
  }, [teamId, setNodes, setEdges]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, field, value } = (e as CustomEvent).detail;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    };
    window.addEventListener('canvas:node-data-change', handler);
    return () => window.removeEventListener('canvas:node-data-change', handler);
  }, [setNodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, resourceId: 'demo', resourceTitle: 'Recurso seleccionado', resourceType: 'note' } }
            : n
        )
      );
    };
    window.addEventListener('canvas:select-resource', handler);
    return () => window.removeEventListener('canvas:select-resource', handler);
  }, [setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: 'var(--dome-accent)', strokeWidth: 2 } }, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow-type');
      if (!type || !reactFlowInstance.current) return;

      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      const data = dataStr ? JSON.parse(dataStr) : {};

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: CanvasNode = {
        id: getNodeId(),
        type,
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleSave = useCallback(async () => {
    await updateAgentTeam(teamId, {
      canvasNodes: nodes,
      canvasEdges: edges,
    } as Record<string, unknown>);
  }, [teamId, nodes, edges]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    const agentNodes = nodes.filter((n) => n.type === 'agentNode');
    const outputNodes = nodes.filter((n) => n.type === 'outputNode');

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'outputNode') return { ...n, data: { ...n.data, status: 'waiting', content: '' } };
        if (n.type === 'agentNode') return { ...n, data: { ...n.data, status: 'idle', output: '' } };
        return n;
      })
    );

    const getInputsForNode = (nodeId: string): string[] => {
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      const inputs: string[] = [];
      for (const edge of incomingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) continue;
        if (sourceNode.type === 'textInput') {
          inputs.push((sourceNode.data as { text?: string }).text || '');
        } else if (sourceNode.type === 'documentInput') {
          const doc = sourceNode.data as { resourceTitle?: string; resourceId?: string };
          inputs.push(`[Documento: ${doc.resourceTitle || 'Sin título'}]`);
        } else if (sourceNode.type === 'imageInput') {
          const img = sourceNode.data as { fileName?: string };
          inputs.push(`[Imagen: ${img.fileName || 'Sin nombre'}]`);
        } else if (sourceNode.type === 'agentNode') {
          const agent = sourceNode.data as AgentNodeData;
          inputs.push(agent.output || '');
        }
      }
      return inputs;
    };

    const topologicalOrder = getExecutionOrder(nodes, edges);

    for (const nodeId of topologicalOrder) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || (node.type !== 'agentNode' && node.type !== 'outputNode')) continue;

      const inputs = getInputsForNode(nodeId);
      const combinedInput = inputs.filter(Boolean).join('\n\n---\n\n');

      if (node.type === 'agentNode') {
        setNodes((nds) =>
          nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: 'running' } } : n)
        );

        await new Promise((r) => setTimeout(r, 600));

        let output = '';
        try {
          const agentData = node.data as AgentNodeData;
          if (window.electron?.invoke) {
            output = await window.electron.invoke('ai:canvas:run-agent', {
              agentId: agentData.agentId,
              agentName: agentData.agentName,
              systemInstructions: agentData.systemInstructions || `You are ${agentData.agentName}. Process the input and provide a helpful response.`,
              input: combinedInput,
            });
          } else {
            output = `[Simulación] ${agentData.agentName} procesó: "${combinedInput.slice(0, 100)}..."`;
          }
        } catch (err) {
          output = `[Error] No se pudo ejecutar el agente: ${(err as Error).message}`;
        }

        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, status: 'done', output } } : n
          )
        );

        const currentNodes = [...nodes];
        const idx = currentNodes.findIndex((n) => n.id === nodeId);
        if (idx >= 0) {
          currentNodes[idx] = { ...currentNodes[idx], data: { ...currentNodes[idx].data, output } };
        }
        Object.assign(nodes[idx < 0 ? 0 : idx].data, { output });
      }

      if (node.type === 'outputNode') {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, content: combinedInput, status: 'done' } } : n
          )
        );
      }
    }

    setIsRunning(false);
  }, [nodes, edges, isRunning, setNodes]);

  const handleLoadTemplate = useCallback(
    (template: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => {
      setNodes(template.nodes);
      setEdges(template.edges);
      setShowTemplates(false);
    },
    [setNodes, setEdges]
  );

  const defaultEdgeOptions = useMemo(() => ({
    animated: true,
    style: { stroke: 'var(--dome-accent, #596037)', strokeWidth: 2 },
  }), []);

  return (
    <div className="canvas-workflow">
      {/* Header */}
      <div className="canvas-workflow__header">
        <div className="canvas-workflow__header-left">
          <button type="button" onClick={onBack} className="canvas-workflow__back-btn" title="Volver">
            <ArrowLeft size={18} />
          </button>
          <h2 className="canvas-workflow__title">{teamName}</h2>
        </div>
        <div className="canvas-workflow__header-actions">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="canvas-workflow__action-btn"
            title="Plantillas"
          >
            <LayoutGrid size={16} />
            <span>Plantillas</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="canvas-workflow__action-btn canvas-workflow__action-btn--danger"
            title="Limpiar canvas"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="canvas-workflow__action-btn"
            title="Guardar"
          >
            <Save size={16} />
            <span>Guardar</span>
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="canvas-workflow__run-btn"
            title="Ejecutar workflow"
          >
            {isRunning ? (
              <>
                <RotateCcw size={16} className="animate-spin" />
                <span>Ejecutando...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Ejecutar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="canvas-workflow__body">
        <CanvasToolbar />

        <div className="canvas-workflow__canvas" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onInit={(instance) => { reactFlowInstance.current = instance; }}
            nodeTypes={NODE_TYPES}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={['Backspace', 'Delete']}
            className="canvas-workflow__flow"
          >
            <Controls className="canvas-workflow__controls" />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--dome-text-muted)" style={{ opacity: 0.3 }} />
          </ReactFlow>
        </div>
      </div>

      {showTemplates && (
        <WorkflowTemplateModal
          onSelect={handleLoadTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}

function getExecutionOrder(nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    graph.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of graph.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return order;
}
