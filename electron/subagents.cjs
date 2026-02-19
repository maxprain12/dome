/* eslint-disable no-console */
/**
 * Subagents - Main Process
 *
 * Implements the LangChain subagents pattern: a main supervisor agent
 * coordinates specialized subagents (research, library, writer, data).
 * Each subagent is wrapped as a tool the main agent can invoke.
 */

const aiChatWithTools = require('./ai-chat-with-tools.cjs');
const { executeToolInMain, getToolDefsBySubagent } = aiChatWithTools;

/**
 * Create a subagent wrapped as a LangChain tool.
 * The main agent calls this tool with a query; the subagent executes
 * with its domain-specific tools and returns the last message content.
 *
 * @param {string} agentName - research | library | writer | data
 * @param {Object} llm - LangChain chat model
 * @param {Function} executeFn - (toolName, args) => result
 * @param {Function} createLangChainTools - (defs, executeFn) => Promise<LangChain tools[]>
 * @returns {Promise<import('@langchain/core/tools').StructuredTool>}
 */
async function createSubagentAsTool(agentName, llm, executeFn, createLangChainTools) {
  const { tool } = await import('@langchain/core/tools');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;
  const { createAgent } = await import('langchain');

  const toolDefs = getToolDefsBySubagent()[agentName];
  if (!toolDefs || toolDefs.length === 0) {
    throw new Error(`No tool definitions for subagent: ${agentName}`);
  }

  const subagentTools = await createLangChainTools(toolDefs, executeFn);
  const subagent = createAgent({ model: llm, tools: subagentTools });

  const descriptions = {
    research:
      'Delegate to the research subagent for web search, fetching URLs, and deep research. Use when the user needs external information, fact-finding, or in-depth analysis of a topic.',
    library:
      'Delegate to the library subagent to search, read, and organize the user\'s resources. Use when the user asks about their notes, PDFs, projects, or wants to organize their library.',
    writer:
      'Delegate to the writer subagent to create notes, flashcards, edit or delete resources, and modify notebooks (add/update/delete cells). Use when the user wants to create content, edit existing resources, add code to a notebook, or create study materials.',
    data: "Delegate to the data subagent for Excel spreadsheets. Use when the user works with spreadsheets: read/write cells, add rows, create or export Excel files. Use excel_get_file_path when the user wants to analyze Excel data in a notebook (returns path for pd.read_excel).",
  };

  const name = `call_${agentName}_agent`;
  const description = descriptions[agentName] || `Delegate to the ${agentName} subagent.`;

  return tool(
    async ({ query }) => {
      const { HumanMessage } = await import('@langchain/core/messages');
      const result = await subagent.invoke(
        { messages: [new HumanMessage(query)] },
        { recursionLimit: 100 }
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
 * @returns {Promise<Array>} LangChain tools the main agent can call
 */
async function createSubagentTools(llm, createLangChainTools) {
  const executeFn = (name, args) => executeToolInMain(name, args);
  const agents = ['research', 'library', 'writer', 'data'];
  const tools = [];
  for (const name of agents) {
    try {
      const t = await createSubagentAsTool(name, llm, executeFn, createLangChainTools);
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
