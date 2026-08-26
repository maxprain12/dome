import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'scripts/jenkins/run-fast-gates.sh');

describe('run-fast-gates.sh JSON overall', () => {
  it('writes overall pass when all gate rcs are 0 (env exported to node)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-gates-'));
    // Stub pnpm / node helpers so gates succeed without a full install
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // Minimal stubs for validate-batch-scope + verify-loop-diff invoked by the script
    fs.mkdirSync(path.join(dir, 'scripts/sonar'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts/jenkins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts/sonar/validate-batch-scope.mjs'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(dir, 'scripts/jenkins/verify-loop-diff.sh'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"t"}\n');
    fs.mkdirSync(path.join(dir, 'app'));

    const sh = fs.readFileSync(SCRIPT, 'utf8');
    fs.writeFileSync(path.join(dir, 'scripts/jenkins/run-fast-gates.sh'), sh, { mode: 0o755 });

    const r = spawnSync('bash', ['scripts/jenkins/run-fast-gates.sh', dir, '.quality-loop/batch.json'], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const payload = JSON.parse(fs.readFileSync(path.join(dir, '.quality-loop/fast-gates.json'), 'utf8'));
    assert.equal(payload.overall, 'pass');
    assert.equal(payload.gates.typecheck, 0);
    assert.equal(payload.gates.lint, 0);
    assert.equal(payload.gates.scope, 0);
    assert.equal(payload.gates.diff, 0);
  });

  it('writes overall fail when a gate fails, matching exit 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-gates-fail-'));
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    // typecheck fails
    fs.writeFileSync(
      path.join(bin, 'pnpm'),
      '#!/bin/sh\nif [ "$1 $2" = "run typecheck" ]; then exit 2; fi\nexit 0\n',
      { mode: 0o755 },
    );
    fs.mkdirSync(path.join(dir, 'scripts/sonar'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts/jenkins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts/sonar/validate-batch-scope.mjs'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(dir, 'scripts/jenkins/verify-loop-diff.sh'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"t"}\n');
    fs.mkdirSync(path.join(dir, 'app'));
    fs.writeFileSync(
      path.join(dir, 'scripts/jenkins/run-fast-gates.sh'),
      fs.readFileSync(SCRIPT, 'utf8'),
      { mode: 0o755 },
    );

    const r = spawnSync('bash', ['scripts/jenkins/run-fast-gates.sh', dir], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    const payload = JSON.parse(fs.readFileSync(path.join(dir, '.quality-loop/fast-gates.json'), 'utf8'));
    assert.equal(payload.overall, 'fail');
    assert.equal(payload.gates.typecheck, 2);
  });
});
