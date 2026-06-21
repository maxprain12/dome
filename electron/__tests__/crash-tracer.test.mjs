import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

describe('crash-tracer', () => {
  /** @type {string | undefined} */
  let tmpDir;
  /** @type {NodeJS.ProcessEnv} */
  let envBackup;

  beforeEach(() => {
    envBackup = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-crash-trace-'));
    process.env.DOME_CRASH_TRACE = '1';
    delete process.env.DOME_PROFILE;
    delete require.cache[require.resolve('../core/crash-tracer.cjs')];
  });

  afterEach(() => {
    process.env = envBackup;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve('../core/crash-tracer.cjs')];
  });

  it('isEnabled respects DOME_CRASH_TRACE=0', () => {
    process.env.DOME_CRASH_TRACE = '0';
    delete require.cache[require.resolve('../core/crash-tracer.cjs')];
    const tracer = require('../core/crash-tracer.cjs');
    assert.equal(tracer.isEnabled(), false);
  });

  it('records breadcrumbs and flushFatal payload shape', () => {
    const tracer = require('../core/crash-tracer.cjs');
    tracer.breadcrumb('test-event', { foo: 'bar' });
    const recent = tracer.getRecentBreadcrumbs();
    assert.ok(recent.length >= 1);
    const last = recent[recent.length - 1];
    assert.equal(last.message, 'test-event');
    assert.equal(last.foo, 'bar');
    assert.doesNotThrow(() => tracer.flushFatal('unit-test', new Error('boom')));
  });

  it('installProcessHooks patches timers once', () => {
    const tracer = require('../core/crash-tracer.cjs');
    assert.equal(tracer.installProcessHooks(), true);
    assert.equal(tracer.installProcessHooks(), false);
  });
});
