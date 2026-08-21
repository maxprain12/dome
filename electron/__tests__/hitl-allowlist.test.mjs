/**
 * Thread-scoped HITL auto-approve — the "approve for this chat" escape hatch.
 * Run: node --test electron/__tests__/hitl-allowlist.test.mjs
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const allowlist = require('../agents/hitl-allowlist.cjs');

describe('hitl allowlist', () => {
  beforeEach(() => allowlist.clearAll());

  it('asks by default', () => {
    assert.equal(allowlist.isToolAutoApproved('t1', 'shell_exec'), false);
  });

  it('approving for a thread covers every HITL tool in it', () => {
    allowlist.approveAllForThread('t1');
    assert.equal(allowlist.isToolAutoApproved('t1', 'shell_exec'), true);
    assert.equal(allowlist.isToolAutoApproved('t1', 'git_commit'), true);
  });

  it('does not leak the decision to another conversation', () => {
    allowlist.approveAllForThread('t1');
    assert.equal(allowlist.isToolAutoApproved('t2', 'shell_exec'), false);
  });

  it('can be narrowed to named tools', () => {
    allowlist.approveAllForThread('t1', ['shell_exec']);
    assert.equal(allowlist.isToolAutoApproved('t1', 'shell_exec'), true);
    assert.equal(allowlist.isToolAutoApproved('t1', 'git_commit'), false);
  });

  it('clearing the thread restores prompting', () => {
    allowlist.approveAllForThread('t1');
    allowlist.clearThread('t1');
    assert.equal(allowlist.isToolAutoApproved('t1', 'shell_exec'), false);
  });

  it('ignores a missing thread id instead of granting globally', () => {
    allowlist.approveAllForThread(null);
    assert.equal(allowlist.isToolAutoApproved(null, 'shell_exec'), false);
    assert.equal(allowlist.isToolAutoApproved('t1', 'shell_exec'), false);
  });
});
