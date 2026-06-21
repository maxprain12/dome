import { create } from 'zustand';
import type { FlashcardDeck, Flashcard, FlashcardDeckStats, StudioOutput, StudioOutputType } from '@/types';
import type {
  GenerateConfig,
  GenerateProgress,
  LearnKpis,
  LearnStreak,
  LearnView,
  LearnStudyMode,
  WizardState,
} from '@/lib/learn/types';
import { loadSavedGenerateConfig, persistGenerateConfig } from '@/lib/learn/generateConfigStorage';
import { useAppStore } from '@/lib/store/useAppStore';

export type LearnSection = 'all' | 'decks' | 'mindmaps' | 'quizzes' | 'guides' | 'faqs' | 'timelines' | 'tables';

interface LearnState {
  activeSection: LearnSection;
  setActiveSection: (section: LearnSection) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  view: LearnView;
  activeDeckId: string | null;
  activeDeckKind: 'flashcard_deck' | StudioOutputType | null;
  openDeck: (id: string, kind: 'flashcard_deck' | StudioOutputType) => void;
  closeDeck: () => void;

  studyMode: LearnStudyMode;
  setStudyMode: (mode: LearnStudyMode) => void;

  decks: FlashcardDeck[];
  studioOutputs: StudioOutput[];
  deckStats: Record<string, FlashcardDeckStats>;

  kpis: LearnKpis | null;
  streak: LearnStreak | null;
  loadKpis: () => Promise<void>;
  loadStreak: () => Promise<void>;

  wizard: WizardState;
  setWizardOpen: (open: boolean) => void;
  setWizardStep: (step: 0 | 1 | 2) => void;
  setWizardType: (type: StudioOutputType | null) => void;
  setWizardSourceIds: (ids: string[]) => void;
  setWizardConfig: (config: Partial<GenerateConfig>) => void;
  setWizardShowProgress: (show: boolean) => void;
  resetWizard: () => void;

  progress: GenerateProgress | null;
  setProgress: (p: GenerateProgress | null) => void;
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;

  isStudying: boolean;
  currentDeckId: string | null;
  currentCardIndex: number;
  isCardFlipped: boolean;
  studyStartTime: number | null;
  sessionCorrect: number;
  sessionIncorrect: number;
  sessionStreak: number;
  maxStreak: number;
  sessionPlannedCards: number;

  isGenerateModalOpen: boolean;
  isDeckEditorOpen: boolean;
  editingDeckId: string | null;

  setGenerateModalOpen: (open: boolean) => void;
  openGenerateWizard: (prefill?: {
    type?: StudioOutputType | null;
    sourceIds?: string[];
    step?: 0 | 1 | 2;
  }) => void;
  setDeckEditorOpen: (open: boolean, deckId?: string | null) => void;

  loadDecks: () => Promise<void>;
  loadStudioOutputs: (projectId?: string) => Promise<void>;
  loadDeckStats: (deckId: string) => Promise<void>;
  loadAllDeckStats: (deckIds: string[]) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<boolean>;
  deleteStudioOutput: (outputId: string) => Promise<boolean>;

  /** Subscribe to main-process learn broadcasts; returns an unsubscribe fn. */
  subscribeToLearnEvents: () => () => void;

  startStudy: (deckId: string) => Promise<void>;
  flipCard: () => void;
  reviewCard: (quality: number) => Promise<void>;
  skipCard: () => void;
  endStudy: () => Promise<void>;

  dueCards: Flashcard[];
  loadDueCards: (deckId: string) => Promise<void>;

  reset: () => void;
}

const initialWizard: WizardState = {
  open: false,
  step: 0,
  showProgress: false,
  type: null,
  sourceIds: [],
  config: loadSavedGenerateConfig(),
};

export const useLearnStore = create<LearnState>((set, get) => ({
  activeSection: 'all',
  setActiveSection: (section) => set({ activeSection: section }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  view: 'library',
  activeDeckId: null,
  activeDeckKind: null,
  openDeck: (id, kind) => set({ view: 'deck', activeDeckId: id, activeDeckKind: kind }),
  closeDeck: () => set({ view: 'library', activeDeckId: null, activeDeckKind: null }),

  studyMode: null,
  setStudyMode: (mode) => set({ studyMode: mode }),

  decks: [],
  studioOutputs: [],
  deckStats: {},

  kpis: null,
  streak: null,
  loadKpis: async () => {
    try {
      const result = await window.electron.db.learn.getKpis();
      if (result.success && result.data) set({ kpis: result.data as LearnKpis });
    } catch (error) {
      console.error('[LearnStore] loadKpis:', error);
    }
  },
  loadStreak: async () => {
    try {
      const result = await window.electron.db.learn.getStreak();
      if (result.success && result.data) set({ streak: result.data as LearnStreak });
    } catch (error) {
      console.error('[LearnStore] loadStreak:', error);
    }
  },

  wizard: { ...initialWizard },
  setWizardOpen: (open) =>
    set((s) => ({
      wizard: { ...s.wizard, open },
      isGenerateModalOpen: open,
    })),
  setWizardStep: (step) => set((s) => ({ wizard: { ...s.wizard, step } })),
  setWizardType: (type) => set((s) => ({ wizard: { ...s.wizard, type } })),
  setWizardSourceIds: (ids) => set((s) => ({ wizard: { ...s.wizard, sourceIds: ids } })),
  setWizardConfig: (config) =>
    set((s) => {
      const next = { ...s.wizard.config, ...config };
      persistGenerateConfig(next);
      return { wizard: { ...s.wizard, config: next } };
    }),
  setWizardShowProgress: (show) => set((s) => ({ wizard: { ...s.wizard, showProgress: show } })),
  resetWizard: () =>
    set({
      wizard: { ...initialWizard, config: loadSavedGenerateConfig() },
      progress: null,
      activeRunId: null,
    }),

  progress: null,
  setProgress: (p) => set({ progress: p }),
  activeRunId: null,
  setActiveRunId: (id) => set({ activeRunId: id }),

  isStudying: false,
  currentDeckId: null,
  currentCardIndex: 0,
  isCardFlipped: false,
  studyStartTime: null,
  sessionCorrect: 0,
  sessionIncorrect: 0,
  sessionStreak: 0,
  maxStreak: 0,
  sessionPlannedCards: 0,

  isGenerateModalOpen: false,
  isDeckEditorOpen: false,
  editingDeckId: null,

  setGenerateModalOpen: (open) => {
    if (open) {
      set((s) => ({
        isGenerateModalOpen: true,
        wizard: {
          ...s.wizard,
          open: true,
          config: s.wizard.config.title ? s.wizard.config : loadSavedGenerateConfig(),
        },
      }));
    } else {
      set({
        isGenerateModalOpen: false,
        wizard: { ...initialWizard, config: loadSavedGenerateConfig() },
        progress: null,
      });
    }
  },
  openGenerateWizard: (prefill) => {
    set((s) => ({
      isGenerateModalOpen: true,
      wizard: {
        ...s.wizard,
        open: true,
        step: prefill?.step ?? 0,
        type: prefill?.type !== undefined ? prefill.type : s.wizard.type,
        sourceIds: prefill?.sourceIds ?? s.wizard.sourceIds,
        config: loadSavedGenerateConfig(),
        showProgress: false,
      },
      progress: null,
    }));
  },
  setDeckEditorOpen: (open, deckId = null) => set({ isDeckEditorOpen: open, editingDeckId: deckId }),

  dueCards: [],

  loadDecks: async () => {
    try {
      // Hard-scope decks to the active project (never cross-project).
      const activeProjectId = useAppStore.getState().currentProject?.id ?? 'default';
      const result = await window.electron.db.flashcards.getDecksByProject(activeProjectId);
      if (result.success && result.data) set({ decks: result.data });
    } catch (error) {
      console.error('[LearnStore] Error loading decks:', error);
    }
  },

  loadStudioOutputs: async (projectId?: string) => {
    try {
      // Default to the active project so study materials never leak across projects.
      const scopedProjectId = projectId ?? useAppStore.getState().currentProject?.id ?? 'default';
      const result = await window.electron.db.studio.getByProject(scopedProjectId);
      if (result.success && result.data) set({ studioOutputs: result.data });
    } catch (error) {
      console.error('[LearnStore] Error loading studio outputs:', error);
    }
  },

  loadDeckStats: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.getStats(deckId);
      if (result.success && result.data) {
        set((state) => ({ deckStats: { ...state.deckStats, [deckId]: result.data } }));
      }
    } catch (error) {
      console.error('[LearnStore] Error loading deck stats:', error);
    }
  },

  // Load stats for many decks in parallel (avoids the old N+1 serial loop)
  loadAllDeckStats: async (deckIds: string[]) => {
    try {
      const entries = await Promise.all(
        deckIds.map(async (id) => {
          const result = await window.electron.db.flashcards.getStats(id);
          return [id, result.success ? result.data : undefined] as const;
        }),
      );
      set((state) => {
        const next = { ...state.deckStats };
        for (const [id, data] of entries) if (data) next[id] = data as FlashcardDeckStats;
        return { deckStats: next };
      });
    } catch (error) {
      console.error('[LearnStore] Error loading deck stats batch:', error);
    }
  },

  deleteDeck: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.deleteDeck(deckId);
      if (result.success) {
        set((state) => ({ decks: state.decks.filter((d) => d.id !== deckId) }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[LearnStore] Error deleting deck:', error);
      return false;
    }
  },

  deleteStudioOutput: async (outputId: string) => {
    try {
      const result = await window.electron.db.studio.delete(outputId);
      if (result.success) {
        set((state) => ({ studioOutputs: state.studioOutputs.filter((o) => o.id !== outputId) }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[LearnStore] Error deleting studio output:', error);
      return false;
    }
  },

  loadDueCards: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.getDueCards(deckId, 50);
      let cards: Flashcard[] = result.success && Array.isArray(result.data) ? result.data : [];

      // SM-2 may schedule every card in the future; still allow cram / re-study the full deck.
      if (cards.length === 0) {
        const allResult = await window.electron.db.flashcards.getCards(deckId);
        if (allResult.success && Array.isArray(allResult.data) && allResult.data.length > 0) {
          cards = allResult.data.slice(0, 50);
        }
      }

      set({ dueCards: cards });
    } catch (error) {
      console.error('[LearnStore] Error loading due cards:', error);
      set({ dueCards: [] });
    }
  },

  startStudy: async (deckId: string) => {
    const { loadDueCards } = get();
    await loadDueCards(deckId);
    const planned = get().dueCards.length;
    set({
      isStudying: true,
      view: 'studying',
      studyMode: 'flashcards',
      currentDeckId: deckId,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: Date.now(),
      sessionCorrect: 0,
      sessionIncorrect: 0,
      sessionStreak: 0,
      maxStreak: 0,
      sessionPlannedCards: planned,
    });
  },

  flipCard: () => set((state) => ({ isCardFlipped: !state.isCardFlipped })),

  reviewCard: async (quality: number) => {
    const { dueCards, currentCardIndex, sessionStreak, maxStreak } = get();
    const card = dueCards[currentCardIndex];
    if (!card) return;
    try {
      await window.electron.db.flashcards.reviewCard(card.id, quality);
      const isCorrect = quality >= 3;
      const newStreak = isCorrect ? sessionStreak + 1 : 0;
      set((state) => ({
        sessionCorrect: state.sessionCorrect + (isCorrect ? 1 : 0),
        sessionIncorrect: state.sessionIncorrect + (isCorrect ? 0 : 1),
        sessionStreak: newStreak,
        maxStreak: Math.max(maxStreak, newStreak),
        currentCardIndex: state.currentCardIndex + 1,
        isCardFlipped: false,
      }));
    } catch (error) {
      console.error('[LearnStore] Error reviewing card:', error);
    }
  },

  skipCard: () => {
    set((state) => ({
      currentCardIndex: state.currentCardIndex + 1,
      isCardFlipped: false,
    }));
  },

  endStudy: async () => {
    const {
      currentDeckId,
      sessionCorrect,
      sessionIncorrect,
      studyStartTime,
      currentCardIndex,
      sessionPlannedCards,
    } = get();
    if (!currentDeckId) return;
    const duration = studyStartTime ? Date.now() - studyStartTime : 0;
    const cardsStudied = Math.max(sessionCorrect + sessionIncorrect, currentCardIndex);
    try {
      if (cardsStudied > 0 || duration > 0) {
        await window.electron.db.flashcards.createSession({
          deck_id: currentDeckId,
          cards_studied: cardsStudied,
          cards_correct: sessionCorrect,
          cards_incorrect: sessionIncorrect,
          duration_ms: duration,
          started_at: studyStartTime || Date.now(),
          completed_at: Date.now(),
        });
      }
    } catch (error) {
      console.error('[LearnStore] Error saving session:', error);
    }
    const deckId = currentDeckId;
    const { activeDeckId } = get();
    set({
      isStudying: false,
      view: activeDeckId ? 'deck' : 'library',
      studyMode: null,
      currentDeckId: null,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
      sessionPlannedCards: 0,
      dueCards: [],
    });
    void get().loadDeckStats(deckId);
    void get().loadDecks();
    void get().loadKpis();
    void get().loadStreak();
  },

  subscribeToLearnEvents: () => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      // Debounce bursts of broadcasts into a single refresh
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = get();
        void s.loadDecks();
        void s.loadStudioOutputs();
        void s.loadKpis();
        void s.loadStreak();
        const ids = get().decks.map((d) => d.id);
        if (ids.length) void s.loadAllDeckStats(ids);
      }, 150);
    };

    const channels = [
      'flashcard:deckCreated',
      'flashcard:deckUpdated',
      'flashcard:deckDeleted',
      'flashcard:sessionEnded',
      'studio:outputCreated',
      'studio:outputDeleted',
    ];
    const unsubs = channels.map((ch) => window.electron.on(ch, refresh));
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((fn) => {
        if (typeof fn === 'function') fn();
      });
    };
  },

  reset: () => {
    set({
      activeSection: 'all',
      searchQuery: '',
      view: 'library',
      activeDeckId: null,
      activeDeckKind: null,
      studyMode: null,
      decks: [],
      studioOutputs: [],
      deckStats: {},
      kpis: null,
      streak: null,
      wizard: { ...initialWizard, config: loadSavedGenerateConfig() },
      progress: null,
      activeRunId: null,
      isStudying: false,
      currentDeckId: null,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
      sessionCorrect: 0,
      sessionIncorrect: 0,
      sessionStreak: 0,
      maxStreak: 0,
      sessionPlannedCards: 0,
      isGenerateModalOpen: false,
      isDeckEditorOpen: false,
      editingDeckId: null,
      dueCards: [],
    });
  },
}));
