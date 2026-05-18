/* eslint-disable no-console */

/**
 * Agent Team IPC Handler — LangGraph supervisor with subgraph nodes.
 *
 * Architecture (2.3 refactor):
 *   - Each member agent is a `createAgent` compiled graph → added as a
 *     subgraph node in a parent `StateGraph`.
 *   - The supervisor is also a `createAgent` graph whose delegation tools
 *     return `Command({ goto: memberId })`, causing the parent graph to
 *     route to the appropriate member subgraph.
 *   - After each member runs, an edge returns to the supervisor.
 *   - The team has ONE stable thread_id for the whole interaction.
 *   - The parent graph is compiled with `getDomeCheckpointer()` so the
 *     full team state is persisted across turns.
 *
 * The renderer expects this chunk shape on `ai:stream:chunk`:
 *   { streamId, chunk: '<text>' }                    — supervisor synthesis text
 *   { streamId, type: 'text', text, agentName: 'X' } — member text (status only)
 *   { streamId, type: 'tool_call'|'tool_result', ... [, agentName] }
 *   { streamId, agentName: 'X' }                     — switch UI to delegation/X
 *   { streamId, agentName: null }                    — switch UI to synthesis
 *   { streamId, done: true }                         — end of stream
 *   { streamId, error: '<msg>' }
 */

const { setMaxListeners } = require('events');
const { getDomeProviderBaseUrl } = require('../dome-provider-url.cjs');
const { createModelFromConfig, createLangChainToolsFromOpenAIDefinitions } = require('../langgraph-agent.cjs');
const { getToolDefinitionsByIds, executeToolInMain } = require('../tool-dispatcher.cjs');
const { getDomeCheckpointer } = require('../checkpointer.cjs');
const { buildSkillsMiddleware } = require('../skills/index.cjs');
const domeOauth = require('../dome-oauth.cjs');
const { buildDomeSystemPrompt } = require('../system-prompt.cjs');
const { readPrompt } = require('../prompts-loader.cjs');

const agentTeamAbortControllers = new Map();

const TEAM_SUPERVISOR_PROMPT_FALLBACK =
  'You are the supervisor of an Agent Team in Dome. Delegate tasks to your members and synthesize their work into a single coherent answer for the user.';

function getTeamSupervisorTemplate() {
  const txt = readPrompt('martin/team-supervisor.txt');
  return typeof txt === 'string' && txt.trim().length > 0
    ? txt
    : TEAM_SUPERVISOR_PROMPT_FALLBACK;
}

async function getAISettings(database) {
  const queries = database.getQueries();
  const provider = queries.getSetting.get('ai_provider')?.value || 'ollama';

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: queries.getSetting.get('ollama_api_key')?.value || undefined,
      model: queries.getSetting.get('ollama_model')?.value || 'llama3.2',
      baseUrl: queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434',
    };
  }

  if (provider === 'dome') {
    const session = await domeOauth.getOrRefreshSession(database);
    return {
      provider: 'dome',
      apiKey: session?.accessToken,
      model: queries.getSetting.get('ai_model')?.value || 'dome/auto',
      baseUrl: `${getDomeProviderBaseUrl()}/api/v1`,
    };
  }

  return {
    provider,
    apiKey: queries.getSetting.get('ai_api_key')?.value,
    model: queries.getSetting.get('ai_model')?.value,
    baseUrl: undefined,
  };
}

function loadAgents(database, projectId = 'default') {
  try {
    const queries = database.getQueries();
    const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
    const rows = queries.listManyAgents?.all?.(pid) ?? [];
    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        systemInstructions: row.system_instructions || '',
        toolIds: row.tool_ids ? JSON.parse(row.tool_ids) : [],
        mcpServerIds: row.mcp_server_ids ? JSON.parse(row.mcp_server_ids) : [],
        skillIds: row.skill_ids ? JSON.parse(row.skill_ids) : [],
        iconIndex: row.icon_index,
        marketplaceId: row.marketplace_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    }
    const result = queries.getSetting.get('many_agents');
    if (!result?.value) return [];
    return JSON.parse(result.value) || [];
  } catch {
    return [];
  }
}

function buildDelegationContext(payload = {}) {
  const lines = ['## Dome Context'];
  if (payload.pathname) lines.push(`- Route: ${payload.pathname}`);
  if (payload.homeSidebarSection) lines.push(`- Home section: ${payload.homeSidebarSection}`);
  if (payload.currentFolderId) lines.push(`- Current folder ID: ${payload.currentFolderId}`);
  if (payload.currentResourceId) lines.push(`- Current resource ID: ${payload.currentResourceId}`);
  if (payload.currentResourceTitle) lines.push(`- Current resource title: "${payload.currentResourceTitle}"`);
  if (lines.length === 1) return '';
  return `${lines.join('\n')}\n- Use this context when deciding which Dome resources or folders to inspect.\n`;
}

function toolNameForAgent(agent) {
  const raw = String(agent.id || agent.name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `delegate_to_${raw || 'agent'}`;
}

/**
 * Build LangChain tools for a member agent (direct execution via tool-dispatcher).
 */
async function buildMemberDirectTools(agent, teamToolIds, teamMcpServerIds, agentName) {
  const toolDefinitions = getToolDefinitionsByIds([
    ...(Array.isArray(agent.toolIds) ? agent.toolIds : []),
    ...(Array.isArray(teamToolIds) ? teamToolIds : []),
  ]);
  const executeFn = async (name, args) => {
    try {
      return await executeToolInMain(name, args, null);
    } catch (e) {
      return { error: e?.message ?? String(e) };
    }
  };
  const lcTools = await createLangChainToolsFromOpenAIDefinitions(toolDefinitions, executeFn);
  return lcTools;
}

/**
 * Build a Command-based delegation tool for the supervisor.
 * When the supervisor calls this tool, the parent StateGraph routes
 * to the corresponding member subgraph node instead of running the
 * tool inline.
 */
async function buildCommandDelegationTool(agent, send) {
  const { tool } = await import('@langchain/core/tools');
  const { Command } = await import('@langchain/langgraph');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;

  const toolName = toolNameForAgent(agent);
  const description = (agent.description && agent.description.trim())
    ? `Delegate a focused subtask to "${agent.name}". ${agent.description.trim()}`
    : `Delegate a focused subtask to "${agent.name}".`;

  return tool(
    async ({ task }) => {
      send({ agentName: agent.name });
      return new Command({
        goto: agent.id,
        update: {
          messages: [{ role: 'user', content: `[Delegated task from supervisor] ${task}` }],
        },
      });
    },
    {
      name: toolName,
      description,
      schema: z.object({
        task: z.string().describe('Concrete subtask for this agent. Include only the context they need to act.'),
      }),
    },
  );
}

/**
 * Build the full LangGraph team StateGraph.
 *
 * Parent graph:
 *   START → supervisor ← → memberA, memberB, … ← END (via supervisor)
 *
 * Each member is a `createAgent.graph` subgraph node.
 * The supervisor uses Command-based delegation tools to route to members.
 */
async function buildTeamGraph({
  memberAgents,
  supervisorSystemPrompt,
  settings,
  teamToolIds,
  teamMcpServerIds,
  send,
  signal,
}) {
  const { StateGraph, MessagesAnnotation, END, START } = await import('@langchain/langgraph');
  const { createAgent, humanInTheLoopMiddleware } = await import('langchain');

  const llm = await createModelFromConfig(settings.provider, settings.model, settings.apiKey, settings.baseUrl);

  // ── Build member subgraph nodes ─────────────────────────────────────────
  const memberNodeMap = {}; // { agentId: CompiledStateGraph }
  for (const agent of memberAgents) {
    const memberLcTools = await buildMemberDirectTools(agent, teamToolIds, teamMcpServerIds);
    const skillsMw = await buildSkillsMiddleware();
    const memberAgent = createAgent({
      model: llm,
      tools: memberLcTools,
      middleware: skillsMw ? [skillsMw] : [],
      // No checkpointer: the parent graph provides persistence
    });
    memberNodeMap[agent.id] = memberAgent.graph;
  }

  // ── Build supervisor Command delegation tools ───────────────────────────
  const delegationTools = [];
  for (const agent of memberAgents) {
    delegationTools.push(await buildCommandDelegationTool(agent, send));
  }

  const supervisorAgent = createAgent({
    model: llm,
    tools: delegationTools,
    middleware: [],
    // No checkpointer: parent graph provides persistence
  });

  // ── Inject supervisor system prompt as pre-messages ─────────────────────
  // We wrap the supervisor graph so the system prompt is prepended.
  const supervisorGraph = supervisorAgent.graph;

  // ── Assemble parent StateGraph ──────────────────────────────────────────
  const memberIds = memberAgents.map((a) => a.id);

  const teamGraph = new StateGraph(MessagesAnnotation)
    .addNode('supervisor', supervisorGraph, { subgraphs: true })
    .addEdge(START, 'supervisor');

  for (const [agentId, graph] of Object.entries(memberNodeMap)) {
    teamGraph.addNode(agentId, graph, { subgraphs: true });
    teamGraph.addEdge(agentId, 'supervisor');
  }

  const compiled = teamGraph.compile({
    checkpointer: getDomeCheckpointer(),
  });

  return { compiled, memberIds };
}

/**
 * Stream the team graph and forward events to the renderer.
 * Handles supervisor text, member text, tool calls/results, and done.
 */
async function streamTeamGraph({
  compiled,
  messages,
  supervisorSystemPrompt,
  threadId,
  signal,
  send,
  memberAgents,
}) {
  const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

  const lcMessages = [
    new SystemMessage(supervisorSystemPrompt),
    ...messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'assistant') {
          const { AIMessage } = require('@langchain/core/messages');
          return new AIMessage(String(m.content || ''));
        }
        return new HumanMessage(String(m.content || ''));
      }),
  ];

  const config = {
    configurable: { thread_id: threadId },
    recursionLimit: 50,
    signal,
    streamMode: ['messages', 'updates'],
  };

  const agentNameById = Object.fromEntries(memberAgents.map((a) => [a.id, a.name]));
  let currentAgentNode = 'supervisor';

  const stream = await compiled.stream({ messages: lcMessages }, config);

  for await (const event of stream) {
    if (signal?.aborted) break;

    // `event` in stream mode is { nodeId: update } or messages chunk
    for (const [nodeId, nodeOutput] of Object.entries(event)) {
      const isSupervising = nodeId === 'supervisor' || nodeId === '__start__';
      const isMember = memberAgents.some((a) => a.id === nodeId);

      if (isMember && nodeId !== currentAgentNode) {
        currentAgentNode = nodeId;
        // agentName already sent by Command delegation tool
      } else if (isSupervising && currentAgentNode !== 'supervisor') {
        currentAgentNode = 'supervisor';
        send({ agentName: null });
      }

      // Forward messages from node output
      if (nodeOutput?.messages) {
        for (const msg of nodeOutput.messages) {
          if (!msg) continue;
          const content = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('')
              : '';

          if (msg._getType?.() === 'ai' || msg.type === 'ai' || msg.role === 'assistant') {
            if (content && isSupervising) {
              send({ chunk: content });
            } else if (content && isMember) {
              send({ type: 'text', text: content, agentName: agentNameById[nodeId] ?? nodeId });
            }
          }
        }
      }

      // Forward tool calls / results
      if (nodeOutput?.tool_calls) {
        for (const tc of nodeOutput.tool_calls) {
          if (tc?.name?.startsWith('delegate_to_')) continue; // routing tool, not shown
          send({
            type: 'tool_call',
            toolName: tc.name,
            args: tc.args,
            agentName: isMember ? (agentNameById[nodeId] ?? nodeId) : undefined,
          });
        }
      }
    }
  }
}

function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('ai:team:stream', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Invalid payload: must be an object' };
    }
    let streamId, teamId, messages, memberAgentIds, supervisorInstructions, currentResourceId, currentResourceTitle, currentFolderId, pathname, homeSidebarSection, teamToolIds, teamMcpServerIds, projectId;
    try {
      ({
        streamId,
        teamId,
        messages,
        memberAgentIds,
        supervisorInstructions,
        currentResourceId,
        currentResourceTitle,
        currentFolderId,
        pathname,
        homeSidebarSection,
        teamToolIds,
        teamMcpServerIds,
        projectId,
      } = payload);
    } catch (err) {
      if (err instanceof TypeError) {
        return { success: false, error: 'Invalid payload: could not read required properties' };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (typeof streamId !== 'string' || !streamId) {
      return { success: false, error: 'Invalid payload: streamId must be a non-empty string' };
    }
    if (typeof teamId !== 'string' || !teamId) {
      return { success: false, error: 'Invalid payload: teamId must be a non-empty string' };
    }
    if (!Array.isArray(messages)) {
      return { success: false, error: 'Invalid payload: messages must be an array' };
    }
    if (!Array.isArray(memberAgentIds)) {
      return { success: false, error: 'Invalid payload: memberAgentIds must be an array' };
    }

    const send = (data) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, ...data });
      }
    };

    const controller = new AbortController();
    setMaxListeners(64, controller.signal);
    agentTeamAbortControllers.set(streamId, controller);

    try {
      const settings = await getAISettings(database);
      const allAgents = loadAgents(database, projectId);
      const memberAgents = memberAgentIds
        .map((id) => allAgents.find((a) => a.id === id))
        .filter(Boolean);

      if (memberAgents.length === 0) {
        throw new Error('No se encontraron agentes del equipo. Verifica la configuración.');
      }

      const contextBlock = buildDelegationContext({
        currentResourceId,
        currentResourceTitle,
        currentFolderId,
        pathname,
        homeSidebarSection,
      });

      // Build supervisor system prompt
      const agentList = memberAgents
        .map((a) => `- **${a.name}** (call \`${toolNameForAgent(a)}\`): ${a.description || 'Specialized agent'}`)
        .join('\n');
      const template = getTeamSupervisorTemplate();
      const supervisorBase = template
        .replace(/\{\{agentList\}\}/g, agentList)
        .replace(/\{\{supervisorInstructions\}\}/g, (supervisorInstructions || '').trim());
      const supervisorSystemPrompt = buildDomeSystemPrompt({
        staticPersona: supervisorBase,
        volatileContext: contextBlock || undefined,
      });

      send({ agentName: null });

      // Build the LangGraph team StateGraph with member subgraphs
      const { compiled } = await buildTeamGraph({
        memberAgents,
        supervisorSystemPrompt,
        settings,
        teamToolIds: Array.isArray(teamToolIds) ? teamToolIds : [],
        teamMcpServerIds: Array.isArray(teamMcpServerIds) ? teamMcpServerIds : [],
        send,
        signal: controller.signal,
      });

      // Stable team thread_id (no Date.now()) for checkpoint persistence
      const teamThreadId = `team_${teamId}`;

      await streamTeamGraph({
        compiled,
        messages,
        supervisorSystemPrompt,
        threadId: teamThreadId,
        signal: controller.signal,
        send,
        memberAgents,
      });

      send({ done: true });
      return { success: true };
    } catch (error) {
      console.error('[AgentTeam] Stream error:', error);
      if (error?.name === 'AbortError') {
        send({ done: true });
        return { success: true };
      }
      send({ error: error.message || 'Error desconocido en Agent Team' });
      return { success: false, error: error.message };
    } finally {
      agentTeamAbortControllers.delete(streamId);
    }
  });

  ipcMain.handle('ai:team:abort', async (event, streamId) => {
    try {
      if (!windowManager.isAuthorized(event.sender.id)) {
        return { success: false, error: 'Unauthorized' };
      }
      const controller = agentTeamAbortControllers.get(streamId);
      if (controller) controller.abort();
      return { success: true };
    } catch (error) {
      console.error('[AgentTeam] Abort error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
