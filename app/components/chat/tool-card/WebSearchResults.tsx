import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LinkSquare01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { showToast } from '@/lib/store/useToastStore';
import { showDomeBrowser } from '@/lib/browser/openDomeBrowser';

export function searchResultDomain(url: string): string | null {
  try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.hostname : null; } catch { return null; }
}

export function WebSearchResults({ result }: { result: unknown }) {
  const { t } = useTranslation();
  let value: unknown = result;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const data = value as { recoveryId?: string; searchUrl?: string; status?: string; results?: { title: string; url: string; description?: string; siteName?: string }[] };
  const recover = async () => {
    if (data.searchUrl) { await openDomeHref(data.searchUrl); return; }
    const response = await window.electron.invoke('native-browser:recover', { recoveryId: data.recoveryId });
    if (!response.success || !response.data?.sessionId) return;
    const sessionId = response.data.sessionId as string;
    showDomeBrowser(sessionId);
  };
  return (
    <div className="flex flex-col gap-2">
      {data.status === 'empty' ? <p className="text-sm text-muted-foreground">{t('native_browser.empty')}</p> : null}
      {data.recoveryId ? <Button variant="outline" onClick={() => { void recover(); }}>{t('native_browser.resolve_captcha')}</Button> : null}
      {!data.recoveryId && data.status === 'captcha' && data.searchUrl ? <Button variant="outline" onClick={() => { void openDomeHref(data.searchUrl!); }}>{t('native_browser.resolve_captcha')}</Button> : null}
      {(data.results || []).filter((item) => searchResultDomain(item.url)).map((item) => (
        <div key={item.url} className="flex flex-col gap-1 border-b py-2 last:border-b-0">
          <a href={item.url} onClick={event => { event.preventDefault(); void openDomeHref(item.url).catch(error => showToast('error', String(error))); }} title={item.url} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-ring"><span>{item.title}</span><HugeiconsIcon icon={LinkSquare01Icon} className="size-3.5 shrink-0" /></a>
          <p className="text-xs text-muted-foreground">{item.siteName || searchResultDomain(item.url)}</p>
          {item.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
