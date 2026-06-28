'use strict';

/**
 * Dome-native subagent delegation for Many and Agent Team.
 * Exposes a `task` tool (Many) and `delegate_to_agent` (Agent Team) that run
 * nested AgentHarness turns with domain-specific tool subsets.
 */

const { readSubagentPrompt } = require('../prompts/prompts-loader.cjs');
const { getToolDefsBySubagent } = require('../tools/tool-definitions.cjs');
const { capToolResultString } = require('../tools/tool-result-cap.cjs');

const SUBAGENT_NAMES = ['research', 'library', 'writer', 'data'];

const SUBAGENT_DESCRIPTIONS = {
  research:
    'Delegate to the research subagent for web search, fetching URLs, and deep research. Use when the user needs external information, fact-finding, or in-depth analysis of a topic.',
  library:
    "Delegate to the library subagent to search, read, and organize the user's resources. Use when the user asks about their notes, PDFs, projects, or wants to organize their library.",
  writer:
    'Delegate to the writer subagent to create notes, flashcards, edit or delete resources, and modify notebooks. Use when the user wants to create content or study materials.',
  data:
    "Delegate to the data subagent for Excel AND PowerPoint. Use for spreadsheets or when the user wants to create a real .pptx presentation.",
};

const subagentPromptCache = new Map();

function getSubagentSystemPrompt(name) {
  if (subagentPromptCache.has(name)) return subagentPromptCache.get(name);
  const text = readSubagentPrompt(name);
  const prompt = typeof text === 'string' ? text.trim() : '';
  subagentPromptCache.set(name, prompt);
  return prompt;
}

function parseManySubagentEnv() {
  const raw = process.env.DOME_MANY_SUBAGENTS;
  if (raw === '') return [];
  const list = (raw || 'research,library,writer,data')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => SUBAGENT_NAMES.includes(s));
  return list.length > 0 ? list : SUBAGENT_NAMES;
}

function manySubagentIds() {
  return parseManySubagentEnv();
}

/**
 * Run one subagent turn via a nested harness (no further task delegation).
 * @param {string} agentName
 * @param {string} query
 * @param {object} parentOpts - provider/model/apiKey/baseUrl/runtimeContext/onChunk/signal
 */
async function runSubagentTurn(agentName, query, parentOpts) {
  const runAgent = parentOpts?.runAgent;
  if (typeof runAgent !== 'function') {
    throw new Error('runSubagentTurn requires parentOpts.runAgent');
  }
  const toolDefs = getToolDefsBySubagent()[agentName];
  if (!toolDefs?.length) {
    throw new Error(`No tools configured for subagent: ${agentName}`);
  }

  const systemPrompt = getSubagentSystemPrompt(agentName) || `You are the ${agentName} subagent.`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: String(query || '').trim() },
  ];

  const nestedOnChunk = parentOpts.onChunk
    ? (chunk) => {
        if (!chunk || typeof chunk !== 'object') return;
        const tagged = { ...chunk, agentName };
        parentOpts.onChunk(tagged);
      }
    : undefined;

  const text = await runAgent('subagent', {
    provider: parentOpts.provider,
    model: parentOpts.model,
    apiKey: parentOpts.apiKey,
    baseUrl: parentOpts.baseUrl,
    messages,
    toolDefinitions: toolDefs,
    useDirectTools: true,
    skipHitl: true,
    runtimeContext: parentOpts.runtimeContext,
    onChunk: nestedOnChunk,
    signal: parentOpts.signal,
    threadId: parentOpts.threadId
      ? `${parentOpts.threadId}_sub_${agentName}_${Date.now()}`
      : undefined,
    parentThreadId: parentOpts.threadId,
  });

  return typeof text === 'string' ? text : String(text?.text ?? text ?? '');
}

/**
 * Native `task` tool for Many supervisor delegation.
 * @param {object} parentOpts
 * @returns {import('@dome/agent-core').AgentTool}
 */
function buildTaskTool(parentOpts) {
  const ids = Array.isArray(parentOpts.subagentIds) && parentOpts.subagentIds.length > 0
    ? parentOpts.subagentIds.filter((n) => SUBAGENT_NAMES.includes(n))
    : manySubagentIds();
  const allowed = new Set(ids);
  return {
    name: 'task',
    label: 'Subagent',
    description:
      'Delegate a specialized subtask to a subagent (research, library, writer, or data). ' +
      'Use for parallel or domain-specific work; return findings to synthesize the final answer.',
    parameters: {
      type: 'object',
      properties: {
        subagent_type: {
          type: 'string',
          enum: ids.length > 0 ? ids : [...SUBAGENT_NAMES],
          description: 'Which subagent should handle this subtask',
        },
        prompt: {
          type: 'string',
          description: 'Clear instructions for the subagent (what to do and what to return)',
        },
      },
      required: ['subagent_type', 'prompt'],
    },
    async execute(_toolCallId, params, signal) {
      const subagentType = String(params?.subagent_type || '').trim().toLowerCase();
      const prompt = String(params?.prompt || '').trim();
      if (!SUBAGENT_NAMES.includes(subagentType)) {
        return {
          content: [{ type: 'text', text: `Unknown subagent_type: ${subagentType}` }],
          details: { error: true },
        };
      }
      if (!allowed.has(subagentType)) {
        return {
          content: [{
            type: 'text',
            text: `Subagent "${subagentType}" is disabled. Set DOME_MANY_SUBAGENTS or enable all four.`,
          }],
          details: { error: true },
        };
      }
      if (!prompt) {
        return {
          content: [{ type: 'text', text: 'prompt is required for task delegation' }],
          details: { error: true },
        };
      }
      try {
        const result = await runSubagentTurn(subagentType, prompt, {
          ...parentOpts,
          signal,
        });
        const capped = capToolResultString('task', result);
        return { content: [{ type: 'text', text: capped }], details: { subagent: subagentType } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Subagent ${subagentType} failed: ${msg}` }],
          details: { error: true, subagent: subagentType },
        };
      }
    },
  };
}

/**
 * `delegate_to_agent` tool for Agent Team supervisor.
 * @param {object} parentOpts
 * @param {Array<{ id: string, name: string, description?: string, systemInstructions?: string, toolIds?: string[] }>} memberAgents
 */
function buildDelegateToAgentTool(parentOpts, memberAgents) {
  const byKey = new Map();
  for (const agent of memberAgents) {
    const key = sanitizeSubagentKey(agent.name || agent.id);
    byKey.set(key, agent);
  }

  return {
    name: 'delegate_to_agent',
    label: 'Delegate',
    description:
      'Delegate a subtask to a team member agent. Use the member subagent key from the team list.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Subagent key for the team member (sanitized name)',
        },
        task: {
          type: 'string',
          description: 'Specific subtask instructions for this member',
        },
      },
      required: ['agent', 'task'],
    },
    async execute(_toolCallId, params, signal) {
      const key = sanitizeSubagentKey(String(params?.agent || ''));
      const task = String(params?.task || '').trim();
      const member = byKey.get(key);
      if (!member) {
        return {
          content: [{ type: 'text', text: `Unknown team agent key: ${key}` }],
          details: { error: true },
        };
      }
      if (!task) {
        return {
          content: [{ type: 'text', text: 'task is required for delegation' }],
          details: { error: true },
        };
      }

      const runAgent = parentOpts?.runAgent;
      if (typeof runAgent !== 'function') {
        return {
          content: [{ type: 'text', text: 'delegate_to_agent: runAgent callback missing' }],
          details: { error: true },
        };
      }
      const { getToolDefinitionsByIds } = require('../tools/tool-definitions.cjs');
      const toolIds = Array.isArray(member.toolIds) ? member.toolIds : [];
      const toolDefinitions = toolIds.length > 0 ? getToolDefinitionsByIds(toolIds) : [];

      const systemPrompt =
        (member.systemInstructions || member.description || `You are ${member.name}.`).trim();
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ];

      const nestedOnChunk = parentOpts.onChunk
        ? (chunk) => {
            if (!chunk || typeof chunk !== 'object') return;
            parentOpts.onChunk({ ...chunk, agentName: member.name });
          }
        : undefined;

      try {
        const text = await runAgent('agent-team-member', {
          provider: parentOpts.provider,
          model: parentOpts.model,
          apiKey: parentOpts.apiKey,
          baseUrl: parentOpts.baseUrl,
          messages,
          toolDefinitions,
          useDirectTools: toolDefinitions.length > 0,
          mcpServerIds: parentOpts.mcpServerIds,
          skipHitl: true,
          runtimeContext: parentOpts.runtimeContext,
          onChunk: nestedOnChunk,
          signal,
          threadId: parentOpts.threadId
            ? `${parentOpts.threadId}_member_${key}_${Date.now()}`
            : undefined,
          parentThreadId: parentOpts.threadId,
        });
        const result = typeof text === 'string' ? text : String(text?.text ?? text ?? '');
        const capped = capToolResultString('delegate_to_agent', result);
        return {
          content: [{ type: 'text', text: capped }],
          details: { agent: member.name, agentId: member.id },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Agent ${member.name} failed: ${msg}` }],
          details: { error: true, agent: member.name },
        };
      }
    },
  };
}

function sanitizeSubagentKey(name) {
  const raw = String(name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return raw || 'agent';
}

module.exports = {
  SUBAGENT_NAMES,
  SUBAGENT_DESCRIPTIONS,
  manySubagentIds,
  runSubagentTurn,
  buildTaskTool,
  buildDelegateToAgentTool,
  getSubagentSystemPrompt,
};
