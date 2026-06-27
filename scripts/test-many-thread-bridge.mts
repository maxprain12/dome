import assert from 'node:assert/strict';
import test from 'node:test';
import { harnessMessagesToManyMessages } from '../app/lib/chat/harnessToManyMessages.ts';
import { mergeManySessionMessages } from '../app/lib/chat/mergeManySessionMessages.ts';
import { mergeTerminalToolCalls } from '../app/lib/chat/coalesceToolCalls.ts';
import { deriveManySessionTitle } from '../app/lib/chat/manySessionTitle.ts';
import {
  parseUserMessageVisualSegments,
  redactBase64FromText,
} from '../app/lib/chat/userMessageVisual.ts';

test('redactBase64FromText strips data URLs and long base64 blobs', () => {
  const blob = `data:image/png;base64,${'A'.repeat(300)}`;
  assert.equal(redactBase64FromText(blob), '[image]');
  assert.doesNotMatch(redactBase64FromText(`see ${blob}`), /data:image\//);
  const long = 'x'.repeat(400) + 'B'.repeat(600);
  const redacted = redactBase64FromText(long);
  assert.match(redacted, /\[…\]/);
});

test('parseUserMessageVisualSegments resolves dome-att image refs', () => {
  const segments = parseUserMessageVisualSegments('![shot](dome-att://att-1)', [
    { id: 'att-1', dataUrl: 'data:image/png;base64,abc', name: 'shot' },
  ]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.type, 'image');
  if (segments[0]?.type === 'image') {
    assert.equal(segments[0].src, 'data:image/png;base64,abc');
  }
});

test('deriveManySessionTitle skips trivial greetings and uses assistant summary', () => {
  const title = deriveManySessionTitle({
    messages: [
      { role: 'user', content: 'hola' },
      {
        role: 'assistant',
        content: '¡Claro! Voy a crearte un artefacto con todos tus milestones e issues de GitHub.',
      },
    ],
  });
  assert.match(title, /artefacto/i);
  assert.doesNotMatch(title, /^hola$/i);
});

test('harnessMessagesToManyMessages coalesces assistant turn with tool results', () => {
  const raw = [
    { role: 'user', content: 'milestones e issues', timestamp: 1000 },
    {
      role: 'assistant',
      timestamp: 2000,
      content: [
        { type: 'toolCall', id: 'tc1', name: 'github_list_repos', arguments: {} },
      ],
    },
    {
      role: 'toolResult',
      toolCallId: 'tc1',
      toolName: 'github_list_repos',
      details: [{ id: 'ghr-1', name: 'dome' }],
      timestamp: 2100,
    },
    {
      role: 'assistant',
      timestamp: 2200,
      content: [
        { type: 'text', text: 'Tengo los datos.' },
        { type: 'toolCall', id: 'tc2', name: 'artifact_create', arguments: { title: 'Dash' } },
      ],
    },
    {
      role: 'toolResult',
      toolCallId: 'tc2',
      toolName: 'artifact_create',
      details: { resource_id: 'res-1' },
      timestamp: 2300,
    },
    {
      role: 'assistant',
      timestamp: 2400,
      content: [{ type: 'text', text: 'Listo, artefacto creado.' }],
    },
  ];

  const messages = harnessMessagesToManyMessages(raw);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, 'user');
  const assistant = messages[1];
  assert.equal(assistant?.role, 'assistant');
  assert.equal(assistant?.toolCalls?.length, 2);
  assert.equal(assistant?.toolCalls?.[0]?.name, 'github_list_repos');
  assert.ok(assistant?.toolCalls?.[0]?.result !== undefined);
  assert.equal(assistant?.toolCalls?.[1]?.name, 'artifact_create');
  assert.match(assistant?.content ?? '', /Tengo los datos/);
  assert.match(assistant?.content ?? '', /Listo, artefacto creado/);
});

test('mergeManySessionMessages keeps local tool results when thread rows omit payloads', () => {
  const local = [
    {
      id: 'u1',
      role: 'user' as const,
      content: 'hola',
      timestamp: 1,
    },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'Respuesta final',
      timestamp: 2,
      toolCalls: [
        {
          id: 'tc1',
          name: 'github_list_issues',
          arguments: { repo_id: 'ghr-1' },
          status: 'success' as const,
          result: { issues: [{ title: 'Bug' }] },
        },
      ],
    },
  ];
  const db = [
    local[0]!,
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'Respuesta final',
      timestamp: 2,
      toolCalls: [
        {
          id: 'tc1',
          name: 'github_list_issues',
          arguments: { repo_id: 'ghr-1' },
          status: 'success' as const,
        },
      ],
    },
  ];
  const merged = mergeManySessionMessages(local, db);
  assert.equal(merged.filter((m) => m.role === 'assistant').length, 1);
  assert.deepEqual(merged.at(-1)?.toolCalls?.[0]?.result, local[1]?.toolCalls?.[0]?.result);
});

test('mergeTerminalToolCalls keeps streamed results when metadata omits them', () => {
  const merged = mergeTerminalToolCalls(
    [{ id: 'tc1', name: 'github_list_repos', arguments: {}, status: 'success' }],
    [{ id: 'tc1', name: 'github_list_repos', arguments: {}, status: 'success', result: { repos: [] } }],
  );
  assert.deepEqual(merged[0]?.result, { repos: [] });
});
