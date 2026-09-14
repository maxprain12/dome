const KEY = 'dome.browserActionApprovals';
const ACTIONS = new Set(['browser_click', 'browser_fill', 'browser_select']);
export function actionOrigin(url?: string): string | null {
  try { const parsed = new URL(url || ''); return /^https?:$/.test(parsed.protocol) ? parsed.origin : null; } catch { return null; }
}
async function clientKey(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
export async function readBrowserApprovals(token: string): Promise<string[]> {
  const raw = (await browser.storage.local.get(KEY))[KEY];
  const saved = raw && typeof raw === 'object' ? raw as { client?: unknown; origins?: unknown } : null;
  if (!saved || saved.client !== await clientKey(token) || !Array.isArray(saved.origins)) return [];
  return saved.origins.filter((origin: unknown): origin is string => typeof origin === 'string' && actionOrigin(origin) === origin);
}
export async function setBrowserApproval(token: string, origin: string, allowed: boolean) {
  if (actionOrigin(origin) !== origin) throw new Error('Invalid website origin');
  const current = await readBrowserApprovals(token);
  const origins = allowed ? [...new Set([...current, origin])] : current.filter((item) => item !== origin);
  await browser.storage.local.set({ [KEY]: { client: await clientKey(token), origins } });
  return origins;
}
export async function isBrowserActionApproved(token: string, name: string, pageUrl?: string) {
  const origin = actionOrigin(pageUrl);
  return Boolean(origin && ACTIONS.has(name) && (await readBrowserApprovals(token)).includes(origin) &&
    await browser.permissions.contains({ origins: [`${origin}/*`] }));
}
