/**
 * @dome/agent-core — SQLite session repository.
 *
 * Replaces the LangGraph `SqliteSaver` (Phase 6 will delete it). The DB
 * connection is **injected** by the caller (`@dome/app` passes the same
 * `better-sqlite3` handle used by `electron/database.cjs`), so this
 * package never opens its own SQLite file. This keeps the agent-core
 * testable in isolation (we use `:memory:` in unit tests) and respects
 * Dome's "one SQLite file" architecture for native modules.
 *
 * Persistence shape: one row per message, ordered by `message_index`
 * within a `thread_id`. This is intentionally a flat list — we don't
 * need LangGraph's nested channel/value structure for our use case,
 * and a flat list keeps the Runs UI (`RunLogView`) trivial to render.
 *
 * Schema versioning (R5): `dome_agent_sessions_meta` table tracks the
 * Dome-side schema version. When the version is outdated, we run
 * `applyMigrations()` before any query. The legacy `dome_checkpoint_meta`
 * (LangGraph) stays untouched until Phase 7 retires it.
 */

import type { AgentMessage, SessionRepo, ThreadSummary } from '../types.js';

/** Bump when `dome_agent_sessions*` structure changes. */
export const DOME_AGENT_SESSIONS_SCHEMA_VERSION = 1;

/** Minimal interface we need from a `better-sqlite3` connection. */
export interface SqliteConnection {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T extends (...args: any[]) => unknown>(fn: T): T;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS dome_agent_sessions (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    name TEXT,
    tool_call_id TEXT,
    tool_calls TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(thread_id, message_index)
  );
  CREATE INDEX IF NOT EXISTS idx_dome_sessions_thread
    ON dome_agent_sessions(thread_id);
  CREATE INDEX IF NOT EXISTS idx_dome_sessions_thread_created
    ON dome_agent_sessions(thread_id, created_at);

  CREATE TABLE IF NOT EXISTS dome_agent_sessions_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dome_agent_threads (
    thread_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_message_at INTEGER NOT NULL,
    message_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dome_threads_last
    ON dome_agent_threads(last_message_at DESC);
`;

/**
 * Apply the Dome-side session schema. Idempotent — safe to call on every
 * boot. The legacy `dome_checkpoint_meta` table is left alone (Phase 7
 * retires it).
 */
export function applySessionSchema(db: SqliteConnection): void {
  db.exec(SCHEMA_SQL);
  // Stamp the schema version if missing.
  const row = db.prepare(
    'SELECT value FROM dome_agent_sessions_meta WHERE key = ?',
  ).get('schema_version') as { value: string } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO dome_agent_sessions_meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(DOME_AGENT_SESSIONS_SCHEMA_VERSION));
  }
  // Future: `if (Number(row?.value) < N) { ... }` blocks.
}

// =============================================================================
// Helpers
// =============================================================================

function genId(prefix: string): string {
  // Stable, sortable, no external dep. crypto.randomUUID is fine in Node 19+.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function serializeMessage(m: AgentMessage): {
  role: string;
  content: string;
  name: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
} {
  // AssistantMessage vs Message — discriminated by presence of `text` (assistant)
  // vs `content` (user/system/tool). AssistantMessage also has `toolCalls`.
  const anyMsg = m as unknown as Record<string, unknown>;
  if (anyMsg.role === 'assistant' && 'text' in anyMsg) {
    const text = (anyMsg.text as string) ?? '';
    const toolCalls = anyMsg.toolCalls;
    return {
      role: 'assistant',
      content: text,
      name: (anyMsg.name as string) ?? null,
      tool_call_id: null,
      tool_calls: Array.isArray(toolCalls) ? JSON.stringify(toolCalls) : null,
    };
  }
  // Message — content can be string or array (multimodal).
  const content = anyMsg.content;
  return {
    role: String(anyMsg.role ?? 'user'),
    content: typeof content === 'string' ? content : JSON.stringify(content ?? ''),
    name: (anyMsg.name as string) ?? null,
    tool_call_id: (anyMsg as { toolCallId?: string }).toolCallId ?? null,
    tool_calls: null,
  };
}

function deserializeMessage(row: {
  role: string;
  content: string;
  name: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
}): AgentMessage {
  if (row.role === 'assistant') {
    let toolCalls: unknown = undefined;
    if (row.tool_calls) {
      try {
        toolCalls = JSON.parse(row.tool_calls);
      } catch {
        /* ignore */
      }
    }
    return {
      role: 'assistant',
      content: row.content, // kept for forward-compat (some callers read it)
      text: row.content,
      name: row.name ?? undefined,
      ...(toolCalls ? { toolCalls } : {}),
    } as AgentMessage;
  }
  // Other roles — preserve content as-is (string is the common case).
  return {
    role: row.role as 'system' | 'user' | 'tool',
    content: row.content,
    ...(row.name ? { name: row.name } : {}),
    ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
  } as unknown as AgentMessage;
}

// =============================================================================
// SessionRepo implementation
// =============================================================================

/**
 * Build a `SessionRepo` bound to the given SQLite connection. The
 * connection is assumed to already have the session schema applied (call
 * `applySessionSchema(db)` once at boot).
 */
export function createSqliteSessionRepo(db: SqliteConnection): SessionRepo {
  return {
    async append(threadId, message) {
      const serialized = serializeMessage(message);
      // message_index = current count for this thread (0-based, append-only).
      const countRow = db.prepare(
        'SELECT COUNT(*) as n FROM dome_agent_sessions WHERE thread_id = ?',
      ).get(threadId) as { n: number };
      const messageIndex = Number(countRow.n);
      const now = Date.now();
      const id = genId('msg');
      db.prepare(
        `INSERT INTO dome_agent_sessions
          (id, thread_id, message_index, role, content, name, tool_call_id, tool_calls, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        threadId,
        messageIndex,
        serialized.role,
        serialized.content,
        serialized.name,
        serialized.tool_call_id,
        serialized.tool_calls,
        now,
      );
      // Upsert the thread row.
      db.prepare(
        `INSERT INTO dome_agent_threads (thread_id, status, last_message_at, message_count, created_at)
         VALUES (?, 'active', ?, 1, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           last_message_at = excluded.last_message_at,
           message_count = message_count + 1`,
      ).run(threadId, now, now);
    },

    async load(threadId) {
      const rows = db.prepare(
        `SELECT role, content, name, tool_call_id, tool_calls
         FROM dome_agent_sessions
         WHERE thread_id = ?
         ORDER BY message_index ASC`,
      ).all(threadId) as Array<{
        role: string;
        content: string;
        name: string | null;
        tool_call_id: string | null;
        tool_calls: string | null;
      }>;
      return rows.map(deserializeMessage);
    },

    async list() {
      const rows = db.prepare(
        `SELECT thread_id, status, last_message_at, message_count
         FROM dome_agent_threads
         ORDER BY last_message_at DESC`,
      ).all() as Array<{
        thread_id: string;
        status: string;
        last_message_at: number;
        message_count: number;
      }>;
      return rows.map((r) => ({
        threadId: r.thread_id,
        lastMessageAt: r.last_message_at,
        messageCount: r.message_count,
        status: r.status as ThreadSummary['status'],
      }));
    },

    async branch(threadId, atIndex) {
      const newThreadId = genId('thread');
      // Copy messages [0..atIndex] into the new thread.
      const rows = db.prepare(
        `SELECT id, role, content, name, tool_call_id, tool_calls, created_at
         FROM dome_agent_sessions
         WHERE thread_id = ? AND message_index <= ?
         ORDER BY message_index ASC`,
      ).all(threadId, atIndex) as Array<{
        id: string;
        role: string;
        content: string;
        name: string | null;
        tool_call_id: string | null;
        tool_calls: string | null;
        created_at: number;
      }>;
      const insert = db.prepare(
        `INSERT INTO dome_agent_sessions
          (id, thread_id, message_index, role, content, name, tool_call_id, tool_calls, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = db.transaction(() => {
        rows.forEach((row, i) => {
          insert.run(
            genId('msg'),
            newThreadId,
            i,
            row.role,
            row.content,
            row.name,
            row.tool_call_id,
            row.tool_calls,
            row.created_at,
          );
        });
        if (rows.length > 0) {
          const last = rows[rows.length - 1];
          db.prepare(
            `INSERT INTO dome_agent_threads (thread_id, status, last_message_at, message_count, created_at)
             VALUES (?, 'active', ?, ?, ?)`,
          ).run(newThreadId, last.created_at, rows.length, last.created_at);
        }
      });
      tx();
      return newThreadId;
    },

    async truncateAfter(threadId, messageIndex) {
      const tx = db.transaction(() => {
        db.prepare(
          'DELETE FROM dome_agent_sessions WHERE thread_id = ? AND message_index > ?',
        ).run(threadId, messageIndex);
        // Recompute the thread summary so list() returns accurate counts.
        const remaining = db.prepare(
          'SELECT COUNT(*) as n, MAX(created_at) as last FROM dome_agent_sessions WHERE thread_id = ?',
        ).get(threadId) as { n: number; last: number | null };
        if (remaining.n === 0) {
          db.prepare('DELETE FROM dome_agent_threads WHERE thread_id = ?').run(threadId);
        } else {
          db.prepare(
            'UPDATE dome_agent_threads SET message_count = ?, last_message_at = ? WHERE thread_id = ?',
          ).run(remaining.n, remaining.last ?? Date.now(), threadId);
        }
      });
      tx();
    },
  };
}

// =============================================================================
// Convenience: a thread-status updater (used by the runtime loop)
// =============================================================================

/**
 * Update the status of a thread. Called by the loop on `done`/`error`.
 * Exposed as a free function (not part of SessionRepo) because the loop
 * is the only writer of `status` transitions; everything else in the
 * repo is just message I/O.
 */
export function updateThreadStatus(
  db: SqliteConnection,
  threadId: string,
  status: ThreadSummary['status'],
): void {
  db.prepare('UPDATE dome_agent_threads SET status = ? WHERE thread_id = ?').run(status, threadId);
}
