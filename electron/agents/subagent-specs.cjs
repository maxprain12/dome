/* eslint-disable no-console */
'use strict';

/**
 * Build deepagents SubAgent specs for createDeepAgent({ subagents }).
 * Replaces call_*_agent wrapper tools with native `task` delegation.
 */

const toolDispatcher = require('../tools/tool-dispatcher.cjs');
const { executeToolInMain, getToolDefsBySubagent } = toolDispatcher;
const { readPrompt } = require('../prompts/prompts-loader.cjs');
const { capToolResultString } = require('../tools/tool-result-cap.cjs');
const { SUBAGENT_NAMES, SUBAGENT_DESCRIPTIONS, SUBAGENT_HITL } = require('./subagents.cjs');
const { buildAgentMiddlewareStack } = require('./agent-middleware.cjs');
const { buildSkillsMiddleware } = require('../skills/index.cjs');
const { userSkillsDir } = require('../skills/index.cjs');

const subagentPromptCache = new Map();

function getSubagentSystemPrompt(name) {
  if (subagentPromptCache.has(name)) return subagentPromptCache.get(name);
  const text = readPrompt(`martin/subagents/${name}.txt`);
  const prompt = typeof text === 'string' ? text.trim() : '';
  subagentPromptCache.set(name, prompt);
  return prompt;
}

/**
 * @param {string} agentName
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} llm
 * @param {Function} createLangChainTools
 * @param {unknown} toolContext
 * @param {{ provider?: string, store?: import('@langchain/langgraph').BaseStore | null }} runtimeOpts
 */
async function buildDeepAgentSubagentSpec(agentName, llm, createLangChainTools, toolContext, runtimeOpts = {}) {
  const { provider = 'openai', store = null } = runtimeOpts;
  const toolDefs = getToolDefsBySubagent()[agentName];
  if (!toolDefs?.length) {
    throw new Error(`No tool definitions for subagent: ${agentName}`);
  }

  const executeFn = async (name, args) => {
    const result = await executeToolInMain(name, args, toolContext);
    const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
    return capToolResultString(name, resultStr0);
  };

  const subagentTools = await createLangChainTools(toolDefs, executeFn, toolContext);
  const skillsMw = await buildSkillsMiddleware();
  const middleware = await buildAgentMiddlewareStack({
    profile: 'worker',
    provider,
    llm,
    tools: subagentTools,
    skillsMiddleware: skillsMw,
    store,
    harnessStack: 'deep',
  });

  const spec = {
    name: agentName,
    description: SUBAGENT_DESCRIPTIONS[agentName] || `Specialized ${agentName} subagent for Dome.`,
    systemPrompt: getSubagentSystemPrompt(agentName),
    model: llm,
    tools: subagentTools,
    middleware,
    skills: [userSkillsDir()],
  };

  const hitl = SUBAGENT_HITL[agentName];
  if (hitl) {
    spec.interruptOn = hitl;
  }

  return spec;
}

/**
 * @param {Object} opts
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} opts.llm
 * @param {Function} opts.createLangChainTools
 * @param {unknown} [opts.toolContext]
 * @param {string[]} [opts.agentNames]
 * @param {{ provider?: string, store?: import('@langchain/langgraph').BaseStore | null }} [opts.runtime]
 */
async function buildDeepAgentSubagentSpecs(opts) {
  const { llm, createLangChainTools, toolContext, runtime = {} } = opts;
  const agents = Array.isArray(opts.agentNames)
    ? opts.agentNames.filter((n) => typeof n === 'string' && SUBAGENT_NAMES.includes(n))
    : SUBAGENT_NAMES;

  const specs = [];
  for (const name of agents) {
    try {
      specs.push(
        await buildDeepAgentSubagentSpec(name, llm, createLangChainTools, toolContext, runtime),
      );
    } catch (err) {
      console.warn(`[SubagentSpecs] Failed to build ${name}:`, err?.message);
    }
  }
  return specs;
}

module.exports = {
  SUBAGENT_HITL,
  buildDeepAgentSubagentSpec,
  buildDeepAgentSubagentSpecs,
};
