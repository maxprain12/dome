import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Maximize02Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { openDesktopSocket } from '@/lib/manys/computerChannel';
import { cn } from '@/lib/utils';

type Link = 'connecting' | 'live' | 'lost';

const HEAL_EVERY_MS = 10000;
/** The desktop is drawn at 3:2 by the computer; the box matches so nothing is letterboxed or offset. */
const ASPECT = 'aspect-[1440/960]';

interface Props {
  manyId: string;
  /** The person holds the wheel: the desktop takes the mouse and the keyboard. */
  human: boolean;
  /** The full-size viewer: as large as the window allows, without growing taller than it. */
  large?: boolean;
  onExpand?: () => void;
  /** Takes the wheel again when the computer has forgotten it. Resolves true when it was taken. */
  onResync?: () => Promise<boolean>;
}

/**
 * The computer's whole screen, shared: Many's browser, a terminal, files and whatever else runs on
 * the machine. It is a VNC view (noVNC) over the channel the main process holds. Opened without the
 * wheel it only watches; the connection is reopened when the wheel changes hands.
 */
export default function ManyComputerDesktop({ manyId, human, large = false, onExpand, onResync }: Props) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement | null>(null);
  const rfb = useRef<{ clipboardPasteFrom(text: string): void } | null>(null);
  const humanRef = useRef(human);
  humanRef.current = human;
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;
  const lastHeal = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState<Link>('connecting');
  const [notice, setNotice] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const target = host.current;
    if (!target) return undefined;
    let cancelled = false;
    let teardown = () => {};
    setLink('connecting');
    setNotice('');
    void import('@novnc/novnc').then(({ default: RFB }) => {
      if (cancelled) return;
      const socket = openDesktopSocket(manyId, (message) => {
        if (cancelled || message.type !== 'error') return;
        const code = typeof message.error === 'string' && /^[a-z_]+$/.test(message.error) ? message.error : 'generic';
        setNotice(code);
        // This person holds the wheel as far as the server knows, but the computer disagrees (it
        // restarted): ask for it again once, quietly, and reconnect with input enabled.
        if (code === 'take_control_first' && humanRef.current && resyncRef.current && Date.now() - lastHeal.current > HEAL_EVERY_MS) {
          lastHeal.current = Date.now();
          void resyncRef.current().then((taken) => { if (taken && !cancelled) setAttempt((value) => value + 1); });
        }
      });
      const view = new RFB(target, socket as unknown as WebSocket, { shared: true });
      view.viewOnly = !humanRef.current;
      view.focusOnClick = humanRef.current;
      view.scaleViewport = true;
      view.resizeSession = false;
      view.background = 'var(--muted)';
      rfb.current = view;
      view.addEventListener('connect', () => { if (!cancelled) setLink('live'); });
      view.addEventListener('disconnect', () => { if (!cancelled) setLink('lost'); });
      view.addEventListener('credentialsrequired', () => view.disconnect());
      teardown = () => {
        rfb.current = null;
        try { view.disconnect(); } catch { /* already closed */ }
      };
    }).catch(() => {
      if (!cancelled) setLink('lost');
    });
    return () => {
      cancelled = true;
      teardown();
      target.replaceChildren();
    };
    // The connection is reopened when the wheel changes hands: its mode is fixed when it opens.
  }, [manyId, human, attempt]);

  useEffect(() => {
    const target = host.current;
    if (!target) return undefined;
    const into = () => setFocused(true);
    const out = () => setFocused(false);
    target.addEventListener('focusin', into);
    target.addEventListener('focusout', out);
    return () => {
      target.removeEventListener('focusin', into);
      target.removeEventListener('focusout', out);
    };
  }, []);

  // Text copied on this computer is put on the remote clipboard; Ctrl+V inside the desktop then pastes it.
  useEffect(() => {
    if (!human || !focused) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text');
      if (text) rfb.current?.clipboardPasteFrom(text);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [human, focused]);

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('relative w-full overflow-hidden rounded-[14px] bg-muted shadow-[0_0_0_1px_var(--hairline)]', ASPECT, large && 'mx-auto max-w-[calc(68vh*1.5)]', human && 'shadow-[0_0_0_2px_var(--warning)]')}>
        <div
          ref={host}
          role="application"
          aria-label={t(human ? 'manys.computer.desktop.human' : 'manys.computer.desktop.watch')}
          className="absolute inset-0 [&>div]:!bg-transparent [&_canvas]:outline-none"
        />
        {onExpand && link === 'live' && (
          <Button type="button" size="icon" variant="outline" className="absolute top-2 right-2 bg-background/85 backdrop-blur-sm" aria-label={t('manys.computer.expand')} title={t('manys.computer.expand')} onClick={onExpand}>
            <HugeiconsIcon icon={Maximize02Icon} size={16} />
          </Button>
        )}
        {link !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center">
            {link === 'connecting' ? (
              <span className="text-muted-foreground">{t('manys.computer.desktop.connecting')}</span>
            ) : (
              <>
                <span>{t('manys.computer.desktop.lost')}</span>
                <span className="max-w-sm text-muted-foreground">{t('manys.computer.desktop.lostHint')}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                  <HugeiconsIcon icon={Refresh01Icon} size={14} />
                  {t('manys.computer.screen.reconnect')}
                </Button>
              </>
            )}
          </div>
        )}
        {link === 'live' && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2">
            <div className="dome-glass-strong dome-glass-float inline-flex items-center gap-2 rounded-full px-3 py-1">
              <span aria-hidden="true" className={cn('size-[7px] rounded-full', human ? 'bg-warning' : 'bg-success')} />
              <span className="text-xs">{human ? (focused ? t('manys.computer.screen.typing') : t('manys.computer.screen.clickToType')) : t('manys.computer.screen.readOnly')}</span>
            </div>
          </div>
        )}
      </div>
      {notice && <p className="text-muted-foreground" role="status">{t(`manys.computer.notice.${notice}`, { defaultValue: t('manys.computer.notice.generic') })}</p>}
    </div>
  );
}
