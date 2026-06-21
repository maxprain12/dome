/* eslint-disable no-console */
/**
 * Low-level async DuckDB connection wrapper (DuckDB migration — Fase 1).
 *
 * Replaces the synchronous `better-sqlite3` API. DuckDB's official Node binding
 * (`@duckdb/node-api`, Neo API) is async-only, so every accessor here returns a
 * Promise. The rest of the DB layer (migrations, queries, database.cjs) is built
 * on top of this module.
 *
 * Public shape (mirrors the old sync `db` ergonomics, but async):
 *   await db.run(sql, params)     -> { changes? } (no row results)
 *   await db.get(sql, params)     -> first row object | undefined
 *   await db.all(sql, params)     -> row object[]
 *   await db.exec(sqlScript)      -> runs one or more statements (no params)
 *   await db.transaction(fn)      -> runs fn() inside BEGIN/COMMIT (ROLLBACK on throw)
 *   db.path                       -> the database file path (or ':memory:')
 *   await db.close()
 *
 * A single persistent connection is used (DuckDB is single-writer); writes from
 * the main process are naturally serialized by awaiting.
 */

let duckdb = null;
function loadDuckDb() {
  if (!duckdb) {
    // Lazy require so tooling that runs without the native binary doesn't crash
    // on import (mirrors how better-sqlite3 was required lazily).
    duckdb = require('@duckdb/node-api');
  }
  return duckdb;
}

/**
 * Normalize a DuckDB result reader into plain JS row objects.
 * DuckDB returns BigInt for 64-bit integer columns; convert to Number when safe
 * so downstream code (which assumed SQLite's Number) keeps working. Values that
 * exceed Number.MAX_SAFE_INTEGER are left as BigInt to avoid silent precision loss.
 */
function normalizeRows(rows) {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (typeof v === 'bigint') {
        row[key] = v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v;
      }
    }
  }
  return rows;
}

class DuckDbConnection {
  constructor(instance, connection, dbPath) {
    this._instance = instance;
    this._conn = connection;
    this.path = dbPath;
    // Serialize all access through a promise chain. DuckDB allows concurrent
    // reads but a single writer; chaining keeps statement ordering deterministic
    // and avoids interleaving inside transactions.
    this._chain = Promise.resolve();
  }

  /** Enqueue work so statements run strictly in call order. */
  _enqueue(work) {
    const result = this._chain.then(work, work);
    // Keep the chain alive but swallow rejections on the chain itself; the
    // returned promise still rejects for the caller.
    this._chain = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async all(sql, params = []) {
    return this._enqueue(async () => {
      const reader = Array.isArray(params) && params.length > 0
        ? await this._conn.runAndReadAll(sql, params)
        : await this._conn.runAndReadAll(sql);
      return normalizeRows(reader.getRowObjects());
    });
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows.length > 0 ? rows[0] : undefined;
  }

  async run(sql, params = []) {
    return this._enqueue(async () => {
      const result = Array.isArray(params) && params.length > 0
        ? await this._conn.run(sql, params)
        : await this._conn.run(sql);
      // DuckDB returns the affected-row count on DML as `rowsChanged`; expose it
      // as `changes` to match the better-sqlite3 RunResult shape used by callers.
      const changes = result && typeof result.rowsChanged === 'number' ? result.rowsChanged : 0;
      return { changes };
    });
  }

  /**
   * Execute a (possibly multi-statement) SQL script with no parameters.
   * DuckDB's `run` accepts multiple statements separated by `;`.
   */
  async exec(sqlScript) {
    return this._enqueue(async () => {
      await this._conn.run(sqlScript);
      return { ok: true };
    });
  }

  /**
   * Run `fn` inside a transaction. `fn` receives this connection and may call
   * run/get/all (which are serialized after BEGIN via the same chain). Commits on
   * success, rolls back on throw. Returns fn's resolved value.
   *
   * NOTE: because access is serialized through one connection, do not start a
   * nested transaction inside `fn`.
   */
  async transaction(fn) {
    await this.run('BEGIN TRANSACTION');
    try {
      const result = await fn(this);
      await this.run('COMMIT');
      return result;
    } catch (err) {
      try {
        await this.run('ROLLBACK');
      } catch {
        /* rollback best-effort */
      }
      throw err;
    }
  }

  async close() {
    await this._chain.catch(() => {});
    try {
      if (this._conn && typeof this._conn.closeSync === 'function') this._conn.closeSync();
      else if (this._conn && typeof this._conn.disconnectSync === 'function') this._conn.disconnectSync();
    } catch {
      /* ignore */
    }
    try {
      if (this._instance && typeof this._instance.closeSync === 'function') this._instance.closeSync();
    } catch {
      /* ignore */
    }
    this._conn = null;
    this._instance = null;
  }
}

/**
 * Open (or create) a DuckDB database at `dbPath` and return a connection wrapper.
 * Loads the `fts` extension for full-text search.
 * @param {string} dbPath absolute file path or ':memory:'
 */
async function openDuckDb(dbPath) {
  const { DuckDBInstance } = loadDuckDb();
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  const conn = new DuckDbConnection(instance, connection, dbPath);
  // FTS + sqlite scanner extensions are bundled with the DuckDB binary; LOAD is
  // cheap and idempotent. sqlite_scanner is needed for the legacy data import
  // (ATTACH 'dome.db' AS legacy (TYPE sqlite)) so DuckDB can read the old
  // better-sqlite3 file natively without keeping that native dependency around.
  try {
    await conn.exec('INSTALL fts; LOAD fts; INSTALL json; LOAD json; INSTALL sqlite_scanner; LOAD sqlite_scanner;');
  } catch (err) {
    console.warn('[DuckDB] Could not load fts/json/sqlite_scanner extensions:', err?.message || err);
  }
  return conn;
}

/**
 * Build an async "prepared statement" wrapper that mirrors the better-sqlite3
 * statement ergonomics (`.get(...args) / .all(...args) / .run(...args)`), but
 * async. This lets the existing `buildQueries(db)` keep returning the same keys
 * so call sites only need to add `await` (e.g. `await queries.getX.get(id)`).
 *
 * Positional args are collected into an array and bound to `?`/`$n` placeholders.
 *   const s = stmt(db, 'SELECT * FROM resources WHERE id = ?');
 *   await s.get('r1');   // -> row | undefined
 *   await s.all();       // -> rows[]
 *   await s.run(a, b);   // -> { changes }
 */
function stmt(db, sql) {
  return {
    sql,
    get: (...args) => db.get(sql, args),
    all: (...args) => db.all(sql, args),
    run: (...args) => db.run(sql, args),
  };
}

module.exports = { openDuckDb, DuckDbConnection, stmt };
