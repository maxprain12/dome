/**
 * People tools — search / get / upsert / link identities (canonical CRM).
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

export function createPeopleSearchTool(): AnyAgentTool {
  return {
    label: 'Search people',
    name: 'people_search',
    description:
      'Search Dome People (leads/contacts) by name, handle, or email. Prefer this before people_get when you lack an id. Source: People.',
    parameters: Type.Object({
      query: Type.String({ description: 'Name, @handle, or email fragment.' }),
      project_id: Type.Optional(Type.String({ description: 'Optional project id.' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20).' })),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const a = args as Record<string, unknown>;
      const query = readStringParam(a, 'query', { required: true });
      const projectId = readStringParam(a, 'project_id') || 'default';
      const limit = typeof a.limit === 'number' ? a.limit : undefined;
      const res = await window.electron.people.search({ projectId, query: query!, limit });
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Search failed.' });
      }
      return jsonResult({ success: true, source: 'people', people: res.data?.people ?? [] });
    },
  };
}

export function createPeopleUpsertTool(): AnyAgentTool {
  return {
    label: 'Upsert person',
    name: 'people_upsert',
    description:
      'Create or update a person in Dome People. Optional identities (social_instagram, email, …). Leads = people with lead_status lead. Source: People.',
    parameters: Type.Object({
      display_name: Type.String({ description: 'Display name.' }),
      person_id: Type.Optional(Type.String({ description: 'Existing person id.' })),
      project_id: Type.Optional(Type.String()),
      primary_email: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      lead_status: Type.Optional(Type.String({ description: 'lead | customer | archived' })),
      identities: Type.Optional(
        Type.Array(
          Type.Object({
            source: Type.String(),
            external_id: Type.String(),
            display_label: Type.Optional(Type.String()),
          }),
        ),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const a = args as Record<string, unknown>;
      const displayName = readStringParam(a, 'display_name', { required: true });
      const personId = readStringParam(a, 'person_id');
      const projectId = readStringParam(a, 'project_id') || 'default';
      const res = await window.electron.people.upsert({
        id: personId || undefined,
        projectId,
        displayName,
        primaryEmail: readStringParam(a, 'primary_email') || undefined,
        notes: readStringParam(a, 'notes') || undefined,
        leadStatus: readStringParam(a, 'lead_status') || undefined,
      });
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Upsert failed.' });
      }
      const person = res.data?.person as { id?: string } | undefined;
      const identities = Array.isArray(a.identities) ? a.identities : [];
      for (const raw of identities) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const source = String(row.source || '');
        const externalId = String(row.external_id || '');
        if (!source || !externalId || !person?.id) continue;
        await window.electron.people.linkIdentity({
          personId: person.id,
          projectId,
          source,
          externalId,
          displayLabel: row.display_label != null ? String(row.display_label) : undefined,
        });
      }
      const refreshed = person?.id
        ? await window.electron.people.get({ id: person.id, includeInteractions: true })
        : res;
      return jsonResult({
        success: true,
        source: 'people',
        person: refreshed?.success ? refreshed.data?.person : person,
      });
    },
  };
}

export function createPeopleLinkIdentityTool(): AnyAgentTool {
  return {
    label: 'Link identity',
    name: 'people_link_identity',
    description:
      'Link social_instagram / email / github (etc.) identity to an existing person. Source: People.',
    parameters: Type.Object({
      person_id: Type.String(),
      source: Type.String(),
      external_id: Type.String(),
      display_label: Type.Optional(Type.String()),
      project_id: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const a = args as Record<string, unknown>;
      const personId = readStringParam(a, 'person_id', { required: true });
      const source = readStringParam(a, 'source', { required: true });
      const externalId = readStringParam(a, 'external_id', { required: true });
      const res = await window.electron.people.linkIdentity({
        personId,
        source,
        externalId,
        displayLabel: readStringParam(a, 'display_label') || undefined,
        projectId: readStringParam(a, 'project_id') || undefined,
      });
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Link failed.' });
      }
      return jsonResult({ success: true, source: 'people', result: res });
    },
  };
}

export function createPeopleTools(): AnyAgentTool[] {
  return [
    createPeopleGetTool(),
    createPeopleSearchTool(),
    createPeopleUpsertTool(),
    createPeopleLinkIdentityTool(),
  ];
}
