import { Type } from '@sinclair/typebox';
import catalog from '../../../../packages/tools/src/families/browser-catalog.json';
import { webToolDefinitions } from '../../../../packages/tools/src/families/web';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

/** Renderer-safe schemas; the agent harness executes browser actions in main. */
export function createLocalBrowserTools(): AnyAgentTool[] {
  const search = webToolDefinitions().find(tool => tool.function?.name === 'web_search')!.function!;
  return [search, ...catalog.map(tool => tool.function)].map(definition => ({
    name: definition.name,
    label: definition.name.replaceAll('_', ' '),
    description: definition.description || '',
    parameters: Type.Unsafe(definition.parameters),
    execute: async (_id, args) => {
      if (definition.name === 'web_search') return jsonResult(await window.electron.invoke('native-browser:search', args));
      throw new Error('Browser actions require the main-process agent harness and a conversation-bound session.');
    },
  }));
}
