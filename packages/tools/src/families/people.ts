/**
 * @dome/tools — `people` family definitions (domains/people/*).
 */

import type { ToolDefinition } from '../types.js';
import { peopleGetDefinition } from '../domains/people/people_get/definition.js';

export const PEOPLE_TOOL_NAMES = ['people_get'] as const;

export type PeopleToolName = (typeof PEOPLE_TOOL_NAMES)[number];

export function peopleToolDefinitions(): ToolDefinition[] {
  return [peopleGetDefinition];
}
