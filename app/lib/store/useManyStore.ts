import { create } from 'zustand';
import { db } from '@/lib/db/client';
import {
  filterOutDeletedSessions,
  isManySessionDeleted,
  loadManySessionsFromStorage,
  loadManySessionUiMeta,
  markManySessionDeleted,
  MAX_MANY_SESSIONS,
  persistManySessionMeta,
  persistManySessions,
  sanitizeManySessionTitle,
  setPersistedCurrentManySessionId,
} from '@/lib/store/manySessionStorage';
import {
  isNestedManyThreadId,
  listManyThreadSummaries,
} from '@/lib/chat/manyThreadBridge';

export type ManyStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

export interface PinnedResource {
  id: string;
  title: string;
  type: string;
}

/** Pending PDF region crop for cloud-vision Q&A in Many (memory only; not persisted). */
export interface PendingPdfRegion {
  imageDataUrl: string;
  resourceId: string;
  page: number;
  resourceTitle: string;
}

/** Metadata for PDF region Q&A (for handoff / copy in Many). */
export interface PdfRegionMeta {
  resourceId: string;
  page: number;
  resourceTitle: string;
  question: string;
}

export interface ManyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Tool calls for assistant messages (traceability) */
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }>;
  /** Reasoning/chain-of-thought for assistant messages */
  thinking?: string;
  /** When set on assistant message, show PDF region handoff actions in Many */
  source?: 'pdf_region';
  pdfRegionMeta?: PdfRegionMeta;
}

export interface ManyChatSession {
  id: string;
  title: string;
  messages: ManyMessage[];
  createdAt: number;
  /** Last activity (message) — used for ordering / grouping in history */
  updatedAt?: number;
  /** Pinned sessions stay at the top of the list */
  pinned?: boolean;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function trimSessions(sessions: ManyChatSession[], currentId: string | null): ManyChatSession[] {
  const trimmed = sessions.slice(0, MAX_MANY_SESSIONS);
  if (!currentId || trimmed.some((s) => s.id === currentId)) return trimmed;
  const current = sessions.find((s) => s.id === currentId);
  if (!current) return trimmed;
  return [current, ...trimmed.filter((s) => s.id !== currentId)].slice(0, MAX_MANY_SESSIONS);
}

const initialState = loadManySessionsFromStorage();

// Ensure we have at least one session when store hydrates with empty state
function ensureInitialSession(
  state: { sessions: ManyChatSession[]; currentSessionId: string | null; messages: ManyMessage[] }
): typeof state {
  if (state.sessions.length > 0) return state;
  const newSession: ManyChatSession = {
    id: createSessionId(),
    title: 'New chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  persistManySessions([newSession]);
  setPersistedCurrentManySessionId(newSession.id);
  return {
    sessions: [newSession],
    currentSessionId: newSession.id,
    messages: [],
  };
}

const hydratedState = ensureInitialSession(initialState);

interface ManyState {
  isOpen: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
  status: ManyStatus;
  messages: ManyMessage[];
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  currentInput: string;
  unreadCount: number;
  lastNotification: string | null;
  currentResourceId: string | null;
  currentResourceTitle: string | null;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setMinimized: (minimized: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setStatus: (status: ManyStatus) => void;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  startNewChat: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => void;
  toggleSessionPin: (id: string) => void;
  hydrateSession: (session: ManyChatSession) => void;
  /** Load session list from JSONL (PI) and merge with local UI meta. */
  hydrateFromThreads: () => Promise<void>;
  setCurrentInput: (input: string) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  setNotification: (message: string | null) => void;
  setContext: (resourceId: string | null, resourceTitle: string | null) => void;
  clearContext: () => void;
  suggestedQuestions: string[];
  setSuggestedQuestions: (questions: string[]) => void;
  clearSuggestedQuestions: () => void;
  petPromptOverride: string | null;
  setPetPromptOverride: (prompt: string | null) => void;
  /** Resources pinned as context for the current session (not persisted) */
  pinnedResources: PinnedResource[];
  addPinnedResource: (resource: PinnedResource) => void;
  removePinnedResource: (id: string) => void;
  clearPinnedResources: () => void;
  /** Skill invoked for the next user message only (slash one-shot); cleared after send */
  pendingOneShotSkillId: string | null;
  setPendingOneShotSkill: (id: string | null) => void;
  /** Sticky skill per Many session (in-memory); applies until cleared */
  activeSkillIdBySession: Record<string, string | null>;
  setActiveSkillForSession: (sessionId: string, skillId: string | null) => void;
  /** Last text-to-speech error (voice assistant HUD) */
  ttsError: string | null;
  setTtsError: (message: string | null) => void;
  /** Sentence currently being spoken by streaming TTS (for live HUD transcript) */
  currentSentence: string | null;
  setCurrentSentence: (sentence: string | null) => void;
  /** Draft message queued from PDF region handoff (consumed by ManyPanel) */
  pendingManyHandoff: string | null;
  setPendingManyHandoff: (value: string | null) => void;
  /** PDF region crop + resource ref before the user asks in Many */
  pendingPdfRegion: PendingPdfRegion | null;
  setPendingPdfRegion: (value: PendingPdfRegion | null) => void;
  clearPendingPdfRegion: () => void;
}

export const useManyStore = create<ManyState>((set, get) => ({
  ...hydratedState,
  isOpen: false,
  isMinimized: false,
  isFullscreen: false,
  status: 'idle',
  currentInput: '',
  unreadCount: 0,
  lastNotification: null,
  currentResourceId: null,
  currentResourceTitle: null,

  setOpen: (open) => {
    set({ isOpen: open });
    if (open) {
      set({ unreadCount: 0 });
    } else {
      set({ petPromptOverride: null, isFullscreen: false });
    }
  },

  toggleOpen: () => {
    const { isOpen } = get();
    set({ isOpen: !isOpen });
    if (!isOpen) {
      set({ unreadCount: 0 });
    }
    if (isOpen) {
      set({ petPromptOverride: null, isFullscreen: false });
    }
  },

  setMinimized: (minimized) => set({ isMinimized: minimized }),

  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  setStatus: (status) => set({ status }),

  addMessage: (message) => {
    const newMessage: ManyMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    const { currentSessionId, sessions } = get();
    let nextSessions = sessions;
    let nextCurrentId = currentSessionId;

    if (currentSessionId) {
      let idx = nextSessions.findIndex((s) => s.id === currentSessionId);
      if (idx < 0) {
        const revived: ManyChatSession = {
          id: currentSessionId,
          title: 'New chat',
          messages: [...get().messages],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        nextSessions = [revived, ...nextSessions];
        idx = 0;
      }
      const session = nextSessions[idx]!;
      const updated = {
        ...session,
        messages: [...session.messages, newMessage],
        updatedAt: Date.now(),
        title:
          message.role === 'user' && (!session.title || session.title === 'New chat')
            ? sanitizeManySessionTitle(message.content)
            : session.title,
      };
      nextSessions = [...nextSessions];
      nextSessions[idx] = updated;
      nextSessions = trimSessions(nextSessions, currentSessionId);
      persistManySessions(nextSessions);
      setPersistedCurrentManySessionId(currentSessionId);
    } else {
      const newSession: ManyChatSession = {
        id: createSessionId(),
        title:
          message.role === 'user'
            ? sanitizeManySessionTitle(message.content)
            : 'New chat',
        messages: [newMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      nextSessions = trimSessions([newSession, ...sessions], newSession.id);
      nextCurrentId = newSession.id;
      persistManySessions(nextSessions);
      setPersistedCurrentManySessionId(newSession.id);
    }

    set({
      messages: [...get().messages, newMessage],
      sessions: nextSessions,
      currentSessionId: nextCurrentId,
    });

    const { isOpen } = get();
    if (!isOpen && message.role === 'assistant') {
      set((state) => ({ unreadCount: state.unreadCount + 1 }));
    }
  },

  clearMessages: () => {
    const { currentSessionId, sessions } = get();
    if (currentSessionId) {
      const idx = sessions.findIndex((s) => s.id === currentSessionId);
      if (idx >= 0) {
        const session = sessions[idx];
        const updated = { ...session, messages: [], title: 'New chat' };
        const nextSessions = [...sessions];
        nextSessions[idx] = updated;
        persistManySessions(nextSessions);
        set({ messages: [], sessions: nextSessions });
        const sid = currentSessionId;
        void db.clearManyChatSession(sid).catch((err) => {
          console.warn('[ManyStore] clearManyChatSession failed:', err);
        });
        return;
      }
    }
    set({ messages: [] });
  },

  startNewChat: () => {
    const newSession: ManyChatSession = {
      id: createSessionId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { sessions } = get();
    const nextSessions = trimSessions([newSession, ...sessions], newSession.id);
    persistManySessions(nextSessions);
    setPersistedCurrentManySessionId(newSession.id);
    set({
      sessions: nextSessions,
      currentSessionId: newSession.id,
      messages: [],
    });
  },

  switchSession: (id) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setPersistedCurrentManySessionId(id);
      set({
        currentSessionId: id,
        messages: [...session.messages],
      });
    }
  },

  deleteSession: async (id) => {
    const { sessions, currentSessionId } = get();
    markManySessionDeleted(id);
    if (window.electron?.threads?.delete) {
      try {
        await window.electron.threads.delete(id);
      } catch (err) {
        console.warn('[ManyStore] threads:delete failed:', err);
      }
    }
    const nextSessions = filterOutDeletedSessions(sessions.filter((s) => s.id !== id));
    persistManySessions(nextSessions);
    let nextId = currentSessionId;
    let nextMessages = get().messages;
    if (currentSessionId === id) {
      const nextCurrent = nextSessions[0];
      nextId = nextCurrent?.id ?? null;
      nextMessages = nextCurrent?.messages ?? [];
      setPersistedCurrentManySessionId(nextId);
    }
    set({
      sessions: nextSessions,
      currentSessionId: nextId,
      messages: nextMessages,
    });
    if (db.isAvailable()) {
      const result = await db.deleteManyChatSession(id);
      if (!result.success) {
        console.warn('[ManyStore] deleteManyChatSession failed:', result.error);
      }
    }
  },

  hydrateFromThreads: async () => {
    const summaries = await listManyThreadSummaries(MAX_MANY_SESSIONS);
    const uiMeta = loadManySessionUiMeta();
    const { sessions: localSessions, currentSessionId } = get();
    const localById = new Map(localSessions.map((s) => [s.id, s]));
    const byId = new Map<string, ManyChatSession>();

    for (const summary of summaries) {
      const local = localById.get(summary.id);
      const meta = uiMeta[summary.id];
      byId.set(summary.id, {
        id: summary.id,
        title: sanitizeManySessionTitle(meta?.title ?? local?.title ?? 'New chat'),
        messages: local?.messages ?? [],
        createdAt: meta?.createdAt ?? local?.createdAt ?? summary.createdAt,
        updatedAt: meta?.updatedAt ?? local?.updatedAt ?? summary.updatedAt,
        pinned: meta?.pinned ?? local?.pinned,
      });
    }

    for (const local of localSessions) {
      if (isManySessionDeleted(local.id) || byId.has(local.id)) continue;
      if (isNestedManyThreadId(local.id)) continue;
      if (local.messages.length > 0) {
        byId.set(local.id, local);
      }
    }

    const nextSessions = trimSessions(
      [...byId.values()].sort((a, b) => {
        const at = a.updatedAt ?? a.createdAt ?? 0;
        const bt = b.updatedAt ?? b.createdAt ?? 0;
        return bt - at;
      }),
      currentSessionId,
    );

    persistManySessions(nextSessions);
    set({ sessions: nextSessions });
  },

  updateSessionTitle: (id, title) => {
    const { sessions } = get();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const nextSessions = [...sessions];
      nextSessions[idx] = { ...nextSessions[idx], title, updatedAt: Date.now() };
      persistManySessions(nextSessions);
      set({ sessions: nextSessions });
    }
  },

  toggleSessionPin: (id) => {
    const { sessions } = get();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const nextSessions = [...sessions];
    const cur = nextSessions[idx]!;
    nextSessions[idx] = { ...cur, pinned: !cur.pinned, updatedAt: Date.now() };
    persistManySessions(nextSessions);
    set({ sessions: nextSessions });
  },

  hydrateSession: (session) => {
    if (isManySessionDeleted(session.id)) return;
    const { sessions, currentSessionId } = get();
    const idx = sessions.findIndex((item) => item.id === session.id);
    const firstUser = session.messages.find((m) => m.role === 'user')?.content ?? '';
    const normalizedSession: ManyChatSession = {
      ...session,
      title: sanitizeManySessionTitle(session.title || firstUser),
      createdAt: session.createdAt ?? Date.now(),
      updatedAt:
        session.updatedAt ??
        session.messages[session.messages.length - 1]?.timestamp ??
        session.createdAt,
      messages: Array.isArray(session.messages) ? session.messages : [],
      pinned: session.pinned ?? false,
    };
    const merged =
      idx >= 0
        ? sessions.map((item) => (item.id === session.id ? normalizedSession : item))
        : [normalizedSession, ...sessions];
    const nextSessions = trimSessions(merged, currentSessionId ?? normalizedSession.id);
    const nextCurrentId = currentSessionId ?? normalizedSession.id;
    // Update in-memory state FIRST so the UI always reflects the latest messages,
    // even if the localStorage write below fails (e.g. quota exceeded).
    set({
      sessions: nextSessions,
      currentSessionId: nextCurrentId,
      messages:
        nextCurrentId === normalizedSession.id
          ? [...normalizedSession.messages]
          : get().messages,
    });
    setPersistedCurrentManySessionId(nextCurrentId);
    persistManySessionMeta({
      id: normalizedSession.id,
      title: normalizedSession.title,
      pinned: normalizedSession.pinned,
      createdAt: normalizedSession.createdAt,
      updatedAt: normalizedSession.updatedAt,
    });
    try {
      persistManySessions(nextSessions);
    } catch (e) {
      console.warn('[ManyStore] Could not persist session UI meta:', e);
    }
  },

  setCurrentInput: (input) => set({ currentInput: input }),

  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

  clearUnread: () => set({ unreadCount: 0 }),

  setNotification: (message) => set({ lastNotification: message }),

  setContext: (resourceId, resourceTitle) =>
    set({
      currentResourceId: resourceId,
      currentResourceTitle: resourceTitle,
    }),

  clearContext: () =>
    set({
      currentResourceId: null,
      currentResourceTitle: null,
    }),

  suggestedQuestions: [],
  setSuggestedQuestions: (questions) => set({ suggestedQuestions: questions }),
  clearSuggestedQuestions: () => set({ suggestedQuestions: [] }),

  petPromptOverride: null,
  setPetPromptOverride: (prompt) => set({ petPromptOverride: prompt }),

  pinnedResources: [],
  addPinnedResource: (resource) =>
    set((state) => {
      if (state.pinnedResources.some((r) => r.id === resource.id)) return state;
      return { pinnedResources: [...state.pinnedResources, resource] };
    }),
  removePinnedResource: (id) =>
    set((state) => ({ pinnedResources: state.pinnedResources.filter((r) => r.id !== id) })),
  clearPinnedResources: () => set({ pinnedResources: [] }),

  pendingOneShotSkillId: null,
  setPendingOneShotSkill: (id) => set({ pendingOneShotSkillId: id }),

  activeSkillIdBySession: {},
  setActiveSkillForSession: (sessionId, skillId) =>
    set((state) => ({
      activeSkillIdBySession: { ...state.activeSkillIdBySession, [sessionId]: skillId },
    })),

  ttsError: null,
  setTtsError: (message) => set({ ttsError: message }),

  currentSentence: null,
  setCurrentSentence: (sentence) => set({ currentSentence: sentence }),

  pendingManyHandoff: null,
  setPendingManyHandoff: (value) => set({ pendingManyHandoff: value }),

  pendingPdfRegion: null,
  setPendingPdfRegion: (value) => set({ pendingPdfRegion: value }),
  clearPendingPdfRegion: () => set({ pendingPdfRegion: null }),
}));
