import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '@/lib/store/useTabStore';
import { Button } from '@/components/ui/button';

export default function NativeBrowserPage({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const active = useTabStore((state) => state.activeTabId === `browser:${sessionId}`);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active || !container.current) return;
    let alive = true;
    const attach = async () => {
      const box = container.current?.getBoundingClientRect();
      if (!box || !box.width || !box.height) return;
      const response = await window.electron.invoke('native-browser:attach', {
        sessionId, bounds: { x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)), width: Math.floor(box.width), height: Math.floor(box.height) },
      });
      if (alive && !response.success) setError(response.error || t('native_browser.closed'));
    };
    const observer = new ResizeObserver(() => { void attach(); });
    observer.observe(container.current);
    window.addEventListener('resize', attach);
    void attach();
    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener('resize', attach);
      void window.electron.invoke('native-browser:detach', { sessionId });
    };
  }, [active, sessionId, t]);
  useEffect(() => () => { void window.electron.invoke('native-browser:close', { sessionId }); }, [sessionId]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <p className="text-sm text-muted-foreground">{t('native_browser.recovery_help')}</p>
        <Button variant="outline" onClick={() => useTabStore.getState().closeTab(`browser:${sessionId}`)}>{t('common.close')}</Button>
      </div>
      {error ? <p role="alert" className="p-4 text-sm text-destructive">{error}</p> : null}
      <div ref={container} className="min-h-0 flex-1" />
    </div>
  );
}
