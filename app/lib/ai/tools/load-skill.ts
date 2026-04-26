/**
 * Model-invoked tools to load file-based skills (execution happens in the main process).
 */
import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

const LoadSkillSchema = Type.Object({
  name: Type.String({
    description: 'Skill slash name (e.g. research-assistant, data-analysis) as shown in / menu.',
  }),
  arguments: Type.Optional(
    Type.String({
      description: 'Optional argument string (same as after /skill in chat).',
    }),
  ),
});

const LoadSkillFileSchema = Type.Object({
  skill: Type.String({ description: 'Skill id or slash name.' }),
  path: Type.String({ description: 'Relative path within the skill directory (e.g. reference.md, scripts/x.py).' }),
});

export function createLoadSkillTools(): AnyAgentTool[] {
  return [
    {
      label: 'Load skill',
      name: 'load_skill',
      description:
        'Load the full instructions for a Dome skill (SKILL.md) when the user needs specialized behavior. Use the name from the Available Skills list. Call this instead of pasting long manuals.',
      parameters: LoadSkillSchema,
      execute: async () =>
        jsonResult({ info: 'Executed in the main process when using LangGraph direct tools.' }),
    },
    {
      label: 'Load skill file',
      name: 'load_skill_file',
      description:
        'Read a supporting file (reference, example, script) from a skill package directory. Paths must be relative to the skill folder.',
      parameters: LoadSkillFileSchema,
      execute: async () =>
        jsonResult({ info: 'Executed in the main process when using LangGraph direct tools.' }),
    },
  ];
}
