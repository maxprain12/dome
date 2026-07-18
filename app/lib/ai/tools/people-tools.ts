/**
 * People tools — resolve pinned / mentioned contacts by id.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

function requireElectron() {
  if (!isElectronAI()) {
    return jsonResult({ success: false, error: 'People tools require the Dome desktop app.' });
  }
  return null;
}

export function createPeopleGetTool(): AnyAgentTool {
  return {
    label: 'Get person',
    name: 'people_get',
    description:
      'Get one person by id (display name, email, linked identities for GitHub/email/social). ' +
      'Call this when mentioned-people lists a person id. Source: People.',
    parameters: Type.Object({
      person_id: Type.String({ description: 'Person id from mentioned-people.' }),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const personId = readStringParam(args as Record<string, unknown>, 'person_id', {
        required: true,
      });
      const res = await window.electron.people.get(personId!);
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Person not found.' });
      }
      return jsonResult({ success: true, source: 'people', person: res.data?.person });
    },
  };
}

export function createPeopleTools(): AnyAgentTool[] {
  return [createPeopleGetTool()];
}
