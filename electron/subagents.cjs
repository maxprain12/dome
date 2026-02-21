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
    data: "Delegate to the data subagent for Excel AND PowerPoint. Use when the user works with spreadsheets (read/write cells, export) OR when they want to create a real .pptx presentation. For 'create PPT from folder X', 'presentación con documentos de [carpeta]', or any request for a PowerPoint file—delegate here. Never delegate PPT creation to writer (writer creates notes/documents, not .pptx).",
  };

  const name = `call_${agentName}_agent`;
  const description = descriptions[agentName] || `Delegate to the ${agentName} subagent.`;

  const systemPrompts = {
    data: `You are the data subagent. You handle Excel and PowerPoint.
For PowerPoint: ALWAYS use ppt_create to create real .pptx files. NEVER use resource_create (writer's tool) for presentations—that creates notes/documents, not PPTs.

PREFER ppt_create with script (PptxGenJS) for rich, themed presentations. Generate full JavaScript code that:
- Uses: const PptxGenJS = require('pptxgenjs'); const pres = new PptxGenJS();
- Sets pres.layout = 'LAYOUT_16x9'; pres.title = '...';
- Adds slides with s.background, s.addText, s.addShape. Use hex colors WITHOUT # (e.g. "1E2761").
- For bullets: addText([{ text: 'X', options: { bullet: true, breakLine: true } }], { x, y, w, h });
- MUST end with: pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
Choose a palette (Midnight Executive, Forest & Moss, Ocean Gradient, etc.) matching the content.

FALLBACK: If you cannot generate a script, use ppt_create with spec (title, theme, slides array).

PPT from folder: (1) get_library_overview; (2) resource_list with folder_id; (3) resource_get for each doc (include_content: true); (4) build script or spec from content; (5) ppt_create with title, script (or spec), project_id, folder_id. If folder_id causes error, retry without it.`,
  };

  return tool(
    async ({ query }) => {
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
      const messages = [];
      if (systemPrompts[agentName]) {
        messages.push(new SystemMessage(systemPrompts[agentName]));
      }
      messages.push(new HumanMessage(query));
      const result = await subagent.invoke(
        { messages },
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
