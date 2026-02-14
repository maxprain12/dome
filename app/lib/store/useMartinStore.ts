import { create } from 'zustand';

export type MartinStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

export interface MartinMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface MartinState {
  // UI State
  isOpen: boolean;
  isMinimized: boolean;
  status: MartinStatus;
  
  // Chat State
  messages: MartinMessage[];
  currentInput: string;
  
  // Notifications
  unreadCount: number;
  lastNotification: string | null;
  
  // Context
  currentResourceId: string | null;
  currentResourceTitle: string | null;
  
  // WhatsApp
  whatsappConnected: boolean;
  whatsappPendingMessages: number;
  
  // Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setMinimized: (minimized: boolean) => void;
  setStatus: (status: MartinStatus) => void;
  
  // Chat Actions
  addMessage: (message: Omit<MartinMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setCurrentInput: (input: string) => void;
  
  // Notification Actions
  incrementUnread: () => void;
  clearUnread: () => void;
  setNotification: (message: string | null) => void;
  
  // Context Actions
  setContext: (resourceId: string | null, resourceTitle: string | null) => void;
  clearContext: () => void;
  
  // WhatsApp Actions
  setWhatsappConnected: (connected: boolean) => void;
  setWhatsappPendingMessages: (count: number) => void;

  // Suggested Questions
  suggestedQuestions: string[];
  setSuggestedQuestions: (questions: string[]) => void;
  clearSuggestedQuestions: () => void;

  // Pet plugin prompt override (when chat opened from pet mascota)
  petPromptOverride: string | null;
  setPetPromptOverride: (prompt: string | null) => void;
}

export const useMartinStore = create<MartinState>((set, get) => ({
  // Initial State
  isOpen: false,
  isMinimized: false,
  status: 'idle',
  messages: [],
  currentInput: '',
  unreadCount: 0,
  lastNotification: null,
  currentResourceId: null,
  currentResourceTitle: null,
  whatsappConnected: false,
  whatsappPendingMessages: 0,

  // UI Actions
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

  // Chat Actions
  addMessage: (message) => {
    const newMessage: MartinMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    set((state) => ({
      messages: [...state.messages, newMessage],
    }));

    // Si el chat está cerrado y es un mensaje de Many, incrementar unread
    const { isOpen } = get();
    if (!isOpen && message.role === 'assistant') {
      set((state) => ({ unreadCount: state.unreadCount + 1 }));
    }
  },
  
  clearMessages: () => set({ messages: [] }),
  
  setCurrentInput: (input) => set({ currentInput: input }),

  // Notification Actions
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  
  clearUnread: () => set({ unreadCount: 0 }),
  
  setNotification: (message) => set({ lastNotification: message }),

  // Context Actions
  setContext: (resourceId, resourceTitle) => set({
    currentResourceId: resourceId,
    currentResourceTitle: resourceTitle,
  }),
  
  clearContext: () => set({
    currentResourceId: null,
    currentResourceTitle: null,
  }),

  // WhatsApp Actions
  setWhatsappConnected: (connected) => set({ whatsappConnected: connected }),

  setWhatsappPendingMessages: (count) => set({ whatsappPendingMessages: count }),

  // Suggested Questions
  suggestedQuestions: [],
  setSuggestedQuestions: (questions) => set({ suggestedQuestions: questions }),
  clearSuggestedQuestions: () => set({ suggestedQuestions: [] }),

  // Pet plugin prompt override
  petPromptOverride: null,
  setPetPromptOverride: (prompt) => set({ petPromptOverride: prompt }),
}));
