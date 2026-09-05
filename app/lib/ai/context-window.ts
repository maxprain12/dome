import { db } from '@/lib/db/client';
import { isLocalChatProvider } from '@/lib/ai/models';

export const LOCAL_CHAT_CONTEXT_FALLBACK = 32_768;
export const CLOUD_CHAT_CONTEXT_FALLBACK = 200_000;

export function contextWindowSettingKey(provider: string): string {
  return `ai_context_window_${String(provider || '').trim().toLowerCase()}`;
}

export function parseContextWindow(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function fallbackContextWindow(provider: string): number {
  return isLocalChatProvider(provider) ? LOCAL_CHAT_CONTEXT_FALLBACK : CLOUD_CHAT_CONTEXT_FALLBACK;
}

export async function readPersistedContextWindow(provider: string): Promise<number> {
  if (!provider || !db.isAvailable()) return 0;
  const res = await db.getSetting(contextWindowSettingKey(provider));
  return parseContextWindow(res.data);
}

export async function persistContextWindow(provider: string, tokens: number): Promise<void> {
  const n = parseContextWindow(tokens);
  if (!n || !provider || !db.isAvailable()) return;
  await db.setSetting(contextWindowSettingKey(provider), String(n));
  globalThis.window?.dispatchEvent(new Event('dome:ai-config-changed'));
}
