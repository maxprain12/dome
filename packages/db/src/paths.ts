import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to SQL migrations shipped with @dome/db. */
export function getMigrationsFolder(): string {
  return path.join(moduleDir, '..', 'drizzle');
}
