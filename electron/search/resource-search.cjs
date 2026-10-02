'use strict';

/** Quote each user term as a literal FTS5 prefix; operators never become syntax. */
function resourceFtsQuery(query) {
  return String(query || '').trim().split(/\s+/).filter(Boolean).slice(0, 100)
    .map((term) => `"${term.replaceAll('"', '""')}"*`).join(' ');
}
function searchResources(db, query, { projectId, type, limit = 25 } = {}) {
  const ftsQuery = resourceFtsQuery(query);
  if (!ftsQuery) return [];
  const clauses = ['resources_fts MATCH ?'];
  const parameters = [ftsQuery];
  if (projectId) { clauses.push('r.project_id = ?'); parameters.push(projectId); }
  if (type) { clauses.push('r.type = ?'); parameters.push(type); }
  parameters.push(Math.max(1, Math.min(100, Number(limit) || 25)));
  return db.prepare(`SELECT r.*, snippet(resources_fts, 2, '<mark>', '</mark>', '…', 50) AS snippet
    FROM resources r JOIN resources_fts ON r.id = resources_fts.resource_id
    WHERE ${clauses.join(' AND ')} ORDER BY rank LIMIT ?`).all(...parameters);
}
module.exports = { resourceFtsQuery, searchResources };
