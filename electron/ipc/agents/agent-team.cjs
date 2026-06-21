/* eslint-disable no-console */

/**
 * Agent Team IPC.
 *
 * Supervisor delegates to team members via the native `delegate_to_agent` tool
 * (nested AgentHarness turns). Member chunks are tagged with `agentName` for the
 * renderer. See docs/architecture/agent-runtime.md.
 *
 * Renderer chunk shape on `ai:stream:chunk`:
 *   { streamId, chunk: '<text>' }                    — supervisor synthesis
 *   { streamId, type: 'tool_call'|'tool_result', ... }
 *   { streamId, agentName: null }                    — back to supervisor
 *   { streamId, done: true }
 *   { streamId, error: '<msg>' }
 */

const { setMaxListeners } = require('events');
const agentRuntime = require('../../agents/agent-runtime.cjs');
const { getAllToolDefinitions, getToolDefinitionsByIds } = require('../../tools/tool-dispatcher.cjs');
const { getAISettings } = require('../../ai/ai-settings.cjs');
const { buildDomeSystemPrompt } = require('../../prompts/system-prompt.cjs');
const { readPrompt } = require('../../prompts/prompts-loader.cjs');

const agentTeamAbortControllers = new Map();

const TEAM_SUPERVISOR_PROMPT_FALLBACK =
  'You are the supervisor of an Agent Team in Dome. Use your tools to research and synthesize one coherent answer. The team members listed below describe the expertise available to you.';

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

async function loadAgents(database, projectId = 'default') {
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
    const result = await queries.getSetting.get('many_agents');
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

/** Map a Dome-native runtime chunk to the Agent Team renderer protocol. */
function mapTeamChunk(chunk, send) {
  if (!chunk || typeof chunk !== 'object') return;
  switch (chunk.type) {
    case 'text':
      if (chunk.text) {
        send(chunk.agentName ? { chunk: chunk.text, agentName: chunk.agentName } : { chunk: chunk.text });
      }
      return;
    case 'thinking':
      return;
    case 'tool_call': {
      if (!chunk.toolCall) return;
      let args = chunk.toolCall.arguments;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      send({
        type: 'tool_call',
        toolName: chunk.toolCall.name,
        args,
        ...(chunk.agentName ? { agentName: chunk.agentName } : {}),
      });
      return;
    }
    case 'tool_result':
      send({ type: 'tool_result', toolCallId: chunk.toolCallId, result: chunk.result });
      return;
    case 'usage':
      if (chunk.usage) send({ type: 'usage', usage: chunk.usage, partial: !!chunk.partial });
      return;
    default:
      // 'done' / 'error' handled by the caller.
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
      const allAgents = await loadAgents(database, projectId);
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

      const toolIds = uniqueToolIds(
        Array.isArray(teamToolIds) ? teamToolIds : [],
        ...memberAgents.map((a) => a.toolIds),
      );
      const toolDefinitions = toolIds.length > 0 ? getToolDefinitionsByIds(toolIds) : getAllToolDefinitions();

      send({ agentName: null });

      const teamMessages = [
        { role: 'system', content: supervisorSystemPrompt },
        ...messages.filter((m) => m && m.role !== 'system'),
      ];

      await agentRuntime.runAgent('agent-team', {
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        messages: teamMessages,
        toolDefinitions,
        useDirectTools: toolDefinitions.length > 0,
        mcpServerIds: Array.isArray(teamMcpServerIds) ? teamMcpServerIds : undefined,
        teamMemberAgents: memberAgents,
        skipHitl: true,
        signal: controller.signal,
        threadId: `team_${teamId}`,
        onChunk: (chunk) => mapTeamChunk(chunk, send),
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
