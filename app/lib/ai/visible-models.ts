/**
 * Per-provider visible model lists for selectors (chat, settings, etc.).
 * Full catalog comes from the provider API / @dome/ai; users can extend the default curated set.
 */

import { db } from '@/lib/db/client';
import { appendCustomModelId } from '@/lib/ai/client';
import { DEFAULT_COPILOT_MODEL_IDS, getCopilotModels } from '@/lib/ai/catalogs/copilot';
import { OPENROUTER_CURATED_SPECS } from '@/lib/ai/catalogs/openrouter';
import {
  PROVIDERS,
  getDefaultModelId,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';

const SETTING_KEY = 'ai_visible_models';

/** Providers with the gear icon + modal (excludes Ollama and Dome). */
export const VISIBLE_MODELS_CONFIGURABLE_PROVIDERS: readonly AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'deepseek',
  'moonshot',
  'qwen',
  'copilot',
  'opencode',
  'opencode-go',
] as const;

export type VisibleModelsByProvider = Partial<Record<AIProviderType, string[]>>;

/** Default visible model ids per provider (original curated lists). */
export const DEFAULT_VISIBLE_MODEL_IDS: Readonly<Record<string, readonly string[]>> = {
  openai: ['gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-oss-120b'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  google: [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  minimax: [
    'MiniMax-M3',
    'MiniMax-M2.7',
    'MiniMax-M2.5',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.5-highspeed',
  ],
  openrouter: OPENROUTER_CURATED_SPECS.map((s) => s.id),
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  moonshot: ['kimi-k2-0905-preview'],
  qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-coder-plus'],
  copilot: [...DEFAULT_COPILOT_MODEL_IDS],
  opencode: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'gpt-5.2', 'gemini-3-flash', 'big-pickle'],
  'opencode-go': [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'kimi-k2.6',
    'minimax-m3',
    'qwen3.7-plus',
    'glm-5.2',
  ],
};

export function isVisibleModelsConfigurable(provider: AIProviderType): boolean {
  return (VISIBLE_MODELS_CONFIGURABLE_PROVIDERS as readonly string[]).includes(provider);
}

export function getDefaultVisibleModelIds(provider: AIProviderType): string[] {
  const fromMap = DEFAULT_VISIBLE_MODEL_IDS[provider];
  if (fromMap?.length) return [...fromMap];
  const staticModels = PROVIDERS[provider]?.models ?? [];
  const recommended = staticModels.filter((m) => m.recommended).map((m) => m.id);
  if (recommended.length) return recommended;
  return staticModels.map((m) => m.id);
}

export async function getVisibleModelsByProvider(): Promise<VisibleModelsByProvider> {
  try {
    const r = await db.getSetting(SETTING_KEY);
    if (!r.data?.trim()) return {};
    const parsed = JSON.parse(r.data) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as VisibleModelsByProvider;
    }
    return {};
  } catch {
    return {};
  }
}

export async function saveVisibleModelsByProvider(map: VisibleModelsByProvider): Promise<void> {
  await db.setSetting(SETTING_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('dome:ai-visible-models-changed'));
}

export async function getVisibleModelIds(provider: AIProviderType): Promise<string[]> {
  const map = await getVisibleModelsByProvider();
  const saved = map[provider];
  if (saved?.length) return [...saved];
  return getDefaultVisibleModelIds(provider);
}

export async function setVisibleModelIds(provider: AIProviderType, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const map = await getVisibleModelsByProvider();
  map[provider] = unique;
  await saveVisibleModelsByProvider(map);
}

export function filterModelsByVisibleIds(
  models: ModelDefinition[],
  visibleIds: readonly string[],
): ModelDefinition[] {
  const set = new Set(visibleIds);
  const filtered = models.filter((m) => set.has(m.id));
  const order = new Map(visibleIds.map((id, i) => [id, i]));
  return filtered.sort(
    (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name),
  );
}

/** Static catalog for providers without a remote /models fetch in Settings. */
export function getStaticProviderCatalog(provider: AIProviderType): ModelDefinition[] {
  if (provider === 'copilot') return getCopilotModels();
  return PROVIDERS[provider]?.models ?? [];
}

export function resolveVisibleModelAfterSave(
  provider: AIProviderType,
  currentModelId: string,
  visibleIds: string[],
): string {
  if (visibleIds.includes(currentModelId)) return currentModelId;
  const defaultId = getDefaultModelId(provider);
  if (visibleIds.includes(defaultId)) return defaultId;
  return visibleIds[0] ?? defaultId;
}

/** Register a manual model id and add it to the visible selector list. */
export async function addCustomModelToProvider(
  provider: AIProviderType,
  modelId: string,
): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  await appendCustomModelId(provider, id);
  const visible = await getVisibleModelIds(provider);
  if (!visible.includes(id)) {
    await setVisibleModelIds(provider, [...visible, id]);
  }
}
