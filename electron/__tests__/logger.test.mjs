import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const logger = require('../core/logger.cjs');

function captureConsole(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (line) => lines.push(line);
  try {
    fn();
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }
  return lines;
}

describe('logger', () => {
  it('emits JSON lines with ts/level/component/message', () => {
    const lines = captureConsole(() => logger.info('test', 'hello', { runId: 'r1' }));
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.level, 'info');
    assert.equal(entry.component, 'test');
    assert.equal(entry.message, 'hello');
    assert.equal(entry.runId, 'r1');
    assert.ok(entry.ts);
  });

  it('redacts secret-like field names and values', () => {
    const lines = captureConsole(() =>
      logger.error('test', 'provider failed', {
        apiKey: 'super-secret-value',
        nested: { authorization: 'Bearer abc123' },
        plain: 'sk-proj-12345',
        safe: 'visible',
      }),
    );
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.apiKey, '[redacted]');
    assert.equal(entry.nested.authorization, '[redacted]');
    assert.equal(entry.plain, '[redacted]');
    assert.equal(entry.safe, 'visible');
  });

  it('survives unserializable fields', () => {
    const circular = {};
    circular.self = circular;
    const lines = captureConsole(() => logger.warn('test', 'circular', { circular }));
    assert.equal(lines.length, 1);
    assert.doesNotThrow(() => JSON.parse(lines[0]));
  });

  it('truncates very long strings', () => {
    const lines = captureConsole(() => logger.info('test', 'long', { blob: 'x'.repeat(10_000) }));
    const entry = JSON.parse(lines[0]);
    assert.ok(entry.blob.length < 5000);
    assert.ok(entry.blob.endsWith('[truncated]'));
  });
});
