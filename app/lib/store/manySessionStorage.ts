import type { ManyChatSession, ManyMessage } from '@/lib/store/useManyStore';
import { db } from '@/lib/db/client';

/** Legacy localStorage blob (pre-JSONL); read once for migration, not written anymore. */
export const SESSIONS_STORAGE_KEY = 'dome-many-sessions:v1';
export const SESSION_META_KEY = 'dome-many-sessions-meta:v1';
/** UI-only metadata (title, pin) — messages live in JSONL agent-sessions. */
export const SESSION_UI_META_KEY = 'dome-many-sessions-ui:v1';
export const DELETED_IDS_SETTING_KEY = 'dome-many-deleted-session-ids';
export const MAX_MANY_SESSIONS = 20;

export interface ManySessionUiMeta {
  title?: string;
  pinned?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type ManySessionUiMetaMap = Record<string, ManySessionUiMeta>;

export interface ManySessionsMeta {
  currentSessionId: string | null;
  deletedSessionIds: string[];
}

const MAX_TOMBSTONES = 200;

export function loadManySessionsMeta(): ManySessionsMeta {
  if (typeof window === 'undefined') {
    return { currentSessionId: null, deletedSessionIds: [] };
  }
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return { currentSessionId: null, deletedSessionIds: [] };
    const parsed = JSON.parse(raw) as Partial<ManySessionsMeta>;
    return {
      currentSessionId:
        typeof parsed.currentSessionId === 'string' ? parsed.currentSessionId : null,
      deletedSessionIds: Array.isArray(parsed.deletedSessionIds)
        ? parsed.deletedSessionIds.filter((id): id is string => typeof id === 'string').slice(-MAX_TOMBSTONES)
        : [],
    };
  } catch {
    return { currentSessionId: null, deletedSessionIds: [] };
  }
}

export function persistManySessionsMeta(meta: ManySessionsMeta): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      SESSION_META_KEY,
      JSON.stringify({
        currentSessionId: meta.currentSessionId,
        deletedSessionIds: meta.deletedSessionIds.slice(-MAX_TOMBSTONES),
      }),
    );
  } catch {
    // quota / private mode
  }
}

export function getDeletedManySessionIds(): Set<string> {
  return new Set(loadManySessionsMeta().deletedSessionIds);
}

export function isManySessionDeleted(sessionId: string): boolean {
  return getDeletedManySessionIds().has(sessionId);
}

function mergeDeletedIds(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].slice(-MAX_TOMBSTONES);
}

/** Load tombstones from SQLite settings and merge into localStorage meta. */
export async function syncManyDeletedIdsFromDb(): Promise<void> {
  if (!db.isAvailable()) return;
  try {
    const result = await db.getSetting(DELETED_IDS_SETTING_KEY);
    if (!result.success || !result.data) return;
    const parsed = JSON.parse(result.data) as unknown;
    if (!Array.isArray(parsed)) return;
    const fromDb = parsed.filter((id): id is string => typeof id === 'string');
    const meta = loadManySessionsMeta();
    meta.deletedSessionIds = mergeDeletedIds(meta.deletedSessionIds, fromDb);
    persistManySessionsMeta(meta);
  } catch {
    // ignore corrupt setting
  }
}

async function persistDeletedIdsToDb(ids: string[]): Promise<void> {
  if (!db.isAvailable()) return;
  try {
    await db.setSetting(DELETED_IDS_SETTING_KEY, JSON.stringify(ids.slice(-MAX_TOMBSTONES)));
  } catch {
    // ignore
  }
}

export function markManySessionDeleted(sessionId: string): void {
  const meta = loadManySessionsMeta();
  if (!meta.deletedSessionIds.includes(sessionId)) {
    meta.deletedSessionIds = mergeDeletedIds(meta.deletedSessionIds, [sessionId]);
  }
  if (meta.currentSessionId === sessionId) {
    meta.currentSessionId = null;
  }
  persistManySessionsMeta(meta);
  void persistDeletedIdsToDb(meta.deletedSessionIds);
}

export function filterOutDeletedSessions(sessions: ManyChatSession[]): ManyChatSession[] {
  const deleted = getDeletedManySessionIds();
  if (deleted.size === 0) return sessions;
  return sessions.filter((s) => !deleted.has(s.id));
}

export function loadManySessionUiMeta(): ManySessionUiMetaMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SESSION_UI_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ManySessionUiMetaMap;
  } catch {
    return {};
  }
}

export function persistManySessionUiMeta(meta: ManySessionUiMetaMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_UI_META_KEY, JSON.stringify(meta));
  } catch {
    // quota / private mode
  }
}

/** Remove the UI meta entry for a deleted session so it cannot be resurrected on next launch. */
export function removeManySessionUiMeta(sessionId: string): void {
  const meta = loadManySessionUiMeta();
  if (sessionId in meta) {
    delete meta[sessionId];
    persistManySessionUiMeta(meta);
  }
}

/**
 * Garbage-collect UI meta: keep only entries for real sessions (the reconciled
 * JSONL-backed list). Drops stale/empty drafts left over from older builds.
 * Call ONLY after a successful JSONL reconciliation to avoid wiping live data.
 */
export function pruneManySessionUiMeta(keepIds: Iterable<string>): void {
  const keep = new Set(keepIds);
  const meta = loadManySessionUiMeta();
  let changed = false;
  for (const id of Object.keys(meta)) {
    if (!keep.has(id)) {
      delete meta[id];
      changed = true;
    }
  }
  if (changed) persistManySessionUiMeta(meta);
}

function upsertSessionUiMeta(sessionId: string, patch: ManySessionUiMeta): void {
  const meta = loadManySessionUiMeta();
  meta[sessionId] = { ...meta[sessionId], ...patch };
  persistManySessionUiMeta(meta);
}

/** @deprecated Legacy flag — true when old localStorage session list exists (migration only). */
export function hasManySessionsLocalBackup(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSIONS_STORAGE_KEY) !== null;
}

/** One-time read of legacy localStorage sessions (messages included). */
export function loadLegacyManySessionsFromStorage(): ManyChatSession[] {
  if (typeof window === 'undefined') return [];
  const deleted = getDeletedManySessionIds();
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_MANY_SESSIONS)
      .filter(
        (s): s is ManyChatSession =>
          s &&
          typeof s === 'object' &&
          typeof s.id === 'string' &&
          Array.isArray(s.messages) &&
          !deleted.has(s.id),
      )
      .map(normalizeLoadedSession);
  } catch {
    return [];
  }
}

export function setPersistedCurrentManySessionId(sessionId: string | null): void {
  const meta = loadManySessionsMeta();
  meta.currentSessionId = sessionId;
  persistManySessionsMeta(meta);
}

/** Avoid markdown images / JSON blobs as session titles in the sidebar. */
export function sanitizeManySessionTitle(text: string): string {
  let s = String(text || '').trim();
  if (!s) return 'New chat';
  s = s
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{"tools"[\s\S]*?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstLine = s.split('\n').map((line) => line.trim()).find(Boolean) ?? s;
  const title = firstLine.slice(0, 50).trim();
  return title || 'New chat';
}

function normalizeLoadedSession(session: ManyChatSession): ManyChatSession {
  const fallbackTitle =
    session.messages.find((m: ManyMessage) => m.role === 'user')?.content ?? '';
  return {
    ...session,
    title:
      !session.title || session.title === 'New chat'
        ? sanitizeManySessionTitle(fallbackTitle)
        : sanitizeManySessionTitle(session.title),
    updatedAt:
      session.updatedAt ??
      session.messages[session.messages.length - 1]?.timestamp ??
      session.createdAt,
    pinned: session.pinned ?? false,
  };
}

export function loadManySessionsFromStorage(): {
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  messages: ManyMessage[];
} {
  if (typeof window === 'undefined') {
    return { sessions: [], currentSessionId: null, messages: [] };
  }
  const meta = loadManySessionsMeta();
  const uiMeta = loadManySessionUiMeta();
  const legacy = loadLegacyManySessionsFromStorage();
  const byId = new Map<string, ManyChatSession>();

  for (const leg of legacy) {
    byId.set(leg.id, leg);
  }

  for (const [id, patch] of Object.entries(uiMeta)) {
    if (getDeletedManySessionIds().has(id)) continue;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        ...existing,
        title: patch.title ? sanitizeManySessionTitle(patch.title) : existing.title,
        pinned: patch.pinned ?? existing.pinned,
        createdAt: patch.createdAt ?? existing.createdAt,
        updatedAt: patch.updatedAt ?? existing.updatedAt,
      });
    }
    // UI-meta-only entries (no legacy messages) are NOT materialized here.
    // The JSONL session repo is the source of truth and hydrateFromThreads
    // restores the real ones. This prevents empty/stale "New chat" drafts from
    // re-appearing on every launch.
  }

  const sessions = [...byId.values()].sort((a, b) => {
    const at = a.updatedAt ?? a.createdAt ?? 0;
    const bt = b.updatedAt ?? b.createdAt ?? 0;
    return bt - at;
  });

  if (sessions.length === 0) {
    // No sessions are materialized synchronously (they live in JSONL and are
    // restored by hydrateFromThreads). Preserve the last active session id, if
    // still valid, so ManyPanel can lazy-load its messages and resume it.
    const last = meta.currentSessionId;
    const resumeId = last && !getDeletedManySessionIds().has(last) ? last : null;
    return { sessions: [], currentSessionId: resumeId, messages: [] };
  }

  const persistedCurrent = meta.currentSessionId;
  const current =
    (persistedCurrent ? sessions.find((s) => s.id === persistedCurrent) : undefined) ??
    sessions[0]!;

  return {
    sessions,
    currentSessionId: current.id,
    messages: current.messages ?? [],
  };
}

/** Persist session list UI metadata only (messages live in JSONL). */
export function persistManySessions(sessions: ManyChatSession[]): void {
  const uiMeta = loadManySessionUiMeta();
  for (const session of filterOutDeletedSessions(sessions).slice(0, MAX_MANY_SESSIONS)) {
    uiMeta[session.id] = {
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt ?? session.createdAt,
    };
  }
  persistManySessionUiMeta(uiMeta);
}

/** Update UI meta for a single session (title/pin/timestamps). */
export function persistManySessionMeta(session: Pick<ManyChatSession, 'id' | 'title' | 'pinned' | 'createdAt' | 'updatedAt'>): void {
  upsertSessionUiMeta(session.id, {
    title: session.title,
    pinned: session.pinned,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt ?? session.createdAt,
  });
}
