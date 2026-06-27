import type Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDrizzle } from './client.js';
import { getMigrationsFolder } from './paths.js';

/** Apply pending Drizzle SQL migrations from packages/db/drizzle. */
export function runDrizzleMigrate(sqlite: Database.Database): void {
  const db = createDrizzle(sqlite);
  migrate(db, { migrationsFolder: getMigrationsFolder() });
}
