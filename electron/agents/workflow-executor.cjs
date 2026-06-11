/* eslint-disable no-console */
/**
 * Workflow DAG executor (04/T05 fase 2 — extracted from run-engine.cjs).
 * Runs a workflow's nodes level by level (topological order, parallel within
 * a level, per-node retry); each agent node goes through the harness via
 * agentRuntime. State persists through run-store; contexts live in
 * run-lifecycle. run-engine.cjs keeps the public API (startWorkflowRun).
 */

const agentRuntime = require('./agent-runtime.cjs');
const { parseRuntimeContext } = require('./agent-runtime-context.cjs');
const { getToolDefinitionsByIds, getAllToolDefinitions } = require('../tools/tool-dispatcher.cjs');
const { buildDomeSystemPrompt } = require('../prompts/system-prompt.cjs');
const logger = require('../core/logger.cjs');
const { notifyError } = require('../core/error-notify.cjs');
const runStore = require('./run-store.cjs');
const {
  createRun,
  patchRun,
  appendRunStep,
  updateRunStep,
  finalizeRunningRunSteps,
  getRun,
  createNoteResource,
  parseJsonSafely,
  toJson,
} = runStore;
const { topologicalLevels, mergePayloads, getInputPayloads } = require('./workflow-dag.cjs');
const { activeRunContexts, releaseRunContext } = require('./run-lifecycle.cjs');
const {
  isRunAbortedError,
  parseToolArguments,
  mergeLlmUsage,
  getToolStepPatch,
} = require('./run-helpers.cjs');

let _database = null;
/** @type {(projectId?: string) => any[]} */
let _loadManyAgents = () => [];

/** Wired by run-engine.init(). */
function init({ database, loadManyAgents }) {
  _database = database;
  _loadManyAgents = loadManyAgents;
}

function getQueries() {
  return _database?.getQueries?.();
}

function now() {
  return Date.now();
}

async function getProviderConfig(providerArg, modelArg) {
  const { resolveProviderConfig } = require('../ai/resolve-provider-config.cjs');
  return resolveProviderConfig(_database, providerArg, modelArg);
}

const SYSTEM_AGENTS = {
  research: {
    name: 'Research Agent',
    toolIds: ['web_search', 'web_fetch', 'deep_research'],
    systemPrompt: `You are an expert research agent. Your mission is to find, analyze, and synthesize high-quality information.
- Use web_search to locate up-to-date and relevant sources
- Cross-verify facts with multiple sources when possible
- Structure findings clearly with sections, key points, and citations
- Be thorough but concise: prioritize quality over quantity
- Always list the sources used at the end of your response`,
  },
  library: {
    name: 'Library Agent',
    toolIds: ['resource_hybrid_search', 'resource_get', 'resource_get_section', 'resource_list'],
    systemPrompt: `You are a library agent expert in personal knowledge management.
- Use resource_hybrid_search to find documents (combines text, semantics, and graph); then resource_get or resource_get_section as needed
- Analyze and connect concepts across different library resources
- Extract key ideas, important quotes, and patterns from documents
- Suggest connections between related materials
- Present information in a structured way, citing the specific resources used`,
  },
  writer: {
    name: 'Writer Agent',
    toolIds: ['resource_create', 'resource_update', 'docx_create', 'docx_update'],
    systemPrompt: `You are an expert writer agent specializing in creating clear, structured, high-quality content.
- Write clear, coherent, well-organized text
- Adapt tone and style to the context (academic, technical, creative, conversational)
- Use markdown for formatting: headings, lists, and emphasis
- Produce content that is ready to publish or use directly`,
  },
  data: {
    name: 'Data Agent',
    toolIds: ['excel_get', 'excel_set_cell', 'excel_set_range', 'excel_add_row', 'resource_get', 'resource_list'],
    systemPrompt: `You are a data analysis agent expert in processing and visualizing structured information.
- Analyze numeric data, tables, and records with precision
- Identify trends, patterns, and anomalies in data
- Present results using well-formatted markdown tables
- Suggest actionable insights based on the data analyzed`,
  },
  presenter: {
    name: 'Presenter Agent',
    toolIds: ['ppt_create', 'ppt_get_slides', 'resource_create', 'screen_understand'],
    systemPrompt: `You are an agent specialized in transforming information into high-quality visual materials.
- Create clear, structured presentations
- Adapt visual style and narrative to the target audience
- Save generated artifacts as resources when useful`,
  },
  curator: {
    name: 'Curator Agent',
    toolIds: ['get_related_resources', 'resource_hybrid_search', 'resource_list', 'flashcard_create', 'resource_create'],
    systemPrompt: `You are a curator agent expert in knowledge organization.
- Identify relationships between resources and concepts
- Suggest relevant connections
- Generate clear, actionable summaries`,
  },
};

function resourceReferenceToPromptBlock(resource) {
  const parts = [
    `- Resource ID: ${resource.resourceId}`,
    `- Title: ${resource.resourceTitle}`,
    `- Type: ${resource.resourceType}`,
  ];
  if (resource.resourceContent) {
    parts.push(`- Content:\n${resource.resourceContent}`);
  }
  if (resource.resourceUrl) {
    parts.push(`- URL: ${resource.resourceUrl}`);
  }
  return parts.join('\n');
}

function resolveStaticNodeOutput(node) {
  const data = node.data ?? {};
  if (data.type === 'text-input') {
    return {
      kind: 'text',
      text: String(data.value || ''),
    };
  }
  if (data.type === 'document') {
    if (!data.resourceId) {
      return { kind: 'text', text: '' };
    }
    return {
      kind: 'resource',
      text: resourceReferenceToPromptBlock({
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'document',
        resourceTitle: data.resourceTitle || 'Documento',
        resourceContent: data.resourceContent,
        metadata: data.resourceMetadata ?? null,
      }),
      resources: [{
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'document',
        resourceTitle: data.resourceTitle || 'Documento',
        resourceContent: data.resourceContent,
        metadata: data.resourceMetadata ?? null,
      }],
    };
  }
  if (data.type === 'image') {
    if (!data.resourceId) {
      return { kind: 'text', text: '' };
    }
    return {
      kind: 'resource',
      text: `- Resource ID: ${data.resourceId}\n- Title: ${data.resourceTitle || 'Imagen'}\n- Type: ${data.resourceType || 'image'}\n- URL: ${data.resourceUrl || ''}`,
      resources: [{
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'image',
        resourceTitle: data.resourceTitle || 'Imagen',
        resourceUrl: data.resourceUrl,
        metadata: data.resourceMetadata ?? null,
      }],
    };
  }
  return { kind: 'text', text: '' };
}

function resolveWorkflowAgent(nodeData, projectId = 'default') {
  if (nodeData.agentId) {
    const agent = _loadManyAgents(projectId).find((item) => item.id === nodeData.agentId);
    if (agent) {
      return {
        name: agent.name,
        toolIds: Array.isArray(agent.toolIds) ? agent.toolIds : [],
        mcpServerIds: Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : [],
        skillIds: Array.isArray(agent.skillIds) ? agent.skillIds : [],
        systemPrompt: agent.systemInstructions || agent.description || `You are ${agent.name}.`,
      };
    }
  }
  if (nodeData.systemAgentRole && SYSTEM_AGENTS[nodeData.systemAgentRole]) {
    const def = SYSTEM_AGENTS[nodeData.systemAgentRole];
    return {
      name: def.name,
      toolIds: def.toolIds,
      mcpServerIds: [],
      skillIds: [],
      systemPrompt: def.systemPrompt,
    };
  }
  return null;
}

function getWorkflowProgressMetadata(workflow, completedNodeIds) {
  const total = Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0;
  const completed = completedNodeIds.size;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

async function executeWorkflowRun(runId, params, workflow) {
  const context = activeRunContexts.get(runId);
  if (!context) return;
  const run = getRun(runId);
  const nodeOutputs = {};
  const completedNodeIds = new Set(
    Array.isArray(run?.metadata?.progress?.completedNodeIds) ? run.metadata.progress.completedNodeIds : [],
  );
  const syncWorkflowProgress = (nodeId) => {
    if (!nodeId || completedNodeIds.has(nodeId)) return;
    completedNodeIds.add(nodeId);
    patchRun(runId, {
      metadata: {
        progress: {
          ...getWorkflowProgressMetadata(workflow, completedNodeIds),
          completedNodeIds: [...completedNodeIds],
        },
      },
    });
  };
  let finalOutput = '';
  const workflowProviderConfig = await getProviderConfig(params.provider, params.model);
  let workflowLlmUsage = null;
  patchRun(runId, {
    status: 'running',
    metadata: {
      kind: 'workflow',
      workflowName: workflow.name,
      provider: workflowProviderConfig.provider,
      model: workflowProviderConfig.model,
      inputTemplate: params.inputTemplate ?? null,
    },
  });
  try {
    // Native DAG executor (replaces the former @langchain/langgraph StateGraph).
    // Nodes are sequenced by topological level and run through the Dome-native
    // harness; there is no LangGraph dependency in the agent/workflow path.
    const wfNodes = workflow.nodes || [];
    const wfEdges = workflow.edges || [];
    const state = { payloads: {} };
    const nodeRunners = new Map();

    // Retry policy: up to 2 retries with exponential back-off for transient errors
    const wfRetryPolicy = {
      maxAttempts: 3,
      initialInterval: 500,
      backoffFactor: 2,
      jitter: 0.1,
      retryOn: (err) => {
        const msg = String(err?.message ?? '').toLowerCase();
        return (
          msg.includes('rate limit') ||
          msg.includes('timeout') ||
          msg.includes('network') ||
          msg.includes('econnreset') ||
          msg.includes('socket hang up')
        );
      },
    };

    for (const node of wfNodes) {
      nodeRunners.set(node.id, async (state) => {
        const data = node.data ?? {};
        if (data.type === 'text-input' || data.type === 'document' || data.type === 'image') {
          const output = resolveStaticNodeOutput(node);
          appendRunStep({
            runId,
            stepType: 'workflow_node',
            title: data.label || node.id,
            status: 'done',
            content: output.text.slice(0, 4000),
            metadata: { nodeId: node.id, nodeType: data.type },
          });
          syncWorkflowProgress(node.id);
          return { payloads: { [node.id]: output } };
        }
        if (data.type === 'output') {
          const inputPayloads = wfEdges
            .filter((e) => e.target === node.id)
            .map((e) => state.payloads[e.source])
            .filter(Boolean);
          const payload = mergePayloads(inputPayloads.length ? inputPayloads : [{ kind: 'text', text: '' }]);
          nodeOutputs[node.id] = payload;
          finalOutput = payload.text || finalOutput;
          patchRun(runId, { outputText: finalOutput });
          appendRunStep({
            runId,
            stepType: 'workflow_output',
            title: data.label || 'Output',
            status: 'done',
            content: payload.text.slice(0, 4000),
            metadata: { nodeId: node.id },
          });
          syncWorkflowProgress(node.id);
          return { payloads: { [node.id]: payload } };
        }
        if (data.type === 'agent') {
          if (context.controller?.signal?.aborted || !getRun(runId)) {
            return { payloads: { [node.id]: { kind: 'text', text: '' } } };
          }
          const agentDef = resolveWorkflowAgent(data, workflow.projectId ?? 'default');
          if (!agentDef) {
            appendRunStep({
              runId,
              stepType: 'workflow_node',
              title: data.label || 'Agente',
              status: 'failed',
              content: 'Agente no configurado',
              metadata: { nodeId: node.id },
            });
            syncWorkflowProgress(node.id);
            return { payloads: { [node.id]: { kind: 'text', text: '' } } };
          }
          const inputPayloads = wfEdges
            .filter((e) => e.target === node.id)
            .map((e) => state.payloads[e.source])
            .filter(Boolean);
          const inputPayload = mergePayloads(inputPayloads.length ? inputPayloads : [{ kind: 'text', text: '' }]);
          const userPrompt = [
            params.inputTemplate?.prompt ? String(params.inputTemplate.prompt) : null,
            inputPayload.text || '',
          ].filter(Boolean).join('\n\n');
          const toolDefinitions = data.agentId
            ? getAllToolDefinitions()
            : getToolDefinitionsByIds(agentDef.toolIds || []);
          const mcpServerIds = Array.isArray(agentDef.mcpServerIds)
            ? agentDef.mcpServerIds
            : (Array.isArray(params.inputTemplate?.mcpServerIds) ? params.inputTemplate.mcpServerIds : []);
          const nodeCtx = {
            fullResponse: '',
            fullThinking: '',
            toolStepIds: new Map(),
            toolSteps: new Map(),
            threadId: `${runId}_${node.id}`,
          };
          const nodeStep = appendRunStep({
            runId,
            stepType: 'workflow_agent',
            title: data.label || agentDef.name || 'Agente',
            status: 'running',
            metadata: { nodeId: node.id, agentId: data.agentId ?? null, systemAgentRole: data.systemAgentRole ?? null },
          });
          const systemContent = buildDomeSystemPrompt({
            staticPersona: agentDef.systemPrompt || '',
            includeDate: false,
            coreToolsMode: data.agentId ? 'full' : 'minimal',
          });
          let nodeError = null;
          try {
            // Workflow/automation agent node runs through the Dome-native
            // `@dome/agent-core` runtime.
            await agentRuntime.runAgent('workflows', {
              provider: workflowProviderConfig.provider,
              model: workflowProviderConfig.model,
              apiKey: workflowProviderConfig.apiKey,
              baseUrl: workflowProviderConfig.baseUrl,
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: userPrompt },
              ],
              toolDefinitions,
              useDirectTools: toolDefinitions.length > 0 || mcpServerIds.length > 0,
              mcpServerIds,
              signal: context.controller.signal,
              threadId: nodeCtx.threadId,
              skipHitl: true,
              automationProjectId: workflow.projectId ?? 'default',
              onChunk: (chunk) => {
                if (chunk.type === 'text' && chunk.text) {
                  nodeCtx.fullResponse += chunk.text;
                  patchRun(runId, { lastHeartbeatAt: now() });
                } else if (chunk.type === 'thinking' && chunk.text) {
                  nodeCtx.fullThinking += chunk.text;
                } else if (chunk.type === 'usage' && chunk.usage && chunk.cumulative) {
                  // Only sum the canonical per-node snapshot (one per node run) to
                  // avoid double counting the per-chunk incremental partials.
                  workflowLlmUsage = mergeLlmUsage(workflowLlmUsage, chunk.usage);
                } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                  const step = appendRunStep({
                    runId,
                    parentStepId: nodeStep?.id ?? null,
                    stepType: 'tool_call',
                    title: `${data.label || agentDef.name}: ${chunk.toolCall.name}`,
                    status: 'running',
                    metadata: {
                      nodeId: node.id,
                      toolCallId: chunk.toolCall.id,
                      arguments: parseToolArguments(chunk.toolCall.arguments),
                    },
                  });
                  if (step) {
                    nodeCtx.toolStepIds.set(chunk.toolCall.id, step.id);
                    nodeCtx.toolSteps.set(chunk.toolCall.id, step);
                  }
                  patchRun(runId, { lastHeartbeatAt: now() });
                } else if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
                  const stepId = nodeCtx.toolStepIds.get(chunk.toolCallId);
                  if (stepId) {
                    const existingStep = nodeCtx.toolSteps.get(chunk.toolCallId) ?? null;
                    const nextStep = updateRunStep(
                      stepId,
                      getToolStepPatch(chunk.toolCallId, chunk.result, { nodeId: node.id }),
                      existingStep,
                    );
                    if (nextStep) nodeCtx.toolSteps.set(chunk.toolCallId, nextStep);
                  }
                  patchRun(runId, { lastHeartbeatAt: now() });
                }
              },
            });
          } catch (err) {
            nodeError = err;
            throw err;
          } finally {
            const aborted = context.controller?.signal?.aborted
              || nodeError?.name === 'AbortError'
              || `${nodeError?.message || ''}`.toLowerCase().includes('abort');
            const terminal = aborted ? 'cancelled' : nodeError ? 'failed' : 'completed';
            finalizeRunningRunSteps(runId, terminal, nodeCtx);
            if (nodeStep && nodeStep.status === 'running') {
              updateRunStep(nodeStep.id, {
                status: aborted ? 'cancelled' : nodeError ? 'failed' : 'done',
                content: nodeError
                  ? (nodeError.message || String(nodeError))
                  : nodeCtx.fullResponse.slice(0, 8000),
                metadata: { nodeId: node.id, thinking: nodeCtx.fullThinking },
              }, nodeStep);
            }
          }
          syncWorkflowProgress(node.id);
          const outputPayload = {
            kind: inputPayload.resources?.length ? 'bundle' : 'text',
            text: nodeCtx.fullResponse,
            resources: inputPayload.resources,
          };
          nodeOutputs[node.id] = outputPayload;
          return { payloads: { [node.id]: outputPayload } };
        }
        // Unknown node type — pass through
        return { payloads: { [node.id]: { kind: 'text', text: '' } } };
      });
    }

    // Execute nodes in topological order. Nodes in the same level have no
    // dependency between them and run in parallel; each retries transient
    // failures per `wfRetryPolicy`. Upstream outputs accumulate in
    // `state.payloads`. (No checkpoint persistence: workflows do not replay
    // mid-graph across restarts.)
    const runNodeWithRetry = async (runner) => {
      let attempt = 0;
      for (;;) {
        try {
          return await runner(state);
        } catch (err) {
          attempt += 1;
          if (attempt >= wfRetryPolicy.maxAttempts || !wfRetryPolicy.retryOn(err)) throw err;
          const base = wfRetryPolicy.initialInterval * wfRetryPolicy.backoffFactor ** (attempt - 1);
          const delay = base + base * wfRetryPolicy.jitter * Math.random();
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    const levels = topologicalLevels(wfNodes, wfEdges);
    for (const level of levels) {
      if (context.controller?.signal?.aborted || !getRun(runId)) break;
      const results = await Promise.all(
        level.map((node) => runNodeWithRetry(nodeRunners.get(node.id))),
      );
      for (const result of results) {
        if (result?.payloads) Object.assign(state.payloads, result.payloads);
      }
    }

    let createdNote = null;
    const outputMode = params.outputMode || 'chat_only';
    if ((outputMode === 'note' || outputMode === 'mixed') && finalOutput.trim()) {
      const projectId = params.inputTemplate?.projectId || 'default';
      createdNote = createNoteResource(projectId, `${workflow.name} · ${new Date().toLocaleDateString('es-ES')}`, finalOutput, {
        workflowId: workflow.id,
        automationRunId: runId,
      });
    }
    if (createdNote) {
      const queries = getQueries();
      queries.createAutomationRunLink.run(
        crypto.randomUUID(),
        runId,
        'resource',
        createdNote.id,
        now(),
      );
    }
    finalizeRunningRunSteps(runId, 'completed', context);
    appendRunStep({
      runId,
      stepType: 'completion',
      title: 'Workflow completado',
      status: 'done',
      content: finalOutput.slice(0, 8000),
      metadata: {
        workflowId: workflow.id,
        createdNoteId: createdNote?.id ?? null,
        ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
      },
    });
    return patchRun(runId, {
      status: 'completed',
      outputText: finalOutput,
      summary: finalOutput.slice(0, 280) || `${workflow.name} completado`,
      finishedAt: now(),
      workflowExecutionId: runId,
      metadata: {
        kind: 'workflow',
        workflowName: workflow.name,
        provider: workflowProviderConfig.provider,
        model: workflowProviderConfig.model,
        progress: {
          ...getWorkflowProgressMetadata(workflow, completedNodeIds),
          completedNodeIds: [...completedNodeIds],
        },
        nodeOutputs,
        createdNoteId: createdNote?.id ?? null,
        ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
      },
    });
  } catch (error) {
    const aborted = isRunAbortedError(error, context.controller?.signal);
    if (getRun(runId)) {
      finalizeRunningRunSteps(runId, aborted ? 'cancelled' : 'failed', context);
      appendRunStep({
        runId,
        stepType: aborted ? 'cancelled' : 'error',
        title: aborted ? 'Workflow cancelado' : 'Workflow con error',
        status: aborted ? 'cancelled' : 'failed',
        content: error?.message || String(error),
        metadata: {
          workflowId: workflow.id,
          ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
        },
      });
      if (!aborted) {
        notifyError({
          scope: 'workflows',
          message: error?.message || String(error),
          runId,
          title: workflow?.title || workflow?.name || undefined,
        });
      }
      patchRun(runId, {
        status: aborted ? 'cancelled' : 'failed',
        error: aborted ? null : (error?.message || String(error)),
        finishedAt: now(),
        metadata: {
          provider: workflowProviderConfig.provider,
          model: workflowProviderConfig.model,
          progress: {
            ...getWorkflowProgressMetadata(workflow, completedNodeIds),
            completedNodeIds: [...completedNodeIds],
          },
          ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
        },
      });
    }
    return null;
  } finally {
    releaseRunContext(runId, { force: true });
  }
}

module.exports = {
  init,
  executeWorkflowRun,
  resolveWorkflowAgent,
  getWorkflowProgressMetadata,
  SYSTEM_AGENTS,
};
