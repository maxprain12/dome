import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { actionOrigin, isBrowserActionApproved, readBrowserApprovals, setBrowserApproval } from './browser-approvals';
let storage: Record<string, unknown>;
const contains = vi.fn();
beforeEach(() => {
  storage = {};
  contains.mockResolvedValue(true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('browser', { storage: { local: { get: async () => storage, set: async (next: Record<string, unknown>) => { storage = { ...storage, ...next }; } } }, permissions: { contains } });
});
afterEach(() => vi.unstubAllGlobals());
it('persists per site and paired client, without storing the token', async () => {
  await setBrowserApproval('secret-token', 'https://example.test', true);
  expect(await isBrowserActionApproved('secret-token', 'browser_fill', 'https://example.test/form')).toBe(true);
  expect(await isBrowserActionApproved('another-client', 'browser_fill', 'https://example.test/form')).toBe(false);
  expect(await isBrowserActionApproved('secret-token', 'browser_click', 'https://other.test')).toBe(false);
  expect(await isBrowserActionApproved('secret-token', 'browser_click', 'http://example.test')).toBe(false);
  expect(JSON.stringify(storage)).not.toContain('secret-token');
});
it('revokes consent and still requires native host access', async () => {
  await setBrowserApproval('token', 'https://example.test', true);
  contains.mockResolvedValue(false);
  expect(await isBrowserActionApproved('token', 'browser_click', 'https://example.test')).toBe(false);
  await setBrowserApproval('token', 'https://example.test', false);
  expect(await readBrowserApprovals('token')).toEqual([]);
});
it('does not grant unrelated tools or unsupported origins', async () => {
  await setBrowserApproval('token', 'https://example.test', true);
  expect(await isBrowserActionApproved('token', 'note_delete', 'https://example.test')).toBe(false);
  expect(actionOrigin('chrome://settings')).toBeNull();
  await expect(setBrowserApproval('token', '*', true)).rejects.toThrow();
});
