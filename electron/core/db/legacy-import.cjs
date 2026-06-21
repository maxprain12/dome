/* eslint-disable no-console */
/**
 * One-time import of legacy better-sqlite3 data (`dome.db`) into DuckDB
 * (`dome.duckdb`). DuckDB reads the SQLite file natively via the `sqlite_scanner`
 * extension (loaded by `openDuckDb`): `ATTACH '<path>' AS legacy (TYPE sqlite)`.
 *
 * Strategy:
 *  - No-op if the legacy file is absent, or if `settings.legacy_sqlite_imported`
 *    is already '1' (idempotent across restarts).
 *  - Discover the legacy SQLite table list from `legacy.sqlite_master()` and the
 *    DuckDB table list from `information_schema.tables`; copy the intersection
 *    only (robust to schema drift between versions).
 *  - Run each table's `INSERT INTO <t> SELECT * FROM legacy.<t>` inside one
 *    DuckDB transaction; on failure roll back and log (the app still boots with
 *    an empty DuckDB — same behaviour as before the migration existed).
 *  - Stamp `settings.legacy_sqlite_imported = '1'` on success.
 *
 * @param {import('./duckdb.cjs').DuckDbConnection} db  open DuckDB connection
 * @param {string} duckDbPath  path to `dome.duckdb` (legacy file is resolved
 *   relative to its directory: `<dir>/dome.db`)
 */
async function importLegacySqlite(db, duckDbPath) {
  if (!duckDbPath) return { imported: false, reason: 'no_path' };

  const path = require('path');
  const fs = require('fs');
  const legacyPath = path.join(path.dirname(duckDbPath), 'dome.db');

  if (!fs.existsSync(legacyPath)) {
    return { imported: false, reason: 'no_legacy_file' };
  }

  // Idempotency guard: don't re-import on every boot.
  try {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', ['legacy_sqlite_imported']);
    if (row?.value === '1') {
      return { imported: false, reason: 'already_imported' };
    }
  } catch {
    // settings table may not exist yet (shouldn't happen — 0001_core runs first)
    // but be defensive: proceed and let the copy fail loudly if so.
  }

  console.log(`[DB] Importing legacy SQLite data from ${legacyPath} into DuckDB…`);

  let attached = false;
  try {
    // ATTACH the SQLite file read-only as the `legacy` schema.
    await db.exec(`ATTACH '${legacyPath.replace(/'/g, "''")}' AS legacy (TYPE sqlite)`);
    attached = true;

    // Discover legacy SQLite tables via `SHOW TABLES FROM legacy`. DuckDB's
    // sqlite_scanner doesn't expose sqlite_master or information_schema for
    // attached SQLite schemas, but `SHOW TABLES` lists them reliably.
    const legacyRows = await db.all('SHOW TABLES FROM legacy');
    const legacyTables = new Set(legacyRows.map((r) => r.name));

    // Discover DuckDB tables in the main schema.
    const duckRows = await db.all(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'main' AND table_type = 'BASE TABLE'
    `);
    const duckTables = new Set(duckRows.map((r) => r.table_name));

    // Intersection — only copy tables that exist in BOTH schemas. This is robust
    // to schema drift (e.g. a table dropped in DuckDB won't be copied; a table
    // added in DuckDB won't be backfilled from legacy).
    const common = [...legacyTables].filter((t) => duckTables.has(t)).sort();

    if (common.length === 0) {
      console.warn('[DB] No common tables between legacy SQLite and DuckDB schema — skipping import');
      await db.exec('DETACH legacy');
      return { imported: false, reason: 'no_common_tables' };
    }

    console.log(`[DB] Copying ${common.length} table(s): ${common.join(', ')}`);

    let totalRows = 0;
    await db.transaction(async (tx) => {
      for (const table of common) {
        // Wrap each table copy in its own savepoint-style guard: if one table
        // fails (e.g. a NOT NULL column missing in legacy), log and continue
        // with the rest rather than aborting the whole import. We commit what
        // succeeded. This is a deliberate trade-off: partial data > no data.
        try {
          // Column-name-aware copy: DuckDB may have extra columns added by
          // later migrations that don't exist in the legacy SQLite file, so
          // `SELECT *` by position would mismatch. Intersect the column lists
          // (via DESCRIBE on both sides) and copy only the common ones by name.
          const duckCols = await tx.all(`DESCRIBE ${table}`);
          const legacyCols = await tx.all(`DESCRIBE legacy.${table}`);
          const legacyNames = new Set(legacyCols.map((c) => c.column_name || c.name));
          const shared = duckCols
            .map((c) => c.column_name || c.name)
            .filter((c) => legacyNames.has(c));
          if (shared.length === 0) {
            console.warn(`[DB] No common columns for ${table} — skipping`);
            continue;
          }
          const colList = shared.join(', ');
          const result = await tx.run(
            `INSERT OR REPLACE INTO ${table} (${colList}) SELECT ${colList} FROM legacy.${table}`,
          );
          if (result && typeof result.changes === 'number') totalRows += result.changes;
        } catch (tableErr) {
          console.warn(`[DB] Could not copy table ${table} from legacy:`, tableErr?.message || tableErr);
        }
      }
    });

    // Detach the SQLite file (best-effort; the connection stays usable).
    try {
      await db.exec('DETACH legacy');
      attached = false;
    } catch {
      /* ignore */
    }

    // Stamp the idempotency guard.
    try {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['legacy_sqlite_imported', '1', Date.now()],
      );
    } catch (err) {
      console.warn('[DB] Could not stamp legacy_sqlite_imported guard:', err?.message || err);
    }

    console.log(`[DB] ✅ Legacy SQLite import done — ${totalRows} row(s) copied`);
    return { imported: true, tables: common.length, rows: totalRows };
  } catch (err) {
    console.error('[DB] Legacy SQLite import failed:', err?.message || err);
    if (attached) {
      try {
        await db.exec('DETACH legacy');
      } catch {
        /* ignore */
      }
    }
    return { imported: false, reason: 'error', error: err?.message || String(err) };
  }
}

module.exports = { importLegacySqlite };
