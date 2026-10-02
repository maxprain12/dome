import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { showDomeBrowser } from '@/lib/browser/openDomeBrowser';

export function BrowserOpenResult({ result }: { result: unknown }) {
  const { t } = useTranslation();
  let value = result;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: { url?: string; sessionId?: string }; url?: string; sessionId?: string }).data || value as { url?: string; sessionId?: string };
  if (!data.url || !/^https?:\/\//i.test(data.url)) return null;
  const open = async () => {
    if (data.sessionId) {
      const response = await window.electron.invoke('native-browser:state', { sessionId: data.sessionId });
      if (response.success) { showDomeBrowser(data.sessionId); return; }
    }
    await openDomeHref(data.url!);
  };
  return <Button variant="outline" onClick={() => { void open(); }}>{t('native_browser.open_in_dome')}</Button>;
}
