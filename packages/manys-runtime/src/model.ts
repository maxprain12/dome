import { clampThinkingLevel, resolveDomeModel, type Model } from '@dome/ai';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** What the worker knows about the model a Many runs on. Everything but provider and model is optional. */
export interface ModelChoice {
  provider: string;
  model: string;
  baseUrl?: string;
  /** What the model accepts. A model without `image` is run on text and page text only. */
  input?: ('text' | 'image')[];
  contextWindow?: number;
  /** The most one answer may use. Defaults are picked per kind of model below. */
  maxTokens?: number;
  reasoning?: boolean;
  thinking?: ThinkingLevel;
}

/** A turn of an agent is short: a tool call or a few paragraphs. Reasoning models also spend this on thinking. */
const DEFAULT_ANSWER_TOKENS = 4096;
const DEFAULT_REASONING_ANSWER_TOKENS = 8192;

export interface BuiltModel {
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
}

/**
 * The model for one run: resolved from the catalog the same way the desktop does, with the choice the owner
 * made laid over it (window, output limit, pictures). The answer budget follows the model instead of one
 * number for all: a reasoning model that is cut off in its own thinking returns an empty reply.
 */
export function buildModel(choice: ModelChoice): BuiltModel {
  const resolved = resolveDomeModel({
    provider: choice.provider,
    model: choice.model,
    baseUrl: choice.baseUrl,
    contextWindow: choice.contextWindow,
    input: choice.input,
  });
  const reasoning = choice.reasoning ?? resolved.reasoning ?? false;
  const wanted = choice.maxTokens ?? (reasoning ? DEFAULT_REASONING_ANSWER_TOKENS : DEFAULT_ANSWER_TOKENS);
  const maxTokens = resolved.maxTokens > 0 ? Math.min(wanted, resolved.maxTokens) : wanted;
  const model = { ...resolved, reasoning, maxTokens } as Model<any>;
  const requested: ThinkingLevel = choice.thinking ?? (reasoning ? 'low' : 'off');
  const thinkingLevel = reasoning ? ((clampThinkingLevel(model, requested) ?? 'off') as ThinkingLevel) : 'off';
  return { model, thinkingLevel };
}
