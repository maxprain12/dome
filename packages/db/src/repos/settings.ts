import { eq } from 'drizzle-orm';
import type { DomeDb } from '../client.js';
import { settings } from '../schema/core.js';

export function getSetting(db: DomeDb, key: string): string | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(db: DomeDb, key: string, value: string, updatedAt = Date.now()): void {
  db.insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt },
    })
    .run();
}

export function deleteSetting(db: DomeDb, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}
