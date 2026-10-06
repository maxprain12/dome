import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHarness, Session, InMemorySessionStorage, type SessionTreeEntry, type AgentTool } from '@dome/agent-core';
import { NodeExecutionEnv } from '@dome/agent-core/node';
import { isContextOverflow } from '@dome/ai';
import { buildModel, type ModelChoice } from './model.js';
import { prepareRequestPayload } from './payload.js';
import { buildSystemPrompt, redact, runContextBlock } from './prompt.js';
import { describeTool, fitResultText, schemas, terminalTools, type ToolName } from './tools.js';

export const protocolVersion = 1;

export interface RuntimeInput extends ModelChoice {
  taskId: string; prompt: string; instructions: string; entries: unknown[]; resumeContext: unknown;
  apiKey: string; signal: AbortSignal;
  saveEntry: (entry: Record<string, unknown>) => Promise<void>;
  beforeRequest: () => Promise<void>; usage: (input: number, output: number) => Promise<void>;
  call: (id: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Live text of the turn as it is written. Optional and best effort: it must never fail the run. */
  stream?: (input: { messageId: string; delta: string; end?: boolean }) => void;
}

/** A run is at most this many assistant turns; a long task is continued, not stretched. */
const MAX_TURNS = 40;

type Receipt = { id: string; operation_id: string; state: string; receipt: unknown };

/**
 * A crash may persist an assistant call before its tool receipt. Repair the transcript without dispatching
 * anything; reviewed proposals and receipts remain the authority.
 */
async function repairInterruptedCalls(session: Session, entries: SessionTreeEntry[], actions: Receipt[] | undefined): Promise<void> {
  const pending = new Map<string, { name: string; arguments: unknown }>();
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const message = entry.message;
    if (message.role === 'assistant') for (const part of message.content) if (part.type === 'toolCall') pending.set(part.id, { name: part.name, arguments: part.arguments });
    if (message.role === 'toolResult') pending.delete(message.toolCallId);
  }
  for (const [id, call] of pending) {
    const action = actions?.find((candidate) => candidate.operation_id === id || candidate.id === (call.arguments as Record<string, unknown>)?.actionId);
    await session.appendMessage({
      role: 'toolResult', toolCallId: id, toolName: call.name,
      content: [{ type: 'text', text: JSON.stringify({ interrupted: true, action: action ?? null, instruction: 'Do not repeat an external write. Inspect the reviewed action and its receipt, or ask for reconciliation.' }) }],
      isError: !action || action.state !== 'succeeded', timestamp: Date.now(),
    });
  }
}

/** The harness receives only capability adapters. Its own temp directory is never exposed as a tool. */
export async function run(input: RuntimeInput): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'manys-session-'));
  const storage = new InMemorySessionStorage({ metadata: { id: input.taskId, createdAt: new Date().toISOString() }, entries: input.entries as SessionTreeEntry[] });
  const append = storage.appendEntry.bind(storage);
  storage.appendEntry = async (entry) => { await input.saveEntry(entry as unknown as Record<string, unknown>); await append(entry); };
  const session = new Session(storage);
  await repairInterruptedCalls(session, input.entries as SessionTreeEntry[], (input.resumeContext as { actions?: Receipt[] } | null)?.actions);

  let finished = false;
  const tools: AgentTool[] = (Object.keys(schemas) as ToolName[]).map((name) => ({
    name, label: name, description: describeTool(name), parameters: schemas[name], executionMode: 'sequential' as const,
    execute: async (id, args) => {
      const result = await input.call(id, name, args as Record<string, unknown>);
      const ends = terminalTools.has(name);
      if (ends) finished = true;
      const value = result as Record<string, unknown> | null;
      if (name.startsWith('computer_') && value && typeof value.base64 === 'string') {
        return { content: [{ type: 'image', data: value.base64, mimeType: 'image/png' }, { type: 'text', text: fitResultText({ ...value, base64: undefined }) }], details: {}, terminate: false };
      }
      return { content: [{ type: 'text', text: fitResultText(result) }], details: {}, terminate: ends };
    },
  } as AgentTool));

  const { model, thinkingLevel } = buildModel(input);
  const harness = new AgentHarness({
    env: new NodeExecutionEnv({ cwd }), session, tools, model, thinkingLevel,
    autoCompaction: false,
    shouldStopAfterTurn: ({ newMessages }) => newMessages.filter((message) => message.role === 'assistant').length >= MAX_TURNS,
    systemPrompt: buildSystemPrompt(input.instructions),
    getApiKeyAndHeaders: async () => ({ apiKey: input.apiKey }),
    streamOptions: { maxRetries: 0, timeoutMs: 120000 },
  });
  harness.on('before_provider_request', async () => { input.signal.throwIfAborted(); await input.beforeRequest(); return undefined; });
  // The payload is shaped by the model library for the API in use (token limit fields included). Here it is
  // only trimmed: old pictures and old large tool results go, and a request still over budget fails clearly.
  harness.on('before_provider_payload', async ({ payload }) => { prepareRequestPayload(payload); return undefined; });

  let reply = '';
  let turn = 0;
  let liveId = '';
  const live = (delta: string, end?: boolean) => { try { input.stream?.({ messageId: liveId, delta, end }); } catch { /* watching is optional */ } };
  harness.subscribe(async (event) => {
    if (event.type === 'message_start' && event.message.role === 'assistant') { turn += 1; liveId = `${input.taskId}:${turn}`; }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta' && liveId) live(event.assistantMessageEvent.delta);
    if (event.type !== 'message_end' || event.message.role !== 'assistant') return;
    if (liveId) live('', true);
    if (['error', 'aborted'].includes(event.message.stopReason)) {
      if (isContextOverflow(event.message, model.contextWindow)) throw new Error('request_context_limit');
      // What the model service said, so a failure can be understood instead of only "outcome unknown".
      const detail = redact(String(event.message.errorMessage ?? '').replace(/\s+/g, ' '), [input.apiKey, input.baseUrl]).slice(0, 300);
      throw new Error(detail ? `model_outcome_unknown: ${detail}` : 'model_outcome_unknown');
    }
    const usage = event.message.usage;
    await input.usage(usage.input + usage.cacheRead + usage.cacheWrite, usage.output);
    reply = event.message.stopReason === 'stop' ? event.message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('').trim() : '';
  });

  const abort = () => { void harness.abort(); };
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    input.signal.throwIfAborted();
    const context = runContextBlock(input.resumeContext);
    await harness.prompt(input.entries.length ? `Continue this task from the persisted checkpoints and reviewed actions.${context}` : `${input.prompt}${context}`);
    // A plain-text turn that ends on its own is the answer to the person: record it as the
    // outcome instead of leaving the task paused with the reply unseen.
    if (!finished && reply) await input.call(randomUUID(), 'finish_task', { text: reply });
  } finally {
    input.signal.removeEventListener('abort', abort);
    await rm(cwd, { recursive: true, force: true });
  }
}
