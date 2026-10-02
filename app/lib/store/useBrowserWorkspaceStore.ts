import { create } from 'zustand';

interface BrowserWorkspaceStore {
  panels: Record<string, string>;
  openPanel: (conversationId: string, sessionId: string) => void;
  closePanel: (conversationId: string) => void;
}

export const useBrowserWorkspaceStore = create<BrowserWorkspaceStore>(set => ({
  panels: {},
  openPanel: (conversationId, sessionId) => set(state => ({ panels: { ...state.panels, [conversationId]: sessionId } })),
  closePanel: conversationId => set(state => {
    const panels = { ...state.panels };
    delete panels[conversationId];
    return { panels };
  }),
}));
