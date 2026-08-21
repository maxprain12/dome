import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const client = require('../social/social-event-cards-client.cjs');

function mockDatabase(initial = {}) {
  const store = { ...initial };
  return {
    getQueries: () => ({
      getSetting: {
        get: (key) => (store[key] !== undefined ? { value: store[key] } : undefined),
      },
      setSetting: {
        run: (key, value) => {
          store[key] = value;
        },
      },
    }),
    _store: store,
  };
}

describe('social event cards local replica', () => {
  it('returns cached cards immediately without waiting for provider', async () => {
    const database = mockDatabase({
      [client.CARDS_CACHE_KEY]: JSON.stringify({
        cards: [{ id: 'c1', internalName: 'Launch', title: 'Launch' }],
        wallet: { appleConfigured: true, googleConfigured: false },
        fetchedAt: 1,
      }),
    });
    const result = await client.listCards(database, {
      onRefreshed: () => {
        throw new Error('refresh should be async and not block listCards');
      },
    });
    assert.equal(result.fromCache, true);
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].internalName, 'Launch');
  });

  it('write-through upserts a card into the local replica', () => {
    const database = mockDatabase();
    client._writeCardsCache(database, { cards: [], wallet: {} });
    // Simulate upsert via private helpers used by mutations
    const cached = client._readCardsCache(database);
    assert.deepEqual(cached.cards, []);
    client._writeCardsCache(database, {
      cards: [{ id: 'c2', title: 'Summit' }],
      wallet: { appleConfigured: false, googleConfigured: false },
    });
    assert.equal(client._readCardsCache(database).cards[0].title, 'Summit');
  });
});
