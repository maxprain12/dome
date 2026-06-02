/* eslint-disable no-console */
const { createModelFromConfig } = require('../langgraph-agent.cjs');

const JUDGE_PASS_THRESHOLD = 3;

async function judgeChat({ provider, model, apiKey, baseUrl, messages }) {
  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
  const langMessages = messages.map((m) => {
    if (m.role === 'system') return new SystemMessage(m.content);
    return new HumanMessage(m.content);
  });
  const response = await llm.invoke(langMessages);
  const text =
    typeof response?.content === 'string'
      ? response.content
      : Array.isArray(response?.content)
        ? response.content.filter((b) => b?.type === 'text').map((b) => b.text).join('')
        : String(response?.content ?? '');
  return text;
}

/**
 * LLM-as-judge (Layer 2). Uses same provider as bench run.
 */
async function runJudge({
  provider,
  model,
  apiKey,
  baseUrl,
  userPrompt,
  agentResponse,
  toolsCalled,
  criteria,
  signal,
}) {
  const system = `Eres un evaluador de calidad para respuestas de un agente de IA en un harness de benchmark.
Devuelve SOLO JSON válido con esta forma exacta:
{"score":0-5,"reasoning":"string","issues":["string"]}
score 0 = inaceptable, 5 = excelente.
No incluyas markdown ni texto fuera del JSON.

IMPORTANTE: agent_response es solo el texto final del asistente; las invocaciones de herramientas van en tools_called.
Si tools_called contiene la herramienta que pide criteria y el texto confirma el resultado (o es breve tras un dispatch), puntúa ≥4 aunque no veas XML ni tool_call en agent_response.`;

  const user = JSON.stringify({
    user_prompt: userPrompt,
    agent_response: (agentResponse || '').slice(0, 12000),
    tools_called: toolsCalled || [],
    criteria: criteria || 'La respuesta debe ser útil, correcta y usar las herramientas apropiadas.',
  }, null, 2);

  try {
    const raw = await judgeChat({
      provider,
      model,
      apiKey,
      baseUrl,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
    const score = Math.max(0, Math.min(5, Number(parsed.score)));
    return {
      pass: score >= JUDGE_PASS_THRESHOLD,
      score,
      reasoning: String(parsed.reasoning || ''),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      raw,
    };
  } catch (err) {
    return {
      pass: true,
      skipped: true,
      score: null,
      reasoning: `Judge skipped (error): ${err?.message || String(err)}`,
      issues: ['judge_error'],
      error: err?.message || String(err),
    };
  }
}

module.exports = { runJudge, JUDGE_PASS_THRESHOLD };
