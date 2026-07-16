/**
 * action-memory unit tests.
 * Run: node --test electron/__tests__/action-memory.test.mjs
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('action-memory', () => {
  let actionMemory;
  let personalityPath;
  let previousPersonality;
  const writes = [];

  before(() => {
    personalityPath = require.resolve('../personality/personality-loader.cjs');
    previousPersonality = require.cache[personalityPath];
    require.cache[personalityPath] = {
      id: personalityPath,
      filename: personalityPath,
      loaded: true,
      exports: {
        updateLongTermMemory(key, value) {
          writes.push({ domain: 'general', key, value });
        },
        updateDomainMemory(domain, key, value) {
          writes.push({ domain, key, value });
        },
        addMemoryEntry() {},
      },
    };
    delete require.cache[require.resolve('../personality/action-memory.cjs')];
    actionMemory = require('../personality/action-memory.cjs');
  });

  after(() => {
    if (previousPersonality) require.cache[personalityPath] = previousPersonality;
    else delete require.cache[personalityPath];
    delete require.cache[require.resolve('../personality/action-memory.cjs')];
  });

  beforeEach(() => {
    writes.length = 0;
    actionMemory._resetDedupForTests();
  });

  it('ignores non-whitelisted tools', () => {
    const res = actionMemory.maybePersistFromToolResult('email_list', {}, { success: true }, false);
    assert.equal(res.persisted, false);
    assert.equal(res.reason, 'not_whitelisted');
    assert.equal(writes.length, 0);
  });

  it('persists social_post_publish to social domain', () => {
    const res = actionMemory.maybePersistFromToolResult(
      'social_post_publish',
      { platform: 'x', caption: 'Hello world launch' },
      { success: true, id: 'p1' },
      false,
    );
    assert.equal(res.persisted, true);
    assert.equal(res.domain, 'social');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].domain, 'social');
  });

  it('dedups same key within 24h', () => {
    actionMemory.maybePersistFromToolResult(
      'email_send',
      { to: 'vip@example.com', subject: 'Follow up' },
      { success: true },
      false,
    );
    const second = actionMemory.maybePersistFromToolResult(
      'email_send',
      { to: 'vip@example.com', subject: 'Follow up again' },
      { success: true },
      false,
    );
    assert.equal(second.persisted, false);
    assert.equal(second.reason, 'dedup');
    assert.equal(writes.length, 1);
  });

  it('persists github_create_issue to general memory', () => {
    const res = actionMemory.maybePersistFromToolResult(
      'github_create_issue',
      { repo: 'dome/app', title: 'Fix mentions', assignees: ['max'] },
      { success: true, number: 42 },
      false,
    );
    assert.equal(res.persisted, true);
    assert.equal(res.domain, 'general');
    assert.match(writes[0].key, /github_issue_/);
  });
});
