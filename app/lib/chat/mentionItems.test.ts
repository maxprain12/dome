import { describe, expect, it } from 'vitest';
import {
  formatIdentitySubtitle,
  mentionInsertionText,
  mergeMentionResults,
  personToMentionItem,
  resourceToMentionItem,
  sourceHitToMentionItem,
  type MentionItem,
} from './mentionItems';

describe('mergeMentionResults', () => {
  it('prefers people, then sources, then resources and respects limit', () => {
    const people: MentionItem[] = [
      { kind: 'person', id: 'p1', title: 'Max', type: 'person' },
      { kind: 'person', id: 'p2', title: 'Alder', type: 'person' },
    ];
    const issues: MentionItem[] = [
      { kind: 'issue', id: 'i1', title: '#1 Task', type: 'issue' },
    ];
    const resources: MentionItem[] = [
      { kind: 'resource', id: 'r1', title: 'Notes', type: 'note' },
      { kind: 'resource', id: 'r2', title: 'PDF', type: 'pdf' },
    ];
    const merged = mergeMentionResults([people, issues, resources], 3);
    expect(merged.map((m) => m.id)).toEqual(['p1', 'p2', 'i1']);
    expect(merged[0]?.kind).toBe('person');
  });

  it('dedupes by kind:id', () => {
    const people: MentionItem[] = [{ kind: 'person', id: 'x', title: 'X', type: 'person' }];
    const resources: MentionItem[] = [{ kind: 'resource', id: 'x', title: 'Clash', type: 'note' }];
    expect(mergeMentionResults([people, resources])).toHaveLength(2);
  });
});

describe('mentionInsertionText', () => {
  it('inserts nothing for chip-only kinds (pin carries context)', () => {
    expect(
      mentionInsertionText({ kind: 'person', id: 'abc', title: 'maxprain', type: 'person' }),
    ).toBe('');
    expect(
      mentionInsertionText({ kind: 'issue', id: 'iss-1', title: '#1 Fix', type: 'issue' }),
    ).toBe('');
    expect(
      mentionInsertionText({ kind: 'email', id: 'em-1', title: 'Hello', type: 'email' }),
    ).toBe('');
    expect(
      mentionInsertionText({ kind: 'social_post', id: 's1', title: 'Post', type: 'social_post' }),
    ).toBe('');
  });

  it('keeps plain @title for library resources', () => {
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

describe('sourceHitToMentionItem', () => {
  it('maps issue hits', () => {
    const item = sourceHitToMentionItem({
      kind: 'issue',
      id: 'iss-1',
      title: 'Issue 450 Mejoras',
      meta: { state: 'open', fullName: 'acme/dome' },
    });
    expect(item.kind).toBe('issue');
    expect(item.subtitle).toContain('acme/dome');
  });

  it('uses short social labels instead of body text', () => {
    const item = sourceHitToMentionItem({
      kind: 'social_post',
      id: 'sp-1',
      title: 'En Dome solo hay un paso manual para crear una feature: escribir el prompt',
      snippet: 'body preview…',
      meta: { provider: 'linkedin', status: 'draft', campaign: null },
    });
    expect(item.title).toBe('LinkedIn · draft');
    expect(mentionInsertionText(item)).toBe('');
  });
});

describe('resourceToMentionItem', () => {
  it('skips folders', () => {
    expect(resourceToMentionItem({ id: 'f', title: 'Folder', type: 'folder' })).toBeNull();
  });
});
