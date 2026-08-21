/**
 * Locks formatVolatileSourceContext output for pinned sources (incl. workspace).
 * Run: pnpm --filter @dome/prompts test  (requires dist build first)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatVolatileSourceContext } from '../dist/assembler.js';

test('formatVolatileSourceContext — empty opts yields session + default task', () => {
  assert.equal(
    formatVolatileSourceContext({}),
    'Source (session):\n\nTask: Respond to the user message using the sources above only when relevant.',
  );
});

test('formatVolatileSourceContext — labels trim and task override', () => {
  assert.equal(
    formatVolatileSourceContext({
      dateLine: '  Friday  ',
      uiContext: 'Library',
      userMemory: ' Prefers ES ',
      taskLine: 'Do X',
    }),
    [
      'Source (session):',
      '**session-date**\nFriday',
      '**ui-context**\nLibrary',
      '**user-memory**\nPrefers ES',
      'Task: Do X',
    ].join('\n\n'),
  );
});

test('formatVolatileSourceContext — people, resources, active resource', () => {
  const out = formatVolatileSourceContext({
    pinnedPeople: [
      {
        id: 'p1',
        title: 'Ada',
        identities: [{ source: 'github', externalId: 'ada', displayLabel: 'Ada L' }],
      },
      { id: 'p2', title: 'Bob' },
    ],
    pinnedResources: [{ id: 'r1', title: 'Doc', type: 'pdf' }],
    activeResource: { id: 'ar1', title: 'Active', type: 'note' },
  });
  assert.match(out, /\*\*mentioned-people\*\* — 2 person\(s\)/);
  assert.match(out, /- p1: Ada \(github:Ada L\)/);
  assert.match(out, /- p2: Bob/);
  assert.match(out, /\*\*pinned-resources\*\* — 1 item\(s\)/);
  assert.match(out, /- r1: Doc \(pdf\)/);
  assert.match(out, /\*\*active-resource\*\* — ar1 \/ note\n"Active"/);
});

test('formatVolatileSourceContext — pinned sources attrs, tool hints, workspace, body', () => {
  const out = formatVolatileSourceContext({
    pinnedSources: [
      {
        kind: 'issue',
        id: '42',
        title: 'Bug',
        meta: { fullName: 'org/repo', localPath: ' /tmp/ws ', body: '  hello  ' },
      },
      { kind: 'email', id: 'e1', title: 'Hi', meta: { folder: 'INBOX' } },
      {
        kind: 'social_post',
        id: 's1',
        title: 'Post',
        meta: { provider: 'x', status: 'draft' },
      },
      { kind: 'issue', id: '43', title: 'No meta' },
      { kind: 'issue', id: '44', title: 'Empty path', meta: { localPath: '   ', body: '' } },
    ],
  });

  assert.match(out, /\*\*mentioned-sources\*\* — 5 item\(s\)/);
  assert.match(
    out,
    /- \[issue\] 42: Bug repo=org\/repo → github_get_issue\n {2}working copy: \/tmp\/ws — the file, shell and git tools are already scoped to it; use relative paths\.\n {2}body: hello/,
  );
  assert.match(out, /- \[email\] e1: Hi folder=INBOX → email_read/);
  assert.match(out, /- \[social_post\] s1: Post provider=x status=draft → social_post_get/);
  assert.match(out, /- \[issue\] 43: No meta → github_get_issue/);
  assert.match(out, /- \[issue\] 44: Empty path → github_get_issue/);
  assert.doesNotMatch(out, /working copy:.*Empty path|Empty path[\s\S]*working copy/);
});

test('formatVolatileSourceContext — empty collections and blank active id omit blocks', () => {
  assert.equal(
    formatVolatileSourceContext({
      pinnedPeople: [],
      pinnedSources: [],
      pinnedResources: [],
      dateLine: '   ',
      uiContext: '',
      activeResource: { id: '', title: 'x' },
    }),
    'Source (session):\n\nTask: Respond to the user message using the sources above only when relevant.',
  );
});
