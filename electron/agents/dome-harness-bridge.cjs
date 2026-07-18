'use strict';

/**
 * Bridge between Electron main process and `@dome/agent-core`'s AgentHarness.
 * Owns JSONL session storage, skills loading, and MCP → AgentTool conversion.
 */

const path = require('node:path');
const os = require('node:os');

const SESSION_CWD = 'dome';

/** Nested harness sessions (subagents, team delegates, forks) — hidden from Many chat list. */
const NESTED_THREAD_ID_RE = /_(sub|member|fork)_/;

/**
 * Non-Many surfaces that run through the agent runtime but must NOT appear in the
 * Many chat history (Learn/Studio generation, agent-canvas nodes). They mark their
 * sessions with one of these threadId prefixes.
 */
const NON_MANY_THREAD_PREFIXES = ['studio-', 'canvas-'];

function isNestedThreadId(threadId) {
  return typeof threadId === 'string' && NESTED_THREAD_ID_RE.test(threadId);
}

/** Root Many/user sessions only — child / non-Many surfaces stay off the sidebar list. */
function isRootSessionMeta(meta) {
  if (!meta || typeof meta.id !== 'string') return false;
  if (meta.parentSessionPath) return false;
  if (isNestedThreadId(meta.id)) return false;
  // Legacy per-run Many ids (pre stable threadId = sessionId).
  if (meta.id.startsWith('many_')) return false;
  // Learn/Studio + agent-canvas runs are not Many chats.
  if (NON_MANY_THREAD_PREFIXES.some((p) => meta.id.startsWith(p))) return false;
  return true;
}

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
 * @param {{ parentThreadId?: string, parentSessionPath?: string }} [options]
 * @returns {Promise<{ session: import('@dome/agent-core').Session, threadId: string }>}
 */
async function resolveSession(threadId, options = {}) {
  const core = await import('@dome/agent-core');
  const repo = await getSessionRepo();
  const list = await repo.list({ cwd: SESSION_CWD });

  if (threadId) {
    const existing = list.find((s) => s.id === threadId);
    if (existing) {
      const session = await repo.open(existing);
      return { session, threadId };
    }
    const createOpts = { cwd: SESSION_CWD, id: threadId };
    if (options.parentSessionPath) {
      createOpts.parentSessionPath = options.parentSessionPath;
    } else if (options.parentThreadId) {
      const parentMeta = list.find((s) => s.id === options.parentThreadId);
      if (parentMeta?.path) {
        createOpts.parentSessionPath = parentMeta.path;
      }
    }
    const session = await repo.create(createOpts);
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
  const { capToolResultString, getCapForTool, safeStringify, boundToolDetails } = require('../tools/tool-result-cap.cjs');
  const { getMCPTools } = require('../mcp/mcp-client.cjs');
  const mcpTools = await getMCPTools(database, mcpServerIds);
  if (!Array.isArray(mcpTools) || mcpTools.length === 0) return [];

  const { normalizeToolParameters } = await import('@dome/tools');
  return mcpTools.map((mcpTool) => {
    const name = typeof mcpTool.name === 'string' ? mcpTool.name : 'mcp_tool';
    const rawSchema = mcpTool.schema ?? {};
    // Coerce to a valid, non-empty JSON Schema object: strict providers
    // (MiniMax) reject empty `parameters` with error 2013.
    const schema = normalizeToolParameters(rawSchema);
    return {
      name,
      label: name,
      description: typeof mcpTool.description === 'string' ? mcpTool.description : '',
      // Plain JSON Schema — @dome/ai validateToolArguments accepts this without TypeBox.
      parameters: schema,
      async execute(_toolCallId, params, signal) {
        const out = await mcpTool.invoke(params, { signal });
        // safeStringify (not raw JSON.stringify): bounds serialization so a huge
        // MCP payload can't OOM the main process before the char cap runs (ELECTRON-7).
        // Native MCP tools already cap inside invoke; re-cap for defense in depth.
        const text = safeStringify(out ?? '');
        const capped = capToolResultString(name, text, { maxChars: getCapForTool(name) });
        // boundToolDetails: the loop persists `details` verbatim into the session
        // JSONL (createToolResultMessage → appendEntry → JSON.stringify). Returning
        // the raw `out` would OOM the main process at persistence time even though
        // `text` is capped — the actual ELECTRON-7 vector for huge snapshots.
        return { content: [{ type: 'text', text: capped }], details: boundToolDetails(out) };
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
 * @param {import('@dome/agent-core').AgentMessage[]} seedMessages
 */
async function seedSessionIfEmpty(session, seedMessages) {
  const ctx = await session.buildContext();
  if (ctx.messages.length > 0 || !Array.isArray(seedMessages)) return;

  const toSeed = seedMessages.filter(
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
  isNestedThreadId,
  isRootSessionMeta,
  getSessionsRoot,
  getSessionRepo,
  resolveSession,
  loadSkillsResources,
  buildMcpAgentTools,
  buildAllTools,
  seedSessionIfEmpty,
  findSessionMetadata,
};
