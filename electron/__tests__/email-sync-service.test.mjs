import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
function fixture(listFolders) {
  const events = [], attempted = [], people = [], indexedProjects = [];
  const accounts = [
    { id: 'bad', email: 'bad@example.com', project_id: 'one', status: 'error' },
    { id: 'good', email: 'good@example.com', project_id: 'two' },
    { id: 'alias', email: 'alias@example.com', project_id: 'two' },
  ];
  const replacements = {
    './himalaya-service.cjs': {
      listAccounts: (pid) => ({ success: true, accounts: accounts.filter((a) => !pid || a.project_id === pid) }),
      listFolders: async (id) => { attempted.push(id); return listFolders(id); },
      listEnvelopes: async () => ({ success: true, envelopes: [{ id: '1' }] }),
    },
    './email-store.cjs': {
      upsertFolder: (id, name) => ({ id: `${id}/${name}` }),
      setSyncState() {}, listCachedEnvelopes: () => [], maxImapUid: () => '1', upsertEnvelope: () => '1',
      extractAddressesFromEnvelope: () => [
        { email: 'GOOD@example.com' }, { email: 'alias@example.com' }, { email: 'contact@example.com', name: 'Contact' },
      ],
    },
    '../people/people-store.cjs': { upsertIdentityPerson: (person) => people.push(person) },
    '../core/window-manager.cjs': { broadcast: (channel, data) => events.push({ channel, data }) },
    '../search/source-index.cjs': { indexEmailMessages() {}, indexPeople: (pid) => indexedProjects.push(pid) },
  };
  const filename = require.resolve('../email/email-sync-service.cjs');
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${readFileSync(filename, 'utf8')}\n})`, { filename })(
    (name) => { if (!(name in replacements)) throw new Error(`Unexpected dependency: ${name}`); return replacements[name]; },
    module, module.exports,
  );
  return { service: module.exports, events, attempted, people, indexedProjects };
}
it('continues after an account failure, updates partial data and always broadcasts syncing=false', async () => {
  const f = fixture((id) => { if (id === 'bad') throw new Error('IMAP unavailable'); return { success: true, folders: [{ name: 'INBOX' }] }; });
  const result = await f.service.syncNow();
  assert.equal(result.success, false);
  assert.equal(result.upserted, 2);
  assert.deepEqual(f.attempted, ['bad', 'good', 'alias']);
  const finalStatus = f.events.filter((e) => e.channel === 'email:sync:status').at(-1).data;
  assert.equal(finalStatus.syncing, false);
  assert.match(finalStatus.error, /bad@example.com/);
  assert.ok(f.events.some((e) => e.channel === 'email:data:updated'));
  assert.deepEqual(f.indexedProjects, ['one', 'two']);
  assert.equal(f.service.getStatus().syncing, false);
});
it('does not seed any of the vault’s own email addresses as contacts', async () => {
  const f = fixture(() => ({ success: true, folders: [{ name: 'INBOX' }] }));
  assert.equal((await f.service.syncNow({ projectId: 'two', accountId: 'good' })).success, true);
  assert.deepEqual(f.people.map((p) => p.externalId), ['contact@example.com']);
  assert.equal(f.people[0].projectId, 'two');
  assert.equal(f.events.filter((e) => e.channel === 'email:sync:status').at(-1).data.syncing, false);
});
it('rejects overlapping syncs with an explicit error and releases the lock after completion', async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  const first = f.service.syncNow({ accountId: 'good' });
  const second = await f.service.syncNow({ accountId: 'alias' });
  assert.equal(second.error, 'Sync already running');
  assert.equal(second.success, false);
  release({ success: true, folders: [] });
  await first;
  assert.equal(f.service.getStatus().syncing, false);
});
