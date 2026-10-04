import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/lib/manys/api';
import { cn } from '@/lib/utils';

type Drawer = 'terminal' | 'files' | 'activity';
const DRAWERS: readonly Drawer[] = ['terminal', 'files', 'activity'];
const labelClass = 'block text-xs leading-[1.3] font-semibold';

/** Seconds between automatic captures while someone is watching an active computer. */
const LIVE_REFRESH_MS = 4000;

export default function ManyComputer({ manyId, control, live }: { manyId: string; control: string; live: boolean }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<Record<string, unknown>>({});
  const [screen, setScreen] = useState<{ base64: string; width: number; height: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>('terminal');
  const [log, setLog] = useState<{ at: number; operation: string }[]>([]);

  const call = async (operation: string, parameters: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const response = await request<Record<string, unknown>>(`/${manyId}/computer`, 'POST', { operation, parameters });
      setResult(response);
      setLog((current) => [{ at: Date.now(), operation }, ...current].slice(0, 50));
      if (typeof response.base64 === 'string') setScreen({ base64: response.base64, width: Number(response.width ?? 1280), height: Number(response.height ?? 800) });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    } finally {
      setBusy(false);
    }
  };
  const human = control === 'human';
  const idle = useRef(true);
  idle.current = !busy;
  // While the agent is using the computer, or the person is driving it, the screen refreshes by
  // itself. An idle computer is never polled: a capture would start its container.
  useEffect(() => {
    if (!live && !human) return undefined;
    const timer = setInterval(() => {
      if (!idle.current || document.visibilityState !== 'visible') return;
      void request<Record<string, unknown>>(`/${manyId}/computer`, 'POST', { operation: 'screenshot', parameters: {} })
        .then((response) => {
          if (typeof response.base64 === 'string') setScreen({ base64: response.base64, width: Number(response.width ?? 1280), height: Number(response.height ?? 800) });
        })
        .catch(() => { /* the next tick tries again; a stale frame is better than an error flash */ });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, human, manyId]);
  const toggleControl = () => {
    void call(human ? 'leave' : 'enter');
  };
  const thenShot = (operation: string, parameters?: Record<string, unknown>) => {
    void call(operation, parameters).then(() => call('screenshot'));
  };
  const shown = { ...result, base64: undefined, computerId: undefined, generation: undefined };

  return (
    <section className="flex flex-col gap-3">
      {error && <Alert variant="destructive"><AlertDescription>{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.service_unavailable') })}</AlertDescription></Alert>}

      <div className="flex items-center gap-2 rounded-[14px] bg-muted px-3 py-2.5">
        <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', human ? 'bg-warning' : 'bg-success')} />
        <span className="min-w-0 grow">
          <strong className="font-semibold">{t(human ? 'manys.controlHuman' : 'manys.controlAgent')}</strong> {t(human ? 'manys.controlHumanHint' : 'manys.controlAgentHint')}
        </span>
        <Button type="button" size="sm" variant={human ? 'outline' : 'default'} disabled={busy} onClick={toggleControl}>
          {t(human ? 'manys.releaseControl' : 'manys.takeControl')}
        </Button>
      </div>
      {control === 'snapshot_required' && <p className="text-muted-foreground">{t('manys.snapshotHint')}</p>}

      <div className={cn('relative aspect-[1280/800] overflow-hidden rounded-[14px] bg-muted shadow-[0_0_0_1px_var(--hairline),0_4px_16px_oklch(0_0_0/0.08)]', human && 'shadow-[0_0_0_2px_var(--warning),0_4px_16px_oklch(0_0_0/0.08)]')}>
        {screen ? (
          <button
            type="button"
            disabled={busy || !human}
            aria-label={t('manys.clickScreen')}
            className="block size-full"
            onClick={(e) => {
              const image = e.currentTarget.querySelector('img');
              if (!image) return;
              const bounds = image.getBoundingClientRect();
              const x = e.detail ? (e.clientX - bounds.left) * screen.width / bounds.width : screen.width / 2;
              const y = e.detail ? (e.clientY - bounds.top) * screen.height / bounds.height : screen.height / 2;
              thenShot('human/click', { x, y });
            }}
          >
            <img src={`data:image/png;base64,${screen.base64}`} alt={t('manys.screen')} className="size-full object-cover" />
          </button>
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">{t('manys.noScreen')}</div>
        )}
        <div className="absolute inset-x-0 bottom-3 flex justify-center px-2">
          <div className="dome-glass-strong dome-glass-float inline-flex flex-wrap items-center justify-center gap-0.5 rounded-full p-[5px]">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void call('screenshot'); }}>{t('manys.screen')}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void call('snapshot'); }}>{t('manys.snapshot')}</Button>
            <span className="mx-1 h-[18px] w-px bg-[var(--hairline)]" />
            <Button type="button" size="sm" variant="ghost" disabled={busy || !human} onClick={() => thenShot('human/key', { key: 'Enter' })}>{t('manys.enter')}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || !human} onClick={() => thenShot('human/scroll', { deltaY: 600 })}>{t('manys.scroll')}</Button>
          </div>
        </div>
      </div>

      <div className="h-px bg-[var(--hairline)]" />
      <div className={cn(labelClass, 'text-[11px] text-muted-foreground')}>{t('manys.manualControl')}</div>
      {!human && <p className="text-muted-foreground">{t('manys.manualHint')}</p>}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          thenShot('human/navigate', { url: new FormData(e.currentTarget).get('url') });
        }}
      >
        <Input name="url" type="url" required disabled={!human} placeholder="https://" aria-label={t('manys.browserUrl')} />
        <Button type="submit" variant="outline" disabled={busy || !human}>{t('manys.go')}</Button>
      </form>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const text = new FormData(e.currentTarget).get('text');
          e.currentTarget.reset();
          thenShot('human/type', { text });
        }}
      >
        <Input name="text" type="text" autoComplete="off" required disabled={!human} placeholder={t('manys.typeText')} aria-label={t('manys.typeText')} />
        <Button type="submit" variant="outline" disabled={busy || !human}>{t('manys.type')}</Button>
      </form>

      <div className="dome-card dome-card-plain flex flex-col overflow-hidden">
        <div className="border-b border-[var(--hairline)] p-2">
          <Tabs value={drawer} onValueChange={(value) => setDrawer(value as Drawer)}>
            <TabsList className="h-7">
              {DRAWERS.map((id) => (
                <TabsTrigger key={id} value={id} className="h-[22px] text-xs">{t(`manys.drawer.${id}`)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-2 p-2">
          {drawer === 'terminal' && (
            <>
              <pre className="dome-term max-h-56 min-h-16 overflow-auto whitespace-pre-wrap">{JSON.stringify(shown, null, 2)}</pre>
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void call('human/exec', { command: new FormData(e.currentTarget).get('command'), timeoutMs: 10000 });
                }}
              >
                <span className="font-mono text-muted-foreground">$</span>
                <Input id="many-terminal" name="command" disabled={!human} required className="font-mono" aria-label={t('manys.terminal')} placeholder={t('manys.terminalPlaceholder')} />
                <Button type="submit" variant="outline" disabled={busy || !human}>{t('manys.run')}</Button>
              </form>
            </>
          )}
          {drawer === 'files' && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} className="w-fit" onClick={() => { void call('files/list'); }}>{t('manys.files')}</Button>
              <pre className="dome-term max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify(shown, null, 2)}</pre>
            </>
          )}
          {drawer === 'activity' && (
            <ul className="flex flex-col gap-1.5 p-1">
              {log.length === 0 && <li className="text-muted-foreground">{t('manys.noActivity')}</li>}
              {log.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex items-center gap-2.5">
                  <span className="font-mono text-muted-foreground">{new Date(entry.at).toLocaleTimeString()}</span>
                  <span>{entry.operation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
