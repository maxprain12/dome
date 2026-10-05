import { describe, expect, it } from 'vitest';
import type { ManyDetail, Task } from './api';
import { buildCloudGroups, buildCloudMessages, toolCallsOf } from './cloudChat';
import type { LiveRun } from './liveRuns';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, prompt: 'p', state: 'completed', question: null, result: null, ...extra });
const detail = (messages: ManyDetail['messages'], tasks: Task[] = []): ManyDetail => ({
  many: { id: 'm', name: 'Peregrini', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: [] } },
  conversations: [{ id: 'c' }], tasks, messages, actions: [], recurrences: [], conflicts: [], computer: null,
} as unknown as ManyDetail);
const run = (taskId: string, items: LiveRun['items'], ended = false): LiveRun => ({ taskId, manyId: 'm', items, ended, touched: 0 });
const tool = (callId: string, name: string, done = true, ok: boolean | null = true) => ({ kind: 'tool' as const, callId, tool: name, operation: null, host: null, done, ok });

describe('the cloud conversation as the local one draws it', () => {
  it('turns saved messages into turns and hangs a finished run\'s tools from its reply', () => {
    const groups = buildCloudGroups({
      detail: detail([{ id: 'u1', role: 'user', content: 'abre instagram', task_id: 't1' }, { id: 'a1', role: 'assistant', content: 'Listo', task_id: 't1' }], [task('t1')]),
      runs: { t1: run('t1', [tool('c1', 'computer_navigate'), tool('c2', 'computer_snapshot', true, false)], true) },
      inFlight: [], question: null,
    });
    expect(groups.map((group) => group.map((message) => message.role))).toEqual([['user'], ['assistant']]);
    expect(groups[1][0].toolCalls?.map((call) => [call.name, call.status])).toEqual([['computer_navigate', 'success'], ['computer_snapshot', 'error']]);
  });

  it('shows the reply as it is written, with the tools placed after the text before them', () => {
    const live = run('t2', [{ kind: 'text', id: 'x', text: 'Voy a abrirla' }, tool('c1', 'computer_navigate', false, null)]);
    const [message] = buildCloudMessages({ detail: detail([{ id: 'u', role: 'user', content: 'hola', task_id: 't2' }].slice(0, 0), [task('t2', { state: 'running' })]), runs: { t2: live }, inFlight: [task('t2', { state: 'running' })], question: null });
    expect(message).toMatchObject({ role: 'assistant', isStreaming: true, content: 'Voy a abrirla' });
    expect(message.toolCalls?.[0]).toMatchObject({ name: 'computer_navigate', status: 'running' });
    expect(message.toolCalls?.[0].contentOffset).toBeGreaterThan('Voy a abrirla'.length - 1);
  });

  it('says nothing for a turn that has neither text nor tools yet, and not twice for one that has its reply', () => {
    const quiet = buildCloudMessages({ detail: detail([], [task('t3', { state: 'queued' })]), runs: {}, inFlight: [task('t3', { state: 'queued' })], question: null });
    expect(quiet).toEqual([]);
    const answered = buildCloudMessages({
      detail: detail([{ id: 'a', role: 'assistant', content: 'ya', task_id: 't4' }], [task('t4', { state: 'running' })]),
      runs: { t4: run('t4', [{ kind: 'text', id: 'x', text: 'ya' }]) }, inFlight: [task('t4', { state: 'running' })], question: null,
    });
    expect(answered).toHaveLength(1);
  });

  it('reads an unsaved result and a pending question as the agent speaking', () => {
    const messages = buildCloudMessages({
      detail: detail([], [task('t5', { result: { text: 'Resumen semanal' } })]), runs: {}, inFlight: [],
      question: task('t6', { state: 'waiting_input', question: '¿Cuál es tu usuario?' }),
    });
    expect(messages.map((message) => message.content)).toEqual(['Resumen semanal', '¿Cuál es tu usuario?']);
    expect(messages.every((message) => message.role === 'assistant')).toBe(true);
  });

  it('uses the saved time of a message and a stable first-seen time for what has none', () => {
    const input = {
      detail: detail([{ id: 'u1', role: 'user', content: 'hola', task_id: 't1', created_at: '2026-10-05T10:00:00Z' }], [task('t1')]),
      runs: {}, inFlight: [], question: task('q', { state: 'waiting_input', question: '¿Cuál?' }),
    };
    const first = buildCloudMessages(input);
    expect(first[0].timestamp).toBe(Date.parse('2026-10-05T10:00:00Z'));
    const second = buildCloudMessages(input);
    expect(second[1].timestamp).toBe(first[1].timestamp);
    expect(first[1].timestamp).toBeGreaterThan(Date.parse('2026-01-01'));
  });

  it('never fabricates tool calls', () => {
    expect(toolCallsOf(undefined)).toEqual([]);
    expect(toolCallsOf(run('x', [{ kind: 'text', id: 'a', text: 'solo texto' }]))).toEqual([]);
  });
});
