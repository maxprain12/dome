/**
 * Agent Team Chat Store — per-team session and message state
 * Persists to localStorage: dome-team-sessions-{teamId}:v1
 */

import { create } from 'zustand';

const MAX_SESSIONS = 20;

export type TeamChatStatus = 'idle' | 'thinking' | 'delegating' | 'synthesizing';

export interface TeamChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown>; status?: string; result?: unknown; error?: string }>;
  /** Which agent produced this message, if it came from a sub-agent */
  agentId?: string;
  agentName?: string;
  /** Phase metadata for supervisor messages */
  phase?: 'planning' | 'delegation' | 'synthesis';
}

export interface TeamChatSession {
  id: string;
  title: string;
  messages: TeamChatMessage[];
  createdAt: number;
}

function storageKey(teamId: string) {
  return `dome-team-sessions-${teamId}:v1`;
}

function createSessionId(): string {
  return `tsession-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadSessions(teamId: string): TeamChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(teamId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const sessions: TeamChatSession[] = Array.isArray(parsed)
      ? parsed.slice(0, MAX_SESSIONS).filter(
          (s): s is TeamChatSession =>
            s && typeof s === 'object' && typeof s.id === 'string' && Array.isArray(s.messages)
        )
      : [];
    return sessions;
  } catch {
    return [];
  }
}

function persistSessions(teamId: string, sessions: TeamChatSession[]): void {
  try {
    localStorage.setItem(storageKey(teamId), JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // ignore
  }
}

function ensureAtLeastOne(sessions: TeamChatSession[]): TeamChatSession[] {
  if (sessions.length > 0) return sessions;
  return [{ id: createSessionId(), title: 'New chat', messages: [], createdAt: Date.now() }];
}

interface AgentTeamChatState {
  teamId: string | null;
  sessions: TeamChatSession[];
  currentSessionId: string | null;
  messages: TeamChatMessage[];
  status: TeamChatStatus;
  currentInput: string;
  activeAgentLabel: string | null;

  setTeam: (teamId: string) => void;
  setStatus: (status: TeamChatStatus) => void;
  setActiveAgentLabel: (label: string | null) => void;
  setCurrentInput: (input: string) => void;
  addMessage: (message: Omit<TeamChatMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistantMessage: (content: string) => void;
  clearMessages: () => void;
  startNewChat: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
}

export const useAgentTeamStore = create<AgentTeamChatState>((set, get) => ({
  teamId: null,
  sessions: [],
  currentSessionId: null,
  messages: [],
  status: 'idle',
  currentInput: '',
  activeAgentLabel: null,

  setTeam: (teamId) => {
    const sessions = ensureAtLeastOne(loadSessions(teamId));
    const sorted = [...sessions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const current = sorted[0];
    set({ teamId, sessions, currentSessionId: current.id, messages: current.messages ?? [] });
  },

  setStatus: (status) => set({ status }),
  setActiveAgentLabel: (label) => set({ activeAgentLabel: label }),
  setCurrentInput: (input) => set({ currentInput: input }),

  addMessage: (message) => {
    const newMessage: TeamChatMessage = {
      ...message,
      id: `tmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    const { teamId, currentSessionId, sessions } = get();
    if (!teamId) return;

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
        persistSessions(teamId, nextSessions);
      }
    } else {
      const newSession: TeamChatSession = {
        id: createSessionId(),
        title:
          message.role === 'user'
            ? message.content.slice(0, 50).trim() || 'New chat'
            : 'New chat',
        messages: [newMessage],
        createdAt: Date.now(),
      };
      nextSessions = ensureAtLeastOne([newSession, ...sessions]);
      nextCurrentId = newSession.id;
      persistSessions(teamId, nextSessions);
    }

    set({ messages: [...get().messages, newMessage], sessions: nextSessions, currentSessionId: nextCurrentId });
  },

  updateLastAssistantMessage: (content) => {
    const { teamId, currentSessionId, sessions, messages } = get();
    if (!teamId) return;
    const lastIdx = messages.map((m) => m.role).lastIndexOf('assistant');
    if (lastIdx < 0) return;
    const updated = messages.map((m, i) => (i === lastIdx ? { ...m, content } : m));
    set({ messages: updated });
    if (currentSessionId) {
      const sIdx = sessions.findIndex((s) => s.id === currentSessionId);
      if (sIdx >= 0) {
        const nextSessions = [...sessions];
        nextSessions[sIdx] = { ...nextSessions[sIdx], messages: updated };
        persistSessions(teamId, nextSessions);
        set({ sessions: nextSessions });
      }
    }
  },

  clearMessages: () => {
    const { teamId, currentSessionId, sessions } = get();
    if (!teamId || !currentSessionId) return;
    const idx = sessions.findIndex((s) => s.id === currentSessionId);
    if (idx >= 0) {
      const nextSessions = [...sessions];
      nextSessions[idx] = { ...nextSessions[idx], messages: [] };
      persistSessions(teamId, nextSessions);
      set({ messages: [], sessions: nextSessions });
    }
  },

  startNewChat: () => {
    const { teamId, sessions } = get();
    if (!teamId) return;
    const newSession: TeamChatSession = {
      id: createSessionId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
    };
    const nextSessions = ensureAtLeastOne([newSession, ...sessions]);
    persistSessions(teamId, nextSessions);
    set({ sessions: nextSessions, currentSessionId: newSession.id, messages: [] });
  },

  switchSession: (id) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === id);
    if (session) {
      set({ currentSessionId: id, messages: [...session.messages] });
    }
  },

  deleteSession: (id) => {
    const { teamId, sessions, currentSessionId } = get();
    if (!teamId) return;
    const nextSessions = sessions.filter((s) => s.id !== id);
    persistSessions(teamId, nextSessions);
    let nextId = currentSessionId;
    let nextMessages = get().messages;
    if (currentSessionId === id) {
      const nextCurrent = nextSessions[0];
      nextId = nextCurrent?.id ?? null;
      nextMessages = nextCurrent?.messages ?? [];
    }
    set({ sessions: nextSessions, currentSessionId: nextId, messages: nextMessages });
  },

  updateSessionTitle: (id, title) => {
    const { teamId, sessions } = get();
    if (!teamId) return;
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const nextSessions = [...sessions];
      nextSessions[idx] = { ...nextSessions[idx], title };
      persistSessions(teamId, nextSessions);
      set({ sessions: nextSessions });
    }
  },
}));
