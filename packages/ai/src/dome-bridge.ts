/**
 * Dome ↔ pi bridge: resolve legacy `{ provider, model, baseUrl }` settings into pi
 * `Model<TApi>` records and convert usage/text shapes for llm-service.cjs callers.
 */

import { getModel } from './models.js';
import type {
  Api,
  AssistantMessage,
  KnownProvider,
  Model,
  OpenAICompletionsCompat,
  Usage,
} from './types.js';

/** Legacy Dome provider id (Settings / llm-service). */
export type DomeLegacyProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'copilot'
  | 'claude-oauth'
  | 'openai-codex'
  | 'dome'
  | 'minimax'
  | 'deepseek'
  | 'moonshot'
  | 'qwen'
  | 'opencode'
  | 'opencode-go';

export interface ResolveDomeModelOptions {
  provider: DomeLegacyProvider | string;
  model: string;
  baseUrl?: string;
}

const OLLAMA_DEFAULT = 'http://127.0.0.1:11434/v1';
const OPENROUTER_DEFAULT = 'https://openrouter.ai/api/v1';
const MINIMAX_OPENAI = 'https://api.minimax.io/v1';
const MINIMAX_ANTHROPIC = 'https://api.minimax.io/anthropic';
const DEEPSEEK_DEFAULT = 'https://api.deepseek.com/v1';
const MOONSHOT_DEFAULT = 'https://api.moonshot.cn/v1';
const QWEN_DEFAULT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const OPENCODE_DEFAULT = 'https://opencode.ai/zen/v1';
const OPENCODE_GO_DEFAULT = 'https://opencode.ai/zen/go/v1';

function openAiCompletionsModel(
  id: string,
  provider: KnownProvider | string,
  baseUrl: string,
  compat?: OpenAICompletionsCompat,
): Model<'openai-completions'> {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider,
    baseUrl,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
    compat,
  };
}

function anthropicModel(id: string, provider: KnownProvider = 'anthropic'): Model<'anthropic-messages'> {
  const fromCatalog = getModel('anthropic', id as never);
  if (fromCatalog) return fromCatalog as Model<'anthropic-messages'>;
  return {
    id,
    name: id,
    api: 'anthropic-messages',
    provider,
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 8192,
  };
}

/**
 * MiniMax (M-series) speaks the Anthropic Messages API at
 * `https://api.minimax.io/anthropic` (NOT api.anthropic.com). M3 supports a
 * larger 16k output budget. Mirrors legacy `model-factory.cjs` minimax branch.
 */
function minimaxModel(id: string, baseUrl?: string): Model<'anthropic-messages'> {
  const modelId = id || 'MiniMax-M3';
  const isM3 = /^MiniMax-M3$/i.test(modelId);
  return {
    id: modelId,
    name: modelId,
    api: 'anthropic-messages',
    provider: 'minimax',
    baseUrl: baseUrl || MINIMAX_ANTHROPIC,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: isM3 ? 16_384 : 8192,
  };
}

function googleModel(id: string): Model<'google-generative-ai'> {
  const fromCatalog = getModel('google', id as never);
  if (fromCatalog) return fromCatalog as Model<'google-generative-ai'>;
  return {
    id,
    name: id,
    api: 'google-generative-ai',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8192,
  };
}

/**
 * Map Dome Settings provider + model id to a provider `Model` for `stream()` / `complete()`.
 */
export function resolveDomeModel(opts: ResolveDomeModelOptions): Model<Api> {
  const { provider, model, baseUrl } = opts;
  const modelId = model || 'gpt-4o-mini';

  switch (provider) {
    case 'openai': {
      const fromCatalog = getModel('openai', modelId as never);
      if (fromCatalog) return fromCatalog;
      return openAiCompletionsModel(modelId, 'openai', baseUrl || 'https://api.openai.com/v1');
    }
    case 'anthropic':
      return anthropicModel(modelId);
    case 'claude-oauth':
      // Same Anthropic Messages API; OAuth vs API key is detected from the token shape.
      return anthropicModel(modelId);
    case 'openai-codex': {
      const fromCodex = getModel('openai-codex', modelId as never);
      if (fromCodex) {
        return baseUrl ? { ...fromCodex, baseUrl } : fromCodex;
      }
      // Same model ids as OpenAI API / ChatGPT (GPT-5.6 Sol/Terra/Luna) — Codex Responses.
      return {
        id: modelId,
        name: modelId,
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        baseUrl: baseUrl || 'https://chatgpt.com/backend-api',
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_050_000,
        maxTokens: 128_000,
      };
    }
    case 'google':
      return googleModel(modelId);
    case 'ollama':
      return openAiCompletionsModel(
        modelId,
        'ollama',
        baseUrl ? (baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/v1`) : OLLAMA_DEFAULT,
        { supportsUsageInStreaming: false, supportsStore: false },
      );
    case 'openrouter': {
      const fromCatalog = getModel('openrouter', modelId as never);
      if (fromCatalog) return fromCatalog;
      return openAiCompletionsModel(modelId, 'openrouter', baseUrl || OPENROUTER_DEFAULT, {
        thinkingFormat: 'openrouter',
      });
    }
    case 'copilot': {
      const fromCatalog = getModel('github-copilot', modelId as never);
      if (fromCatalog) {
        return baseUrl ? { ...fromCatalog, baseUrl } : fromCatalog;
      }
      return {
        id: modelId,
        name: modelId,
        api: 'openai-responses',
        provider: 'github-copilot',
        baseUrl: baseUrl || 'https://api.githubcopilot.com',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 8192,
      };
    }
    case 'minimax':
      return minimaxModel(modelId, baseUrl);
    case 'dome':
      return openAiCompletionsModel(modelId || 'dome/auto', 'minimax', baseUrl || MINIMAX_OPENAI, {
        supportsUsageInStreaming: true,
        supportsStore: false,
        maxTokensField: 'max_tokens',
      });
    case 'deepseek':
      return openAiCompletionsModel(modelId, 'deepseek', baseUrl || DEEPSEEK_DEFAULT);
    case 'moonshot':
      return openAiCompletionsModel(modelId, 'moonshot', baseUrl || MOONSHOT_DEFAULT);
    case 'qwen':
      return openAiCompletionsModel(modelId, 'qwen', baseUrl || QWEN_DEFAULT);
    case 'opencode': {
      const fromCatalog = getModel('opencode', modelId as never);
      if (fromCatalog) return fromCatalog;
      return openAiCompletionsModel(modelId, 'opencode', baseUrl || OPENCODE_DEFAULT);
    }
    case 'opencode-go': {
      const fromCatalog = getModel('opencode-go', modelId as never);
      if (fromCatalog) return fromCatalog;
      return openAiCompletionsModel(modelId, 'opencode-go', baseUrl || OPENCODE_GO_DEFAULT);
    }
    default: {
      const fromCatalog = getModel(provider as KnownProvider, modelId as never);
      if (fromCatalog) return fromCatalog;
      return openAiCompletionsModel(modelId, provider, baseUrl || OPENROUTER_DEFAULT);
    }
  }
}

/** Legacy llm-service usage shape. */
export interface LegacyUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function domeUsageToLegacy(usage: Usage | null | undefined): LegacyUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
}

export function legacyUsageToDome(usage: LegacyUsage | null): Usage | null {
  if (!usage) return null;
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: usage.totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/** Extract plain text from a pi assistant message (text blocks only). */
export function extractTextFromAssistantMessage(msg: AssistantMessage): string {
  return msg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
