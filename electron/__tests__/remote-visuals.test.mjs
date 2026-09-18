import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractRemoteVisual } = require('../remote/visuals.cjs');

describe('remote-many visuals', () => {
  it('extracts a compact Instagram profile card from social_public_resolve', () => {
    const visual = extractRemoteVisual('social_public_resolve', {
      success: true,
      card: {
        kind: 'profile',
        provider: 'instagram',
        body: 'The AI workspace that works while you sleep.',
        url: 'https://www.instagram.com/notionhq/',
        followers: 489632,
        postsCount: 355,
        following: 148,
        author: { name: 'Notion', handle: 'notionhq', avatarUrl: 'https://cdn.example/n.jpg' },
      },
    });
    assert.equal(visual.kind, 'profile');
    assert.equal(visual.name, 'Notion');
    assert.equal(visual.handle, 'notionhq');
    assert.equal(visual.providerLabel, 'Instagram');
    assert.equal(visual.followers, 489632);
    assert.equal(visual.postsCount, 355);
  });

  it('skips account lists so Companion does not spam profile cards', () => {
    const visual = extractRemoteVisual('social_accounts_list', {
      success: true,
      accounts: [{ provider: 'instagram', handle: 'domeia', displayName: 'Dome' }],
    });
    assert.equal(visual, null);
  });

  it('turns a saved note into a compact card without the resource id as label', () => {
    const visual = extractRemoteVisual('resource_create', {
      success: true,
      resource: {
        id: 'res_123',
        type: 'note',
        title: 'Briefing de la semana',
        content: 'Reunión el viernes y enviar el resumen.',
      },
    });
    assert.equal(visual.kind, 'note');
    assert.equal(visual.name, 'Briefing de la semana');
    assert.equal(visual.type, 'note');
    assert.match(visual.excerpt, /Reunión/);
    assert.equal(visual.resourceId, 'res_123');
  });

  it('turns ppt_create into a presentation card', () => {
    const visual = extractRemoteVisual('ppt_create', {
      success: true,
      resource: {
        id: 'ppt-1',
        type: 'ppt',
        title: 'Informe de Redes Sociales — ADVO',
      },
    });
    assert.equal(visual.kind, 'ppt');
    assert.equal(visual.name, 'Informe de Redes Sociales — ADVO');
    assert.equal(visual.resourceId, 'ppt-1');
  });

  it('turns calendar events into agenda cards without ids', () => {
    const visual = extractRemoteVisual('calendar_list_events', {
      success: true,
      events: [
        { id: 'evt-1', title: 'Dentista', start_at: 1726660800000, location: 'Clínica' },
        { id: 'evt-2', title: ' sp-deadbeef ' },
      ],
    });
    assert.equal(visual.kind, 'events');
    assert.equal(visual.items.length, 1);
    assert.equal(visual.items[0].name, 'Dentista');
    assert.equal(visual.items[0].location, 'Clínica');
    assert.equal(visual.items[0].id, undefined);
  });
});
