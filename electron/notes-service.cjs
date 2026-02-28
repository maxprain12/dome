/* eslint-disable no-console */
/**
 * Notes Service - Docmost-style business logic
 * Encapsulates CRUD, move with fractional ordering, breadcrumbs, trash/restore
 */

const { generateJitteredKeyBetween } = require('fractional-indexing-jittered');
const crypto = require('crypto');

/**
 * Generate a unique slug_id for a note
 */
function generateSlugId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Get the next position for a new note (fractional indexing)
 * @param {object} queries - Database queries
 * @param {string} projectId
 * @param {string|null} parentNoteId
 * @returns {string} Position string for ordering
 */
function nextPosition(queries, projectId, parentNoteId) {
  const siblings = parentNoteId
    ? queries.getChildNotes.all(parentNoteId)
    : queries.getRootNotes.all(projectId);
  const last = siblings[siblings.length - 1];
  return last ? generateJitteredKeyBetween(last.position, null) : generateJitteredKeyBetween(null, null);
}

/**
 * Get breadcrumbs (ancestors) for a note
 * @param {object} queries
 * @param {string} noteId
 * @returns {Array} Ancestor notes from root to parent
 */
function getBreadcrumbs(queries, noteId) {
  const note = queries.getNoteById.get(noteId);
  if (!note || !note.parent_note_id) return [];

  const ancestors = [];
  let currentId = note.parent_note_id;

  while (currentId) {
    const parent = queries.getNoteById.get(currentId);
    if (!parent) break;
    ancestors.unshift(parent);
    currentId = parent.parent_note_id;
  }

  return ancestors;
}

/**
 * Compute new position when moving a note between siblings
 * @param {object} queries
 * @param {string} noteId - Note being moved
 * @param {string|null} newParentId
 * @param {number} index - Target index among siblings (0 = first)
 * @returns {{ position: string, parentNoteId: string|null }}
 */
function computeMovePosition(queries, noteId, newParentId, index, projectId) {
  const siblings = newParentId
    ? queries.getChildNotes.all(newParentId)
    : queries.getRootNotes.all(projectId);

  const filtered = siblings.filter((n) => n.id !== noteId);
  const parentNoteId = newParentId || null;

  if (filtered.length === 0) {
    return { position: generateJitteredKeyBetween(null, null), parentNoteId };
  }

  if (index <= 0) {
    return { position: generateJitteredKeyBetween(null, filtered[0].position), parentNoteId };
  }

  if (index >= filtered.length) {
    return { position: generateJitteredKeyBetween(filtered[filtered.length - 1].position, null), parentNoteId };
  }

  const before = filtered[index - 1];
  const after = filtered[index];
  return {
    position: generateJitteredKeyBetween(before.position, after.position),
    parentNoteId,
  };
}

/**
 * Duplicate a note and its descendants (recursive)
 * @param {object} queries
 * @param {string} noteId
 * @param {string} projectId
 * @param {string|null} newParentId
 * @returns {object} The new root note
 */
function duplicateNote(queries, noteId, projectId, newParentId = null) {
  const note = queries.getNoteById.get(noteId);
  if (!note) return null;

  const newId = crypto.randomUUID();
  const newSlugId = generateSlugId();
  const now = Date.now();
  const position = nextPosition(queries, projectId, newParentId);

  queries.createNote.run(
    newId,
    newSlugId,
    projectId,
    newParentId,
    note.title + ' (copy)',
    note.icon,
    note.content_json,
    note.text_content,
    position,
    now,
    now,
    null,
    null
  );

  const children = queries.getChildNotes.all(noteId);
  for (const child of children) {
    duplicateNote(queries, child.id, projectId, newId);
  }

  return queries.getNoteById.get(newId);
}

module.exports = {
  generateSlugId,
  nextPosition,
  getBreadcrumbs,
  computeMovePosition,
  duplicateNote,
};
