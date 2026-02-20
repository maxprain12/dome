/**
 * Agent Chat Store - Per-agent session and message state
 * Persists to localStorage: dome-many-sessions-{agentId}:v1
 */

import { create } from 'zustand';

const MAX_SESSIONS = 20;

export type AgentChatStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AgentChatSession {
  id: string;
  title: string;
  messages: AgentChatMessage[];
  createdAt: number;
}

function storageKey(agentId: string) {
  return `dome-many-sessions-${agentId}:v1`;
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadSessions(agentId: string): AgentChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const sessions: AgentChatSession[] = Array.isArray(parsed)
      ? parsed.slice(0, MAX_SESSIONS).filter(
          (s): s is AgentChatSession =>
            s &&
            typeof s === 'object' &&
            typeof s.id === 'string' &&
            Array.isArray(s.messages)
        )
      : [];
    return sessions;
  } catch {
    return [];
  }
}

function persistSessions(agentId: string, sessions: AgentChatSession[]): void {
  try {
    localStorage.setItem(storageKey(agentId), JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // ignore
  }
}

function ensureAtLeastOne(sessions: AgentChatSession[]): AgentChatSession[] {
  if (sessions.length > 0) return sessions;
  return [
    {
      id: createSessionId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
    },
  ];
}

interface AgentChatState {
  agentId: string | null;
  sessions: AgentChatSession[];
  currentSessionId: string | null;
  messages: AgentChatMessage[];
  status: AgentChatStatus;
  currentInput: string;

  setAgent: (agentId: string) => void;
  setStatus: (status: AgentChatStatus) => void;
  setCurrentInput: (input: string) => void;
  addMessage: (message: Omit<AgentChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  startNewChat: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
}

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  agentId: null,
  sessions: [],
  currentSessionId: null,
  messages: [],
  status: 'idle',
  currentInput: '',

  setAgent: (agentId) => {
    const sessions = ensureAtLeastOne(loadSessions(agentId));
    const sorted = [...sessions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const current = sorted[0];
    set({
      agentId,
      sessions,
      currentSessionId: current.id,
      messages: current.messages ?? [],
    });
  },

  setStatus: (status) => set({ status }),
  setCurrentInput: (input) => set({ currentInput: input }),

  addMessage: (message) => {
    const newMessage: AgentChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    const { agentId, currentSessionId, sessions } = get();
    if (!agentId) return;

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
        persistSessions(agentId, nextSessions);
      }
    } else {
      const newSession: AgentChatSession = {
        id: createSessionId(),
        title: message.role === 'user' ? message.content.slice(0, 50).trim() || 'New chat' : 'New chat',
        messages: [newMessage],
        createdAt: Date.now(),
      };
      nextSessions = ensureAtLeastOne([newSession, ...sessions]);
      nextCurrentId = newSession.id;
      persistSessions(agentId, nextSessions);
    }

    set({
      messages: [...get().messages, newMessage],
      sessions: nextSessions,
      currentSessionId: nextCurrentId,
    });
  },

  clearMessages: () => {
    const { agentId, currentSessionId, sessions } = get();
    if (!agentId || !currentSessionId) return;
    const idx = sessions.findIndex((s) => s.id === currentSessionId);
    if (idx >= 0) {
      const session = sessions[idx];
      const updated = { ...session, messages: [] };
      const nextSessions = [...sessions];
      nextSessions[idx] = updated;
      persistSessions(agentId, nextSessions);
      set({ messages: [], sessions: nextSessions });
    }
  },

  startNewChat: () => {
    const { agentId, sessions } = get();
    if (!agentId) return;
    const newSession: AgentChatSession = {
      id: createSessionId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
    };
    const nextSessions = ensureAtLeastOne([newSession, ...sessions]);
    persistSessions(agentId, nextSessions);
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
    const { agentId, sessions, currentSessionId } = get();
    if (!agentId) return;
    const nextSessions = sessions.filter((s) => s.id !== id);
    persistSessions(agentId, nextSessions);
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
    const { agentId, sessions } = get();
    if (!agentId) return;
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const nextSessions = [...sessions];
      nextSessions[idx] = { ...nextSessions[idx], title };
      persistSessions(agentId, nextSessions);
      set({ sessions: nextSessions });
    }
  },
}));
