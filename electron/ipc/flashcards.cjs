/* eslint-disable no-console */
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, windowManager, database, validateSender }) {
  // Create flashcard deck
  ipcMain.handle('db:flashcards:createDeck', (event, deck) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const id = deck.id || generateId();
      queries.createFlashcardDeck.run(
        id,
        deck.resource_id || null,
        deck.project_id,
        deck.title,
        deck.description || null,
        deck.card_count || 0,
        deck.tags ? JSON.stringify(deck.tags) : null,
        deck.settings ? JSON.stringify(deck.settings) : null,
        deck.created_at || now,
        deck.updated_at || now
      );
      const created = queries.getFlashcardDeckById.get(id);
      windowManager.broadcast('flashcard:deckCreated', created);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Get deck by ID
  ipcMain.handle('db:flashcards:getDeck', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const deck = queries.getFlashcardDeckById.get(id);
      return { success: true, data: deck || null };
    } catch (error) {
      console.error('[DB] Error getting flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Get decks by project
  ipcMain.handle('db:flashcards:getDecksByProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const decks = queries.getFlashcardDecksByProject.all(projectId);
      return { success: true, data: decks };
    } catch (error) {
      console.error('[DB] Error getting flashcard decks by project:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all decks
  ipcMain.handle('db:flashcards:getAllDecks', (event, limit) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const decks = queries.getAllFlashcardDecks.all(limit || 100);
      return { success: true, data: decks };
    } catch (error) {
      console.error('[DB] Error getting all flashcard decks:', error);
      return { success: false, error: error.message };
    }
  });

  // Update deck
  ipcMain.handle('db:flashcards:updateDeck', (event, deck) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.updateFlashcardDeck.run(
        deck.title,
        deck.description || null,
        deck.card_count || 0,
        deck.tags ? JSON.stringify(deck.tags) : null,
        deck.settings ? JSON.stringify(deck.settings) : null,
        now,
        deck.id
      );
      const updated = queries.getFlashcardDeckById.get(deck.id);
      windowManager.broadcast('flashcard:deckUpdated', updated);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete deck
  ipcMain.handle('db:flashcards:deleteDeck', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.deleteFlashcardDeck.run(id);
      windowManager.broadcast('flashcard:deckDeleted', { id });
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Create single card
  ipcMain.handle('db:flashcards:createCard', (event, card) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const id = card.id || generateId();
      queries.createFlashcard.run(
        id,
        card.deck_id,
        card.question,
        card.answer,
        card.difficulty || 'medium',
        card.tags ? JSON.stringify(card.tags) : null,
        card.metadata ? JSON.stringify(card.metadata) : null,
        card.ease_factor || 2.5,
        card.interval || 0,
        card.repetitions || 0,
        card.next_review_at || null,
        card.last_reviewed_at || null,
        card.created_at || now,
        card.updated_at || now
      );
      const created = queries.getFlashcardById.get(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Bulk create cards (for AI-generated decks)
  ipcMain.handle('db:flashcards:createCards', (event, { deckId, cards }) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const now = Date.now();

      const insertMany = db.transaction((cardsToInsert) => {
        for (const card of cardsToInsert) {
          const id = generateId();
          queries.createFlashcard.run(
            id,
            deckId,
            card.question,
            card.answer,
            card.difficulty || 'medium',
            card.tags ? JSON.stringify(card.tags) : null,
            card.metadata ? JSON.stringify(card.metadata) : null,
            2.5, 0, 0, null, null, now, now
          );
        }
        // Update deck card count
        const allCards = queries.getFlashcardsByDeck.all(deckId);
        queries.updateFlashcardDeck.run(
          queries.getFlashcardDeckById.get(deckId)?.title || 'Untitled',
          queries.getFlashcardDeckById.get(deckId)?.description || null,
          allCards.length,
          queries.getFlashcardDeckById.get(deckId)?.tags || null,
          queries.getFlashcardDeckById.get(deckId)?.settings || null,
          now,
          deckId
        );
      });

      insertMany(cards);

      const allCards = queries.getFlashcardsByDeck.all(deckId);
      return { success: true, data: { count: allCards.length, cards: allCards } };
    } catch (error) {
      console.error('[DB] Error bulk creating flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Get cards in a deck
  ipcMain.handle('db:flashcards:getCards', (event, deckId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const cards = queries.getFlashcardsByDeck.all(deckId);
      return { success: true, data: cards };
    } catch (error) {
      console.error('[DB] Error getting flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Get due cards for study
  ipcMain.handle('db:flashcards:getDueCards', (event, { deckId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const cards = queries.getDueFlashcards.all(deckId, now, limit || 50);
      return { success: true, data: cards };
    } catch (error) {
      console.error('[DB] Error getting due flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Review a card (update SM-2 fields)
  ipcMain.handle('db:flashcards:reviewCard', (event, { cardId, quality }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const card = queries.getFlashcardById.get(cardId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      // SM-2 algorithm
      const q = Math.max(0, Math.min(5, Math.round(quality)));
      let newEF = card.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      newEF = Math.max(1.3, newEF);

      let newInterval;
      let newReps;

      if (q < 3) {
        newReps = 0;
        newInterval = 1;
      } else {
        newReps = card.repetitions + 1;
        if (newReps === 1) {
          newInterval = 1;
        } else if (newReps === 2) {
          newInterval = 6;
        } else {
          newInterval = Math.round(card.interval * newEF);
        }
      }

      const now = Date.now();
      const nextReviewAt = now + newInterval * 24 * 60 * 60 * 1000;

      queries.updateFlashcardReview.run(
        Math.round(newEF * 100) / 100,
        newInterval,
        newReps,
        nextReviewAt,
        now,
        now,
        cardId
      );

      const updated = queries.getFlashcardById.get(cardId);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error reviewing flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Update card content
  ipcMain.handle('db:flashcards:updateCard', (event, card) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.updateFlashcard.run(
        card.question,
        card.answer,
        card.difficulty || 'medium',
        card.tags ? JSON.stringify(card.tags) : null,
        card.metadata ? JSON.stringify(card.metadata) : null,
        now,
        card.id
      );
      const updated = queries.getFlashcardById.get(card.id);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete card
  ipcMain.handle('db:flashcards:deleteCard', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.deleteFlashcard.run(id);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Get deck stats
  ipcMain.handle('db:flashcards:getStats', (event, deckId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const stats = queries.getFlashcardStats.get(now, deckId);
      return { success: true, data: stats };
    } catch (error) {
      console.error('[DB] Error getting flashcard stats:', error);
      return { success: false, error: error.message };
    }
  });

  // Create study session
  ipcMain.handle('db:flashcards:createSession', (event, session) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = session.id || generateId();
      queries.createFlashcardSession.run(
        id,
        session.deck_id,
        session.cards_studied || 0,
        session.cards_correct || 0,
        session.cards_incorrect || 0,
        session.duration_ms || 0,
        session.started_at || Date.now(),
        session.completed_at || null
      );
      return { success: true, data: { id, ...session } };
    } catch (error) {
      console.error('[DB] Error creating flashcard session:', error);
      return { success: false, error: error.message };
    }
  });

  // Get sessions by deck
  ipcMain.handle('db:flashcards:getSessions', (event, { deckId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const sessions = queries.getSessionsByDeck.all(deckId, limit || 20);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[DB] Error getting flashcard sessions:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
