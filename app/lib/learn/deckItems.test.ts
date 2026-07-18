import { describe, expect, it } from 'vitest';
import { countBySection, filterLearnItems, parseStudioContentCount, recentlyCreatedItems } from './deckItems';
import type { LearnDeckItem } from './types';

const items: LearnDeckItem[] = [
  { id: 'deck', kind: 'flashcard_deck', type: 'flashcards', title: 'Cell biology', count: 12, dueCount: 3, createdAt: 1, updatedAt: 2, lastSeen: 2, pinned: false },
  { id: 'quiz', kind: 'quiz', type: 'quiz', title: 'Mitosis quiz', count: 5, createdAt: 3, updatedAt: 4, lastSeen: 4, pinned: false },
];

describe('Learn library presentation', () => {
  it('counts, filters and searches without changing persisted items', () => {
    expect(countBySection(items)).toMatchObject({ all: 2, decks: 1, quizzes: 1 });
    expect(filterLearnItems(items, 'quizzes', '')).toEqual([items[1]]);
    expect(filterLearnItems(items, 'all', 'cell')).toEqual([items[0]]);
    expect(items).toHaveLength(2);
  });

  it('keeps content types exhaustive and recent items deterministic', () => {
    expect(parseStudioContentCount('quiz', JSON.stringify({ questions: [{}, {}] }))).toBe(2);
    expect(parseStudioContentCount('timeline', '{bad')).toBe(0);
    expect(recentlyCreatedItems(items).map((item) => item.id)).toEqual(['quiz', 'deck']);
  });
});
