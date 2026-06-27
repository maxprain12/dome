/** Renderer-local memory tool OpenAI definitions (mirrors @dome/tools families/memory). */

export const MEMORY_TOOL_NAMES = ['interaction_list', 'remember_fact'] as const;

export type MemoryToolName = (typeof MEMORY_TOOL_NAMES)[number];

type MemoryToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function memoryToolDefinitions(): MemoryToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'interaction_list',
        description: 'List interactions (notes, annotations, chat) for a resource.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            type: { type: 'string', description: 'Filter: note, annotation, chat' },
            limit: { type: 'number', description: 'Max results (default 50)' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remember_fact',
        description: 'Save a user fact to long-term memory (key/value).',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Memory label, e.g. preferred_language' },
            value: { type: 'string', description: 'Fact to remember' },
          },
          required: ['key', 'value'],
        },
      },
    },
  ];
}
