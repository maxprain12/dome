import { create } from 'zustand';
import type { FlashcardDeck, Flashcard, FlashcardStudySession, FlashcardDeckStats } from '@/types';
import { calculateSM2 } from '@/lib/utils/spaced-repetition';

interface FlashcardState {
  // Data
  decks: FlashcardDeck[];
  currentDeck: FlashcardDeck | null;
  currentCards: Flashcard[];
  dueCards: Flashcard[];
  deckStats: Record<string, FlashcardDeckStats>;

  // UI State
  isStudying: boolean;
  currentCardIndex: number;
  isCardFlipped: boolean;
  studyStartTime: number | null;

  // Session tracking
  sessionCorrect: number;
  sessionIncorrect: number;
  sessionStreak: number;
  maxStreak: number;

  // Actions
  loadDecks: (projectId?: string) => Promise<void>;
  loadDeck: (deckId: string) => Promise<void>;
  loadDueCards: (deckId: string) => Promise<void>;
  loadDeckStats: (deckId: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<boolean>;

  // Study actions
  startStudy: (deckId: string) => Promise<void>;
  flipCard: () => void;
  reviewCard: (quality: number) => Promise<void>;
  endStudy: () => Promise<void>;

  // Reset
  reset: () => void;
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  // Data
  decks: [],
  currentDeck: null,
  currentCards: [],
  dueCards: [],
  deckStats: {},

  // UI State
  isStudying: false,
  currentCardIndex: 0,
  isCardFlipped: false,
  studyStartTime: null,

  // Session tracking
  sessionCorrect: 0,
  sessionIncorrect: 0,
  sessionStreak: 0,
  maxStreak: 0,

  loadDecks: async (projectId?: string) => {
    try {
      const result = projectId
        ? await window.electron.db.flashcards.getDecksByProject(projectId)
        : await window.electron.db.flashcards.getAllDecks(100);
      if (result.success && result.data) {
        set({ decks: result.data });
      }
    } catch (error) {
      console.error('[FlashcardStore] Error loading decks:', error);
    }
  },

  loadDeck: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.getDeck(deckId);
      if (result.success && result.data) {
        set({ currentDeck: result.data });
      }
      const cardsResult = await window.electron.db.flashcards.getCards(deckId);
      if (cardsResult.success && cardsResult.data) {
        set({ currentCards: cardsResult.data });
      }
    } catch (error) {
      console.error('[FlashcardStore] Error loading deck:', error);
    }
  },

  loadDueCards: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.getDueCards(deckId, 50);
      if (result.success && result.data) {
        set({ dueCards: result.data });
      }
    } catch (error) {
      console.error('[FlashcardStore] Error loading due cards:', error);
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
      console.error('[FlashcardStore] Error loading deck stats:', error);
    }
  },

  deleteDeck: async (deckId: string) => {
    try {
      const result = await window.electron.db.flashcards.deleteDeck(deckId);
      if (result.success) {
        set((state) => ({
          decks: state.decks.filter((d) => d.id !== deckId),
          currentDeck: state.currentDeck?.id === deckId ? null : state.currentDeck,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[FlashcardStore] Error deleting deck:', error);
      return false;
    }
  },

  startStudy: async (deckId: string) => {
    const { loadDeck, loadDueCards } = get();
    await loadDeck(deckId);
    await loadDueCards(deckId);

    set({
      isStudying: true,
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
      console.error('[FlashcardStore] Error reviewing card:', error);
    }
  },

  endStudy: async () => {
    const { currentDeck, sessionCorrect, sessionIncorrect, studyStartTime } = get();
    if (!currentDeck) return;

    const duration = studyStartTime ? Date.now() - studyStartTime : 0;

    try {
      await window.electron.db.flashcards.createSession({
        deck_id: currentDeck.id,
        cards_studied: sessionCorrect + sessionIncorrect,
        cards_correct: sessionCorrect,
        cards_incorrect: sessionIncorrect,
        duration_ms: duration,
        started_at: studyStartTime || Date.now(),
        completed_at: Date.now(),
      });
    } catch (error) {
      console.error('[FlashcardStore] Error saving session:', error);
    }

    set({
      isStudying: false,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
    });
  },

  reset: () => {
    set({
      decks: [],
      currentDeck: null,
      currentCards: [],
      dueCards: [],
      deckStats: {},
      isStudying: false,
      currentCardIndex: 0,
      isCardFlipped: false,
      studyStartTime: null,
      sessionCorrect: 0,
      sessionIncorrect: 0,
      sessionStreak: 0,
      maxStreak: 0,
    });
  },
}));
