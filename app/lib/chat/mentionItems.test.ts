import { describe, expect, it } from 'vitest';
import {
  formatIdentitySubtitle,
  mentionInsertionText,
  mergeMentionResults,
  personToMentionItem,
  resourceToMentionItem,
  type MentionItem,
} from './mentionItems';

describe('mergeMentionResults', () => {
  it('prefers people before resources and respects limit', () => {
    const people: MentionItem[] = [
      { kind: 'person', id: 'p1', title: 'Max', type: 'person' },
      { kind: 'person', id: 'p2', title: 'Alder', type: 'person' },
    ];
    const resources: MentionItem[] = [
      { kind: 'resource', id: 'r1', title: 'Notes', type: 'note' },
      { kind: 'resource', id: 'r2', title: 'PDF', type: 'pdf' },
    ];
    const merged = mergeMentionResults(people, resources, 3);
    expect(merged.map((m) => m.id)).toEqual(['p1', 'p2', 'r1']);
    expect(merged[0]?.kind).toBe('person');
  });

  it('dedupes by id', () => {
    const people: MentionItem[] = [{ kind: 'person', id: 'x', title: 'X', type: 'person' }];
    const resources: MentionItem[] = [{ kind: 'resource', id: 'x', title: 'Clash', type: 'note' }];
    expect(mergeMentionResults(people, resources)).toHaveLength(1);
    expect(mergeMentionResults(people, resources)[0]?.kind).toBe('person');
  });
});

describe('mentionInsertionText', () => {
  it('serializes person as markdown person: link', () => {
    expect(
      mentionInsertionText({ kind: 'person', id: 'abc', title: 'maxprain', type: 'person' }),
    ).toBe('[@maxprain](person:abc) ');
  });

  it('keeps plain @title for resources', () => {
    expect(
      mentionInsertionText({ kind: 'resource', id: 'r1', title: 'Thesis', type: 'pdf' }),
    ).toBe('@Thesis ');
  });
});

describe('personToMentionItem', () => {
  it('builds subtitle from identities', () => {
    const item = personToMentionItem({
      id: '1',
      displayName: 'Max',
      identities: [
        { source: 'github', externalId: 'maxprain' },
        { source: 'email', externalId: 'max@example.com' },
      ],
    });
    expect(item.subtitle).toBe(formatIdentitySubtitle(item.identities));
    expect(item.subtitle).toContain('GitHub:maxprain');
    expect(item.subtitle).toContain('email:max@example.com');
  });
});

describe('resourceToMentionItem', () => {
  it('skips folders', () => {
    expect(resourceToMentionItem({ id: 'f', title: 'Folder', type: 'folder' })).toBeNull();
  });
});
