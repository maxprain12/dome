import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPinnedEmailReadArgs,
  hydratePinnedContext,
} from './hydratePinnedContext';
import type { PinnedResource } from '@/lib/store/useManyStore';

function stubEmailRead(read: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis.window, 'electron', {
    configurable: true,
    writable: true,
    value: { email: { read } },
  });
}

function emailPin(meta: Record<string, unknown>): PinnedResource {
  return {
    id: 'emsg-abc',
    title: 'Re: Sigpyme',
    type: 'email',
    kind: 'email',
    meta,
  };
}

describe('buildPinnedEmailReadArgs', () => {
  it('coerces numeric uid and forwards accountId + folder', () => {
    expect(
      buildPinnedEmailReadArgs(
        emailPin({ uid: 1842, folder: 'INBOX', accountId: 'acct-1' }),
      ),
    ).toEqual({
      messageId: '1842',
      folder: 'INBOX',
      accountId: 'acct-1',
    });
  });

  it('falls back to pin id when uid is missing', () => {
    expect(buildPinnedEmailReadArgs(emailPin({ folder: 'Sent' }))).toEqual({
      messageId: 'emsg-abc',
      folder: 'Sent',
    });
  });
});

describe('hydratePinnedContext email', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis.window, 'electron');
  });

  it('passes coerced uid and accountId to email.read and inlines body', async () => {
    const read = vi.fn().mockResolvedValue({
      success: true,
      message: { text: 'Hola, te escribo por Sigpyme', subject: 'Re: Sigpyme' },
    });
    stubEmailRead(read);

    const { sources } = await hydratePinnedContext([
      emailPin({ uid: 1842, folder: 'INBOX', accountId: 'acct-1' }),
    ]);

    expect(read).toHaveBeenCalledWith({
      messageId: '1842',
      folder: 'INBOX',
      accountId: 'acct-1',
    });
    expect(sources[0]?.meta?.body).toContain('Sigpyme');
  });

  it('does not invent a body when email.read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const read = vi.fn().mockResolvedValue({ success: false, error: 'Unknown email message id' });
    stubEmailRead(read);

    const { sources } = await hydratePinnedContext([emailPin({ uid: 99, folder: 'INBOX' })]);

    expect(sources[0]?.meta?.body).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
