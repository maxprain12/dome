import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'scripts/jenkins/run-sonar-scanner.sh');

/**
 * @param {{ lcov?: string | null }} opts
 */
function prepWorkspace(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-sonar-scanner-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const logPath = path.join(dir, 'pnpm-argv.log');
  // Record argv and succeed — do not download @sonar/scan in unit tests.
  fs.writeFileSync(
    path.join(bin, 'pnpm'),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "${logPath}"\nexit 0\n`,
    { mode: 0o755 },
  );
  fs.mkdirSync(path.join(dir, 'scripts/jenkins'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts/jenkins/run-sonar-scanner.sh'), fs.readFileSync(SCRIPT, 'utf8'), {
    mode: 0o755,
  });
  if (opts.lcov != null) {
    fs.mkdirSync(path.join(dir, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'coverage/lcov.info'), opts.lcov);
  }
  return { dir, bin, logPath };
}

describe('run-sonar-scanner.sh', () => {
  it('invokes pnpm dlx sonar-scanner-npm (not bare sonar-scanner)', () => {
    const { dir, bin, logPath } = prepWorkspace({ lcov: 'TN:\nSF:x.ts\nend_of_record\n' });
    const r = spawnSync('bash', ['scripts/jenkins/run-sonar-scanner.sh', dir], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const argv = fs.readFileSync(logPath, 'utf8').trim();
    assert.equal(argv, '--package=@sonar/scan dlx sonar-scanner-npm');
    assert.doesNotMatch(argv, /(^|\s)sonar-scanner(\s|$)/);
  });

  it('creates empty coverage/lcov.info when missing and still runs the scanner', () => {
    const { dir, bin, logPath } = prepWorkspace({ lcov: null });
    const r = spawnSync('bash', ['scripts/jenkins/run-sonar-scanner.sh', dir], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout + r.stderr, /WARN: coverage\/lcov\.info missing or empty/);
    assert.ok(fs.existsSync(path.join(dir, 'coverage/lcov.info')));
    assert.equal(fs.readFileSync(path.join(dir, 'coverage/lcov.info'), 'utf8'), '');
    assert.equal(fs.readFileSync(logPath, 'utf8').trim(), '--package=@sonar/scan dlx sonar-scanner-npm');
  });

  it('creates empty coverage/lcov.info when the file is empty and still runs the scanner', () => {
    const { dir, bin, logPath } = prepWorkspace({ lcov: '' });
    const r = spawnSync('bash', ['scripts/jenkins/run-sonar-scanner.sh', dir], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout + r.stderr, /WARN: coverage\/lcov\.info missing or empty/);
    assert.equal(fs.readFileSync(logPath, 'utf8').trim(), '--package=@sonar/scan dlx sonar-scanner-npm');
  });
});
