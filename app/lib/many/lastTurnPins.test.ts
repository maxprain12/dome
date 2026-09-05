import { describe, expect, it } from 'vitest';
import { resolvePinsForHydration } from './lastTurnPins';
import type { PinnedResource } from '@/lib/store/useManyStore';

function emailPin(id: string, title = 'Re: Hello'): PinnedResource {
  return {
    id,
    title,
    type: 'email',
    kind: 'email',
    meta: { uid: id.replace('emsg-', ''), folder: 'INBOX' },
  };
}

function docPin(id: string): PinnedResource {
  return { id, title: `Doc ${id}`, type: 'pdf', kind: 'resource' };
}

function personPin(id: string): PinnedResource {
  return { id, title: `Person ${id}`, type: 'person', kind: 'person' };
}

describe('resolvePinsForHydration', () => {
  it('returns composer pins unchanged when the composer is not empty', () => {
    const composer = [emailPin('emsg-composer')];
    const messages = [
      { role: 'user' as const, pinnedResources: [emailPin('emsg-old'), docPin('doc-1')] },
    ];
    expect(resolvePinsForHydration(composer, messages)).toBe(composer);
  });

  it('uses the last user-turn pins when the composer is empty', () => {
    const last = [emailPin('emsg-last'), personPin('p-1')];
    const messages = [
      { role: 'user' as const, pinnedResources: [emailPin('emsg-old')] },
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, pinnedResources: last },
      { role: 'assistant' as const, content: 'done' },
    ];
    expect(resolvePinsForHydration([], messages)).toEqual([personPin('p-1'), emailPin('emsg-last')]);
  });

  it('returns [] when no user message has pins', () => {
    expect(
      resolvePinsForHydration([], [
        { role: 'user' as const, pinnedResources: [] },
        { role: 'assistant' as const, pinnedResources: [emailPin('emsg-asst')] },
        { role: 'user' as const },
      ]),
    ).toEqual([]);
  });

  it('keeps only the last email when a snapshot has two emails', () => {
    const snapshot = [
      emailPin('emsg-first', 'Older'),
      personPin('p-1'),
      emailPin('emsg-second', 'Newer'),
    ];
    expect(resolvePinsForHydration([], [{ role: 'user', pinnedResources: snapshot }])).toEqual([
      personPin('p-1'),
      emailPin('emsg-second', 'Newer'),
    ]);
  });

  it('caps sticky pins at 4 while keeping the last email', () => {
    const snapshot = [
      docPin('d1'),
      docPin('d2'),
      docPin('d3'),
      docPin('d4'),
      emailPin('emsg-keep'),
    ];
    const result = resolvePinsForHydration([], [{ role: 'user', pinnedResources: snapshot }]);
    expect(result).toHaveLength(4);
    expect(result.filter((p) => p.kind === 'email')).toEqual([emailPin('emsg-keep')]);
  });
});
