import { Type } from '@sinclair/typebox';
import { useManyStore } from '@/lib/store/useManyStore';
import { memoryToolDefinitions } from './memory-tool-definitions';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';
import { isElectronAI } from '@/lib/utils/formatting';
const RememberFactSchema = Type.Object({
  key: Type.String({
    description: 'Short label for the memory (e.g. "user_name", "preferred_language", "research_topic").',
  }),
  value: Type.String({
    description: 'The fact to remember.',
  }),
  domain: Type.Optional(
    Type.Union([
      Type.Literal('general'),
      Type.Literal('social'),
      Type.Literal('email'),
    ], {
      description: 'general (MEMORY.md), social, or email domain pack',
    }),
  ),
});

const rememberFactDef = memoryToolDefinitions().find((d) => d.function?.name === 'remember_fact');

export function createRememberFactTool(): AnyAgentTool {
  const canonicalDesc =
    rememberFactDef?.function?.description ??
    'Save an important fact about the user to long-term memory.';
  return {
    label: 'Remember Fact',
    name: 'remember_fact',
    description: canonicalDesc,
    parameters: RememberFactSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Not in Electron environment' });
        }
        const params = args as Record<string, unknown>;
        const key = typeof params.key === 'string' ? params.key : '';
        const value = typeof params.value === 'string' ? params.value : '';
        const domain = typeof params.domain === 'string' ? params.domain : 'general';
        const result = await window.electron.personality.rememberFact(key, value, domain, useManyStore.getState().currentSessionId || undefined);
        if (!result.success) throw new Error(result.error || 'Memory could not be saved');
        return jsonResult({ status: 'success', message: `Remembered: ${key}`, domain });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}
export function createMemoryTools(): AnyAgentTool[] { return [createRememberFactTool()]; }
