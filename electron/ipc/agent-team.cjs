/* eslint-disable no-console */

/**
 * Agent Team IPC Handler
 * Orchestrates a supervisor LLM that delegates sub-tasks to specialized agents
 * and synthesizes the results into a final response.
 */

const { setMaxListeners } = require('events');
const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';
const langgraphAgent = require('../langgraph-agent.cjs');
const { getToolDefinitionsByIds } = require('../ai-chat-with-tools.cjs');
const domeOauth = require('../dome-oauth.cjs');
const { appendSkillsToPrompt } = require('../skill-prompt.cjs');

const agentTeamAbortControllers = new Map();

/**
 * Get AI settings from database (async for dome provider session refresh)
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
      baseUrl: DOME_PROVIDER_URL,
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
 * Load agent configs from dedicated agents table
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
 * Call an LLM (non-streaming) and return the text response
 */
async function callLLM(settings, messages, tools, aiCloudService, ollamaService) {
  const { provider, apiKey, model, baseUrl } = settings;

  if (provider === 'ollama') {
    let fullText = '';
    let toolCalls = [];
    await new Promise((resolve, reject) => {
      ollamaService
        .chatStream(
          messages.map((m) => ({ role: m.role, content: m.content })),
          model || 'llama3.2',
          baseUrl || 'http://127.0.0.1:11434',
          (data) => {
            if (data.type === 'text' && data.text) fullText += data.text;
            if (data.type === 'tool_call') toolCalls.push(data);
            if (data.type === 'done') resolve();
            if (data.type === 'error') reject(new Error(data.error));
          },
          {
            temperature: 0.7,
            think: false,
            tools: tools || undefined,
            apiKey: apiKey || undefined,
          }
        )
        .then(resolve)
        .catch(reject);
    });
    return { text: fullText, toolCalls };
  }

  if (provider === 'dome') {
    if (!apiKey) throw new Error('Dome provider is not connected. Open Settings > AI > Dome.');
    const res = await fetch(`${DOME_PROVIDER_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: model || 'dome/auto', messages }),
    });
    if (!res.ok) throw new Error(`Dome API error: ${res.status}`);
    const data = await res.json();
    return { text: data?.choices?.[0]?.message?.content || '', toolCalls: [] };
  }

  // OpenAI / Anthropic / Google via aiCloudService
  const text = await aiCloudService.chat(provider, messages, apiKey, model);
  return { text, toolCalls: [] };
}

/**
 * Stream final synthesis text character by character
 */
async function streamText(text, sender, streamId, delay = 6) {
  const chunkSize = 4;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (sender.isDestroyed()) break;
    const chunk = text.slice(i, i + chunkSize);
    sender.send('ai:stream:chunk', { streamId, chunk });
    await new Promise((r) => setTimeout(r, delay));
  }
}

function register({ ipcMain, windowManager, database, aiCloudService, ollamaService }) {
  /**
   * ai:team:stream
   *
   * Input:
   *   streamId: string
   *   teamId: string
   *   messages: Array<{ role: string; content: string }>
   *   memberAgentIds: string[]
   *   supervisorInstructions: string
   *
   * Emits ai:stream:chunk events:
   *   { streamId, chunk: string }                  — streaming text from synthesis
   *   { streamId, chunk: string, agentName: string } — text from agent delegation phase
   *   { streamId, done: true }                      — end of stream
   *   { streamId, error: string }                   — error
   */
  ipcMain.handle('ai:team:stream', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const hasRequiredShape =
      payload &&
      typeof payload === 'object' &&
      typeof payload.streamId === 'string' &&
      typeof payload.teamId === 'string' &&
      Array.isArray(payload.messages) &&
      Array.isArray(payload.memberAgentIds);

    if (!hasRequiredShape) {
      const errorMsg = 'Invalid payload: streamId and teamId must be strings, messages and memberAgentIds must be arrays';
      console.error('[AgentTeam] Validation error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    const {
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
    } = payload;

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

      const contextBlock = buildDelegationContext({
        currentResourceId,
        currentResourceTitle,
        currentFolderId,
        pathname,
        homeSidebarSection,
      });

      if (memberAgents.length === 0) {
        throw new Error('No se encontraron agentes del equipo. Verifica la configuración.');
      }

      // ── Step 1: Supervisor planning phase ─────────────────────────────
      const agentList = memberAgents
        .map((a, i) => `${i + 1}. ${a.name} (id: ${a.id}) — ${a.description || 'Agente especializado'}`)
        .join('\n');

      const supervisorSystemPrompt = `${supervisorInstructions || 'Eres el supervisor de este equipo de agentes.'}

Los agentes disponibles en tu equipo son:
${agentList}

Tu objetivo es:
1. Analizar la solicitud del usuario.
2. Decidir qué agentes necesitas y qué subtarea asignarle a cada uno.
3. Responder en JSON con este formato exacto:
{
  "plan": "Breve descripción del plan de trabajo",
  "delegations": [
    { "agentId": "<id del agente>", "agentName": "<nombre>", "task": "<descripción clara de la subtarea>" }
  ]
}
Solo responde con el JSON, sin texto adicional.

${contextBlock}`.trim();

      const planMessages = [
        { role: 'system', content: supervisorSystemPrompt },
        ...messages,
      ];

      send({ chunk: '' }); // Trigger UI to start showing status

      let planJSON = '';
      try {
        const planResult = await callLLM(settings, planMessages, undefined, aiCloudService, ollamaService);
        planJSON = planResult.text.trim();
        // Extract JSON even if wrapped in markdown code blocks
        const jsonMatch = planJSON.match(/```(?:json)?\s*([\s\S]*?)```/) || planJSON.match(/(\{[\s\S]*\})/);
        if (jsonMatch) planJSON = jsonMatch[1].trim();
      } catch (err) {
        console.error('[AgentTeam] Planning phase error:', err);
        throw new Error(`Error en la fase de planificación: ${err.message}`);
      }

      let plan;
      try {
        plan = JSON.parse(planJSON);
      } catch {
        // If JSON parse fails, create a simple single-agent delegation
        const firstAgent = memberAgents[0];
        plan = {
          plan: 'Delegación directa',
          delegations: [
            {
              agentId: firstAgent.id,
              agentName: firstAgent.name,
              task: messages[messages.length - 1]?.content || 'Responde la solicitud del usuario',
            },
          ],
        };
      }

      const delegations = Array.isArray(plan.delegations) ? plan.delegations : [];
      if (delegations.length === 0) {
        // Fallback: delegate to first agent
        const firstAgent = memberAgents[0];
        delegations.push({
          agentId: firstAgent.id,
          agentName: firstAgent.name,
          task: messages[messages.length - 1]?.content || '',
        });
      }

      // ── Step 2: Execute each agent delegation ─────────────────────────
      const agentResults = [];

      for (const delegation of delegations) {
        const agent = memberAgents.find((a) => a.id === delegation.agentId);
        if (!agent) continue;

        // Signal to UI which agent is working
        send({ chunk: '', agentName: agent.name });

        let agentSystemPrompt = agent.systemInstructions?.trim()
          || agent.description
          || `You are ${agent.name}, a specialized AI assistant.`;
        agentSystemPrompt = appendSkillsToPrompt(
          agentSystemPrompt,
          Array.isArray(agent.skillIds) ? agent.skillIds : [],
          database.getQueries(),
        );

        const toolDefinitions = getToolDefinitionsByIds([
          ...(Array.isArray(agent.toolIds) ? agent.toolIds : []),
          ...(Array.isArray(teamToolIds) ? teamToolIds : []),
        ]);
        const mcpServerIds = [
          ...(Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : []),
          ...(Array.isArray(teamMcpServerIds) ? teamMcpServerIds : []),
        ];

        const agentMessages = [
          {
            role: 'system',
            content: `${agentSystemPrompt}\n\n${contextBlock}\nUse Dome tools when they improve the answer, especially for resource-aware tasks.`,
          },
          {
            role: 'user',
            content: delegation.task || messages[messages.length - 1]?.content || '',
          },
        ];

        try {
          let memberResponse = '';
          const normalizedMcpServerIds = Array.from(
            new Set(mcpServerIds.filter((serverId) => typeof serverId === 'string' && serverId.trim().length > 0))
          );

          await langgraphAgent.invokeLangGraphAgent({
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
            messages: agentMessages,
            toolDefinitions,
            useDirectTools: toolDefinitions.length > 0 || normalizedMcpServerIds.length > 0,
            mcpServerIds: normalizedMcpServerIds.length > 0 ? normalizedMcpServerIds : undefined,
            signal: controller.signal,
            threadId: `team_${teamId}_${agent.id}_${Date.now()}`,
            skipHitl: true,
            onChunk: (chunk) => {
              if (!event.sender || event.sender.isDestroyed()) return;
              if (chunk.type === 'text' && chunk.text) {
                memberResponse += chunk.text;
              }
              send({
                ...chunk,
                agentName: agent.name,
              });
            },
          });

          agentResults.push({
            agentName: agent.name,
            agentId: agent.id,
            task: delegation.task,
            result: memberResponse,
          });
        } catch (err) {
          console.error(`[AgentTeam] Agent ${agent.name} error:`, err);
          agentResults.push({
            agentName: agent.name,
            agentId: agent.id,
            task: delegation.task,
            result: `Error: ${err.message}`,
          });
        }
      }

      // ── Step 3: Supervisor synthesis ──────────────────────────────────
      send({ chunk: '', agentName: null }); // Signal synthesis phase

      const resultSummary = agentResults
        .map((r) => `## ${r.agentName}\n**Tarea:** ${r.task}\n**Resultado:**\n${r.result}`)
        .join('\n\n---\n\n');

      const synthesisSystemPrompt = `Eres el supervisor del equipo. Los agentes han completado sus tareas. 
Sintetiza sus respuestas en una respuesta coherente, bien estructurada y útil para el usuario.
Integra la información de todos los agentes de forma fluida, evitando repeticiones innecesarias.
Si hay contradicciones, menciónalas claramente.
Responde en el idioma del usuario.`;

      const synthesisMessages = [
        { role: 'system', content: synthesisSystemPrompt },
        ...messages,
        {
          role: 'assistant',
          content: `He coordinado el equipo. Plan: ${plan.plan || 'Delegar y sintetizar'}.`,
        },
        {
          role: 'user',
          content: `Los agentes han respondido. Por favor, sintetiza estos resultados:\n\n${resultSummary}\n\nProporciona una respuesta final integrada.`,
        },
      ];

      let synthesisText = '';
      try {
        const synthesisResult = await callLLM(
          settings,
          synthesisMessages,
          undefined,
          aiCloudService,
          ollamaService
        );
        synthesisText = synthesisResult.text;
      } catch (err) {
        console.error('[AgentTeam] Synthesis error:', err);
        // Fallback: concatenate agent results
        synthesisText = agentResults
          .map((r) => `**${r.agentName}:**\n${r.result}`)
          .join('\n\n');
      }

      // Stream the synthesis back to renderer
      await streamText(synthesisText, event.sender, streamId);

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
