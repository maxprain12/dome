/**
 * Dome ↔ pi bridge: resolve legacy `{ provider, model, baseUrl }` settings into pi
 * `Model<TApi>` records and convert usage/text shapes for llm-service.cjs callers.
 */

import { getBuiltinModel as getModel, type BuiltinProvider } from './providers/all.js';
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
  | 'opencode-go'
  | 'vllm'
  | 'lmstudio';

export interface ResolveDomeModelOptions {
  provider: DomeLegacyProvider | string;
  model: string;
  baseUrl?: string;
  /** Persisted or server-reported window. Overrides the resolver default. */
  contextWindow?: number;
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
const VLLM_DEFAULT = 'http://127.0.0.1:8000/v1';
const LMSTUDIO_DEFAULT = 'http://127.0.0.1:1234/v1';

function openAiCompletionsModel(
  id: string,
  provider: KnownProvider | string,
  baseUrl: string,
  compat?: OpenAICompletionsCompat,
  contextWindow = 128_000,
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
    contextWindow,
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

/** Prefer catalog entry; otherwise build an OpenAI-completions model. */
function catalogOrOpenAiCompletions(
  catalogProvider: BuiltinProvider,
  modelId: string,
  provider: KnownProvider | string,
  baseUrl: string,
  compat?: OpenAICompletionsCompat,
): Model<Api> {
  const fromCatalog = getModel(catalogProvider, modelId as never);
  if (fromCatalog) return fromCatalog;
  return openAiCompletionsModel(modelId, provider, baseUrl, compat);
}

function withOptionalBaseUrl<T extends Model<Api>>(model: T, baseUrl?: string): T {
  return baseUrl ? { ...model, baseUrl } : model;
}

function resolveOpenaiModel(modelId: string, baseUrl?: string): Model<Api> {
  return catalogOrOpenAiCompletions('openai', modelId, 'openai', baseUrl || 'https://api.openai.com/v1');
}

function resolveOpenaiCodexModel(modelId: string, baseUrl?: string): Model<Api> {
  const fromCodex = getModel('openai-codex', modelId as never);
  if (fromCodex) {
    return withOptionalBaseUrl(fromCodex, baseUrl);
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

function openaiCompatBaseUrl(baseUrl: string | undefined, fallback: string): string {
  if (!baseUrl) return fallback;
  if (baseUrl.endsWith('/v1')) return baseUrl;
  return `${baseUrl.replace(/\/$/, '')}/v1`;
}

function ollamaBaseUrl(baseUrl?: string): string {
  return openaiCompatBaseUrl(baseUrl, OLLAMA_DEFAULT);
}

const LOCAL_CHAT_CONTEXT_FALLBACK = 32_768;

function resolveLocalOpenAiCompatModel(
  provider: 'vllm' | 'lmstudio',
  modelId: string,
  baseUrl?: string,
): Model<'openai-completions'> {
  const fallback = provider === 'vllm' ? VLLM_DEFAULT : LMSTUDIO_DEFAULT;
  return openAiCompletionsModel(
    modelId,
    provider,
    openaiCompatBaseUrl(baseUrl, fallback),
    {
      supportsUsageInStreaming: false,
      supportsStore: false,
    },
    LOCAL_CHAT_CONTEXT_FALLBACK,
  );
}

function resolveOllamaModel(modelId: string, baseUrl?: string): Model<'openai-completions'> {
  return openAiCompletionsModel(
    modelId,
    'ollama',
    ollamaBaseUrl(baseUrl),
    {
      supportsUsageInStreaming: false,
      supportsStore: false,
    },
    LOCAL_CHAT_CONTEXT_FALLBACK,
  );
}

function resolveOpenrouterModel(modelId: string, baseUrl?: string): Model<Api> {
  return catalogOrOpenAiCompletions('openrouter', modelId, 'openrouter', baseUrl || OPENROUTER_DEFAULT, {
    thinkingFormat: 'openrouter',
  });
}

function resolveCopilotModel(modelId: string, baseUrl?: string): Model<Api> {
  const fromCatalog = getModel('github-copilot', modelId as never);
  if (fromCatalog) {
    return withOptionalBaseUrl(fromCatalog, baseUrl);
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

function resolveDomeProviderModel(modelId: string, baseUrl?: string): Model<'openai-completions'> {
  return openAiCompletionsModel(modelId || 'dome/auto', 'minimax', baseUrl || MINIMAX_OPENAI, {
    supportsUsageInStreaming: true,
    supportsStore: false,
    maxTokensField: 'max_tokens',
  });
}

function resolveOpencodeModel(modelId: string, baseUrl?: string): Model<Api> {
  return catalogOrOpenAiCompletions('opencode', modelId, 'opencode', baseUrl || OPENCODE_DEFAULT);
}

function resolveOpencodeGoModel(modelId: string, baseUrl?: string): Model<Api> {
  return catalogOrOpenAiCompletions(
    'opencode-go',
    modelId,
    'opencode-go',
    baseUrl || OPENCODE_GO_DEFAULT,
  );
}

function resolveOpenAiCompatProvider(
  provider: 'deepseek' | 'moonshot' | 'qwen',
  modelId: string,
  baseUrl: string | undefined,
  defaultBaseUrl: string,
): Model<'openai-completions'> {
  return openAiCompletionsModel(modelId, provider, baseUrl || defaultBaseUrl);
}

function resolveDefaultProviderModel(
  provider: string,
  modelId: string,
  baseUrl?: string,
): Model<Api> {
  return catalogOrOpenAiCompletions(
    provider as BuiltinProvider,
    modelId,
    provider,
    baseUrl || OPENROUTER_DEFAULT,
  );
}

type DomeModelResolver = (modelId: string, baseUrl?: string) => Model<Api>;

/** Known Dome Settings providers → Model builders (default handled separately). */
const DOME_PROVIDER_RESOLVERS: Record<string, DomeModelResolver> = {
  openai: resolveOpenaiModel,
  anthropic: (modelId) => anthropicModel(modelId),
  // Same Anthropic Messages API; OAuth vs API key is detected from the token shape.
  'claude-oauth': (modelId) => anthropicModel(modelId),
  'openai-codex': resolveOpenaiCodexModel,
  google: (modelId) => googleModel(modelId),
  ollama: resolveOllamaModel,
  openrouter: resolveOpenrouterModel,
  copilot: resolveCopilotModel,
  minimax: (modelId, baseUrl) => minimaxModel(modelId, baseUrl),
  dome: resolveDomeProviderModel,
  deepseek: (modelId, baseUrl) =>
    resolveOpenAiCompatProvider('deepseek', modelId, baseUrl, DEEPSEEK_DEFAULT),
  moonshot: (modelId, baseUrl) =>
    resolveOpenAiCompatProvider('moonshot', modelId, baseUrl, MOONSHOT_DEFAULT),
  qwen: (modelId, baseUrl) => resolveOpenAiCompatProvider('qwen', modelId, baseUrl, QWEN_DEFAULT),
  opencode: resolveOpencodeModel,
  'opencode-go': resolveOpencodeGoModel,
  vllm: (modelId, baseUrl) => resolveLocalOpenAiCompatModel('vllm', modelId, baseUrl),
  lmstudio: (modelId, baseUrl) => resolveLocalOpenAiCompatModel('lmstudio', modelId, baseUrl),
};

/**
 * Map Dome Settings provider + model id to a provider `Model` for `stream()` / `complete()`.
 */
export function resolveDomeModel(opts: ResolveDomeModelOptions): Model<Api> {
  const { provider, model, baseUrl, contextWindow } = opts;
  const modelId = model || 'gpt-4o-mini';
  const resolve = DOME_PROVIDER_RESOLVERS[provider];
  const resolved = resolve
    ? resolve(modelId, baseUrl)
    : resolveDefaultProviderModel(provider, modelId, baseUrl);
  if (typeof contextWindow === 'number' && contextWindow > 0) {
    return { ...resolved, contextWindow };
  }
  return resolved;
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
