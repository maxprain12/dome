'use strict';

/**
 * Bridge between Electron main process and `@dome/agent-core`'s AgentHarness.
 * Owns JSONL session storage, skills loading, and MCP → AgentTool conversion.
 */

const path = require('path');
const os = require('os');

const SESSION_CWD = 'dome';

let sessionRepo = null;
let sessionEnv = null;

function getUserDataPath() {
  try {
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    return path.join(os.homedir(), '.dome');
  }
}

function getSessionsRoot() {
  return path.join(getUserDataPath(), 'agent-sessions');
}

async function getSessionEnv() {
  if (!sessionEnv) {
    const { NodeExecutionEnv } = await import('@dome/agent-core/node');
    sessionEnv = new NodeExecutionEnv({ cwd: process.cwd() });
  }
  return sessionEnv;
}

async function getSessionRepo() {
  if (!sessionRepo) {
    const core = await import('@dome/agent-core');
    const env = await getSessionEnv();
    sessionRepo = new core.JsonlSessionRepo({
      fs: env,
      sessionsRoot: getSessionsRoot(),
    });
  }
  return sessionRepo;
}

/**
 * @param {string|undefined|null} threadId
 * @returns {Promise<{ session: import('@dome/agent-core').Session, threadId: string }>}
 */
async function resolveSession(threadId) {
  const core = await import('@dome/agent-core');
  const repo = await getSessionRepo();
  const list = await repo.list({ cwd: SESSION_CWD });

  if (threadId) {
    const existing = list.find((s) => s.id === threadId);
    if (existing) {
      const session = await repo.open(existing);
      return { session, threadId };
    }
    const session = await repo.create({ cwd: SESSION_CWD, id: threadId });
    return { session, threadId };
  }

  const session = await repo.create({ cwd: SESSION_CWD });
  const meta = await session.getMetadata();
  return { session, threadId: meta.id };
}

/**
 * @returns {Promise<{ skills: import('@dome/agent-core').Skill[] }>}
 */
async function loadSkillsResources() {
  const core = await import('@dome/agent-core');
  const { NodeExecutionEnv } = await import('@dome/agent-core/node');
  const skillsIndex = require('../skills/index.cjs');
  const dir = skillsIndex.userSkillsDir();
  const env = new NodeExecutionEnv({ cwd: dir });
  const { skills, diagnostics } = await core.loadSkills(env, dir);
  for (const d of diagnostics) {
    console.warn(`[AgentHarness] skill ${d.code}: ${d.message} (${d.path})`);
  }
  return { skills: skills ?? [] };
}

/**
 * @param {object} database
 * @param {string[]} mcpServerIds
 * @returns {Promise<import('@dome/agent-core').AgentTool[]>}
 */
async function buildMcpAgentTools(database, mcpServerIds) {
  if (!Array.isArray(mcpServerIds) || mcpServerIds.length === 0) return [];
  const { Type } = await import('typebox');
  const { capToolResultString, getCapForTool } = require('../tools/tool-result-cap.cjs');
  const { getMCPTools } = require('../mcp/mcp-client.cjs');
  const lcTools = await getMCPTools(database, mcpServerIds);
  if (!Array.isArray(lcTools) || lcTools.length === 0) return [];

  return lcTools.map((lcTool) => {
    const name = typeof lcTool.name === 'string' ? lcTool.name : 'mcp_tool';
    const schema = lcTool.schema ?? lcTool.lc_kwargs?.schema ?? {};
    return {
      name,
      label: name,
      description: typeof lcTool.description === 'string' ? lcTool.description : '',
      parameters: Type.Unsafe(schema),
      async execute(_toolCallId, params, signal) {
        const out = await lcTool.invoke(params, { signal });
        const text = typeof out === 'string' ? out : JSON.stringify(out ?? '');
        const capped = capToolResultString(name, text, { maxChars: getCapForTool(name) });
        return { content: [{ type: 'text', text: capped }], details: out };
      },
    };
  });
}

/**
 * @param {object} database
 * @param {{ toolDefinitions?: unknown[], mcpServerIds?: string[] }} opts
 * @param {(name: string, args: unknown) => Promise<unknown>} executeToolInMain
 * @returns {Promise<import('@dome/agent-core').AgentTool[]>}
 */
async function buildAllTools(database, opts, executeToolInMain) {
  const toolsPkg = await import('@dome/tools');
  const domeTools = toolsPkg.createToolRegistry(opts.toolDefinitions, { executeToolInMain });
  const mcpTools = await buildMcpAgentTools(database, opts.mcpServerIds);
  const byName = new Map();
  for (const t of domeTools) byName.set(t.name, t);
  for (const t of mcpTools) {
    if (!byName.has(t.name)) byName.set(t.name, t);
  }
  return [...byName.values()];
}

/**
 * Seed an empty session with prior conversation turns (renderer inline history).
 * @param {import('@dome/agent-core').Session} session
 * @param {import('@dome/agent-core').AgentMessage[]} piMessages
 */
async function seedSessionIfEmpty(session, piMessages) {
  const ctx = await session.buildContext();
  if (ctx.messages.length > 0 || !Array.isArray(piMessages)) return;

  const toSeed = piMessages.filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'),
  );
  if (toSeed.length <= 1) return;

  for (const m of toSeed.slice(0, -1)) {
    await session.appendMessage(m);
  }
}

/**
 * @param {string|undefined|null} threadId
 * @returns {Promise<import('@dome/agent-core').JsonlSessionMetadata|null>}
 */
async function findSessionMetadata(threadId) {
  if (!threadId) return null;
  const repo = await getSessionRepo();
  const list = await repo.list({ cwd: SESSION_CWD });
  return list.find((s) => s.id === threadId) ?? null;
}

module.exports = {
  SESSION_CWD,
  getSessionsRoot,
  getSessionRepo,
  resolveSession,
  loadSkillsResources,
  buildMcpAgentTools,
  buildAllTools,
  seedSessionIfEmpty,
  findSessionMetadata,
};
