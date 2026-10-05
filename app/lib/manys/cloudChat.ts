import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { groupMessagesByRole } from '@/lib/chat/groupMessagesByRole';
import type { ManyMessageData } from '@/lib/many/types';
import type { ManyDetail, Task } from './api';
import type { LiveItem, LiveRun, LiveRuns } from './liveRuns';

const ID_PREFIX = 'cloud:';
const firstSeen = new Map<string, number>();
/** When something with no saved time was first on screen: stable across renders, so the clock does not move. */
function seen(id: string): number {
  let at = firstSeen.get(id);
  if (at === undefined) {
    at = Date.now();
    firstSeen.set(id, at);
  }
  return at;
}

/** The tool calls of a run in the shape the local transcript draws, each placed after the text written before it. */
export function toolCallsOf(run: LiveRun | undefined, textBefore = false): ToolCallData[] {
  if (!run) return [];
  const calls: ToolCallData[] = [];
  let written = 0;
  for (const item of run.items) {
    if (item.kind === 'text') {
      written += item.text.length + 2;
      continue;
    }
    calls.push({
      id: item.callId,
      name: item.tool,
      arguments: { ...(item.operation ? { operation: item.operation } : {}), ...(item.host ? { host: item.host } : {}) },
      status: !item.done ? 'running' : item.ok === false ? 'error' : 'success',
      ...(textBefore ? { contentOffset: written } : {}),
    });
  }
  return calls;
}

const liveText = (items: LiveItem[]): string => items.flatMap((item) => (item.kind === 'text' ? [item.text] : [])).join('\n\n');

export interface CloudChatInput {
  detail: ManyDetail;
  runs: LiveRuns;
  /** Tasks the agent has not finished: their text and tool calls arrive live. */
  inFlight: Task[];
  /** The question the agent is waiting on, said as the agent's own message. */
  question: Task | null;
}

/**
 * The conversation of a cloud Many as the local Many draws it: turns of messages, the agent's tool
 * calls inside its reply, and the reply as it is being written. A message that has no saved time (a
 * reply still being written, a question, a result never saved as a message) takes the time it was first seen.
 */
export function buildCloudMessages({ detail, runs, inFlight, question }: CloudChatInput): ManyMessageData[] {
  const messages: ManyMessageData[] = [];
  const lastOfTask = new Map<string, number>();
  detail.messages.forEach((message) => {
    const role = message.role === 'user' ? 'user' : 'assistant';
    const saved = message.created_at ? Date.parse(message.created_at) : Number.NaN;
    messages.push({ id: `${ID_PREFIX}${message.id}`, role, content: message.content, timestamp: Number.isNaN(saved) ? seen(`${ID_PREFIX}${message.id}`) : saved });
    if (role === 'assistant') lastOfTask.set(message.task_id, messages.length - 1);
  });
  // The tools a finished turn used hang from its reply.
  for (const [taskId, at] of lastOfTask) {
    const calls = toolCallsOf(runs[taskId]);
    if (calls.length) messages[at] = { ...messages[at], toolCalls: calls };
  }
  const spoken = new Set(detail.messages.map((message) => message.content));
  // A result that was never saved as a message (a recurring check) still reads as the agent's reply.
  for (const task of [...detail.tasks].reverse()) {
    const text = task.result?.text;
    if (text && !spoken.has(text)) messages.push({ id: `${ID_PREFIX}result:${task.id}`, role: 'assistant', content: text, timestamp: seen(`${ID_PREFIX}result:${task.id}`), toolCalls: toolCallsOf(runs[task.id]) });
  }
  for (const task of [...inFlight].reverse()) {
    if (detail.messages.some((message) => message.task_id === task.id && message.role !== 'user')) continue;
    const run = runs[task.id];
    const text = run ? liveText(run.items) : '';
    const calls = toolCallsOf(run, true);
    if (!text && calls.length === 0) continue;
    messages.push({ id: `${ID_PREFIX}live:${task.id}`, role: 'assistant', content: text, timestamp: seen(`${ID_PREFIX}live:${task.id}`), isStreaming: true, toolCalls: calls });
  }
  if (question?.question) messages.push({ id: `${ID_PREFIX}question:${question.id}`, role: 'assistant', content: question.question, timestamp: seen(`${ID_PREFIX}question:${question.id}`) });
  return messages;
}

export function buildCloudGroups(input: CloudChatInput): ManyMessageData[][] {
  return groupMessagesByRole(buildCloudMessages(input));
}
