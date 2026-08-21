/**
 * Local git tools, exercised against a real throwaway repository.
 * Run: node --test electron/__tests__/git-tools.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gitTools = require('../coding/git-tools.cjs');

describe('parseStatus', () => {
  const { parseStatus } = gitTools;

  it('reads the branch and ahead/behind counts', () => {
    const r = parseStatus('## main...origin/main [ahead 2, behind 1]');
    assert.equal(r.branch, 'main');
    assert.equal(r.ahead, 2);
    assert.equal(r.behind, 1);
    assert.deepEqual(r.files, []);
  });

  it('reads a branch with no upstream', () => {
    assert.equal(parseStatus('## feat/thing').branch, 'feat/thing');
  });

  it('classifies staged, unstaged and untracked files', () => {
    const r = parseStatus(['## main', 'M  staged.ts', ' M dirty.ts', '?? new.ts'].join('\n'));
    const byPath = Object.fromEntries(r.files.map((f) => [f.path, f]));
    assert.equal(byPath['staged.ts'].staged, true);
    assert.equal(byPath['dirty.ts'].staged, false);
    assert.equal(byPath['new.ts'].untracked, true);
    assert.equal(byPath['new.ts'].staged, false);
  });

  it('records the old path of a rename', () => {
    const r = parseStatus(['## main', 'R  old.ts -> new.ts'].join('\n'));
    assert.equal(r.files[0].path, 'new.ts');
    assert.equal(r.files[0].renamedFrom, 'old.ts');
  });
});

describe('git tools against a real repo', () => {
  let repo;
  let ctx;

  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  before(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dome-git-')));
    ctx = { workspaceCwd: repo };
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@dome.local');
    git('config', 'user.name', 'Dome Test');
    git('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n', 'utf8');
    git('add', 'a.txt');
    git('commit', '-m', 'initial commit');
  });

  after(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reports a clean tree', async () => {
    const res = await gitTools.gitStatus({}, ctx);
    assert.equal(res.status, 'success');
    assert.equal(res.branch, 'main');
    assert.equal(res.clean, true);
  });

  it('refuses to run without a workspace', async () => {
    const res = await gitTools.gitStatus({}, {});
    assert.equal(res.status, 'error');
    assert.match(res.error, /No coding workspace/);
  });

  it('sees an unstaged edit in status and diff', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\nTWO\n', 'utf8');

    const status = await gitTools.gitStatus({}, ctx);
    assert.equal(status.clean, false);
    assert.equal(status.files[0].path, 'a.txt');
    assert.equal(status.files[0].staged, false);

    const diff = await gitTools.gitDiff({}, ctx);
    assert.equal(diff.status, 'success');
    assert.equal(diff.empty, false);
    assert.match(diff.diff, /^-two$/m);
    assert.match(diff.diff, /^\+TWO$/m);
  });

  it('git_add stages only the listed paths', async () => {
    fs.writeFileSync(path.join(repo, 'b.txt'), 'untouched\n', 'utf8');
    const res = await gitTools.gitAdd({ paths: ['a.txt'] }, ctx);
    assert.equal(res.status, 'success');

    const status = await gitTools.gitStatus({}, ctx);
    const byPath = Object.fromEntries(status.files.map((f) => [f.path, f]));
    assert.equal(byPath['a.txt'].staged, true);
    assert.equal(byPath['b.txt'].untracked, true);
  });

  it('git_add rejects an empty path list', async () => {
    const res = await gitTools.gitAdd({}, ctx);
    assert.equal(res.status, 'error');
    assert.match(res.error, /paths\[\] is required/);
  });

  it('staged diff differs from the working-tree diff', async () => {
    const staged = await gitTools.gitDiff({ staged: true }, ctx);
    assert.equal(staged.empty, false);
    assert.match(staged.diff, /\+TWO/);
  });

  it('git_commit commits what is staged and returns the hash', async () => {
    const res = await gitTools.gitCommit({ message: 'change two to TWO' }, ctx);
    assert.equal(res.status, 'success');
    assert.ok(res.commit && res.commit.length >= 7);
    assert.deepEqual(res.files, ['a.txt']);

    const status = await gitTools.gitStatus({}, ctx);
    assert.equal(status.staged_count, 0);
  });

  it('git_commit refuses when nothing is staged', async () => {
    const res = await gitTools.gitCommit({ message: 'empty' }, ctx);
    assert.equal(res.status, 'error');
    assert.match(res.error, /Nothing staged/);
  });

  it('git_commit requires a message', async () => {
    const res = await gitTools.gitCommit({}, ctx);
    assert.equal(res.status, 'error');
    assert.match(res.error, /message is required/);
  });

  it('git_log lists commits newest first', async () => {
    const res = await gitTools.gitLog({ limit: 10 }, ctx);
    assert.equal(res.status, 'success');
    assert.equal(res.count, 2);
    assert.equal(res.commits[0].subject, 'change two to TWO');
    assert.equal(res.commits[1].subject, 'initial commit');
    assert.equal(res.commits[0].author, 'Dome Test');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(res.commits[0].date));
  });

  it('git_log survives a subject containing separators', async () => {
    fs.writeFileSync(path.join(repo, 'c.txt'), 'x\n', 'utf8');
    await gitTools.gitAdd({ paths: ['c.txt'] }, ctx);
    await gitTools.gitCommit({ message: 'fix: a | b -> c' }, ctx);
    const res = await gitTools.gitLog({ limit: 1 }, ctx);
    assert.equal(res.commits[0].subject, 'fix: a | b -> c');
  });

  it('git_branch_create switches to the new branch', async () => {
    const res = await gitTools.gitBranchCreate({ name: 'fix/issue-1' }, ctx);
    assert.equal(res.status, 'success');
    assert.equal(res.branch, 'fix/issue-1');
    assert.equal((await gitTools.gitStatus({}, ctx)).branch, 'fix/issue-1');
  });

  it('git_branch_create rejects a malformed name', async () => {
    const res = await gitTools.gitBranchCreate({ name: 'bad branch~name' }, ctx);
    assert.equal(res.status, 'error');
    assert.match(res.error, /Invalid branch name/);
  });

  it('git_branch_create requires a name', async () => {
    assert.equal((await gitTools.gitBranchCreate({}, ctx)).status, 'error');
  });

  it('git_branch_create reports a cancellation as such, not as a bad name', async () => {
    // Regression: any pre-flight failure used to surface as "Invalid branch
    // name", sending everyone hunting a naming problem that did not exist.
    const res = await gitTools.gitBranchCreate(
      { name: 'refactor/issue-991-note-action-bar' },
      { ...ctx, signal: AbortSignal.abort() },
    );
    assert.equal(res.status, 'error');
    assert.doesNotMatch(res.error, /Invalid branch name/);
    assert.match(res.error, /Cancelled/i);
  });

  it('git_branch_create still rejects a genuinely malformed name', async () => {
    const res = await gitTools.gitBranchCreate({ name: 'bad branch~name' }, ctx);
    assert.equal(res.status, 'error');
    assert.match(res.error, /Invalid branch name/);
  });

  it('quotes paths containing spaces and quotes', async () => {
    const tricky = "weird name's file.txt";
    fs.writeFileSync(path.join(repo, tricky), 'content\n', 'utf8');
    const add = await gitTools.gitAdd({ paths: [tricky] }, ctx);
    assert.equal(add.status, 'success');
    const status = await gitTools.gitStatus({}, ctx);
    assert.ok(status.files.some((f) => f.path.includes('weird name')));
  });
});
