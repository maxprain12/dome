import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { listComments, sendDm } from '../social/providers/instagram.cjs';
import { sendDm as sendLinkedInDm } from '../social/providers/linkedin.cjs';

function mockStore(accountId = 'acc-ig') {
  return {
    getAccountTokens: () => ({ access_token: 'tok-1' }),
    getAccount: () => ({ id: accountId, external_id: '178414000' }),
  };
}

describe('instagram listComments / sendDm', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalizes Graph comments and returns the paging cursor', async () => {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /\/999\/comments/);
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: 'c1',
                text: 'Me interesa #Curso',
                username: 'ada',
                timestamp: '2026-09-01T10:00:00+0000',
                from: { id: 'igsid-ada' },
              },
            ],
            paging: { cursors: { after: 'cursor-2' } },
          }),
      };
    };

    const page = await listComments(mockStore(), { accountId: 'acc-ig', externalPostId: '999' });
    assert.equal(page.comments.length, 1);
    assert.equal(page.comments[0].id, 'c1');
    assert.equal(page.comments[0].authorExternalId, 'igsid-ada');
    assert.equal(page.nextCursor, 'cursor-2');
  });

  it('flattens Instagram replies with parentId for nesting', async () => {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /replies/);
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: 'c1',
                text: 'root',
                username: 'ada',
                timestamp: '2026-09-01T10:00:00+0000',
                from: { id: 'igsid-ada' },
                replies: {
                  data: [
                    {
                      id: 'c1r',
                      text: 'nested',
                      username: 'dome_ia',
                      timestamp: '2026-09-01T11:00:00+0000',
                      from: { id: 'igsid-dome' },
                    },
                  ],
                },
              },
            ],
          }),
      };
    };

    const page = await listComments(mockStore(), { accountId: 'acc-ig', externalPostId: '999' });
    assert.equal(page.comments.length, 2);
    assert.equal(page.comments[0].id, 'c1');
    assert.equal(page.comments[1].id, 'c1r');
    assert.equal(page.comments[1].parentId, 'c1');
    assert.equal(page.comments[1].authorName, 'dome_ia');
  });

  it('dedupes a reply that Graph returns both nested and as a top-level comment', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            {
              id: 'c1',
              text: 'Info',
              username: 'mery_sugy',
              timestamp: '2026-09-01T10:00:00+0000',
              from: { id: 'igsid-mery' },
              replies: {
                data: [
                  {
                    id: 'c1r',
                    text: 'Revisa tu DM',
                    timestamp: '2026-09-01T11:00:00+0000',
                    from: { id: '178414000' },
                  },
                ],
              },
            },
            {
              id: 'c1r',
              text: 'Revisa tu DM',
              username: 'dome_ia',
              timestamp: '2026-09-01T11:00:00+0000',
              from: { id: '178414000' },
            },
          ],
        }),
    });

    const page = await listComments(mockStore(), { accountId: 'acc-ig', externalPostId: '999' });
    assert.equal(page.comments.length, 2);
    const reply = page.comments.find((row) => row.id === 'c1r');
    assert.equal(reply.parentId, 'c1');
    assert.equal(reply.authorName, 'dome_ia');
  });

  it('refuses to mark a DM sent without a provider message id', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ recipient_id: 'igsid-ada' }),
    });

    await assert.rejects(
      () =>
        sendDm(mockStore(), {
          accountId: 'acc-ig',
          recipientExternalId: 'igsid-ada',
          text: 'hola',
        }),
      /missing message id/,
    );
  });

  it('returns externalMessageId from a real-looking Messaging response', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ message_id: 'mid.abc' }),
    });

    const sent = await sendDm(mockStore(), {
      accountId: 'acc-ig',
      recipientExternalId: 'igsid-ada',
      text: 'hola',
    });
    assert.equal(sent.externalMessageId, 'mid.abc');
  });
});

describe('linkedin sendDm', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does not invent an externalMessageId when LinkedIn omits one', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: { entries: () => [] },
    });

    await assert.rejects(
      () =>
        sendLinkedInDm(
          {
            getAccountTokens: () => ({ access_token: 'tok-li' }),
            getAccount: () => ({ id: 'acc-li', external_id: 'abc', account_kind: 'member' }),
          },
          { accountId: 'acc-li', recipientExternalId: 'urn:li:person:x', text: 'hola' },
        ),
      /missing message id|partner/,
    );
  });
});
