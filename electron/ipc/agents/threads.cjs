/* eslint-disable no-console */
/**
 * IPC handlers for agent thread lifecycle (backed by JSONL sessions).
 *
 * Channels:
 *   threads:list         — list thread IDs and metadata
 *   threads:get-state    — current messages for a thread_id
 *   threads:get-history  — session tree entries for a thread_id
 *   threads:delete       — delete a JSONL session
 *   threads:update-state — fork session at current leaf (time-travel stub)
 *   threads:compact       — run harness compaction on a thread session
 *   threads:navigate-tree — branch to a tree entry (optional branch summary)
 */

const { z } = require('zod');
const bridge = require('../../agents/dome-harness-bridge.cjs');
const agentRuntime = require('../../agents/agent-runtime.cjs');
const database = require('../../core/database.cjs');
const { resolveProviderConfig } = require('../../ai/resolve-provider-config.cjs');

const ThreadsListOptsSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  /** When true (default), omit subagent / fork / child sessions from the list. */
  rootOnly: z.boolean().optional(),
});

const ThreadIdPayloadSchema = z.object({
  threadId: z.string().min(1),
});

const ThreadsGetHistoryPayloadSchema = z.object({
  threadId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const ThreadsUpdateStatePayloadSchema = z.object({
  threadId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  asNode: z.union([z.string(), z.null()]).optional(),
});

const ThreadsCompactPayloadSchema = z.object({
  threadId: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  customInstructions: z.string().optional(),
});

const ThreadsNavigateTreePayloadSchema = z.object({
  threadId: z.string().min(1),
  targetId: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  summarize: z.boolean().optional(),
  customInstructions: z.string().optional(),
  replaceInstructions: z.boolean().optional(),
  label: z.string().optional(),
});

async function openThreadSession(threadId) {
  const meta = await bridge.findSessionMetadata(threadId);
  if (!meta) return null;
  const repo = await bridge.getSessionRepo();
  const session = await repo.open(meta);
  return { meta, session, repo };
}

async function resolveThreadProviderConfig(provider, model) {
  const queries = database.getQueries();
  const providerResult = queries.getSetting.get('ai_provider');
  const modelResult = queries.getSetting.get('ai_model');
  const effectiveProvider = provider || providerResult?.value || 'openai';
  const effectiveModel = model || modelResult?.value;
  return resolveProviderConfig(database, effectiveProvider, effectiveModel);
}

function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('threads:list', async (event, raw) => {
    const parsedOpts = ThreadsListOptsSchema.safeParse(raw ?? {});
    if (!parsedOpts.success) {
      return { error: 'Invalid payload', threads: [] };
    }
    try {
      validateSender(event, windowManager);
      const repo = await bridge.getSessionRepo();
      let sessions = await repo.list({ cwd: bridge.SESSION_CWD });
      const rootOnly = parsedOpts.data.rootOnly !== false;
      if (rootOnly) {
        sessions = sessions.filter(bridge.isRootSessionMeta);
      }
      const limit = Math.min(Number(parsedOpts.data.limit ?? 100), 500);
      const threads = sessions.slice(0, limit).map((meta) => ({
        threadId: meta.id,
        checkpointCount: 0,
        latestCheckpointId: meta.id,
        metadata: {
          cwd: meta.cwd,
          path: meta.path,
          createdAt: meta.createdAt,
          parentSessionPath: meta.parentSessionPath ?? null,
        },
      }));
      return { threads };
    } catch (err) {
      console.error('[threads:list]', err?.message);
      return { error: err?.message ?? 'Unknown error', threads: [] };
    }
  });

  ipcMain.handle('threads:get-state', async (event, raw) => {
    const parsed = ThreadIdPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', state: null };
    }
    const { threadId } = parsed.data;
    try {
      validateSender(event, windowManager);
      const opened = await openThreadSession(threadId);
      if (!opened) return { state: null };
      const { meta, session } = opened;
      const ctx = await session.buildContext();
      const leafId = await session.getStorage().getLeafId();
      return {
        state: {
          threadId,
          checkpointId: leafId ?? meta.id,
          checkpoint: {
            channel_values: {
              messages: ctx.messages,
              thinkingLevel: ctx.thinkingLevel,
              model: ctx.model,
              activeToolNames: ctx.activeToolNames,
            },
          },
          metadata: meta,
          createdAt: meta.createdAt,
        },
      };
    } catch (err) {
      console.error('[threads:get-state]', err?.message);
      return { error: err?.message ?? 'Unknown error', state: null };
    }
  });

  ipcMain.handle('threads:get-history', async (event, raw) => {
    const parsed = ThreadsGetHistoryPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', history: [] };
    }
    const { threadId, limit: rawLimit } = parsed.data;
    try {
      validateSender(event, windowManager);
      const opened = await openThreadSession(threadId);
      if (!opened) return { threadId, history: [] };
      const { session } = opened;
      const entries = await session.getStorage().getEntries();
      const limit = Math.min(Number(rawLimit ?? 50), 200);
      const history = entries.slice(-limit).map((entry, idx) => ({
        checkpointId: entry.id,
        parentId: entry.parentId ?? null,
        metadata: { type: entry.type },
        createdAt: entry.timestamp,
        channel_values: entry,
        index: entries.length - entries.slice(-limit).length + idx,
      }));
      return { threadId, history };
    } catch (err) {
      console.error('[threads:get-history]', err?.message);
      return { error: err?.message ?? 'Unknown error', history: [] };
    }
  });

  ipcMain.handle('threads:delete', async (event, raw) => {
    const parsed = ThreadIdPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', deleted: 0 };
    }
    const { threadId } = parsed.data;
    try {
      validateSender(event, windowManager);
      const meta = await bridge.findSessionMetadata(threadId);
      if (!meta) return { deleted: 0 };
      const repo = await bridge.getSessionRepo();
      await repo.delete(meta);
      console.log(`[threads:delete] removed JSONL session ${threadId}`);
      return { deleted: 1 };
    } catch (err) {
      console.error('[threads:delete]', err?.message);
      return { error: err?.message ?? 'Unknown error', deleted: 0 };
    }
  });

  ipcMain.handle('threads:update-state', async (event, raw) => {
    const parsed = ThreadsUpdateStatePayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'Invalid payload', success: undefined };
    }
    const { threadId, values } = parsed.data;
    try {
      validateSender(event, windowManager);
      const opened = await openThreadSession(threadId);
      if (!opened) return { error: 'Thread not found' };
      const { meta, repo } = opened;
      const forked = await repo.fork(meta, {
        cwd: bridge.SESSION_CWD,
        id: `${threadId}_fork_${Date.now()}`,
      });
      const forkMeta = await forked.getMetadata();
      if (values && typeof values === 'object' && Array.isArray(values.messages)) {
        for (const msg of values.messages) {
          if (msg && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'toolResult')) {
            await forked.appendMessage(msg);
          }
        }
      }
      return {
        success: true,
        config: { configurable: { thread_id: forkMeta.id, parent_thread_id: threadId } },
      };
    } catch (err) {
      console.error('[threads:update-state]', err?.message);
      return { error: err?.message ?? 'Unknown error' };
    }
  });

  ipcMain.handle('threads:compact', async (event, raw) => {
    const parsed = ThreadsCompactPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'Invalid payload', success: false };
    }
    const { threadId, provider, model, customInstructions } = parsed.data;
    let cleanup = () => {};
    try {
      validateSender(event, windowManager);
      const providerConfig = await resolveThreadProviderConfig(provider, model);
      const setup = await agentRuntime.openHarnessForThread({
        threadId,
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
      });
      cleanup = setup.cleanup;
      const result = await setup.harness.compact(customInstructions);
      return { success: true, threadId, ...result };
    } catch (err) {
      console.error('[threads:compact]', err?.message);
      return { error: err?.message ?? 'Unknown error', success: false };
    } finally {
      cleanup();
    }
  });

  ipcMain.handle('threads:navigate-tree', async (event, raw) => {
    const parsed = ThreadsNavigateTreePayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'Invalid payload', success: false };
    }
    const {
      threadId,
      targetId,
      provider,
      model,
      summarize,
      customInstructions,
      replaceInstructions,
      label,
    } = parsed.data;
    let cleanup = () => {};
    try {
      validateSender(event, windowManager);
      const providerConfig = await resolveThreadProviderConfig(provider, model);
      const setup = await agentRuntime.openHarnessForThread({
        threadId,
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
      });
      cleanup = setup.cleanup;
      const result = await setup.harness.navigateTree(targetId, {
        summarize: summarize ?? false,
        customInstructions,
        replaceInstructions,
        label,
      });
      const leafId = await setup.session.getStorage().getLeafId();
      return { success: true, threadId, leafId, ...result };
    } catch (err) {
      console.error('[threads:navigate-tree]', err?.message);
      return { error: err?.message ?? 'Unknown error', success: false };
    } finally {
      cleanup();
    }
  });
}

module.exports = { register };
