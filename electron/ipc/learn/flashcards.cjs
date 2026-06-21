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

async function resolveProjectId(queries, rawProjectId) {
  let projectId = typeof rawProjectId === 'string' ? rawProjectId.trim() : '';
  if (!projectId) projectId = 'default';

  const projectExists = await queries.getProjectById.get(projectId);
  if (!projectExists) {
    projectId = 'default';
    const defaultExists = await queries.getProjectById.get('default');
    if (!defaultExists) {
      throw new Error('No valid project found. Create a project first.');
    }
  }
  return projectId;
}

async function resolveResourceId(queries, rawResourceId) {
  let resourceId = rawResourceId || null;
  if (resourceId) {
    const resourceExists = await queries.getResourceById.get(resourceId);
    if (!resourceExists) resourceId = null;
  }
  return resourceId;
}

function register({ ipcMain, windowManager, database, validateSender }) {
  // Create flashcard deck
  ipcMain.handle('db:flashcards:createDeck', async (event, deck) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const id = deck.id || generateId();
      const projectId = await resolveProjectId(queries, deck.project_id);
      const resourceId = await resolveResourceId(queries, deck.resource_id);
      await queries.createFlashcardDeck.run(
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
      const created = await queries.getFlashcardDeckById.get(id);
      await invalidateLearnKpisCache(database.getDB());
      windowManager.broadcast('flashcard:deckCreated', created);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Get deck by ID
  ipcMain.handle('db:flashcards:getDeck', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const deck = await queries.getFlashcardDeckById.get(id);
      return { success: true, data: deck || null };
    } catch (error) {
      console.error('[DB] Error getting flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Get decks by project
  ipcMain.handle('db:flashcards:getDecksByProject', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const decks = await queries.getFlashcardDecksByProject.all(projectId);
      return { success: true, data: decks };
    } catch (error) {
      console.error('[DB] Error getting flashcard decks by project:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all decks
  ipcMain.handle('db:flashcards:getAllDecks', async (event, limit) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const decks = await queries.getAllFlashcardDecks.all(limit || 100);
      return { success: true, data: decks };
    } catch (error) {
      console.error('[DB] Error getting all flashcard decks:', error);
      return { success: false, error: error.message };
    }
  });

  // Update deck
  ipcMain.handle('db:flashcards:updateDeck', async (event, deck) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      await queries.updateFlashcardDeck.run(
        deck.title,
        deck.description || null,
        deck.card_count || 0,
        deck.tags ? JSON.stringify(deck.tags) : null,
        deck.settings ? JSON.stringify(deck.settings) : null,
        now,
        deck.id
      );
      const updated = await queries.getFlashcardDeckById.get(deck.id);
      windowManager.broadcast('flashcard:deckUpdated', updated);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete deck
  ipcMain.handle('db:flashcards:deleteDeck', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await queries.deleteFlashcardDeck.run(id);
      await invalidateLearnKpisCache(database.getDB());
      windowManager.broadcast('flashcard:deckDeleted', { id });
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting flashcard deck:', error);
      return { success: false, error: error.message };
    }
  });

  // Create single card
  ipcMain.handle('db:flashcards:createCard', async (event, card) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const id = card.id || generateId();
      const question = requireText(card.question, 'question');
      const answer = requireText(card.answer, 'answer');
      await queries.createFlashcard.run(
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
      const created = await queries.getFlashcardById.get(id);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Bulk create cards (for AI-generated decks). card_count is kept in sync by triggers.
  ipcMain.handle('db:flashcards:createCards', async (event, { deckId, cards }) => {
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

      await db.transaction(async (_tx) => {
        for (const card of rows) {
          await queries.createFlashcard.run(
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

      const allCards = await queries.getFlashcardsByDeck.all(deckId);
      const updated = await queries.getFlashcardDeckById.get(deckId);
      if (updated) windowManager.broadcast('flashcard:deckUpdated', updated);
      return { success: true, data: { count: allCards.length, cards: allCards } };
    } catch (error) {
      console.error('[DB] Error bulk creating flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Get cards in a deck
  ipcMain.handle('db:flashcards:getCards', async (event, deckId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const cards = await queries.getFlashcardsByDeck.all(deckId);
      return { success: true, data: cards };
    } catch (error) {
      console.error('[DB] Error getting flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Get due cards for study
  ipcMain.handle('db:flashcards:getDueCards', async (event, { deckId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const cards = await queries.getDueFlashcards.all(deckId, now, limit || 50);
      return { success: true, data: cards };
    } catch (error) {
      console.error('[DB] Error getting due flashcards:', error);
      return { success: false, error: error.message };
    }
  });

  // Review a card (FSRS scheduling). quality: 1=Again, 2=Hard, 3=Good, 4=Easy
  ipcMain.handle('db:flashcards:reviewCard', async (event, { cardId, quality }) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const card = await queries.getFlashcardById.get(cardId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      const now = Date.now();
      const next = schedule(card, quality, now);

      await queries.reviewFlashcardFsrs.run(
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
      await invalidateLearnKpisCache(db);

      const updated = await queries.getFlashcardById.get(cardId);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error reviewing flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Update card content
  ipcMain.handle('db:flashcards:updateCard', async (event, card) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      await queries.updateFlashcard.run(
        requireText(card.question, 'question'),
        requireText(card.answer, 'answer'),
        card.difficulty || 'medium',
        card.tags ? JSON.stringify(card.tags) : null,
        card.metadata ? JSON.stringify(card.metadata) : null,
        now,
        card.id
      );
      const updated = await queries.getFlashcardById.get(card.id);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete card (card_count kept in sync by trigger; broadcast updated deck)
  ipcMain.handle('db:flashcards:deleteCard', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const card = await queries.getFlashcardById.get(id);
      await queries.deleteFlashcard.run(id);
      if (card?.deck_id) {
        const deck = await queries.getFlashcardDeckById.get(card.deck_id);
        if (deck) windowManager.broadcast('flashcard:deckUpdated', deck);
      }
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting flashcard:', error);
      return { success: false, error: error.message };
    }
  });

  // Get deck stats
  ipcMain.handle('db:flashcards:getStats', async (event, deckId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const stats = await queries.getFlashcardStats.get(now, deckId);
      return { success: true, data: stats };
    } catch (error) {
      console.error('[DB] Error getting flashcard stats:', error);
      return { success: false, error: error.message };
    }
  });

  // Create study session (writes legacy flashcard_sessions + unified study_events)
  ipcMain.handle('db:flashcards:createSession', async (event, session) => {
    try {
      validateSender(event, windowManager);
      const db = database.getDB();
      const queries = database.getQueries();
      const id = session.id || generateId();
      const deck = session.deck_id ? await queries.getFlashcardDeckById.get(session.deck_id) : null;
      const startedAt = session.started_at || Date.now();
      const completedAt = session.completed_at || Date.now();

      await db.transaction(async (_tx) => {
        await queries.createFlashcardSession.run(
          id,
          session.deck_id,
          session.cards_studied || 0,
          session.cards_correct || 0,
          session.cards_incorrect || 0,
          session.duration_ms || 0,
          startedAt,
          completedAt,
        );
        await queries.createStudyEvent.run(
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
      await invalidateLearnKpisCache(db);

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
  ipcMain.handle('db:flashcards:getSessions', async (event, { deckId, limit }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const sessions = await queries.getSessionsByDeck.all(deckId, limit || 20);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[DB] Error getting flashcard sessions:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
