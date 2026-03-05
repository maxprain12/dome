/**
 * Canvas Workflow Executor
 *
 * Performs a level-based topological sort to group nodes by execution level,
 * then executes each level in parallel using Promise.all.
 *
 * Agent nodes use chatWithToolsStream (via LangGraph) with correct chunk handling.
 * Supports both user-defined ManyAgents and built-in SystemAgents.
 */

import type { Node, Edge } from 'reactflow';
import type {
  CanvasNodeData,
  AgentNodeData,
  TextInputNodeData,
  DocumentNodeData,
  ImageNodeData,
  OutputNodeData,
  NodeExecutionState,
  ExecutionLogEntry,
} from '@/types/canvas';
import { chatWithToolsStream } from '@/lib/ai/client';
import { createToolsForAgent } from '@/lib/ai/tools';
import { getManyAgentById } from '@/lib/agents/api';
import { getSystemAgent } from './system-agents';
import type { useCanvasStore } from '@/lib/store/useCanvasStore';

type StoreActions = ReturnType<typeof import('@/lib/store/useCanvasStore').useCanvasStore.getState>;

export type { ExecutionLogEntry };

/**
 * Level-based topological sort.
 * Returns an array of levels; each level is an array of nodes that can run in parallel.
 */
function topologicalLevels(nodes: Node[], edges: Edge[]): Node[][] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }

  for (const edge of edges) {
    adjacency[edge.source]?.push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] ?? 0) + 1;
  }

  const levels: Node[][] = [];
  let currentLevel = nodes.filter((n) => inDegree[n.id] === 0);

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: Node[] = [];
    for (const node of currentLevel) {
      for (const neighborId of (adjacency[node.id] ?? [])) {
        inDegree[neighborId] = (inDegree[neighborId] ?? 1) - 1;
        if (inDegree[neighborId] === 0) {
          const neighbor = nodes.find((n) => n.id === neighborId);
          if (neighbor) nextLevel.push(neighbor);
        }
      }
    }
    currentLevel = nextLevel;
  }

  return levels;
}

/** Collect resolved text values from nodes connected to a given target node. */
function getInputValues(
  targetNodeId: string,
  edges: Edge[],
  resolvedOutputs: Record<string, string>
): string {
  const incomingEdges = edges.filter((e) => e.target === targetNodeId);
  const parts: string[] = [];

  for (const edge of incomingEdges) {
    const value = resolvedOutputs[edge.source];
    if (value) parts.push(value);
  }

  return parts.join('\n\n---\n\n');
}

/** Resolve the "output value" of a non-agent node (text-input, document, image). */
function resolveStaticNodeOutput(node: Node<CanvasNodeData>): string {
  const data = node.data;
  if (data.type === 'text-input') {
    return (data as TextInputNodeData).value ?? '';
  }
  if (data.type === 'document') {
    const d = data as DocumentNodeData;
    if (d.resourceContent) return d.resourceContent;
    if (d.resourceTitle) return `[Documento: ${d.resourceTitle}]`;
    return '';
  }
  if (data.type === 'image') {
    const d = data as ImageNodeData;
    return d.resourceTitle ? `[Imagen: ${d.resourceTitle}]` : '';
  }
  return '';
}

/** Execute a single agent node, streaming chunks back to the store. */
async function executeAgentNode(
  node: Node<CanvasNodeData>,
  edges: Edge[],
  resolvedOutputs: Record<string, string>,
  store: StoreActions,
  onLog: (entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>) => void
): Promise<string> {
  const agentData = node.data as AgentNodeData;

  const inputText = getInputValues(node.id, edges, resolvedOutputs);
  if (!inputText.trim()) {
    const errMsg = 'No hay inputs conectados a este agente';
    store.updateNode(node.id, { status: 'error', errorMessage: errMsg } as Partial<AgentNodeData>);
    store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'error', output: '', error: errMsg });
    onLog({ nodeId: node.id, nodeLabel: agentData.label, message: errMsg, type: 'error' });
    throw new Error(errMsg);
  }

  // Resolve tools and system prompt
  let toolIds: string[] = [];
  let systemPrompt: string | undefined;

  if (agentData.agentId) {
    // User-defined ManyAgent
    const agent = await getManyAgentById(agentData.agentId);
    if (!agent) {
      const errMsg = `Agente "${agentData.agentName ?? agentData.agentId}" no encontrado`;
      store.updateNode(node.id, { status: 'error', errorMessage: errMsg } as Partial<AgentNodeData>);
      store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'error', output: '', error: errMsg });
      onLog({ nodeId: node.id, nodeLabel: agentData.label, message: errMsg, type: 'error' });
      throw new Error(errMsg);
    }
    toolIds = agent.toolIds ?? [];
    systemPrompt = agent.systemInstructions || undefined;
  } else if (agentData.systemAgentRole) {
    // Built-in system agent
    const sysAgent = getSystemAgent(agentData.systemAgentRole);
    toolIds = sysAgent.toolIds;
    systemPrompt = sysAgent.systemPrompt;
  } else {
    // No agent at all — run without tools
    onLog({ nodeId: node.id, nodeLabel: agentData.label, message: 'Sin agente asignado — ejecutando sin herramientas', type: 'info' });
  }

  const tools = createToolsForAgent(toolIds);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: inputText });

  store.updateNode(node.id, {
    status: 'running',
    outputText: '',
    errorMessage: null,
  } as Partial<AgentNodeData>);
  store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'running', output: '' });
  onLog({ nodeId: node.id, nodeLabel: agentData.label, message: 'Iniciando...', type: 'info' });

  let agentOutput = '';

  try {
    const stream = chatWithToolsStream(messages, tools, {
      threadId: `canvas-${node.id}-${Date.now()}`,
      skipHitl: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        agentOutput += chunk.text;
        store.updateNode(node.id, {
          status: 'running',
          outputText: agentOutput,
        } as Partial<AgentNodeData>);
        store.setNodeExecutionState(node.id, {
          nodeId: node.id,
          status: 'running',
          output: agentOutput,
        });
      } else if (chunk.type === 'thinking' && chunk.text) {
        onLog({
          nodeId: node.id,
          nodeLabel: agentData.label,
          message: `💭 ${chunk.text.slice(0, 80)}${chunk.text.length > 80 ? '...' : ''}`,
          type: 'info',
        });
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        onLog({
          nodeId: node.id,
          nodeLabel: agentData.label,
          message: `🔧 ${chunk.toolCall.name}(${(chunk.toolCall.arguments ?? '{}').slice(0, 60)})`,
          type: 'tool_call',
        });
      } else if (chunk.type === 'error') {
        const errMsg = (chunk as { type: 'error'; error?: string }).error ?? 'Error del agente';
        store.updateNode(node.id, { status: 'error', errorMessage: errMsg } as Partial<AgentNodeData>);
        store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'error', output: agentOutput, error: errMsg });
        onLog({ nodeId: node.id, nodeLabel: agentData.label, message: errMsg, type: 'error' });
        throw new Error(errMsg);
      } else if (chunk.type === 'done') {
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    store.updateNode(node.id, { status: 'error', errorMessage: msg } as Partial<AgentNodeData>);
    store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'error', output: agentOutput, error: msg });
    onLog({ nodeId: node.id, nodeLabel: agentData.label, message: msg, type: 'error' });
    throw err;
  }

  store.updateNode(node.id, {
    status: 'done',
    outputText: agentOutput,
  } as Partial<AgentNodeData>);
  store.setNodeExecutionState(node.id, { nodeId: node.id, status: 'done', output: agentOutput });
  onLog({ nodeId: node.id, nodeLabel: agentData.label, message: 'Completado ✓', type: 'done' });

  return agentOutput;
}

export async function executeWorkflow(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  store: StoreActions,
  onLog?: (entry: ExecutionLogEntry) => void
): Promise<void> {
  store.setExecutionStatus('running');
  store.resetExecution();

  const levels = topologicalLevels(nodes, edges);
  const resolvedOutputs: Record<string, string> = {};

  let logCounter = 0;
  const emit = (entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>) => {
    if (!onLog) return;
    onLog({
      ...entry,
      id: `log-${++logCounter}`,
      timestamp: Date.now(),
    });
  };

  try {
    for (const level of levels) {
      // Process all nodes in this level in parallel
      await Promise.all(
        level.map(async (node) => {
          const data = node.data;

          if (data.type === 'text-input' || data.type === 'document' || data.type === 'image') {
            const value = resolveStaticNodeOutput(node);
            resolvedOutputs[node.id] = value;
            const label = node.data.label ?? 'Input';
            if (data.type === 'text-input') {
              const preview = (value.length > 60 ? value.slice(0, 60) + '...' : value) || '(vacío)';
              emit({ nodeId: node.id, nodeLabel: label, message: `Input de texto: ${preview}`, type: 'info' });
            } else if (data.type === 'document') {
              const d = data as DocumentNodeData;
              emit({ nodeId: node.id, nodeLabel: label, message: `Documento: ${d.resourceTitle ?? '(sin seleccionar)'}`, type: 'info' });
            } else if (data.type === 'image') {
              const d = data as ImageNodeData;
              emit({ nodeId: node.id, nodeLabel: label, message: `Imagen: ${d.resourceTitle ?? '(sin seleccionar)'}`, type: 'info' });
            }
            return;
          }

          if (data.type === 'output') {
            const inputText = getInputValues(node.id, edges, resolvedOutputs);
            resolvedOutputs[node.id] = inputText;
            store.updateNode(node.id, {
              content: inputText,
              status: 'done',
            } as Partial<OutputNodeData>);
            store.setNodeExecutionState(node.id, {
              nodeId: node.id,
              status: 'done',
              output: inputText,
            } as NodeExecutionState);
            const preview = inputText.length > 80 ? inputText.slice(0, 80) + '...' : inputText || '(vacío)';
            emit({ nodeId: node.id, nodeLabel: (node.data as OutputNodeData).label ?? 'Output', message: `Output: ${preview}`, type: 'info' });
            return;
          }

          if (data.type === 'agent') {
            try {
              const output = await executeAgentNode(node, edges, resolvedOutputs, store, emit);
              resolvedOutputs[node.id] = output;

              // Propagate to directly connected output nodes
              for (const edge of edges.filter((e) => e.source === node.id)) {
                const target = nodes.find((n) => n.id === edge.target);
                if (target?.data.type === 'output') {
                  store.updateNode(edge.target, {
                    content: output,
                    status: 'done',
                  } as Partial<OutputNodeData>);
                }
              }
            } catch {
              // Individual agent errors don't abort the whole workflow
              resolvedOutputs[node.id] = '';
            }
          }
        })
      );
    }

    store.setExecutionStatus('done');
  } catch (err) {
    store.setExecutionStatus('error');
    throw err;
  }
}
