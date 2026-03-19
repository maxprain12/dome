import { create } from 'zustand';
import type { FlashcardDeck, Flashcard, FlashcardDeckStats, StudioOutput } from '@/types';

export type LearnSection = 'all' | 'decks' | 'mindmaps' | 'quizzes' | 'guides' | 'faqs' | 'timelines' | 'tables';

interface LearnState {
  // Navigation
  activeSection: LearnSection;
  setActiveSection: (section: LearnSection) => void;

  // Data
  decks: FlashcardDeck[];
  studioOutputs: StudioOutput[];
  deckStats: Record<string, FlashcardDeckStats>;

  // UI State
  isStudying: boolean;
  currentDeckId: string | null;
  currentCardIndex: number;
  isCardFlipped: boolean;
  studyStartTime: number | null;

  // Session tracking
  sessionCorrect: number;
  sessionIncorrect: number;
  sessionStreak: number;
  maxStreak: number;

  // Modals
  isGenerateModalOpen: boolean;
  isDeckModalOpen: boolean;
  isDeckEditorOpen: boolean;
  editingDeckId: string | null;

  setGenerateModalOpen: (open: boolean) => void;
  setDeckModalOpen: (open: boolean) => void;
  setDeckEditorOpen: (open: boolean, deckId?: string | null) => void;

  // Actions
  loadDecks: () => Promise<void>;
  loadStudioOutputs: (projectId?: string) => Promise<void>;
  loadDeckStats: (deckId: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<boolean>;
  deleteStudioOutput: (outputId: string) => Promise<boolean>;

  // Study actions
  startStudy: (deckId: string) => Promise<void>;
  flipCard: () => void;
  reviewCard: (quality: number) => Promise<void>;
  endStudy: () => Promise<void>;

  // Due cards
  dueCards: Flashcard[];
  loadDueCards: (deckId: string) => Promise<void>;

  // Reset
  reset: () => void;
}

export const useLearnStore = create<LearnState>((set, get) => ({
  // Navigation
  activeSection: 'all',
  setActiveSection: (section) => set({ activeSection: section }),

  // Data
  decks: [],
  studioOutputs: [],
  deckStats: {},

  // UI State
  isStudying: false,
  currentDeckId: null,
  currentCardIndex: 0,
  isCardFlipped: false,
  studyStartTime: null,

  // Session tracking
  sessionCorrect: 0,
  sessionIncorrect: 0,
  sessionStreak: 0,
  maxStreak: 0,

  // Modals
  isGenerateModalOpen: false,
  isDeckModalOpen: false,
  isDeckEditorOpen: false,
  editingDeckId: null,

  setGenerateModalOpen: (open) => set({ isGenerateModalOpen: open }),
  setDeckModalOpen: (open) => set({ isDeckModalOpen: open }),
  setDeckEditorOpen: (open, deckId = null) => set({ isDeckEditorOpen: open, editingDeckId: deckId }),

  // Due cards
  dueCards: [],

  loadDecks: async () => {
    try {
      const result = await window.electron.db.flashcards.getAllDecks(100);
      if (result.success && result.data) {
        set({ decks: result.data });
      }
    } catch (error) {
      console.error('[LearnStore] Error loading decks:', error);
    }
  },

  loadStudioOutputs: async (projectId?: string) => {
    try {
      const result = projectId
        ? await window.electron.db.studio.getByProject(projectId)
        : await window.electron.db.studio.getAll();
      if (result.success && result.data) {
        set({ studioOutputs: result.data });
      }
    } catch (error) {
      console.error('[LearnStore] Error loading studio outputs:', error);
    }
  },

  loadDeckStats: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.getStats(deckId);
      if (result.success && result.data) {
        set((state) => ({
          deckStats: { ...state.deckStats, [deckId]: result.data },
        }));
      }
    } catch (error) {
      console.error('[LearnStore] Error loading deck stats:', error);
    }
  },

  deleteDeck: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.deleteDeck(deckId);
      if (result.success) {
        set((state) => ({
          decks: state.decks.filter((d) => d.id !== deckId),
        }));
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
        set((state) => ({
          studioOutputs: state.studioOutputs.filter((o) => o.id !== outputId),
        }));
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
      if (result.success && result.data) {
        set({ dueCards: result.data });
      }
    } catch (error) {
      console.error('[LearnStore] Error loading due cards:', error);
    }
  },

  startStudy: async (deckId: string) => {
    const { loadDueCards } = get();
    await loadDueCards(deckId);

    set({
      isStudying: true,
      currentDeckId: deckId,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: Date.now(),
      sessionCorrect: 0,
      sessionIncorrect: 0,
      sessionStreak: 0,
      maxStreak: 0,
    });
  },

  flipCard: () => {
    set((state) => ({ isCardFlipped: !state.isCardFlipped }));
  },

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

  endStudy: async () => {
    const { currentDeckId, sessionCorrect, sessionIncorrect, studyStartTime } = get();
    if (!currentDeckId) return;

    const duration = studyStartTime ? Date.now() - studyStartTime : 0;

    try {
      await window.electron.db.flashcards.createSession({
        deck_id: currentDeckId,
        cards_studied: sessionCorrect + sessionIncorrect,
        cards_correct: sessionCorrect,
        cards_incorrect: sessionIncorrect,
        duration_ms: duration,
        started_at: studyStartTime || Date.now(),
        completed_at: Date.now(),
      });
    } catch (error) {
      console.error('[LearnStore] Error saving session:', error);
    }

    set({
      isStudying: false,
      currentDeckId: null,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
    });
  },

  reset: () => {
    set({
      activeSection: 'all',
      decks: [],
      studioOutputs: [],
      deckStats: {},
      isStudying: false,
      currentDeckId: null,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
      sessionCorrect: 0,
      sessionIncorrect: 0,
      sessionStreak: 0,
      maxStreak: 0,
      isGenerateModalOpen: false,
      isDeckModalOpen: false,
      isDeckEditorOpen: false,
      editingDeckId: null,
      dueCards: [],
    });
  },
}));
