import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertPublicUrl, isBlockedIp, isPrivateIpv4 } = require('../services/web/url-guard.cjs');

describe('url-guard', () => {
  it('detects private IPv4 ranges', () => {
    assert.equal(isPrivateIpv4('127.0.0.1'), true);
    assert.equal(isPrivateIpv4('10.0.0.1'), true);
    assert.equal(isPrivateIpv4('192.168.1.1'), true);
    assert.equal(isPrivateIpv4('169.254.169.254'), true);
    assert.equal(isPrivateIpv4('8.8.8.8'), false);
  });

  it('blocks localhost URLs', async () => {
    await assert.rejects(() => assertPublicUrl('http://127.0.0.1:11434/api'), /Blocked URL/);
    await assert.rejects(() => assertPublicUrl('http://localhost:8080'), /Blocked URL/);
  });

  it('blocks metadata endpoints', async () => {
    await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/meta-data'), /Blocked URL/);
  });

  it('blocks decimal-encoded loopback', async () => {
    await assert.rejects(() => assertPublicUrl('http://2130706433/'), /Blocked URL/);
  });

  it('allows public HTTPS URLs', async () => {
    const url = await assertPublicUrl('https://example.com/path');
    assert.equal(url, 'https://example.com/path');
  });

  it('blocks non-http protocols', async () => {
    await assert.rejects(() => assertPublicUrl('file:///etc/passwd'), /protocol/);
  });

  it('flags blocked IPs directly', () => {
    assert.equal(isBlockedIp('::1'), true);
    assert.equal(isBlockedIp('203.0.113.1'), false);
  });
});
