/**
 * OpenRouter presets (merged dynamically with GET /models in Settings).
 */

export interface OpenRouterCuratedSpec {
  id: string;
  name: string;
  reasoning: boolean;
  readonly input: readonly ('text' | 'image')[];
  contextWindow: number;
  maxTokens: number;
  recommended?: boolean;
  description?: string;
}

export const OPENROUTER_CURATED_SPECS: OpenRouterCuratedSpec[] = [
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200_000,
    maxTokens: 8192,
    recommended: true,
    description: 'Anthropic Claude Sonnet via OpenRouter',
  },
  {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude Opus 4.5',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200_000,
    maxTokens: 8192,
    description: 'Anthropic Claude Opus via OpenRouter',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128_000,
    maxTokens: 16_384,
    description: 'OpenAI GPT-4o',
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 256_000,
    maxTokens: 16_384,
    description: 'OpenAI GPT-5.2',
  },
  {
    id: 'google/gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1_048_576,
    maxTokens: 8192,
    description: 'Google Gemini 2.5 Flash',
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1_048_576,
    maxTokens: 8192,
    description: 'Google Gemini 2.5 Pro',
  },
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 131_072,
    maxTokens: 8192,
    description: 'Meta Llama 4 Maverick',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    reasoning: false,
    input: ['text'],
    contextWindow: 128_000,
    maxTokens: 8192,
    description: 'DeepSeek Chat',
  },
  {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    name: 'Mistral Small 3.2 24B',
    reasoning: false,
    input: ['text'],
    contextWindow: 128_000,
    maxTokens: 8192,
    description: 'Mistral Small instruct',
  },
];
