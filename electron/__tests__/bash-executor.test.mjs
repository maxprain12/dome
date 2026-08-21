/**
 * Agent-grade shell execution: streaming, cancellation, timeout, truncation.
 * Run: node --test electron/__tests__/bash-executor.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { executeBash, truncationNotice } = require('../coding/bash-executor.cjs');
const { stripAnsi, sanitizeBinaryOutput, getShellConfig } = require('../coding/shell-utils.cjs');

const ESC = String.fromCharCode(0x1b);

/** Poll until `predicate` holds or the deadline passes. */
async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

describe('shell-utils', () => {
  it('stripAnsi removes CSI colour codes', () => {
    assert.equal(stripAnsi(`${ESC}[31mred${ESC}[0m tail`), 'red tail');
  });

  it('stripAnsi is a fast no-op without an introducer', () => {
    assert.equal(stripAnsi('plain text'), 'plain text');
  });

  it('sanitizeBinaryOutput keeps tab/newline and drops other control chars', () => {
    const raw = `a${String.fromCharCode(0)}b\tc\nd${String.fromCharCode(7)}`;
    assert.equal(sanitizeBinaryOutput(raw), 'ab\tc\nd');
  });

  it('resolves a usable shell', () => {
    const { shell, args } = getShellConfig();
    assert.ok(shell.length > 0);
    assert.ok(args.includes('-c') || args.includes('/c'));
  });
});

describe('executeBash', () => {
  let cwd;

  before(() => {
    cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dome-bash-')));
  });

  after(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('captures stdout and the exit code', async () => {
    const res = await executeBash('echo hello', cwd);
    assert.equal(res.output.trim(), 'hello');
    assert.equal(res.exitCode, 0);
    assert.equal(res.cancelled, false);
    assert.equal(res.timedOut, false);
  });

  it('interleaves stderr and reports a non-zero exit code', async () => {
    const res = await executeBash('echo out; echo err 1>&2; exit 3', cwd);
    assert.match(res.output, /out/);
    assert.match(res.output, /err/);
    assert.equal(res.exitCode, 3);
  });

  it('runs in the given cwd', async () => {
    const res = await executeBash('pwd', cwd);
    assert.equal(fs.realpathSync(res.output.trim()), cwd);
  });

  it('rejects a cwd that does not exist', async () => {
    await assert.rejects(
      () => executeBash('echo x', path.join(cwd, 'missing')),
      /Working directory does not exist/,
    );
  });

  it('streams output as it arrives, before the command finishes', async () => {
    const seen = [];
    const res = await executeBash('echo one; sleep 0.2; echo two', cwd, {
      onChunk: (text) => seen.push(text),
    });
    assert.ok(seen.length >= 2, `expected multiple chunks, got ${seen.length}`);
    assert.match(res.output, /one[\s\S]*two/);
  });

  it('strips ANSI from streamed output', async () => {
    const res = await executeBash(`printf '\\033[31mred\\033[0m\\n'`, cwd);
    assert.equal(res.output.trim(), 'red');
  });

  it('returns immediately when the signal is already aborted', async () => {
    const res = await executeBash('echo never', cwd, { signal: AbortSignal.abort() });
    assert.equal(res.cancelled, true);
    assert.equal(res.output, '');
  });

  it('cancels a running command and kills its child process tree', async () => {
    const marker = path.join(cwd, 'still-alive.txt');
    const controller = new AbortController();
    // The outer shell spawns a background child; only a process-tree kill stops it.
    const command = `(while true; do echo tick >> ${JSON.stringify(marker)}; sleep 0.05; done) & echo started; wait`;

    const running = executeBash(command, cwd, { signal: controller.signal });
    const started = await waitFor(() => fs.existsSync(marker));
    assert.ok(started, 'background child never started');

    controller.abort();
    const res = await running;
    assert.equal(res.cancelled, true);
    assert.equal(res.exitCode, undefined);

    // Nothing should append to the marker after the tree was killed.
    const sizeAfterKill = fs.statSync(marker).size;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fs.statSync(marker).size, sizeAfterKill, 'orphaned child kept writing');
  });

  it('kills a command that exceeds its per-call timeout', async () => {
    const started = Date.now();
    const res = await executeBash('sleep 10', cwd, { timeoutSeconds: 0.3 });
    assert.equal(res.timedOut, true);
    assert.equal(res.exitCode, undefined);
    assert.ok(Date.now() - started < 5000, 'timeout did not fire promptly');
  });

  it('has no default timeout for a slow command', async () => {
    const res = await executeBash('sleep 0.6; echo done', cwd);
    assert.equal(res.timedOut, false);
    assert.equal(res.output.trim(), 'done');
  });

  it('truncates huge output and spills the full transcript to a temp file', async () => {
    const res = await executeBash('for i in $(seq 1 40000); do echo "line-$i"; done', cwd);
    assert.equal(res.truncated, true);
    assert.ok(res.fullOutputPath, 'expected a full-output path');
    assert.ok(fs.existsSync(res.fullOutputPath));

    // The reported window keeps the END of the output, as a terminal would.
    assert.match(res.output, /line-40000/);
    assert.ok(!res.output.includes('line-1\n'), 'expected the head to be dropped');

    const full = fs.readFileSync(res.fullOutputPath, 'utf8');
    assert.match(full, /line-1\n/);
    assert.match(full, /line-40000/);
    assert.ok(res.bytesTotal > full.length / 2);

    const notice = truncationNotice(res);
    assert.match(notice, /truncated/i);
    assert.ok(notice.includes(res.fullOutputPath));
    fs.rmSync(res.fullOutputPath, { force: true });
  });

  it('does not create a temp file for small output', async () => {
    const res = await executeBash('echo small', cwd);
    assert.equal(res.truncated, false);
    assert.equal(res.fullOutputPath, undefined);
    assert.equal(truncationNotice(res), null);
  });
});

describe('shell-policy denylist', () => {
  const { assessShellCommand } = require('../core/shell-policy.cjs');

  it('blocks destructive commands before they reach the executor', () => {
    assert.equal(assessShellCommand('sudo rm -rf /').blocked, true);
    assert.equal(assessShellCommand('').blocked, true);
  });

  it('allows ordinary build commands', () => {
    assert.equal(assessShellCommand('pnpm run build').blocked, false);
    assert.equal(assessShellCommand('git status --porcelain').blocked, false);
  });
});
