import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractSonarKey } from '../lib.mjs';

/**
 * Mirrors sync-github-issues / close-duplicate logic: keys from OPEN+CLOSED
 * must block recreation.
 */
function collectExistingKeys(issues) {
  /** @type {Set<string>} */
  const keys = new Set();
  let openCount = 0;
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issue.state !== 'closed') openCount++;
    const key = extractSonarKey(issue.body || '');
    if (key) keys.add(key);
  }
  return { keys, openCount };
}

/**
 * Open issues whose key already exists on a closed issue should be closed.
 */
function openRefilesToClose(openIssues, closedKeys) {
  /** @type {number[]} */
  const out = [];
  for (const issue of openIssues) {
    const key = extractSonarKey(issue.body || '');
    if (key && closedKeys.has(key)) out.push(issue.number);
  }
  return out;
}

describe('sync/dedupe OPEN+CLOSED', () => {
  it('includes closed issue keys in the existing set (no recreate)', () => {
    const { keys, openCount } = collectExistingKeys([
      {
        number: 1,
        state: 'closed',
        body: '## SonarQube\n- **Key**: b7574194-d8f2-41ed-892e-2037a8a89f54\n',
      },
      {
        number: 2,
        state: 'open',
        body: '## SonarQube\n- **Key**: ac90b841-86ff-4dc3-82de-b0d833b2cd9f\n',
      },
    ]);
    assert.equal(openCount, 1);
    assert.ok(keys.has('b7574194-d8f2-41ed-892e-2037a8a89f54'));
    assert.ok(keys.has('ac90b841-86ff-4dc3-82de-b0d833b2cd9f'));
    // Candidate from stale Sonar must not be created again
    assert.ok(keys.has('b7574194-d8f2-41ed-892e-2037a8a89f54'));
  });

  it('flags open refiles when a closed issue already holds the key', () => {
    const closedKeys = new Set(['b7574194-d8f2-41ed-892e-2037a8a89f54']);
    const toClose = openRefilesToClose(
      [
        {
          number: 1247,
          body: '## SonarQube\n- **Key**: b7574194-d8f2-41ed-892e-2037a8a89f54\n',
        },
        {
          number: 1333,
          body: '## SonarQube\n- **Key**: ac90b841-86ff-4dc3-82de-b0d833b2cd9f\n',
        },
      ],
      closedKeys,
    );
    assert.deepEqual(toClose, [1247]);
  });
});
