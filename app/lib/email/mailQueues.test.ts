import { describe, expect, it } from 'vitest';
import {
  buildMailQueues,
  collectNetworkEmails,
  computeMailStats,
  filterEnvelopesByQuery,
  formatMailDate,
  fromEmail,
  fromLabel,
  isRecentSent,
  isUnread,
  type MailEnvelope,
} from './mailQueues';

function env(partial: Partial<MailEnvelope> & { id: string }): MailEnvelope {
  return {
    subject: 'Hi',
    from: { name: 'Ada', addr: 'ada@example.com' },
    flags: [],
    ...partial,
  };
}

describe('mailQueues', () => {
  it('parses from email from string, object and Himalaya array', () => {
    expect(fromEmail({ addr: 'A@X.com' })).toBe('a@x.com');
    expect(fromEmail('Ada Lovelace <ada@x.com>')).toBe('ada@x.com');
    expect(fromEmail([{ name: 'Popolare', email: 'hello@popolare.fr' }])).toBe('hello@popolare.fr');
    expect(fromLabel([{ name: 'Popolare', email: 'hello@popolare.fr' }])).toBe('Popolare');
  });

  it('treats missing seen as unread', () => {
    expect(isUnread([])).toBe(true);
    expect(isUnread(['\\Seen'])).toBe(false);
    expect(isUnread(['Flagged'])).toBe(true);
  });

  it('partitions needs_reply, network, waiting, rest', () => {
    const network = new Set(['bob@acme.com']);
    const self = new Set(['me@dome.app']);
    const list = [
      env({ id: '1', from: { addr: 'bob@acme.com' }, flags: [] }),
      env({ id: '2', from: { addr: 'bob@acme.com' }, flags: ['\\Answered'] }),
      env({ id: '3', from: { addr: 'carol@other.com' }, flags: [] }),
      env({ id: '4', from: { addr: 'me@dome.app' }, flags: [] }),
    ];
    const q = buildMailQueues(list, network, self);
    expect(q.needsReply.map((e) => e.id)).toEqual(['1', '3']);
    expect(q.fromNetwork.map((e) => e.id)).toEqual(['1', '2']);
    expect(q.waiting.map((e) => e.id)).toEqual(['4']);
    expect(q.rest.map((e) => e.id)).toEqual(['2']);
  });

  it('computes stats and recent sent window', () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    const inbox = [
      env({ id: '1', from: { addr: 'bob@acme.com' }, flags: [] }),
      env({ id: '2', from: { addr: 'x@y.com' }, flags: ['\\Seen'] }),
      // Unread + answered: counts in attend, not in needsReply
      env({ id: '3', from: { addr: 'z@y.com' }, flags: ['\\Answered'] }),
    ];
    const sent = [
      env({
        id: 's1',
        date: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      env({
        id: 's2',
        date: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    const stats = computeMailStats(inbox, sent, new Set(['bob@acme.com']), new Set(), now);
    expect(stats.attend).toBe(2);
    expect(stats.network).toBe(1);
    expect(stats.needsReply).toBe(2);
    expect(stats.recentSent).toBe(1);
    expect(isRecentSent(sent[0]!, now)).toBe(true);
    expect(isRecentSent(sent[1]!, now)).toBe(false);
  });

  it('formats ISO mail dates for list rows', () => {
    expect(formatMailDate(undefined)).toBe('');
    expect(formatMailDate('not-a-date')).toBe('');
    // Same calendar day → time only (locale-dependent digits, but not the raw ISO string)
    const todayIso = new Date().toISOString();
    const todayLabel = formatMailDate(todayIso, 'es');
    expect(todayLabel).not.toContain('T');
    expect(todayLabel).not.toContain('Z');
    expect(todayLabel.length).toBeGreaterThan(0);
    const older = formatMailDate('2024-01-15T20:03:00.000Z', 'es');
    expect(older).not.toContain('T');
    expect(older).toMatch(/2024|ene|jan/i);
  });

  it('filters by query and collects network emails', () => {
    const list = [
      env({ id: '1', subject: 'Invoice Q2', from: { addr: 'billing@acme.com' } }),
      env({ id: '2', subject: 'Hello', from: { name: 'Bob', addr: 'bob@x.com' } }),
    ];
    expect(filterEnvelopesByQuery(list, 'invoice').map((e) => e.id)).toEqual(['1']);
    expect(filterEnvelopesByQuery(list, 'bob').map((e) => e.id)).toEqual(['2']);
    expect(filterEnvelopesByQuery(list, 'from:billing').map((e) => e.id)).toEqual(['1']);
    expect(filterEnvelopesByQuery(list, 'subject:hello').map((e) => e.id)).toEqual(['2']);
    const emails = collectNetworkEmails([
      {
        primaryEmail: 'Ada@X.com',
        identities: [
          { source: 'email', externalId: 'ada+work@x.com' },
          { source: 'github', externalId: 'adal' },
        ],
      },
    ]);
    expect(emails.has('ada@x.com')).toBe(true);
    expect(emails.has('ada+work@x.com')).toBe(true);
    expect(emails.has('adal')).toBe(false);
  });
});
