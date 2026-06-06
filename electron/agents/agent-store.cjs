'use strict';

/**
 * DomeSQLiteStore — LangGraph BaseStore implementation backed by SQLite.
 *
 * Provides cross-thread persistent memory for agents via the `agent_store`
 * table (migration 34). Compatible with the LangGraph JS `BaseStore` interface:
 * batch / put / get / delete / search / listNamespaces.
 *
 * `batch()` is the core method LangGraph's `AsyncBatchedStore` routes every
 * operation through; it must exist or `/memories/` filesystem ops (glob, ls,
 * read) fail with "this.store.batch is not a function".
 *
 * Namespaces are stored as dot-joined strings, e.g. ["user","facts"] → "user.facts".
 * Values are JSON-serialized in the `value` column.
 */

const { getDB } = require('../core/database.cjs');

/** Join a namespace tuple into a string key. */
function nsKey(namespace) {
  if (Array.isArray(namespace)) return namespace.join('.');
  return String(namespace);
}

/**
 * Match a namespace path against a MatchCondition ({ matchType, path }).
 * Supports the "*" wildcard segment and prefix/suffix match types.
 * @param {string[]} namespace
 * @param {{ matchType?: 'prefix'|'suffix'; path?: (string|'*')[] }} condition
 */
function matchNamespace(namespace, condition) {
  const path = Array.isArray(condition?.path) ? condition.path : [];
  if (path.length === 0) return true;
  if (path.length > namespace.length) return false;
  const segment = condition?.matchType === 'suffix'
    ? namespace.slice(namespace.length - path.length)
    : namespace.slice(0, path.length);
  return path.every((p, i) => p === '*' || p === segment[i]);
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
   * Search items under a namespace prefix (BaseStore-compatible signature).
   * Matches items whose namespace equals the prefix or is nested below it.
   * Supports exact-match `filter` on value fields and a naive substring `query`.
   * @param {string[]} namespacePrefix
   * @param {{ filter?: Record<string, unknown>; limit?: number; offset?: number; query?: string }} [options]
   * @returns {Promise<Array<{ key: string; value: unknown; namespace: string[]; createdAt: Date; updatedAt: Date }>>}
   */
  async search(namespacePrefix = [], options = {}) {
    const db = this._getDB();
    const { filter, limit = 10, offset = 0, query } = options || {};
    const prefix = nsKey(namespacePrefix);

    let rows;
    if (prefix) {
      rows = db.prepare(
        `SELECT * FROM agent_store
         WHERE namespace = ? OR namespace LIKE ?
         ORDER BY namespace, key
         LIMIT ? OFFSET ?`,
      ).all(prefix, `${prefix}.%`, limit, offset);
    } else {
      rows = db.prepare(
        'SELECT * FROM agent_store ORDER BY namespace, key LIMIT ? OFFSET ?',
      ).all(limit, offset);
    }

    let items = rows.map((r) => this._toItem(r));

    if (filter && typeof filter === 'object') {
      const entries = Object.entries(filter);
      items = items.filter((it) => {
        const val = it.value && typeof it.value === 'object' ? it.value : {};
        return entries.every(([k, v]) => val[k] === v);
      });
    }

    if (query) {
      const q = String(query).toLowerCase();
      items = items.filter((it) => {
        try {
          return JSON.stringify(it.value).toLowerCase().includes(q);
        } catch {
          return false;
        }
      });
    }

    return items;
  }

  /**
   * List distinct namespace paths (BaseStore-compatible signature).
   * @param {{ prefix?: string[]; suffix?: string[]; maxDepth?: number; limit?: number; offset?: number }} [options]
   * @returns {Promise<string[][]>}
   */
  async listNamespaces(options = {}) {
    const db = this._getDB();
    const { prefix, suffix, maxDepth, limit = 100, offset = 0 } = options || {};
    const rows = db.prepare('SELECT DISTINCT namespace FROM agent_store ORDER BY namespace').all();

    let namespaces = rows.map((r) => r.namespace.split('.'));

    if (Array.isArray(prefix) && prefix.length) {
      namespaces = namespaces.filter((ns) => matchNamespace(ns, { matchType: 'prefix', path: prefix }));
    }
    if (Array.isArray(suffix) && suffix.length) {
      namespaces = namespaces.filter((ns) => matchNamespace(ns, { matchType: 'suffix', path: suffix }));
    }
    if (typeof maxDepth === 'number' && maxDepth >= 0) {
      namespaces = namespaces.map((ns) => ns.slice(0, maxDepth));
    }

    const seen = new Set();
    const deduped = [];
    for (const ns of namespaces) {
      const key = ns.join('.');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ns);
    }

    return deduped.slice(offset, offset + limit);
  }

  /**
   * Execute a batch of store operations (the core BaseStore method).
   *
   * LangGraph wraps every store in an `AsyncBatchedStore` that routes all
   * get/search/put/delete/listNamespaces calls through `batch()`. Without this
   * method, any filesystem operation over the `/memories/` route (e.g. `glob`)
   * fails with "this.store.batch is not a function".
   *
   * @param {Array<object>} operations
   * @returns {Promise<Array<unknown>>} results aligned with the input order
   */
  async batch(operations = []) {
    const results = [];
    for (const op of operations) {
      if (op && 'namespacePrefix' in op) {
        results.push(await this.search(op.namespacePrefix, {
          filter: op.filter,
          limit: op.limit,
          offset: op.offset,
          query: op.query,
        }));
      } else if (op && 'key' in op && 'value' in op) {
        if (op.value === null) {
          await this.delete(op.namespace, op.key);
        } else {
          await this.put(op.namespace, op.key, op.value);
        }
        results.push(undefined);
      } else if (op && 'key' in op) {
        results.push(await this.get(op.namespace, op.key));
      } else {
        results.push(await this.listNamespaces({
          maxDepth: op?.maxDepth,
          limit: op?.limit,
          offset: op?.offset,
        }));
      }
    }
    return results;
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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
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
