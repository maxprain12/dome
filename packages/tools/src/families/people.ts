/**
 * @dome/tools — `people` family definitions (domains/people/*).
 */

import type { ToolDefinition } from '../types.js';
import { peopleGetDefinition } from '../domains/people/people_get/definition.js';
import { peopleSearchDefinition } from '../domains/people/people_search/definition.js';
import { peopleUpsertDefinition } from '../domains/people/people_upsert/definition.js';
import { peopleLinkIdentityDefinition } from '../domains/people/people_link_identity/definition.js';
import { peopleAddInteractionDefinition } from '../domains/people/people_add_interaction/definition.js';
import { peopleIngestDefinition } from '../domains/people/people_ingest/definition.js';

export const PEOPLE_TOOL_NAMES = [
  'people_get',
  'people_search',
  'people_upsert',
  'people_link_identity',
  'people_add_interaction',
  'people_ingest',
] as const;

export type PeopleToolName = (typeof PEOPLE_TOOL_NAMES)[number];

export function peopleToolDefinitions(): ToolDefinition[] {
  return [
    peopleGetDefinition,
    peopleSearchDefinition,
    peopleUpsertDefinition,
    peopleLinkIdentityDefinition,
    peopleAddInteractionDefinition,
    peopleIngestDefinition,
  ];
}
