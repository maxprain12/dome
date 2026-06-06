/* eslint-disable no-console */

/**
 * Agent Team IPC — deepagents harness (supervisor + subagents via `task`).
 *
 * Renderer chunk shape on `ai:stream:chunk`:
 *   { streamId, chunk: '<text>' }                    — supervisor synthesis
 *   { streamId, type: 'text', text, agentName }     — member text
 *   { streamId, type: 'tool_call'|'tool_result', ... [, agentName] }
 *   { streamId, agentName: 'X' }                     — delegation UI
 *   { streamId, agentName: null }                    — back to supervisor
 *   { streamId, done: true }
 *   { streamId, error: '<msg>' }
 */

const { setMaxListeners } = require('events');
const { getDomeProviderBaseUrl } = require('../../ai/dome-provider-url.cjs');
const {
  createModelFromConfig,
  createLangChainToolsFromOpenAIDefinitions,
  streamAgentRun,
} = require('../../agents/langgraph-agent.cjs');
const { buildAgentMiddlewareStack } = require('../../agents/agent-middleware.cjs');
const { getAllToolDefinitions, getToolDefinitionsByIds, executeToolInMain } = require('../../tools/tool-dispatcher.cjs');
const { getDomeCheckpointer } = require('../../agents/checkpointer.cjs');
const { buildSkillsMiddleware } = require('../../skills/index.cjs');
const { getAISettings } = require('../../ai/ai-settings.cjs');
const { registerDomeHarnessProfiles } = require('../../agents/harness-profiles.cjs');
const { createDomeHarnessBackendFactory, DEFAULT_HARNESS_PERMISSIONS } = require('../../agents/harness-backend.cjs');
const { getDomeStore } = require('../../agents/agent-store.cjs');
const { getMCPTools } = require('../../mcp/mcp-client.cjs');
const { buildDomeSystemPrompt } = require('../../prompts/system-prompt.cjs');
const { readPrompt } = require('../../prompts/prompts-loader.cjs');
const { withLangfuseCallbacks } = require('../../core/observability.cjs');
const { capToolResultString } = require('../../tools/tool-result-cap.cjs');

const agentTeamAbortControllers = new Map();

const TEAM_SUPERVISOR_PROMPT_FALLBACK =
  'You are the supervisor of an Agent Team in Dome. Delegate focused subtasks to members via the `task` tool and synthesize their work into one coherent answer.';

function getTeamSupervisorTemplate() {
  const txt = readPrompt('martin/team-supervisor.txt');
  return typeof txt === 'string' && txt.trim().length > 0
    ? txt
    : TEAM_SUPERVISOR_PROMPT_FALLBACK;
}

function sanitizeSubagentName(name) {
  const raw = String(name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return raw || 'agent';
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

function uniqueToolIds(...lists) {
  const out = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      const s = String(id || '').trim();
      if (s) out.add(s);
    }
  }
  return [...out];
}

/**
 * LangChain tools for a team member (respects agent.toolIds + teamToolIds).
 */
async function buildMemberDirectTools(database, agent, teamToolIds, teamMcpServerIds) {
  const ids = uniqueToolIds(agent.toolIds, teamToolIds);
  const toolDefinitions = ids.length > 0 ? getToolDefinitionsByIds(ids) : getAllToolDefinitions();
  const executeFn = async (name, args) => {
    try {
      const result = await executeToolInMain(name, args, null);
      const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
      return capToolResultString(name, resultStr0);
    } catch (e) {
      return { error: e?.message ?? String(e) };
    }
  };
  const lcTools = await createLangChainToolsFromOpenAIDefinitions(toolDefinitions, executeFn);
  const mcpIds = uniqueToolIds(agent.mcpServerIds, teamMcpServerIds);
  const mcpTools = mcpIds.length > 0 ? await getMCPTools(database, mcpIds) : [];
  return [...lcTools, ...mcpTools];
}

/**
 * Build createDeepAgent team graph (supervisor + member subagents).
 */
async function buildTeamDeepAgent({
  database,
  memberAgents,
  supervisorSystemPrompt,
  settings,
  teamToolIds,
  teamMcpServerIds,
}) {
  registerDomeHarnessProfiles();
  const { createDeepAgent } = await import('deepagents');
  const llm = await createModelFromConfig(
    settings.provider,
    settings.model,
    settings.apiKey,
    settings.baseUrl,
  );
  const agentStore = getDomeStore();

  const subagents = [];
  const nameBySubagentKey = {};

  for (const agent of memberAgents) {
    const subName = sanitizeSubagentName(agent.name || agent.id);
    nameBySubagentKey[subName] = agent.name || agent.id;
    const memberTools = await buildMemberDirectTools(database, agent, teamToolIds, teamMcpServerIds);
    const persona =
      (agent.systemInstructions && String(agent.systemInstructions).trim()) ||
      (agent.description && String(agent.description).trim()) ||
      `You are ${agent.name}, a specialized member of a Dome Agent Team.`;
    const memberSystemPrompt = buildDomeSystemPrompt({ staticPersona: persona });
    const skillsMw = await buildSkillsMiddleware();
    const middleware = await buildAgentMiddlewareStack({
      profile: 'worker',
      provider: settings.provider,
      llm,
      tools: memberTools,
      skillsMiddleware: skillsMw,
      store: agentStore,
      harnessStack: 'deep',
    });
    subagents.push({
      name: subName,
      description:
        (agent.description && agent.description.trim()) ||
        `Team member "${agent.name}" for delegated subtasks.`,
      systemPrompt: memberSystemPrompt,
      model: llm,
      tools: memberTools,
      middleware,
    });
  }

  const teamIds = uniqueToolIds(teamToolIds);
  let supervisorTools = [];
  if (teamIds.length > 0) {
    const teamDefs = getToolDefinitionsByIds(teamIds);
    const executeFn = async (name, args) => {
      try {
        const result = await executeToolInMain(name, args, null);
        const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
        return capToolResultString(name, resultStr0);
      } catch (e) {
        return { error: e?.message ?? String(e) };
      }
    };
    supervisorTools = await createLangChainToolsFromOpenAIDefinitions(teamDefs, executeFn);
    const mcpTools =
      Array.isArray(teamMcpServerIds) && teamMcpServerIds.length > 0
        ? await getMCPTools(database, teamMcpServerIds)
        : [];
    supervisorTools = [...supervisorTools, ...mcpTools];
  }

  const supervisorMiddleware = await buildAgentMiddlewareStack({
    profile: 'full',
    provider: settings.provider,
    llm,
    tools: supervisorTools,
    store: agentStore,
    harnessStack: 'deep',
  });

  const agent = await createDeepAgent({
    model: llm,
    tools: supervisorTools,
    systemPrompt: supervisorSystemPrompt,
    middleware: supervisorMiddleware,
    subagents,
    interruptOn: { task: false },
    checkpointer: getDomeCheckpointer(),
    store: agentStore,
    backend: createDomeHarnessBackendFactory(agentStore),
    permissions: DEFAULT_HARNESS_PERMISSIONS,
  });

  return { agent, nameBySubagentKey };
}

function parseTaskSubagentName(toolArgs) {
  if (!toolArgs) return null;
  let parsed = toolArgs;
  if (typeof toolArgs === 'string') {
    try {
      parsed = JSON.parse(toolArgs);
    } catch {
      return null;
    }
  }
  if (parsed && typeof parsed === 'object') {
    const candidate =
      parsed.subagent_name ?? parsed.subagent ?? parsed.name ?? parsed.agent ?? parsed.agent_name;
    if (candidate) return String(candidate);
  }
  return null;
}

/**
 * Stream team deep agent and map harness chunks to renderer protocol.
 */
async function streamTeamDeepAgent({
  agent,
  nameBySubagentKey,
  messages,
  threadId,
  signal,
  send,
}) {
  const { HumanMessage, AIMessage } = await import('@langchain/core/messages');

  const lcMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'assistant') {
        return new AIMessage(String(m.content || ''));
      }
      return new HumanMessage(String(m.content || ''));
    });

  const config = withLangfuseCallbacks({
    configurable: { thread_id: threadId },
    recursionLimit: Number(process.env.DOME_AGENT_TEAM_RECURSION_LIMIT) || 250,
    signal,
  });

  let activeMember = null;

  const onChunk = (chunk) => {
    if (!chunk || typeof chunk !== 'object') return;

    if (chunk.type === 'tool_call' && chunk.toolCall?.name === 'task') {
      const subKey = parseTaskSubagentName(chunk.toolCall.arguments);
      const displayName = (subKey && nameBySubagentKey[subKey]) || subKey || 'member';
      activeMember = displayName;
      send({ agentName: displayName });
      return;
    }

    if (chunk.type === 'text' && chunk.text) {
      if (chunk.agentName || activeMember) {
        send({
          type: 'text',
          text: chunk.text,
          agentName: chunk.agentName || activeMember,
        });
      } else {
        send({ chunk: chunk.text });
      }
      return;
    }

    if (chunk.type === 'tool_call' && chunk.toolCall) {
      const name = chunk.toolCall.name;
      if (name === 'task') return;
      let args = chunk.toolCall.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      send({
        type: 'tool_call',
        toolName: name,
        args,
        agentName: chunk.agentName || activeMember || undefined,
      });
      return;
    }

    if (chunk.type === 'tool_result' && chunk.toolCallId) {
      send({
        type: 'tool_result',
        toolCallId: chunk.toolCallId,
        result: chunk.result,
        agentName: chunk.agentName || activeMember || undefined,
      });
      return;
    }

    if (chunk.type === 'usage' && chunk.usage) {
      send({ type: 'usage', usage: chunk.usage, partial: !!chunk.partial });
    }
  };

  const rtEmittedCallIds = new Set();
  const rtEmittedResultIds = new Set();

  await streamAgentRun(
    agent,
    { messages: lcMessages },
    config,
    onChunk,
    rtEmittedCallIds,
    rtEmittedResultIds,
  );

  send({ agentName: null });
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

      const agentList = memberAgents
        .map(
          (a) =>
            `- **${a.name}** (subagent \`${sanitizeSubagentName(a.name || a.id)}\`): ${a.description || 'Specialized agent'}`,
        )
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

      const { agent, nameBySubagentKey } = await buildTeamDeepAgent({
        database,
        memberAgents,
        supervisorSystemPrompt,
        settings,
        teamToolIds: Array.isArray(teamToolIds) ? teamToolIds : [],
        teamMcpServerIds: Array.isArray(teamMcpServerIds) ? teamMcpServerIds : [],
      });

      const teamThreadId = `team_${teamId}`;

      await streamTeamDeepAgent({
        agent,
        nameBySubagentKey,
        messages,
        threadId: teamThreadId,
        signal: controller.signal,
        send,
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
