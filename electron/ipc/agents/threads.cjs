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
 */

const { z } = require('zod');
const bridge = require('../../agents/dome-harness-bridge.cjs');

const ThreadsListOptsSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
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

async function openThreadSession(threadId) {
  const meta = await bridge.findSessionMetadata(threadId);
  if (!meta) return null;
  const repo = await bridge.getSessionRepo();
  const session = await repo.open(meta);
  return { meta, session, repo };
}

function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('threads:list', async (event, raw) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized', threads: [] };
    const parsedOpts = ThreadsListOptsSchema.safeParse(raw ?? {});
    if (!parsedOpts.success) {
      return { error: 'Invalid payload', threads: [] };
    }
    try {
      const repo = await bridge.getSessionRepo();
      const sessions = await repo.list({ cwd: bridge.SESSION_CWD });
      const limit = Math.min(Number(parsedOpts.data.limit ?? 100), 500);
      const threads = [];
      for (const meta of sessions.slice(0, limit)) {
        let entryCount = 0;
        try {
          const session = await repo.open(meta);
          const entries = await session.getStorage().getEntries();
          entryCount = entries.length;
        } catch {
          entryCount = 0;
        }
        threads.push({
          threadId: meta.id,
          checkpointCount: entryCount,
          latestCheckpointId: meta.id,
          metadata: {
            cwd: meta.cwd,
            path: meta.path,
            createdAt: meta.createdAt,
            parentSessionPath: meta.parentSessionPath ?? null,
          },
        });
      }
      return { threads };
    } catch (err) {
      console.error('[threads:list]', err?.message);
      return { error: err?.message ?? 'Unknown error', threads: [] };
    }
  });

  ipcMain.handle('threads:get-state', async (event, raw) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized', state: null };
    const parsed = ThreadIdPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', state: null };
    }
    const { threadId } = parsed.data;
    try {
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
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized', history: [] };
    const parsed = ThreadsGetHistoryPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', history: [] };
    }
    const { threadId, limit: rawLimit } = parsed.data;
    try {
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
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized', deleted: 0 };
    const parsed = ThreadIdPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'threadId required', deleted: 0 };
    }
    const { threadId } = parsed.data;
    try {
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
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    const parsed = ThreadsUpdateStatePayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { error: 'Invalid payload', success: undefined };
    }
    const { threadId, values } = parsed.data;
    try {
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
}

module.exports = { register };
