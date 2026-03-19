import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SidebarSection = 'workspace' | 'chats' | 'reports' | 'skills' | 'memories';

interface ResizeState {
  leftSidebarWidth: number;
  leftSidebarCollapsed: boolean;
  rightSidebarWidth: number;
  rightSidebarCollapsed: boolean;
  chatSidebarWidth: number;
  chatSidebarCollapsed: boolean;
  openSections: Set<SidebarSection>;
  
  setLeftSidebarWidth: (width: number) => void;
  toggleLeftSidebar: () => void;
  setRightSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  setChatSidebarWidth: (width: number) => void;
  toggleChatSidebar: () => void;
  toggleSection: (section: SidebarSection) => void;
  isSectionOpen: (section: SidebarSection) => boolean;
}

export const useResizeStore = create<ResizeState>()(
  persist(
    (set, get) => ({
      leftSidebarWidth: 288,
      leftSidebarCollapsed: false,
      rightSidebarWidth: 380,
      rightSidebarCollapsed: true,
      chatSidebarWidth: 320,
      chatSidebarCollapsed: false,
      openSections: new Set<SidebarSection>(['workspace', 'chats']),

      setLeftSidebarWidth: (width) => {
        const clamped = Math.min(Math.max(width, 200), 480);
        set({ leftSidebarWidth: clamped });
      },

      toggleLeftSidebar: () => {
        set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed }));
      },

      setRightSidebarWidth: (width) => {
        const clamped = Math.min(Math.max(width, 260), 900);
        set({ rightSidebarWidth: clamped });
      },

      toggleRightSidebar: () => {
        set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed }));
      },

      setChatSidebarWidth: (width) => {
        const clamped = Math.min(Math.max(width, 220), 480);
        set({ chatSidebarWidth: clamped });
      },

      toggleChatSidebar: () => {
        set((state) => ({ chatSidebarCollapsed: !state.chatSidebarCollapsed }));
      },

      toggleSection: (section) => {
        set((state) => {
          const next = new Set(state.openSections);
          if (next.has(section)) {
            next.delete(section);
          } else {
            next.add(section);
          }
          return { openSections: next };
        });
      },

      isSectionOpen: (section) => {
        return get().openSections.has(section);
      },
    }),
    {
      name: 'dome-resize-store',
      partialize: (state) => ({
        leftSidebarWidth: state.leftSidebarWidth,
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarCollapsed: state.rightSidebarCollapsed,
        chatSidebarWidth: state.chatSidebarWidth,
        chatSidebarCollapsed: state.chatSidebarCollapsed,
        openSections: Array.from(state.openSections),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as { openSections?: string[] } & Partial<ResizeState>;
        return {
          ...current,
          ...persistedState,
          openSections: new Set(persistedState.openSections ?? ['workspace', 'chats']),
        };
      },
    }
  )
);
