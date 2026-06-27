export { LEGACY_SCHEMA_VERSION, DRIZZLE_BASELINE_TAG } from './constants.js';
export { createDrizzle, schema, type DomeDb } from './client.js';
export { getMigrationsFolder } from './paths.js';
export { runDrizzleMigrate } from './migrate.js';
export * from './schema/index.js';
export * as settingsRepo from './repos/settings.js';
export * as tagsRepo from './repos/tags.js';

// Re-export pilot table symbols for spike/tests
export { settings, tags } from './schema/core.js';
