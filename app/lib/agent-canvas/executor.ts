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
  CanvasNodePayload,
  CanvasResourceReference,
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
import { db } from '@/lib/db/client';
import { appendSkillsMarkdown } from '@/lib/skills/append-markdown';
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

  const processedCount = levels.reduce((total, level) => total + level.length, 0);
  if (processedCount !== nodes.length) {
    throw new Error('El workflow contiene ciclos o dependencias inválidas');
  }

  return levels;
}

function payloadToText(payload: CanvasNodePayload | undefined): string {
  return payload?.text ?? '';
}

/** Collect resolved payloads from nodes connected to a given target node. */
function getInputPayloads(
  targetNodeId: string,
  edges: Edge[],
  resolvedPayloads: Record<string, CanvasNodePayload>
): CanvasNodePayload[] {
  const incomingEdges = edges.filter((e) => e.target === targetNodeId);
  const payloads: CanvasNodePayload[] = [];

  for (const edge of incomingEdges) {
    const payload = resolvedPayloads[edge.source];
    if (payload) payloads.push(payload);
  }

  return payloads;
}

function mergePayloads(payloads: CanvasNodePayload[]): CanvasNodePayload {
  const resources = payloads.flatMap((payload) => payload.resources ?? []);
  const uniqueResources = resources.filter(
    (resource, index) =>
      resources.findIndex(
        (candidate) =>
          candidate.resourceId === resource.resourceId &&
          candidate.resourceType === resource.resourceType
      ) === index
  );

  return {
    kind: payloads.length > 1 ? 'bundle' : payloads[0]?.kind ?? 'text',
    text: payloads.map((payload) => payload.text).filter(Boolean).join('\n\n---\n\n'),
    resources: uniqueResources.length > 0 ? uniqueResources : undefined,
  };
}

function resourceReferenceToPromptBlock(resource: CanvasResourceReference): string {
  const parts = [
    `- Resource ID: ${resource.resourceId}`,
    `- Title: ${resource.resourceTitle}`,
    `- Type: ${resource.resourceType}`,
  ];

  if (resource.resourceUrl) {
    parts.push(`- URL/Preview: ${resource.resourceUrl}`);
  }
  if (resource.resourceContent) {
    parts.push(`- Content:\n${resource.resourceContent}`);
  }

  return parts.join('\n');
}

function buildAgentInputPayload(payloads: CanvasNodePayload[]): CanvasNodePayload {
  const merged = mergePayloads(payloads);
  if (!merged.resources || merged.resources.length === 0) {
    return merged;
  }

  const resourceBlock = merged.resources
    .map((resource) => resourceReferenceToPromptBlock(resource))
    .join('\n\n');

  return {
    ...merged,
    text: `${merged.text}\n\n## Connected Dome Resources\n${resourceBlock}`.trim(),
  };
}

/** Resolve the "output value" of a non-agent node (text-input, document, image). */
function resolveStaticNodeOutput(node: Node<CanvasNodeData>): CanvasNodePayload {
  const data = node.data;
  if (data.type === 'text-input') {
    return {
      kind: 'text',
      text: (data as TextInputNodeData).value ?? '',
    };
  }
  if (data.type === 'document') {
    const d = data as DocumentNodeData;
    const resolvedTitle = d.resourceTitle || 'Documento';
    const resource =
      d.resourceId
        ? ({
            resourceId: d.resourceId,
            resourceType: d.resourceType ?? 'document',
            resourceTitle: resolvedTitle,
            resourceContent: d.resourceContent,
            metadata: d.resourceMetadata ?? null,
          } satisfies CanvasResourceReference)
        : undefined;
    return {
      kind: resource ? 'resource' : 'text',
      text: d.resourceContent || (d.resourceId ? `[Documento: ${resolvedTitle}]` : ''),
      resources: resource ? [resource] : undefined,
    };
  }
  if (data.type === 'image') {
    const d = data as ImageNodeData;
    const resource =
      d.resourceId && d.resourceTitle
        ? ({
            resourceId: d.resourceId,
            resourceType: d.resourceType ?? 'image',
            resourceTitle: d.resourceTitle,
            resourceUrl: d.resourceUrl,
            metadata: d.resourceMetadata ?? null,
          } satisfies CanvasResourceReference)
        : undefined;
    return {
      kind: resource ? 'resource' : 'text',
      text: d.resourceTitle ? `[Imagen: ${d.resourceTitle}]` : '',
      resources: resource ? [resource] : undefined,
    };
  }
  return { kind: 'text', text: '' };
}

/** Execute a single agent node, streaming chunks back to the store. */
async function executeAgentNode(
  node: Node<CanvasNodeData>,
  edges: Edge[],
  resolvedPayloads: Record<string, CanvasNodePayload>,
  store: StoreActions,
  onLog: (entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>) => void
): Promise<CanvasNodePayload> {
  const agentData = node.data as AgentNodeData;

  const inputPayloads = getInputPayloads(node.id, edges, resolvedPayloads);
  const mergedInputPayload = buildAgentInputPayload(inputPayloads);
  const inputText = mergedInputPayload.text;
  if (!inputText.trim()) {
    const errMsg = 'No hay inputs conectados a este agente';
    store.updateNode(node.id, { status: 'error', errorMessage: errMsg } as Partial<AgentNodeData>);
    store.setNodeExecutionState(node.id, {
      nodeId: node.id,
      status: 'error',
      output: '',
      payload: mergedInputPayload,
      error: errMsg,
    });
    onLog({ nodeId: node.id, nodeLabel: agentData.label, message: errMsg, type: 'error' });
    throw new Error(errMsg);
  }

  // Resolve tools and system prompt
  let toolIds: string[] = [];
  let systemPrompt: string | undefined;
  let mcpServerIds: string[] = [];

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
    mcpServerIds = agent.mcpServerIds ?? [];
    if (agent.skillIds?.length && db.isAvailable()) {
      try {
        const res = await db.getAISkills();
        if (res.success && Array.isArray(res.data)) {
          systemPrompt = appendSkillsMarkdown(systemPrompt ?? '', agent.skillIds, res.data);
        }
      } catch {
        /* ignore */
      }
    }
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
      mcpServerIds,
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
          payload: {
            ...mergedInputPayload,
            kind: mergedInputPayload.resources?.length ? 'bundle' : 'text',
            text: agentOutput,
          },
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
        store.setNodeExecutionState(node.id, {
          nodeId: node.id,
          status: 'error',
          output: agentOutput,
          payload: {
            ...mergedInputPayload,
            kind: mergedInputPayload.resources?.length ? 'bundle' : 'text',
            text: agentOutput,
          },
          error: errMsg,
        });
        onLog({ nodeId: node.id, nodeLabel: agentData.label, message: errMsg, type: 'error' });
        throw new Error(errMsg);
      } else if (chunk.type === 'done') {
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    store.updateNode(node.id, { status: 'error', errorMessage: msg } as Partial<AgentNodeData>);
    store.setNodeExecutionState(node.id, {
      nodeId: node.id,
      status: 'error',
      output: agentOutput,
      payload: {
        ...mergedInputPayload,
        kind: mergedInputPayload.resources?.length ? 'bundle' : 'text',
        text: agentOutput,
      },
      error: msg,
    });
    onLog({ nodeId: node.id, nodeLabel: agentData.label, message: msg, type: 'error' });
    throw err;
  }

  store.updateNode(node.id, {
    status: 'done',
    outputText: agentOutput,
  } as Partial<AgentNodeData>);
  const outputPayload: CanvasNodePayload = {
    kind: mergedInputPayload.resources?.length ? 'bundle' : 'text',
    text: agentOutput,
    resources: mergedInputPayload.resources,
    metadata: {
      sourceNodeIds: inputPayloads.length,
    },
  };
  store.setNodeExecutionState(node.id, {
    nodeId: node.id,
    status: 'done',
    output: agentOutput,
    payload: outputPayload,
  });
  onLog({ nodeId: node.id, nodeLabel: agentData.label, message: 'Completado ✓', type: 'done' });

  return outputPayload;
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
  const resolvedPayloads: Record<string, CanvasNodePayload> = {};

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
            const payload = resolveStaticNodeOutput(node);
            resolvedPayloads[node.id] = payload;
            const label = node.data.label ?? 'Input';
            if (data.type === 'text-input') {
              const preview = (payload.text.length > 60 ? payload.text.slice(0, 60) + '...' : payload.text) || '(vacío)';
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
            const payload = mergePayloads(getInputPayloads(node.id, edges, resolvedPayloads));
            resolvedPayloads[node.id] = payload;
            store.updateNode(node.id, {
              content: payload.text,
              status: 'done',
            } as Partial<OutputNodeData>);
            store.setNodeExecutionState(node.id, {
              nodeId: node.id,
              status: 'done',
              output: payload.text,
              payload,
            } as NodeExecutionState);
            const preview = payload.text.length > 80 ? payload.text.slice(0, 80) + '...' : payload.text || '(vacío)';
            emit({ nodeId: node.id, nodeLabel: (node.data as OutputNodeData).label ?? 'Output', message: `Output: ${preview}`, type: 'info' });
            return;
          }

          if (data.type === 'agent') {
            try {
              const outputPayload = await executeAgentNode(node, edges, resolvedPayloads, store, emit);
              resolvedPayloads[node.id] = outputPayload;

              // Propagate to directly connected output nodes
              for (const edge of edges.filter((e) => e.source === node.id)) {
                const target = nodes.find((n) => n.id === edge.target);
                if (target?.data.type === 'output') {
                  store.updateNode(edge.target, {
                    content: outputPayload.text,
                    status: 'done',
                  } as Partial<OutputNodeData>);
                }
              }
            } catch {
              // Individual agent errors don't abort the whole workflow
              resolvedPayloads[node.id] = { kind: 'text', text: '' };
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
