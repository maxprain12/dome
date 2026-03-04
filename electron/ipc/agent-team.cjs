/* eslint-disable no-console */

/**
 * Agent Team IPC Handler
 * Orchestrates a supervisor LLM that delegates sub-tasks to specialized agents
 * and synthesizes the results into a final response.
 */

const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';

/**
 * Get AI settings from database
 */
function getAISettings(database) {
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
    const session = queries.getActiveDomeProviderSession?.get?.(Date.now());
    return {
      provider: 'dome',
      apiKey: session?.access_token,
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
 * Load agent configs from settings table
 */
function loadAgents(database) {
  try {
    const queries = database.getQueries();
    const result = queries.getSetting.get('many_agents');
    if (!result?.value) return [];
    return JSON.parse(result.value) || [];
  } catch {
    return [];
  }
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

    const { streamId, teamId, messages, memberAgentIds, supervisorInstructions } = payload || {};

    if (!streamId || !teamId || !Array.isArray(messages) || !Array.isArray(memberAgentIds)) {
      return { success: false, error: 'Invalid payload' };
    }

    const send = (data) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, ...data });
      }
    };

    try {
      const settings = getAISettings(database);
      const allAgents = loadAgents(database);
      const memberAgents = memberAgentIds
        .map((id) => allAgents.find((a) => a.id === id))
        .filter(Boolean);

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
Solo responde con el JSON, sin texto adicional.`;

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

        const agentSystemPrompt = agent.systemInstructions?.trim()
          || agent.description
          || `You are ${agent.name}, a specialized AI assistant.`;

        const agentMessages = [
          { role: 'system', content: agentSystemPrompt },
          {
            role: 'user',
            content: delegation.task || messages[messages.length - 1]?.content || '',
          },
        ];

        try {
          const result = await callLLM(settings, agentMessages, undefined, aiCloudService, ollamaService);
          agentResults.push({
            agentName: agent.name,
            agentId: agent.id,
            task: delegation.task,
            result: result.text,
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
      send({ error: error.message || 'Error desconocido en Agent Team' });
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
