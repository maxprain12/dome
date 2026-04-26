/* eslint-disable no-console */
/**
 * Subagents - Main Process
 *
 * Implements the LangChain subagents pattern: a main supervisor agent
 * coordinates specialized subagents (research, library, writer, data).
 * Each subagent is wrapped as a tool the main agent can invoke.
 */

const toolDispatcher = require('./tool-dispatcher.cjs');
const { executeToolInMain, getToolDefsBySubagent } = toolDispatcher;
const { readPrompt } = require('./prompts-loader.cjs');

/** Canonical subagent names. Order matters: it's the default tool order
 *  the supervisor sees, and the supervisor's choice can be order-biased. */
const SUBAGENT_NAMES = ['research', 'library', 'writer', 'data'];

/** Recursion limit for an individual subagent run. Mirrors the main agent's
 *  budget — Excel/PPT subagents legitimately loop over many rows/slides. */
const SUBAGENT_RECURSION_LIMIT = 100;

const SUBAGENT_DESCRIPTIONS = {
  research:
    'Delegate to the research subagent for web search, fetching URLs, and deep research. Use when the user needs external information, fact-finding, or in-depth analysis of a topic.',
  library:
    "Delegate to the library subagent to search, read, and organize the user's resources. Use when the user asks about their notes, PDFs, projects, or wants to organize their library.",
  writer:
    'Delegate to the writer subagent to create notes, flashcards, edit or delete resources, and modify notebooks (add/update/delete cells). Use when the user wants to create content, edit existing resources, add code to a notebook, or create study materials.',
  data: "Delegate to the data subagent for Excel AND PowerPoint. Use when the user works with spreadsheets (read/write cells, export) OR when they want to create a real .pptx presentation. For 'create PPT from folder X', 'presentación con documentos de [carpeta]', or any request for a PowerPoint file—delegate here. Never delegate PPT creation to writer (writer creates notes/documents, not .pptx).",
};

/** Cache prompt file contents — small, hot-path read on every tool call. */
const subagentPromptCache = new Map();
function getSubagentSystemPrompt(name) {
  if (subagentPromptCache.has(name)) return subagentPromptCache.get(name);
  const text = readPrompt(`martin/subagents/${name}.txt`);
  const prompt = typeof text === 'string' ? text.trim() : '';
  subagentPromptCache.set(name, prompt);
  return prompt;
}

/**
 * Create a subagent wrapped as a LangChain tool.
 * The main agent calls this tool with a query; the subagent executes
 * with its domain-specific tools and returns the last message content.
 *
 * @param {string} agentName - research | library | writer | data
 * @param {Object} llm - LangChain chat model
 * @param {Function} executeFn - (toolName, args) => result
 * @param {Function} createLangChainTools - (defs, executeFn) => Promise<LangChain tools[]>
 * @param {Function|null} onChunk - optional chunk emitter for real-time tool events
 * @returns {Promise<import('@langchain/core/tools').StructuredTool>}
 */
async function createSubagentAsTool(agentName, llm, executeFn, createLangChainTools, onChunk) {
  const { tool } = await import('@langchain/core/tools');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;
  const { createAgent } = await import('langchain');

  const toolDefs = getToolDefsBySubagent()[agentName];
  if (!toolDefs || toolDefs.length === 0) {
    throw new Error(`No tool definitions for subagent: ${agentName}`);
  }

  // Wrap executeFn to emit real-time tool_call / tool_result events
  let rtCounter = 0;
  const wrappedExecuteFn = onChunk
    ? async (name, args) => {
        const id = `sub_${agentName}_${name}_${++rtCounter}_${Date.now()}`;
        onChunk({
          type: 'tool_call',
          toolCall: {
            id,
            name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args || {}),
          },
        });
        const result = await executeFn(name, args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        onChunk({ type: 'tool_result', toolCallId: id, result: resultStr });
        return result;
      }
    : executeFn;

  const subagentTools = await createLangChainTools(toolDefs, wrappedExecuteFn);
  const subagent = createAgent({ model: llm, tools: subagentTools });

  const name = `call_${agentName}_agent`;
  const description = SUBAGENT_DESCRIPTIONS[agentName] || `Delegate to the ${agentName} subagent.`;
  const systemPrompt = getSubagentSystemPrompt(agentName);

  return tool(
    async ({ query }) => {
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
      const messages = [];
      if (systemPrompt) {
        messages.push(new SystemMessage(systemPrompt));
      }
      messages.push(new HumanMessage(query));
      const result = await subagent.invoke(
        { messages },
        { recursionLimit: SUBAGENT_RECURSION_LIMIT }
      );
      const lastMsg = result?.messages?.at(-1);
      const content = lastMsg?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const textParts = content.filter((b) => b?.type === 'text' && b?.text).map((b) => b.text);
        return textParts.join('\n') || JSON.stringify(content);
      }
      return JSON.stringify(content ?? result ?? {});
    },
    {
      name,
      description,
      schema: z.object({
        query: z
          .string()
          .describe('The task or question to send to the subagent. Include relevant context.'),
      }),
    },
  );
}

/**
 * Create all subagent-invocation tools for the main supervisor.
 * @param {Object} llm - LangChain chat model
 * @param {Function} createLangChainTools - (defs, executeFn) => Promise<tools[]>
 * @param {Function|null} onChunk - optional chunk emitter for real-time tool events
 * @returns {Promise<Array>} LangChain tools the main agent can call
 */
async function createSubagentTools(llm, createLangChainTools, onChunk, agentNames, toolContext) {
  const executeFn = (name, args) => executeToolInMain(name, args, toolContext);
  const agents = Array.isArray(agentNames)
    ? agentNames.filter((name) => typeof name === 'string' && name.trim().length > 0)
    : ['research', 'library', 'writer', 'data'];
  const tools = [];
  for (const name of agents) {
    try {
      const t = await createSubagentAsTool(name, llm, executeFn, createLangChainTools, onChunk);
      tools.push(t);
    } catch (err) {
      console.warn(`[Subagents] Failed to create ${name} subagent:`, err?.message);
    }
  }
  return tools;
}

module.exports = {
  createSubagentAsTool,
  createSubagentTools,
};
