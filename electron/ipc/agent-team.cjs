/* eslint-disable no-console */

/**
 * Agent Team IPC Handler — LangGraph supervisor.
 *
 * The supervisor is a `createAgent` whose tools are: (1) the team's own
 * tools / MCP servers, and (2) one `delegate_to_<agentId>` tool per member
 * agent. Each delegation tool spins up its own member `createAgent` and
 * streams its events back through the parent `onChunk`, tagged with the
 * member's `agentName` so the renderer can label the UI.
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
const langgraphAgent = require('../langgraph-agent.cjs');
const { getToolDefinitionsByIds } = require('../tool-dispatcher.cjs');
const domeOauth = require('../dome-oauth.cjs');
const { appendSkillsToPrompt, filterToolsBySkill } = require('../skill-prompt.cjs');
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

/**
 * Get AI settings from database (async for dome provider session refresh).
 */
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

/**
 * Load agent configs from dedicated agents table, falling back to legacy
 * `many_agents` setting for older installs.
 */
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

/**
 * Lowercase, snake-case, ASCII-only — must match LangChain tool name rules.
 */
function toolNameForAgent(agent) {
  const raw = String(agent.id || agent.name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `delegate_to_${raw || 'agent'}`;
}

/**
 * Build a single member-as-tool wrapper. The wrapper accepts `{ task }`,
 * runs the member as its own LangGraph agent, streams events back to the
 * parent `onChunk` tagged with `agentName`, and returns the final text.
 */
async function buildMemberDelegationTool({
  agent,
  contextBlock,
  teamToolIds,
  teamMcpServerIds,
  settings,
  controller,
  database,
  parentOnChunk,
  send,
  teamId,
}) {
  const { tool } = await import('@langchain/core/tools');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;

  const baseInstructions = (agent.systemInstructions || agent.description || '').trim()
    || `You are ${agent.name}, a specialized AI assistant.`;
  const withSkills = appendSkillsToPrompt(
    baseInstructions,
    Array.isArray(agent.skillIds) ? agent.skillIds : [],
    database.getQueries(),
  );
  const staticPersona = `${withSkills}\n\nUse Dome tools when they improve the answer, especially for resource-aware tasks.`;
  const memberSystemPrompt = buildDomeSystemPrompt({
    staticPersona,
    volatileContext: contextBlock || undefined,
  });

  const rawToolDefinitions = getToolDefinitionsByIds([
    ...(Array.isArray(agent.toolIds) ? agent.toolIds : []),
    ...(Array.isArray(teamToolIds) ? teamToolIds : []),
  ]);
  const toolDefinitions = filterToolsBySkill(agent.skillIds, rawToolDefinitions);
  const mcpServerIds = Array.from(new Set([
    ...(Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : []),
    ...(Array.isArray(teamMcpServerIds) ? teamMcpServerIds : []),
  ].filter((s) => typeof s === 'string' && s.trim().length > 0)));

  const toolName = toolNameForAgent(agent);
  const description = (agent.description && agent.description.trim())
    ? `Delegate a focused subtask to "${agent.name}". ${agent.description.trim()}`
    : `Delegate a focused subtask to "${agent.name}".`;

  return tool(
    async ({ task }) => {
      // Tell the renderer to switch UI status to "delegating to <agent>".
      send({ agentName: agent.name });
      let memberResponse = '';
      try {
        await langgraphAgent.invokeLangGraphAgent({
          provider: settings.provider,
          model: settings.model,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          messages: [
            { role: 'system', content: memberSystemPrompt },
            { role: 'user', content: String(task || '') },
          ],
          toolDefinitions,
          useDirectTools: toolDefinitions.length > 0 || mcpServerIds.length > 0,
          mcpServerIds: mcpServerIds.length > 0 ? mcpServerIds : undefined,
          signal: controller.signal,
          threadId: `team_${teamId}_${agent.id}_${Date.now()}`,
          skipHitl: true,
          onChunk: (chunk) => {
            if (!chunk || typeof chunk !== 'object') return;
            if (chunk.type === 'text' && chunk.text) memberResponse += chunk.text;
            // Suppress per-member done/usage to avoid prematurely closing the team stream.
            if (chunk.type === 'done' || chunk.type === 'usage') return;
            parentOnChunk({ ...chunk, agentName: agent.name });
          },
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const msg = err?.message || String(err);
        console.error(`[AgentTeam] member ${agent.name} failed:`, msg);
        return `Error delegating to ${agent.name}: ${msg}`;
      } finally {
        // Switch UI status back to supervisor synthesis.
        send({ agentName: null });
      }
      return memberResponse.trim() || `${agent.name} returned no content.`;
    },
    {
      name: toolName,
      description,
      schema: z.object({
        task: z
          .string()
          .describe('Concrete subtask for this agent. Include only the context they need to act.'),
      }),
    },
  );
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
        const errorMsg = 'Invalid payload: could not read required properties';
        console.error('[AgentTeam] Validation error:', errorMsg, err);
        return { success: false, error: errorMsg };
      }
      console.error('[AgentTeam] Unexpected error during destructuring:', err);
      return { success: false, error: err.message || 'Unexpected error during payload processing' };
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

      // ── Build supervisor prompt ───────────────────────────────────────
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

      // ── parentOnChunk: forwards member-tagged chunks to renderer ──────
      const parentOnChunk = (chunk) => {
        if (!chunk || typeof chunk !== 'object') return;
        send(chunk);
      };

      // ── Build delegation tools ────────────────────────────────────────
      const memberTools = [];
      for (const agent of memberAgents) {
        const t = await buildMemberDelegationTool({
          agent,
          contextBlock,
          teamToolIds,
          teamMcpServerIds,
          settings,
          controller,
          database,
          parentOnChunk,
          send,
          teamId,
        });
        memberTools.push(t);
      }

      // ── Supervisor's own tools (team-level tools + MCP servers) ──────
      const teamToolDefinitions = getToolDefinitionsByIds(
        Array.isArray(teamToolIds) ? teamToolIds : [],
      );
      const supervisorMcp = Array.isArray(teamMcpServerIds)
        ? Array.from(new Set(teamMcpServerIds.filter((s) => typeof s === 'string' && s.trim())))
        : [];

      // ── supervisorOnChunk: translates LangGraph chunks for the renderer ──
      // Supervisor text accumulates into the message bubble (renderer reads
      // `data.chunk`). Member text is already forwarded with `type: 'text'` +
      // `agentName`, so it does not enter this codepath.
      const supervisorOnChunk = (chunk) => {
        if (!chunk || typeof chunk !== 'object') return;
        switch (chunk.type) {
          case 'text':
            if (chunk.text) send({ chunk: chunk.text });
            return;
          case 'thinking':
            // Supervisor thinking is internal — drop it.
            return;
          case 'tool_call':
          case 'tool_result':
            send(chunk);
            return;
          case 'usage':
            send(chunk);
            return;
          case 'done':
            // Suppress: outer handler emits the final `done: true`.
            return;
          case 'error':
            send({ error: chunk.error });
            return;
          default:
            send(chunk);
        }
      };

      // Mark the start of the supervisor turn so the renderer shows the
      // synthesis label until a member tool flips it to "delegating".
      send({ agentName: null });

      await langgraphAgent.invokeLangGraphAgent({
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        messages: [
          { role: 'system', content: supervisorSystemPrompt },
          ...messages,
        ],
        toolDefinitions: teamToolDefinitions,
        useDirectTools: true,
        mcpServerIds: supervisorMcp.length > 0 ? supervisorMcp : undefined,
        customTools: memberTools,
        signal: controller.signal,
        threadId: `team_supervisor_${teamId}_${Date.now()}`,
        skipHitl: true,
        onChunk: supervisorOnChunk,
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
