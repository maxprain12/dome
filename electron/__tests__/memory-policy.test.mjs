import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-memory-'));
const values = new Map();
const queries = { getSetting: { get: (key) => values.has(key) ? { value: values.get(key) } : undefined },
  setSetting: { run: (key, value) => values.set(key, value) } };
const databasePath = require.resolve('../core/database.cjs');
const electronPath = require.resolve('electron');
const savedDatabase = require.cache[databasePath];
const savedElectron = require.cache[electronPath];
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { getQueries: () => queries } };
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => temp }, shell: {} } };
const policy = require('../personality/memory-policy.cjs');
const loader = require('../personality/personality-loader.cjs');
const context = require('../personality/context-files.cjs');
const action = require('../personality/action-memory.cjs');

test('main memory policy, atomic files and optimistic editor conflicts', async () => {
  try {
    loader.ensureDefaultFiles();
    loader.writeContextFile('USER.md', 'Personal preference secret');
    loader.updateLongTermMemory('a.*[x]($)', 'literal $& value');
    loader.updateLongTermMemory('unrelated', 'keep');
    loader.updateLongTermMemory('a.*[x]($)', 'updated $& literal');
    assert.match(loader.readContextFile('MEMORY.md'), /updated \$& literal/);
    assert.match(loader.readContextFile('MEMORY.md'), /unrelated\nkeep/);
    await Promise.all(Array.from({ length: 30 }, (_, i) => Promise.resolve().then(() => loader.updateLongTermMemory(`concurrent-${i}`, String(i)))));
    assert.equal((loader.readContextFile('MEMORY.md').match(/### concurrent-/g) || []).length, 30);
    const snapshot = loader.readContextDocument('MEMORY.md');
    loader.updateLongTermMemory('changed-after-open', 'new');
    assert.throws(() => loader.writeContextFile('MEMORY.md', 'stale', snapshot.revision), /changed/);
    assert.match(loader.readContextFile('MEMORY.md'), /changed-after-open/);
    const rename = fs.renameSync;
    fs.renameSync = () => { throw new Error('disk failure'); };
    try { assert.throws(() => loader.updateLongTermMemory('disk', 'failed'), /disk failure/); }
    finally { fs.renameSync = rename; }
    assert.equal(fs.readdirSync(path.join(temp, 'martin')).some((f) => f.endsWith('.tmp')), false);

    const project = path.join(temp, 'project'); fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'AGENTS.md'), 'Project instructions must remain.');
    policy.setMemoryPolicy({ conversationId: 'chat', enabled: false });
    const originalRead = loader.readContextFile;
    loader.readContextFile = (name) => { if (name !== 'SOUL.md') throw new Error(`Forbidden personal read: ${name}`); return originalRead(name); };
    try {
      const off = context.loadAgentMemoryContext({ conversationId: 'chat', projectPath: project, includeDomains: ['social', 'email'] });
      assert.equal(off.user, ''); assert.equal(off.memory, ''); assert.equal(off.domainMemory, '');
      assert.match(off.projectMemory, /Project instructions must remain/);
      assert.ok(off.soul);
      await policy.withMemoryPolicy({ threadId: 'chat' }, async () => {
        await Promise.resolve();
        assert.throws(() => loader.updateLongTermMemory('blocked', 'value'), /disabled/);
        assert.equal(action.maybePersistFromToolResult('email_send', { to: 'x', subject: 'y' }, { success: true }).reason, 'memory_disabled');
        await policy.withMemoryPolicy({ threadId: 'child', memoryEnabled: true }, async () => {
          assert.equal(policy.isMemoryEnabled(), false);
        });
      });
    } finally { loader.readContextFile = originalRead; }
    policy.setMemoryPolicy({ enabled: false });
    policy.setMemoryPolicy({ conversationId: 'chat', enabled: true });
    assert.equal(policy.getMemoryPolicy({ conversationId: 'chat' }).enabled, false);
    assert.throws(() => loader.addMemoryEntry('blocked global log'), /disabled/);
    loader.writeContextFile('MEMORY.md', 'Manual edit while memory off');
    assert.equal(loader.readContextDocument('MEMORY.md').content, 'Manual edit while memory off');
  } finally {
    if (savedDatabase) require.cache[databasePath] = savedDatabase; else delete require.cache[databasePath];
    if (savedElectron) require.cache[electronPath] = savedElectron; else delete require.cache[electronPath];
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
