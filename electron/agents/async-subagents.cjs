/* eslint-disable no-console */
/**
 * Async subagents — Main Process
 *
 * Non-blocking variant of the sync `call_*_agent` tools: the supervisor gets a
 * task_id immediately and can check, update, cancel, or list tasks while work
 * continues (same subagent graphs as subagents.cjs; in-process, not Agent Protocol HTTP).
 *
 * Inspired by LangChain deepagents async subagent middleware; Dome keeps task
 * metadata in a per-checkpoint-thread registry so IDs survive message trimming.
 */

const { randomUUID } = require('node:crypto');
const { buildSubagentRunner, SUBAGENT_NAMES } = require('./subagents.cjs');

/** @typedef {'pending'|'running'|'success'|'error'|'cancelled'} AsyncTaskStatus */

/** Max finished tasks retained per LangGraph thread (prevents unbounded memory). */
const MAX_TERMINAL_TASKS_PER_THREAD = 48;

/** threadId -> Map(taskId -> task) */
const tasksByThread = new Map();

function getThreadMap(threadId) {
  const key = threadId && String(threadId).length > 0 ? String(threadId) : '_default';
  if (!tasksByThread.has(key)) tasksByThread.set(key, new Map());
  return tasksByThread.get(key);
}

function pruneTerminalTasks(threadMap) {
  const terminal = [];
  for (const [id, t] of threadMap) {
    if (t.status === 'success' || t.status === 'error' || t.status === 'cancelled') {
      terminal.push({ id, updatedAt: t.updatedAt || 0 });
    }
  }
  if (terminal.length <= MAX_TERMINAL_TASKS_PER_THREAD) return;
  terminal.sort((a, b) => a.updatedAt - b.updatedAt);
  const toDrop = terminal.length - MAX_TERMINAL_TASKS_PER_THREAD;
  for (let i = 0; i < toDrop; i += 1) {
    threadMap.delete(terminal[i].id);
  }
}

/**
 * @param {string} threadId
 * @param {string} taskId
 * @returns {object|null}
 */
function getTask(threadId, taskId) {
  const m = getThreadMap(threadId);
  const t = m.get(String(taskId));
  return t || null;
}

function isAllowedAgent(name, enabledAgents) {
  const set = new Set(
    Array.isArray(enabledAgents) && enabledAgents.length > 0
      ? enabledAgents
      : SUBAGENT_NAMES,
  );
  return set.has(name);
}

/**
 * @param {object} opts
 * @param {string} opts.threadId
 * @param {import('@langchain/core').BaseChatModel} opts.llm
 * @param {Function} opts.createLangChainTools
 * @param {Function|null} [opts.onChunk]
 * @param {unknown} [opts.toolContext]
 * @param {string[]} [opts.subagentIds]
 * @param {string} [opts.provider]
 * @param {import('@langchain/langgraph').BaseStore | null} [opts.store]
 * @returns {Promise<Array>}
 */
async function createAsyncSubagentTools(opts) {
  const { tool } = await import('@langchain/core/tools');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;
  const { executeToolInMain } = require('../tools/tool-dispatcher.cjs');

  const threadId = opts.threadId && String(opts.threadId).length > 0 ? String(opts.threadId) : '_default';
  const { llm, createLangChainTools, onChunk, toolContext, provider, store } = opts;
  const enabledAgents = Array.isArray(opts.subagentIds)
    ? opts.subagentIds.filter((n) => typeof n === 'string' && n.trim().length > 0)
    : SUBAGENT_NAMES;

  const executeFn = (name, args) => executeToolInMain(name, args, toolContext);

  /** @type {Map<string, { run: (q: string, o?: { signal?: AbortSignal }) => Promise<string> }>} */
  const runners = new Map();
  for (const agentName of enabledAgents) {
    if (!SUBAGENT_NAMES.includes(agentName)) continue;
    try {
      const runner = await buildSubagentRunner(agentName, llm, executeFn, createLangChainTools, onChunk, {
        provider: provider || 'openai',
        store: store ?? null,
        toolContext,
      });
      runners.set(agentName, runner);
    } catch (err) {
      console.warn(`[AsyncSubagents] Failed to build runner for ${agentName}:`, err?.message);
    }
  }

  if (runners.size === 0) return [];

  function scheduleRun(task) {
    const runner = runners.get(task.agentName);
    if (!runner) {
      task.status = 'error';
      task.error = `Unknown or disabled subagent: ${task.agentName}`;
      task.updatedAt = Date.now();
      return;
    }
    task.generation = (task.generation || 0) + 1;
    const gen = task.generation;
    if (task.abortController) {
      try {
        task.abortController.abort();
      } catch {
        /* ignore */
      }
    }
    task.abortController = new AbortController();
    task.status = 'running';
    task.updatedAt = Date.now();

    void (async () => {
      try {
        const text = await runner.run(task.query, { signal: task.abortController.signal });
        if (task.generation !== gen) return;
        if (task.status === 'cancelled') return;
        task.status = 'success';
        task.result = text;
        task.error = undefined;
      } catch (err) {
        if (task.generation !== gen) return;
        if (task.status === 'cancelled') return;
        const msg = err && typeof err.message === 'string' ? err.message : String(err);
        if (task.abortController?.signal?.aborted || /abort/i.test(msg)) {
          task.status = 'cancelled';
          task.error = undefined;
        } else {
          task.status = 'error';
          task.error = msg;
        }
      } finally {
        if (task.generation === gen) {
          task.updatedAt = Date.now();
          pruneTerminalTasks(getThreadMap(threadId));
        }
      }
    })();
  }

  const startTool = tool(
    async ({ agent_name, query }) => {
      const name = String(agent_name || '').trim();
      if (!isAllowedAgent(name, enabledAgents) || !runners.has(name)) {
        return JSON.stringify({
          error: `Invalid or disabled agent_name. Use one of: ${[...runners.keys()].join(', ')}`,
        });
      }
      const taskId = randomUUID();
      const threadMap = getThreadMap(threadId);
      /** @type {any} */
      const task = {
        taskId,
        threadId,
        agentName: name,
        query: String(query || '').trim(),
        status: /** @type {AsyncTaskStatus} */ ('pending'),
        generation: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        checkedAt: 0,
        result: undefined,
        error: undefined,
        abortController: null,
      };
      threadMap.set(taskId, task);
      pruneTerminalTasks(threadMap);
      scheduleRun(task);
      return JSON.stringify({
        task_id: taskId,
        agent_name: name,
        status: task.status,
        message:
          'Task started in the background. Tell the user the task_id. Do not call check_async_subagent_task in the same turn right after start; continue the conversation and check only when the user asks or in a later turn.',
      });
    },
    {
      name: 'start_async_subagent_task',
      description:
        'Start a specialized subagent (research | library | writer | data) in the BACKGROUND. Returns task_id immediately so you can keep chatting. Same capabilities as call_*_agent but non-blocking. Use for long-running or parallel work. After starting, return to the user with the task_id; never poll check_async_subagent_task in a tight loop in the same turn. Prefer call_*_agent when the user needs the result in one shot.',
      schema: z.object({
        agent_name: z
          .string()
          .describe(`Which subagent to run. Must be one of: ${[...runners.keys()].join(', ')}.`),
        query: z.string().describe('Full task instructions and context for the subagent.'),
      }),
    },
  );

  const checkTool = tool(
    async ({ task_id }) => {
      const id = String(task_id || '').trim();
      const task = getTask(threadId, id);
      if (!task) {
        return JSON.stringify({ error: 'Unknown task_id for this conversation.', task_id: id });
      }
      task.checkedAt = Date.now();
      const base = {
        task_id: id,
        agent_name: task.agentName,
        status: task.status,
        updated_at: task.updatedAt,
      };
      if (task.status === 'success') return JSON.stringify({ ...base, result: task.result ?? '' });
      if (task.status === 'error') return JSON.stringify({ ...base, error: task.error || 'error' });
      if (task.status === 'cancelled') return JSON.stringify({ ...base, message: 'cancelled' });
      return JSON.stringify({
        ...base,
        message: 'Still running. Statuses in older messages may be stale — this object is fresh.',
      });
    },
    {
      name: 'check_async_subagent_task',
      description:
        'Get live status and result of a background subagent task. Always pass the full task_id UUID. If status is still running, tell the user to wait; do not assume text from earlier turns is up to date.',
      schema: z.object({
        task_id: z.string().uuid().describe('Exact task_id returned by start_async_subagent_task.'),
      }),
    },
  );

  const updateTool = tool(
    async ({ task_id, new_instructions }) => {
      const id = String(task_id || '').trim();
      const task = getTask(threadId, id);
      if (!task) {
        return JSON.stringify({ error: 'Unknown task_id for this conversation.', task_id: id });
      }
      if (task.status === 'success' || task.status === 'error' || task.status === 'cancelled') {
        return JSON.stringify({
          error: 'Task already finished; start a new task instead.',
          task_id: id,
          status: task.status,
        });
      }
      const add = String(new_instructions || '').trim();
      const prior = String(task.query || '').trim();
      task.query =
        add.length > 0
          ? `${prior}\n\n--- Supervisor follow-up ---\n${add}`
          : prior;
      task.updatedAt = Date.now();
      scheduleRun(task);
      return JSON.stringify({
        task_id: id,
        status: task.status,
        message:
          'Updated instructions applied; previous run was interrupted and the subagent restarted with full history in the task query. task_id unchanged.',
      });
    },
    {
      name: 'update_async_subagent_task',
      description:
        'Send new instructions to a running background subagent. Interrupts the current run and restarts with the same task_id and merged instructions. Do not use on finished tasks.',
      schema: z.object({
        task_id: z.string().uuid().describe('Exact task_id from start_async_subagent_task.'),
        new_instructions: z.string().describe('Additional or revised instructions for the subagent.'),
      }),
    },
  );

  const cancelTool = tool(
    async ({ task_id }) => {
      const id = String(task_id || '').trim();
      const task = getTask(threadId, id);
      if (!task) {
        return JSON.stringify({ error: 'Unknown task_id for this conversation.', task_id: id });
      }
      if (task.status === 'success' || task.status === 'error' || task.status === 'cancelled') {
        return JSON.stringify({ task_id: id, status: task.status, message: 'Task already terminal.' });
      }
      task.status = 'cancelled';
      task.updatedAt = Date.now();
      if (task.abortController) {
        try {
          task.abortController.abort();
        } catch {
          /* ignore */
        }
      }
      return JSON.stringify({ task_id: id, status: 'cancelled', message: 'Cancellation requested.' });
    },
    {
      name: 'cancel_async_subagent_task',
      description: 'Cancel a running background subagent task by task_id.',
      schema: z.object({
        task_id: z.string().uuid().describe('Exact task_id from start_async_subagent_task.'),
      }),
    },
  );

  const listTool = tool(
    async () => {
      const m = getThreadMap(threadId);
      const rows = [];
      for (const [id, t] of m) {
        rows.push({
          task_id: id,
          agent_name: t.agentName,
          status: t.status,
          created_at: t.createdAt,
          updated_at: t.updatedAt,
        });
      }
      rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      return JSON.stringify({ tasks: rows, note: 'Prefer check_async_subagent_task for authoritative status of a single task.' });
    },
    {
      name: 'list_async_subagent_tasks',
      description:
        'List all background subagent tasks for this chat thread with current cached status. Use after summarization if task_ids might have been dropped from message history.',
      schema: z.object({}),
    },
  );

  return [startTool, checkTool, updateTool, cancelTool, listTool];
}

module.exports = {
  createAsyncSubagentTools,
};
