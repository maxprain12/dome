import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema/index.js';

export type DomeDb = BetterSQLite3Database<typeof schema>;

/**
 * Wrap an existing better-sqlite3 connection (do not open a second writer).
 */
export function createDrizzle(sqlite: Database.Database): DomeDb {
  return drizzle(sqlite, { schema });
}

export { schema };
