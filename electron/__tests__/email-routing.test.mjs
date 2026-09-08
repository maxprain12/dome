import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
function loadService(replacements) {
  const filename = require.resolve('../email/himalaya-service.cjs');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${readFileSync(filename, 'utf8')}\n})`, { filename })(
    (name) => replacements[name] ?? localRequire(name), module, module.exports,
  );
  return module.exports;
}
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE email_accounts (
    id TEXT PRIMARY KEY, project_id TEXT, email TEXT, display_name TEXT,
    is_default INTEGER, created_at INTEGER, secret TEXT
  );
  INSERT INTO email_accounts VALUES ('other-vault','other','other@example.com','Other',1,0,'secret-other');
  INSERT INTO email_accounts VALUES ('primary','vault','primary@example.com','Primary',1,1,'secret-primary');
  INSERT INTO email_accounts VALUES ('secondary','vault','secondary@example.com','Secondary',0,2,'secret-secondary');`);
  const commands = [];
  const writes = [];
  const service = loadService({
    '../core/database.cjs': { getDB: () => db },
    '../core/secret-storage.cjs': { decryptSecret: (value) => value, maskSecret: () => '***' },
    './himalaya-binary.cjs': { ensureHimalaya: async () => 'himalaya-fixture' },
    electron: { app: { getPath: () => '/tmp/email-routing-fixture' } },
    fs: { mkdirSync() {}, writeFileSync(_path, data) { writes.push(data); } },
    child_process: { execFile(_binary, args, options, callback) {
      const command = { args, password: options.env.DOME_HIMALAYA_PASSWORD, input: '' };
      commands.push(command);
      queueMicrotask(() => callback(null, args.includes('read')
        ? 'From: Sender <sender@example.com>\nSubject: Hello\nMessage-ID: <original@example.com>\n\n'
        : '[]', ''));
      return { stdin: { write(value) { command.input += value; }, end() {} } };
    } },
    './email-store.cjs': {
      resolveMessageRef(id, { accountId, folder }) {
        if (id === 'emsg-original') return accountId && accountId !== 'secondary' ? null
          : { accountId: 'secondary', uid: '42', folder: 'Archive', row: { body_text: 'cached' } };
        return { accountId, uid: id, folder };
      },
    },
  });
  return { service, commands, writes, db };
}
it('passes the selected account and matching credentials to every CLI operation', async (t) => {
  const { service, commands, writes } = fixture(t);
  await service.listFolders('secondary', 'vault');
  await service.sendMessage('secondary', { projectId: 'vault', to: 'recipient@example.com', body: 'Draft' });
  for (const command of commands) {
    assert.equal(command.args[command.args.indexOf('-a') + 1], 'secondary');
    assert.equal(command.password, 'secret-secondary');
  }
  assert.match(commands[1].input, /From: Secondary <secondary@example.com>/);
  assert.ok(writes.every((config) => !config.includes('default = true')));
});
it('resolves a canonical reply to its account, UID and actual folder', async (t) => {
  const { service, commands } = fixture(t);
  await service.replyMessage(null, 'emsg-original', { projectId: 'vault', folder: 'INBOX', body: 'Reply' });
  assert.ok(commands[0].args.includes('42'));
  assert.equal(commands[0].args[commands[0].args.indexOf('-f') + 1], 'Archive');
  assert.equal(commands[0].args[commands[0].args.indexOf('-a') + 1], 'secondary');
  assert.match(commands[1].input, /From: Secondary <secondary@example.com>/);
  assert.match(commands[1].input, /In-Reply-To: <original@example.com>/);
});
it('rejects account or canonical message references from another vault before I/O', async (t) => {
  const { service, commands } = fixture(t);
  await assert.rejects(service.sendMessage('other-vault', { projectId: 'vault', to: 'x@example.com' }), /project/);
  await assert.rejects(service.readMessage(null, 'emsg-original', { projectId: 'other' }), /project/);
  await assert.rejects(service.replyMessage(null, 'emsg-original', { projectId: 'other' }), /project/);
  const mismatch = await service.replyMessage('primary', 'emsg-original', { projectId: 'vault' });
  assert.equal(mismatch.success, false);
  assert.equal(commands.length, 0);
});
it('reassigns the default only inside the removed account’s vault', (t) => {
  const { service, db } = fixture(t);
  service.removeAccount('primary');
  assert.equal(db.prepare('SELECT is_default FROM email_accounts WHERE id = ?').get('secondary').is_default, 1);
  assert.equal(db.prepare('SELECT is_default FROM email_accounts WHERE id = ?').get('other-vault').is_default, 1);
});
