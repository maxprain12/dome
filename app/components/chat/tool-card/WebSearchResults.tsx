import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { showDomeBrowser } from '@/lib/browser/openDomeBrowser';

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
      {(data.results || []).filter((item) => /^https?:\/\//.test(item.url)).map((item) => (
        <div key={item.url} className="rounded-md border p-3">
          <a href={item.url} onClick={event => { event.preventDefault(); void openDomeHref(item.url); }} className="font-medium text-primary underline underline-offset-4">{item.title}</a>
          <p className="text-xs text-muted-foreground">{item.siteName}</p>
          {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
