/* eslint-disable no-console */
/**
 * Code ports of SQLite triggers that DuckDB cannot host (DuckDB migration).
 *
 * The `trg_flashcards_count_*` triggers maintained `flashcard_decks.card_count`
 * on flashcard insert/delete/move. DuckDB trigger support is limited, so call
 * `recomputeDeckCardCount(db, deckId)` from the relevant flashcard mutations.
 */

/**
 * Recompute and persist `card_count` for one deck.
 * @param {import('./duckdb.cjs').DuckDbConnection} db
 * @param {string|null|undefined} deckId
 */
async function recomputeDeckCardCount(db, deckId) {
  if (!deckId) return;
  await db.run(
    'UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = ?) WHERE id = ?',
    [deckId, deckId],
  );
}

module.exports = { recomputeDeckCardCount };
