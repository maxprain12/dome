'use strict';

/**
 * DomeSQLiteStore — LangGraph BaseStore implementation backed by SQLite.
 *
 * Provides cross-thread persistent memory for agents via the `agent_store`
 * table (migration 34). Compatible with the LangGraph JS `BaseStore` interface:
 * put / get / delete / list / search.
 *
 * Namespaces are stored as dot-joined strings, e.g. ["user","facts"] → "user.facts".
 * Values are JSON-serialized in the `value` column.
 */

const { getDB } = require('./database.cjs');

/** Join a namespace tuple into a string key. */
function nsKey(namespace) {
  if (Array.isArray(namespace)) return namespace.join('.');
  return String(namespace);
}

class DomeSQLiteStore {
  constructor() {
    this._db = null;
  }

  _getDB() {
    if (!this._db) this._db = getDB();
    return this._db;
  }

  /**
   * Store a value under (namespace, key).
   * @param {string[]} namespace
   * @param {string} key
   * @param {unknown} value
   */
  async put(namespace, key, value) {
    const db = this._getDB();
    const ns = nsKey(namespace);
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_store (namespace, key, value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(namespace, key) DO UPDATE
         SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(ns, key, JSON.stringify(value), now, now);
  }

  /**
   * Retrieve a single item.
   * Returns an object with { value, key, namespace, createdAt, updatedAt } or null.
   * @param {string[]} namespace
   * @param {string} key
   */
  async get(namespace, key) {
    const db = this._getDB();
    const ns = nsKey(namespace);
    const row = db.prepare(
      'SELECT * FROM agent_store WHERE namespace = ? AND key = ?',
    ).get(ns, key);
    if (!row) return null;
    return this._toItem(row);
  }

  /**
   * Delete a single item.
   * @param {string[]} namespace
   * @param {string} key
   */
  async delete(namespace, key) {
    const db = this._getDB();
    const ns = nsKey(namespace);
    db.prepare('DELETE FROM agent_store WHERE namespace = ? AND key = ?').run(ns, key);
  }

  /**
   * List all items in a namespace (optionally prefix-filtered).
   * @param {string[]} namespace
   * @param {{ prefix?: string; limit?: number; offset?: number }} [opts]
   * @returns {Promise<Array<{ key: string; value: unknown; namespace: string[]; createdAt: number; updatedAt: number }>>}
   */
  async list(namespace, opts = {}) {
    const db = this._getDB();
    const ns = nsKey(namespace);
    const { prefix, limit = 100, offset = 0 } = opts;

    let rows;
    if (prefix) {
      rows = db.prepare(
        'SELECT * FROM agent_store WHERE namespace = ? AND key LIKE ? LIMIT ? OFFSET ?',
      ).all(ns, `${prefix}%`, limit, offset);
    } else {
      rows = db.prepare(
        'SELECT * FROM agent_store WHERE namespace = ? LIMIT ? OFFSET ?',
      ).all(ns, limit, offset);
    }
    return rows.map((r) => this._toItem(r));
  }

  /**
   * Basic full-text search within a namespace — scans JSON-serialized values for
   * the query string. For production workloads, swap for FTS5 or vector search.
   * @param {string[]} namespace
   * @param {string} query
   * @param {{ limit?: number }} [opts]
   */
  async search(namespace, query, opts = {}) {
    const db = this._getDB();
    const ns = nsKey(namespace);
    const { limit = 20 } = opts;
    const rows = db.prepare(
      'SELECT * FROM agent_store WHERE namespace = ? AND value LIKE ? LIMIT ?',
    ).all(ns, `%${query}%`, limit);
    return rows.map((r) => this._toItem(r));
  }

  /**
   * List all distinct namespace prefixes (top-level first segment).
   */
  async listNamespaces() {
    const db = this._getDB();
    const rows = db.prepare('SELECT DISTINCT namespace FROM agent_store ORDER BY namespace').all();
    return rows.map((r) => r.namespace.split('.'));
  }

  _toItem(row) {
    let value;
    try {
      value = JSON.parse(row.value);
    } catch {
      value = row.value;
    }
    return {
      namespace: row.namespace.split('.'),
      key: row.key,
      value,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

let _store = null;

/**
 * Returns the singleton DomeSQLiteStore instance.
 */
function getDomeStore() {
  if (!_store) _store = new DomeSQLiteStore();
  return _store;
}

module.exports = { DomeSQLiteStore, getDomeStore };
