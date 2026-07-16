export * from './core.js';
export * from './agents.js';
export * from './data.js';
export * from './automations.js';
export * from './calendar.js';
export * from './learn.js';
export * from './github.js';
export * from './pipelines.js';
export * from './sync.js';
export * from './people.js';

import * as core from './core.js';
import * as agents from './agents.js';
import * as data from './data.js';
import * as automations from './automations.js';
import * as calendar from './calendar.js';
import * as learn from './learn.js';
import * as github from './github.js';
import * as pipelines from './pipelines.js';
import * as sync from './sync.js';
import * as people from './people.js';

/** Full schema object passed to drizzle(). FTS5 virtual tables are managed via raw SQL. */
export const schema = {
  ...core,
  ...agents,
  ...data,
  ...automations,
  ...calendar,
  ...learn,
  ...github,
  ...pipelines,
  ...sync,
  ...people,
};
