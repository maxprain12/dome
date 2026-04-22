import { create } from 'zustand';
import { db } from '@/lib/db/client';

const SESSIONS_STORAGE_KEY = 'dome-many-sessions:v1';
const MAX_SESSIONS = 20;

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
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getInitialSessionsState(): {
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  messages: ManyMessage[];
} {
  if (typeof window === 'undefined') {
    return { sessions: [], currentSessionId: null, messages: [] };
  }
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return { sessions: [], currentSessionId: null, messages: [] };
    const parsed = JSON.parse(raw) as unknown;
    const sessions: ManyChatSession[] = (Array.isArray(parsed)
      ? parsed.slice(0, MAX_SESSIONS).filter(
          (s): s is ManyChatSession =>
            s &&
            typeof s === 'object' &&
            typeof s.id === 'string' &&
            Array.isArray(s.messages)
        )
      : []).map((s) => ({
        ...s,
        // Backfill title from first user message if missing or still default
        title: (!s.title || s.title === 'New chat')
          ? (s.messages.find((m: ManyMessage) => m.role === 'user')?.content?.slice(0, 50)?.trim() || 'New chat')
          : s.title,
      }));
    if (sessions.length === 0) return { sessions: [], currentSessionId: null, messages: [] };
    const sorted = [...sessions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const current = sorted[0];
    return {
      sessions,
      currentSessionId: current.id,
      messages: current.messages ?? [],
    };
  } catch {
    return { sessions: [], currentSessionId: null, messages: [] };
  }
}

function persistSessions(sessions: ManyChatSession[]): void {
  const MAX_MSG_LENGTH = 4000; // chars per message before trimming
  const toStore = sessions.slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Quota exceeded — retry with trimmed message content to free space
    try {
      const trimmed = toStore.map((s) => ({
        ...s,
        messages: s.messages.map((m) => ({
          ...m,
          content: m.content.length > MAX_MSG_LENGTH ? m.content.slice(0, MAX_MSG_LENGTH) + '…' : m.content,
          // Drop tool call results (usually large) when saving under pressure
          toolCalls: m.toolCalls?.map((tc) => ({ ...tc, result: undefined })),
        })),
      }));
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // incognito, disabled, or completely out of space — silently skip
    }
  }
}

const initialState = getInitialSessionsState();

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
  };
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
  whatsappConnected: boolean;
  whatsappPendingMessages: number;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setMinimized: (minimized: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setStatus: (status: ManyStatus) => void;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  startNewChat: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  hydrateSession: (session: ManyChatSession) => void;
  setCurrentInput: (input: string) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  setNotification: (message: string | null) => void;
  setContext: (resourceId: string | null, resourceTitle: string | null) => void;
  clearContext: () => void;
  setWhatsappConnected: (connected: boolean) => void;
  setWhatsappPendingMessages: (count: number) => void;
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
  whatsappConnected: false,
  whatsappPendingMessages: 0,

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
      const idx = nextSessions.findIndex((s) => s.id === currentSessionId);
      if (idx >= 0) {
        const session = nextSessions[idx];
        const updated = {
          ...session,
          messages: [...session.messages, newMessage],
          title:
            message.role === 'user' && (!session.title || session.title === 'New chat')
              ? message.content.slice(0, 50).trim() || 'New chat'
              : session.title,
        };
        nextSessions = [...nextSessions];
        nextSessions[idx] = updated;
        persistSessions(nextSessions);
      }
    } else {
      const newSession: ManyChatSession = {
        id: createSessionId(),
        title: message.role === 'user' ? message.content.slice(0, 50).trim() || 'New chat' : 'New chat',
        messages: [newMessage],
        createdAt: Date.now(),
      };
      nextSessions = [newSession, ...sessions].slice(0, MAX_SESSIONS);
      nextCurrentId = newSession.id;
      persistSessions(nextSessions);
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
        persistSessions(nextSessions);
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
    };
    const { sessions } = get();
    const nextSessions = [newSession, ...sessions].slice(0, MAX_SESSIONS);
    persistSessions(nextSessions);
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
      set({
        currentSessionId: id,
        messages: [...session.messages],
      });
    }
  },

  deleteSession: (id) => {
    const { sessions, currentSessionId } = get();
    const nextSessions = sessions.filter((s) => s.id !== id);
    persistSessions(nextSessions);
    let nextId = currentSessionId;
    let nextMessages = get().messages;
    if (currentSessionId === id) {
      const nextCurrent = nextSessions[0];
      nextId = nextCurrent?.id ?? null;
      nextMessages = nextCurrent?.messages ?? [];
    }
    set({
      sessions: nextSessions,
      currentSessionId: nextId,
      messages: nextMessages,
    });
    void db.deleteManyChatSession(id).catch((err) => {
      console.warn('[ManyStore] deleteManyChatSession failed:', err);
    });
  },

  updateSessionTitle: (id, title) => {
    const { sessions } = get();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const nextSessions = [...sessions];
      nextSessions[idx] = { ...nextSessions[idx], title };
      persistSessions(nextSessions);
      set({ sessions: nextSessions });
    }
  },

  hydrateSession: (session) => {
    const { sessions, currentSessionId } = get();
    const idx = sessions.findIndex((item) => item.id === session.id);
    const normalizedSession: ManyChatSession = {
      ...session,
      createdAt: session.createdAt ?? Date.now(),
      messages: Array.isArray(session.messages) ? session.messages : [],
    };
    const nextSessions = idx >= 0
      ? sessions.map((item) => (item.id === session.id ? normalizedSession : item))
      : [normalizedSession, ...sessions].slice(0, MAX_SESSIONS);
    // Update in-memory state FIRST so the UI always reflects the latest messages,
    // even if the localStorage write below fails (e.g. quota exceeded).
    set({
      sessions: nextSessions,
      currentSessionId: currentSessionId ?? normalizedSession.id,
      messages:
        currentSessionId === normalizedSession.id || (!currentSessionId && nextSessions[0]?.id === normalizedSession.id)
          ? [...normalizedSession.messages]
          : get().messages,
    });
    // Best-effort persistence — a failure here must never clear the chat UI.
    try {
      persistSessions(nextSessions);
    } catch (e) {
      console.warn('[ManyStore] Could not persist sessions to localStorage:', e);
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

  setWhatsappConnected: (connected) => set({ whatsappConnected: connected }),

  setWhatsappPendingMessages: (count) => set({ whatsappPendingMessages: count }),

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
