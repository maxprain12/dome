/**
 * email-store unit tests (node:sqlite).
 * Run: node --experimental-sqlite --test electron/__tests__/email-store.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

describe('email-store', () => {
  let emailStore;
  let memDb;
  let originalGetDB;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE email_accounts (id TEXT PRIMARY KEY);
      INSERT INTO email_accounts (id) VALUES ('acc-1');
      CREATE TABLE email_folders (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        remote_name TEXT NOT NULL,
        role TEXT,
        uidvalidity INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(account_id, remote_name)
      );
      CREATE TABLE email_messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        message_id TEXT,
        subject TEXT,
        from_json TEXT,
        to_json TEXT,
        cc_json TEXT,
        date_ms INTEGER,
        snippet TEXT,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        flags_json TEXT,
        body_text TEXT,
        body_html TEXT,
        synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(account_id, folder_id, uid)
      );
      CREATE TABLE email_sync_state (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        last_uid TEXT,
        cursor TEXT,
        last_synced_at INTEGER,
        status TEXT,
        error TEXT,
        updated_at INTEGER NOT NULL,
        UNIQUE(account_id, folder_id)
      );
    `);
    const database = require('../core/database.cjs');
    originalGetDB = database.getDB;
    database.getDB = () => memDb;
    delete require.cache[require.resolve('../email/email-store.cjs')];
    emailStore = require('../email/email-store.cjs');
  });

  after(() => {
    const database = require('../core/database.cjs');
    database.getDB = originalGetDB;
    memDb.close();
  });

  it('upsertEnvelope is idempotent by uid', () => {
    const folder = emailStore.upsertFolder('acc-1', 'INBOX');
    assert.equal(folder.role, 'inbox');
    emailStore.upsertEnvelope('acc-1', folder.id, {
      id: '42',
      subject: 'Hello',
      from: { name: 'Max', addr: 'max@example.com' },
      date: '2026-01-01T00:00:00Z',
    });
    emailStore.upsertEnvelope('acc-1', folder.id, {
      id: '42',
      subject: 'Hello updated',
      from: { name: 'Max', addr: 'max@example.com' },
      date: '2026-01-01T00:00:00Z',
    });
    const list = emailStore.listCachedEnvelopes('acc-1', 'INBOX');
    assert.equal(list.length, 1);
    assert.equal(list[0].subject, 'Hello updated');
    assert.equal(list[0].id, '42');
  });

  it('cacheMessageBody stores text for later read', () => {
    emailStore.cacheMessageBody('acc-1', '42', 'INBOX', {
      text: 'plain body',
      html: '<p>hi</p>',
    });
    const msg = emailStore.getCachedMessage('acc-1', '42', 'INBOX');
    assert.equal(msg.body_text, 'plain body');
    assert.equal(msg.body_html, '<p>hi</p>');
  });

  it('resolveMessageRef maps emsg-… row ids to IMAP uid + folder', () => {
    const folder = emailStore.upsertFolder('acc-1', 'INBOX');
    const dbId = emailStore.upsertEnvelope('acc-1', folder.id, {
      id: '99',
      subject: 'Pinned',
      from: { name: 'Ada', addr: 'ada@example.com' },
      date: '2026-01-02T00:00:00Z',
    });
    assert.ok(String(dbId).startsWith('emsg-'));
    const resolved = emailStore.resolveMessageRef(dbId, { accountId: 'acc-1' });
    assert.equal(resolved.uid, '99');
    assert.equal(resolved.folder, 'INBOX');
    assert.equal(resolved.accountId, 'acc-1');
    const byUid = emailStore.resolveMessageRef('99', { accountId: 'acc-1', folder: 'INBOX' });
    assert.equal(byUid.uid, '99');
    assert.equal(emailStore.resolveMessageRef('emsg-deadbeef'), null);
  });

  it('extractAddressesFromEnvelope pulls from/to/cc', () => {
    const addrs = emailStore.extractAddressesFromEnvelope({
      from: { addr: 'a@x.com', name: 'A' },
      to: [{ addr: 'b@x.com' }],
      cc: 'c@x.com',
    });
    assert.equal(addrs.length, 3);
    assert.ok(addrs.some((a) => a.email === 'a@x.com'));
  });

  it('normalizes Himalaya from[{name,email}] and does not wipe on sparse upsert', () => {
    const folder = emailStore.upsertFolder('acc-2', 'INBOX');
    emailStore.upsertEnvelope('acc-2', folder.id, {
      id: '7',
      subject: 'Promo pizza',
      from: [{ name: 'Popolare', email: 'hello@popolare.fr' }],
      flags: [{ iana: 'seen', raw: '\\Seen' }],
      'message-id': '<abc@x>',
      'has-attachment': false,
      date: '2026-07-01T12:00:00Z',
    });
    // Sparse upsert (old read-path bug) must keep subject/from.
    emailStore.upsertEnvelope('acc-2', folder.id, { id: '7' });
    const list = emailStore.listCachedEnvelopes('acc-2', 'INBOX');
    assert.equal(list.length, 1);
    assert.equal(list[0].subject, 'Promo pizza');
    assert.equal(list[0].from?.addr, 'hello@popolare.fr');
    assert.equal(list[0].from?.name, 'Popolare');
    assert.ok(list[0].flags.includes('seen'));

    const live = emailStore.normalizeEnvelope({
      id: '9',
      subject: 'Live',
      from: [{ name: 'Ada', email: 'ada@x.com' }],
    });
    assert.equal(live.from.addr, 'ada@x.com');
  });
});
