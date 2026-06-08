/* eslint-disable no-console */
const crypto = require('crypto');
const { schedule } = require('../../services/fsrs-scheduler.cjs');
const { invalidateLearnKpisCache } = require('../../services/learn-kpis.cjs');

function generateId() {
  return crypto.randomUUID();
}

/** Trim a value and ensure it is a non-empty string. */
function requireText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function resolveProjectId(queries, rawProjectId) {
  let projectId = typeof rawProjectId === 'string' ? rawProjectId.trim() : '';
  if (!projectId) projectId = 'default';

  const projectExists = queries.getProjectById.get(projectId);
  if (!projectExists) {
    projectId = 'default';
    const defaultExists = queries.getProjectById.get('default');
    if (!defaultExists) {
      throw new Error('No valid project found. Create a project first.');
    }
  }
  return projectId;
}

function resolveResourceId(queries, rawResourceId) {
  let resourceId = rawResourceId || null;
  if (resourceId) {
    const resourceExists = queries.getResourceById.get(resourceId);
    if (!resourceExists) resourceId = null;
  }
  return resourceId;
}

function register({ ipcMain, windowManager, database, validateSender }) {
  // Create flashcard deck
  ipcMain.handle('db:flashcards:createDeck', (event, deck) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const id = deck.id || generateId();
      const projectId = resolveProjectId(queries, deck.project_id);
      const resourceId = resolveResourceId(queries, deck.resource_id);
      queries.createFlashcardDeck.run(
        id,
        resourceId,
        projectId,
        deck.title,
        deck.description || null,
        deck.card_count || 0,
        deck.tags ? JSON.stringify(deck.tags) : null,
        deck.settings ? JSON.stringify(deck.settings) : null,
        deck.created_at || now,
        deck.updated_at || now
      );
      const created = queries.getFlashcardDeckById.get(id);
      invalidateLearnKpisCache(database.getDB());
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
      invalidateLearnKpisCache(database.getDB());
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
      const question = requireText(card.question, 'question');
      const answer = requireText(card.answer, 'answer');
      queries.createFlashcard.run(
        id,
        card.deck_id,
        question,
        answer,
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

  // Bulk create cards (for AI-generated decks). card_count is kept in sync by triggers.
  ipcMain.handle('db:flashcards:createCards', (event, { deckId, cards }) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const now = Date.now();

      const rows = (Array.isArray(cards) ? cards : [])
        .map((card) => ({
          question: typeof card.question === 'string' ? card.question.trim() : '',
          answer: typeof card.answer === 'string' ? card.answer.trim() : '',
          difficulty: card.difficulty || 'medium',
          tags: card.tags ? JSON.stringify(card.tags) : null,
          metadata: card.metadata ? JSON.stringify(card.metadata) : null,
        }))
        .filter((card) => card.question && card.answer);

      const insertMany = db.transaction((cardsToInsert) => {
        for (const card of cardsToInsert) {
          queries.createFlashcard.run(
            generateId(),
            deckId,
            card.question,
            card.answer,
            card.difficulty,
            card.tags,
            card.metadata,
            2.5, 0, 0, null, null, now, now,
          );
        }
      });
      insertMany(rows);

      const allCards = queries.getFlashcardsByDeck.all(deckId);
      const updated = queries.getFlashcardDeckById.get(deckId);
      if (updated) windowManager.broadcast('flashcard:deckUpdated', updated);
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

  // Review a card (FSRS scheduling). quality: 1=Again, 2=Hard, 3=Good, 4=Easy
  ipcMain.handle('db:flashcards:reviewCard', (event, { cardId, quality }) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const card = queries.getFlashcardById.get(cardId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      const now = Date.now();
      const next = schedule(card, quality, now);

      queries.reviewFlashcardFsrs.run(
        next.stability,
        next.fsrs_difficulty,
        next.fsrs_state,
        next.lapses,
        next.scheduled_days,
        next.learning_steps,
        next.repetitions,
        next.next_review_at,
        next.last_reviewed_at,
        next.last_rating,
        next.interval,
        now,
        cardId,
      );
      invalidateLearnKpisCache(db);

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
        requireText(card.question, 'question'),
        requireText(card.answer, 'answer'),
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

  // Delete card (card_count kept in sync by trigger; broadcast updated deck)
  ipcMain.handle('db:flashcards:deleteCard', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const card = queries.getFlashcardById.get(id);
      queries.deleteFlashcard.run(id);
      if (card?.deck_id) {
        const deck = queries.getFlashcardDeckById.get(card.deck_id);
        if (deck) windowManager.broadcast('flashcard:deckUpdated', deck);
      }
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

  // Create study session (writes legacy flashcard_sessions + unified study_events)
  ipcMain.handle('db:flashcards:createSession', (event, session) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const id = session.id || generateId();
      const deck = session.deck_id ? queries.getFlashcardDeckById.get(session.deck_id) : null;
      const startedAt = session.started_at || Date.now();
      const completedAt = session.completed_at || Date.now();

      const persist = db.transaction(() => {
        queries.createFlashcardSession.run(
          id,
          session.deck_id,
          session.cards_studied || 0,
          session.cards_correct || 0,
          session.cards_incorrect || 0,
          session.duration_ms || 0,
          startedAt,
          completedAt,
        );
        queries.createStudyEvent.run(
          id,
          deck?.project_id || null,
          session.deck_id || null,
          null,
          'flashcard',
          session.cards_studied || 0,
          session.cards_correct || 0,
          session.cards_incorrect || 0,
          session.duration_ms || 0,
          startedAt,
          completedAt,
        );
      });
      persist();
      invalidateLearnKpisCache(db);

      windowManager.broadcast('flashcard:sessionEnded', {
        type: 'flashcard',
        deckId: session.deck_id,
        sessionId: id,
      });
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
