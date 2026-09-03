/**
 * People tools — search / get / upsert / ingest / identities / timeline.
 * Documents and people are first-class: extract full profiles, never a thin form.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const IDENTITY_SOURCES =
  'github | email | website | phone | document | calendar | company | ' +
  'social_x | social_linkedin | social_instagram | social_facebook | ' +
  'social_tiktok | social_youtube | manual (aliases: url, instagram, linkedin, x)';

const PROFILE_HINT =
  'Complete freeform profile. Prefer occupation, company, website, phone, location, ' +
  'how_we_met, plus any other facts the user or document mentions. Do not omit known details.';

function requireElectron() {
  if (!isElectronAI()) {
    return jsonResult({ success: false, error: 'People tools require the Dome desktop app.' });
  }
  return null;
}

function readProfile(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

const identityItemSchema = Type.Object({
  source: Type.String({ description: IDENTITY_SOURCES }),
  external_id: Type.String({ description: 'Stable id (email, handle, URL, phone).' }),
  display_label: Type.Optional(Type.String()),
});

export function createPeopleGetTool(): AnyAgentTool {
  return {
    label: 'Get person',
    name: 'people_get',
    description:
      'Get one person by id (full profile, notes, identities, timeline). ' +
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
      const res = await window.electron.people.get({ id: personId!, includeInteractions: true });
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
      'Search Dome People (leads/contacts) by name, handle, email, or company. Prefer this before people_get when you lack an id. Source: People.',
    parameters: Type.Object({
      query: Type.String({ description: 'Name, @handle, email, company, or website fragment.' }),
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
      'Create or update a person with a complete profile. Merges profile keys; ' +
      'does not wipe existing facts. Use when the user asks to add or change one contact. ' +
      `Identities: ${IDENTITY_SOURCES}. Source: People.`,
    parameters: Type.Object({
      display_name: Type.String({ description: 'Display name.' }),
      person_id: Type.Optional(Type.String({ description: 'Existing person id.' })),
      project_id: Type.Optional(Type.String()),
      primary_email: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      lead_status: Type.Optional(
        Type.String({
          description:
            'lead | prospect | qualified | customer | partner | vendor | investor | colleague | personal | archived, or a custom slug',
        }),
      ),
      discovered_via: Type.Optional(Type.String({ description: 'How we met / source label.' })),
      profile: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), { description: PROFILE_HINT }),
      ),
      identities: Type.Optional(Type.Array(identityItemSchema)),
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
        discoveredVia: readStringParam(a, 'discovered_via') || undefined,
        profile: readProfile(a.profile),
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
    description: `Link an identity to an existing person. Sources: ${IDENTITY_SOURCES}. Source: People.`,
    parameters: Type.Object({
      person_id: Type.String(),
      source: Type.String({ description: IDENTITY_SOURCES }),
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

export function createPeopleAddInteractionTool(): AnyAgentTool {
  return {
    label: 'Add people note',
    name: 'people_add_interaction',
    description:
      'Append a timeline note or source event to a person (meeting, email, document, call). ' +
      'Use when the user tells you something to remember about someone. Source: People.',
    parameters: Type.Object({
      person_id: Type.String(),
      kind: Type.Optional(
        Type.String({ description: 'note | meeting | email | document | call | web (default note).' }),
      ),
      summary: Type.String({ description: 'What to remember, in the user language.' }),
      ref_type: Type.Optional(Type.String({ description: 'resource | email | event | …' })),
      ref_id: Type.Optional(Type.String({ description: 'Linked resource / email / event id.' })),
      project_id: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const a = args as Record<string, unknown>;
      const personId = readStringParam(a, 'person_id', { required: true });
      const summary = readStringParam(a, 'summary', { required: true });
      const res = await window.electron.people.addInteraction({
        personId,
        kind: readStringParam(a, 'kind') || 'note',
        summary,
        refType: readStringParam(a, 'ref_type') || undefined,
        refId: readStringParam(a, 'ref_id') || undefined,
        projectId: readStringParam(a, 'project_id') || undefined,
      });
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Could not add interaction.' });
      }
      return jsonResult({ success: true, source: 'people', interaction: res.data?.interaction });
    },
  };
}

export function createPeopleIngestTool(): AnyAgentTool {
  return {
    label: 'Ingest people',
    name: 'people_ingest',
    description:
      'Extract and save one or more complete people from a document, meeting, email, or URL. ' +
      'Read the source first (resource_get / email_read), then persist every relevant lead with ' +
      'full profile + identities (website, email, social, phone). Documents and people are first-class. Source: People.',
    parameters: Type.Object({
      people: Type.Array(
        Type.Object({
          display_name: Type.String(),
          person_id: Type.Optional(Type.String()),
          primary_email: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          lead_status: Type.Optional(Type.String()),
          discovered_via: Type.Optional(Type.String()),
          profile: Type.Optional(
            Type.Record(Type.String(), Type.Unknown(), { description: PROFILE_HINT }),
          ),
          identities: Type.Optional(Type.Array(identityItemSchema)),
        }),
      ),
      source_resource_id: Type.Optional(
        Type.String({ description: 'PDF, note, or meeting resource id this extraction came from.' }),
      ),
      source_kind: Type.Optional(
        Type.String({ description: 'document | email | meeting | web | manual' }),
      ),
      summary: Type.Optional(Type.String({ description: 'Shared timeline summary for each person.' })),
      project_id: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const a = args as Record<string, unknown>;
      const people = Array.isArray(a.people) ? a.people : [];
      if (people.length === 0) {
        return jsonResult({ success: false, error: 'people array is required.' });
      }
      const res = await window.electron.people.ingest({
        people,
        projectId: readStringParam(a, 'project_id') || 'default',
        sourceResourceId: readStringParam(a, 'source_resource_id') || undefined,
        sourceKind: readStringParam(a, 'source_kind') || 'document',
        summary: readStringParam(a, 'summary') || undefined,
      });
      if (!res?.success) {
        return jsonResult({ success: false, error: res?.error || 'Ingest failed.' });
      }
      return jsonResult({ success: true, source: 'people', ...res.data });
    },
  };
}

export function createPeopleTools(): AnyAgentTool[] {
  return [
    createPeopleGetTool(),
    createPeopleSearchTool(),
    createPeopleUpsertTool(),
    createPeopleLinkIdentityTool(),
    createPeopleAddInteractionTool(),
    createPeopleIngestTool(),
  ];
}
