import { create } from 'zustand';

const SESSIONS_STORAGE_KEY = 'dome-many-sessions:v1';
const MAX_SESSIONS = 20;

export type ManyStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

export interface ManyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
    const sessions: ManyChatSession[] = Array.isArray(parsed)
      ? parsed.slice(0, MAX_SESSIONS).filter(
          (s): s is ManyChatSession =>
            s &&
            typeof s === 'object' &&
            typeof s.id === 'string' &&
            Array.isArray(s.messages)
        )
      : [];
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
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // ignore (incognito, quota, disabled)
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
  setStatus: (status: ManyStatus) => void;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  startNewChat: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
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
}

export const useManyStore = create<ManyState>((set, get) => ({
  ...hydratedState,
  isOpen: false,
  isMinimized: false,
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
      set({ petPromptOverride: null });
    }
  },

  toggleOpen: () => {
    const { isOpen } = get();
    set({ isOpen: !isOpen });
    if (!isOpen) {
      set({ unreadCount: 0 });
    }
    if (isOpen) {
      set({ petPromptOverride: null });
    }
  },

  setMinimized: (minimized) => set({ isMinimized: minimized }),

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
            message.role === 'user'
              ? message.content.slice(0, 50).trim() || session.title
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
        const updated = { ...session, messages: [] };
        const nextSessions = [...sessions];
        nextSessions[idx] = updated;
        persistSessions(nextSessions);
        set({ messages: [], sessions: nextSessions });
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
}));
