/**
 * @dome/agent-core — model stream parser (pi wire-format).
 *
 * Converts pi `AssistantMessageEvent` chunks from `@dome/ai` into loop
 * `AgentEvent`s and a normalized turn summary for the session / IPC layer.
 */

import type { AssistantMessageEvent, Usage } from '@dome/ai';
import { extractTextFromAssistantMessage } from '@dome/ai';
import type { AgentEvent, AgentToolCall } from '../types.js';

/** Normalized assistant turn for turn_end / done / hooks. */
export interface TurnSummary {
  text: string;
  usage: Usage | null;
  toolCalls?: AgentToolCall[];
  error?: string;
}

export interface StreamParseResult {
  message: TurnSummary;
  toolCalls: AgentToolCall[];
  text: string;
  usage: Usage | null;
  error?: string;
}

function toolCallFromPi(tc: { id: string; name: string; arguments?: Record<string, unknown> }): AgentToolCall {
  return {
    id: tc.id,
    name: tc.name,
    arguments: tc.arguments ?? {},
  };
}

function usageFromPartial(partial: { usage?: Usage } | undefined): Usage | null {
  return partial?.usage ?? null;
}

export async function parseModelStream(
  stream: AsyncIterable<AssistantMessageEvent>,
  emit: (event: AgentEvent) => void,
): Promise<StreamParseResult> {
  let text = '';
  const toolCalls: AgentToolCall[] = [];
  let usage: Usage | null = null;
  let error: string | undefined;
  let providerMessage: import('@dome/ai').AssistantMessage | undefined;

  for await (const event of stream) {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
      throw new TypeError('parseModelStream: malformed stream event');
    }

    switch (event.type) {
      case 'start':
        break;
      case 'text_start':
        break;
      case 'text_delta': {
        if (event.delta) {
          text += event.delta;
          emit({ type: 'text_delta', text: event.delta });
        }
        usage = usageFromPartial(event.partial) ?? usage;
        break;
      }
      case 'text_end':
        usage = usageFromPartial(event.partial) ?? usage;
        break;
      case 'thinking_start':
        break;
      case 'thinking_delta': {
        if (event.delta) {
          emit({ type: 'thinking', text: event.delta });
        }
        break;
      }
      case 'thinking_end':
        break;
      case 'toolcall_start':
        break;
      case 'toolcall_delta':
        break;
      case 'toolcall_end': {
        const call = toolCallFromPi(event.toolCall);
        toolCalls.push(call);
        emit({ type: 'tool_call', call });
        usage = usageFromPartial(event.partial) ?? usage;
        break;
      }
      case 'done': {
        providerMessage = event.message;
        usage = event.message.usage ?? usage;
        if (usage) emit({ type: 'usage', usage });
        break;
      }
      case 'error': {
        error = event.error.errorMessage ?? 'Model error';
        providerMessage = event.error;
        emit({ type: 'error', error });
        break;
      }
      default: {
        const _never: never = event;
        void _never;
        break;
      }
    }
  }

  if (providerMessage) {
    const providerText = extractTextFromAssistantMessage(providerMessage);
    if (providerText) text = providerText;
    usage = providerMessage.usage ?? usage;
    for (const block of providerMessage.content) {
      if (block.type === 'toolCall') {
        const call = toolCallFromPi(block);
        if (!toolCalls.some((c) => c.id === call.id)) {
          toolCalls.push(call);
        }
      }
    }
    if (providerMessage.stopReason === 'error' || providerMessage.stopReason === 'aborted') {
      error = providerMessage.errorMessage ?? error;
    }
  }

  const message: TurnSummary = {
    text,
    usage,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(error ? { error } : {}),
  };

  const resolvedToolCalls = (message.toolCalls ?? toolCalls).map((c) => ({
    id: c.id,
    name: c.name,
    arguments: c.arguments ?? {},
  }));

  return {
    message,
    toolCalls: resolvedToolCalls,
    text: message.text,
    usage: message.usage,
    error,
  };
}
