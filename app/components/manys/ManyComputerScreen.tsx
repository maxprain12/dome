import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalIcon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { request } from '@/lib/manys/api';
import { openComputerChannel, type ComputerChannel } from '@/lib/manys/computerChannel';
import { isPasteShortcut, keyMessage, mouseMessage, pagePoint, wheelMessage } from '@/lib/manys/screenInput';
import { cn } from '@/lib/utils';

type Link = 'connecting' | 'live' | 'lost';
interface Frame { data: string; width: number; height: number }

const MOVE_INTERVAL_MS = 33;
const PAGE_POLL_MS = 5000;
const BLANK_PAGE = 'about:blank';
const HEAL_EVERY_MS = 10000;
/** The computer words its refusals in English; the person reads them in their own language. */
const KNOWN_REFUSALS: Record<string, string> = {
  'Take control before driving the computer yourself.': 'take_control_first',
  'This screen is still starting. Try that again in a moment.': 'screen_starting',
  'This screen is no longer live. Reopen it to carry on watching.': 'screen_gone',
};
const refusalCode = (raw: unknown): string => {
  const text = typeof raw === 'string' ? raw : '';
  return KNOWN_REFUSALS[text] ?? (/^[a-z_]+$/.test(text) ? text : 'generic');
};

interface Props {
  manyId: string;
  /** The person holds the wheel: the screen takes clicks, keys and scrolling. */
  human: boolean;
  /** A small read-only preview for inline use: no address bar, no controls. */
  compact?: boolean;
  /** Takes the wheel again when the computer has forgotten it. Resolves true when it was taken. */
  onResync?: () => Promise<boolean>;
}

/** The Many's browser as it changes, with the mouse and keyboard going straight to it. */
export default function ManyComputerScreen({ manyId, human, compact = false, onResync }: Props) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const channel = useRef<ComputerChannel | null>(null);
  const size = useRef<{ width: number; height: number } | null>(null);
  const lastMove = useRef(0);
  const humanRef = useRef(human);
  humanRef.current = human;
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState<Link>('connecting');
  const [notice, setNotice] = useState('');
  const [focused, setFocused] = useState(false);
  const [page, setPage] = useState<{ url: string; title: string } | null>(null);
  const [address, setAddress] = useState('');
  const [navigating, setNavigating] = useState(false);
  const lastHeal = useRef(0);
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;

  const paint = useRef<{ next: Frame | null; running: boolean }>({ next: null, running: false });
  const draw = useCallback(async () => {
    if (paint.current.running) return;
    paint.current.running = true;
    try {
      while (paint.current.next) {
        const frame = paint.current.next;
        paint.current.next = null;
        const target = canvas.current;
        if (!target) break;
        try {
          const bytes = Uint8Array.from(atob(frame.data), (char) => char.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
          target.width = bitmap.width;
          target.height = bitmap.height;
          target.getContext('2d')?.drawImage(bitmap, 0, 0);
          size.current = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
        } catch {
          /* the next frame replaces a corrupt one */
        }
      }
    } finally {
      paint.current.running = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: ComputerChannel | null = null;
    setLink('connecting');
    setNotice('');
    void openComputerChannel(manyId, 'stream', {
      onMessage: (message) => {
        if (message.type === 'error') {
          const code = refusalCode(message.error);
          setNotice(code);
          // The server says this person holds the wheel but the computer does not (it restarted):
          // ask for it again once, quietly, instead of leaving a screen that ignores every key.
          if (code === 'take_control_first' && humanRef.current && resyncRef.current && Date.now() - lastHeal.current > HEAL_EVERY_MS) {
            lastHeal.current = Date.now();
            void resyncRef.current().then((taken) => { if (taken && !cancelled) setAttempt((value) => value + 1); });
          }
          return;
        }
        if (message.type !== 'frame' || typeof message.data !== 'string') return;
        const width = typeof message.width === 'number' ? message.width : 1280;
        const height = typeof message.height === 'number' ? message.height : 800;
        if (!(width > 0 && height > 0 && width <= 8192 && height <= 8192)) return;
        setLink('live');
        paint.current.next = { data: message.data, width, height };
        void draw();
      },
      onClose: () => {
        if (!cancelled) setLink('lost');
      },
    }).then((created) => {
      if (cancelled) created.close();
      else {
        opened = created;
        channel.current = created;
      }
    }).catch(() => {
      if (!cancelled) setLink('lost');
    });
    return () => {
      cancelled = true;
      opened?.close();
      channel.current = null;
    };
  }, [manyId, attempt, draw]);

  // Where the browser is. Reading the page is only done while the person is driving, so it never
  // competes with the agent's own calls.
  useEffect(() => {
    if (!human || link !== 'live') return undefined;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await request<{ url?: string; title?: string }>(`/${manyId}/computer`, 'POST', { operation: 'read', parameters: {} });
        const url = result.url;
        if (stopped || typeof url !== 'string') return;
        setPage({ url, title: String(result.title ?? '') });
        setAddress((current) => (document.activeElement?.id === 'many-address' ? current : url === BLANK_PAGE ? '' : url));
      } catch {
        /* the address is a convenience */
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, PAGE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [human, link, manyId]);

  const blankNow = human && link === 'live' && page?.url === BLANK_PAGE;
  useEffect(() => {
    if (blankNow && !compact) document.getElementById('many-address')?.focus();
  }, [blankNow, compact]);

  const send = useCallback((message: Record<string, unknown>) => {
    if (humanRef.current) channel.current?.send(message);
  }, []);
  const point = (event: { clientX: number; clientY: number }) => {
    const target = canvas.current;
    return target && size.current ? pagePoint(size.current, target.getBoundingClientRect(), event) : null;
  };

  useEffect(() => {
    const target = canvas.current;
    if (!target || !human) return undefined;
    const onWheel = (event: WheelEvent) => {
      const where = point(event);
      if (!where) return;
      event.preventDefault();
      send(wheelMessage(where, event));
    };
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
  }, [human, send, link]);

  useEffect(() => {
    if (!focused || !human) return undefined;
    const onPaste = (event: globalThis.ClipboardEvent) => {
      const text = event.clipboardData?.getData('text');
      if (!text) return;
      event.preventDefault();
      send({ type: 'text', text });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [focused, human, send]);

  const pointer = human ? {
    onMouseDown: (event: MouseEvent<HTMLCanvasElement>) => {
      event.currentTarget.focus();
      const where = point(event);
      if (where) send(mouseMessage('pressed', where, event));
    },
    onMouseUp: (event: MouseEvent<HTMLCanvasElement>) => {
      const where = point(event);
      if (where) send(mouseMessage('released', where, event));
    },
    onMouseMove: (event: MouseEvent<HTMLCanvasElement>) => {
      const now = performance.now();
      if (now - lastMove.current < MOVE_INTERVAL_MS) return;
      lastMove.current = now;
      const where = point(event);
      if (where) send(mouseMessage('moved', where, event));
    },
    onContextMenu: (event: MouseEvent<HTMLCanvasElement>) => event.preventDefault(),
    onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => {
      if (isPasteShortcut(event.nativeEvent)) return;
      event.preventDefault();
      send(keyMessage('down', event.nativeEvent));
    },
    onKeyUp: (event: KeyboardEvent<HTMLCanvasElement>) => {
      if (isPasteShortcut(event.nativeEvent)) return;
      event.preventDefault();
      send(keyMessage('up', event.nativeEvent));
    },
    onPaste: (event: ClipboardEvent<HTMLCanvasElement>) => event.preventDefault(),
  } : {};

  const navigate = async (url: string) => {
    setNavigating(true);
    try {
      await request(`/${manyId}/computer`, 'POST', { operation: 'human/navigate', parameters: { url } });
      setNotice('');
    } catch {
      setNotice(t('manys.computer.screen.navigateFailed'));
    } finally {
      setNavigating(false);
    }
  };
  const normalized = (value: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  const blank = human && link === 'live' && page?.url === BLANK_PAGE;

  return (
    <div className="flex flex-col gap-2">
      {!compact && human && <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim()) void navigate(normalized(address.trim()));
        }}
      >
        <Input
          id="many-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          disabled={!human || link !== 'live'}
          placeholder={human ? t('manys.computer.screen.addressPlaceholder') : (page?.title || t('manys.computer.screen.readOnly'))}
          aria-label={t('manys.computer.screen.address')}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="button" variant="outline" size="icon" disabled={!human || link !== 'live' || navigating || !page?.url || page.url === BLANK_PAGE} aria-label={t('manys.computer.screen.reload')} title={t('manys.computer.screen.reload')} onClick={() => { if (page?.url) void navigate(page.url); }}>
          <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
        </Button>
        <Button type="submit" variant="outline" disabled={!human || link !== 'live' || navigating || !address.trim()}>{t('manys.computer.screen.go')}</Button>
      </form>}

      <div className={cn('relative overflow-hidden rounded-[14px] bg-muted shadow-[0_0_0_1px_var(--hairline)]', human && 'shadow-[0_0_0_2px_var(--warning)]')}>
        <canvas
          ref={canvas}
          tabIndex={human ? 0 : -1}
          aria-label={t(human ? 'manys.computer.screen.canvasHuman' : 'manys.computer.screen.canvasWatch')}
          className={cn('block aspect-[1280/800] w-full bg-muted outline-none', human && 'cursor-crosshair', focused && human && 'ring-2 ring-ring ring-inset')}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...pointer}
        />
        {link !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center">
            {link === 'connecting' ? (
              <span className="text-muted-foreground">{t('manys.computer.screen.connecting')}</span>
            ) : (
              <>
                <span>{t('manys.computer.screen.lost')}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                  <HugeiconsIcon icon={Refresh01Icon} size={14} />
                  {t('manys.computer.screen.reconnect')}
                </Button>
              </>
            )}
          </div>
        )}
        {blank && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-background/90 px-3 py-2 text-center text-muted-foreground shadow-[0_0_0_1px_var(--hairline)]">
            {t('manys.computer.screen.blank')}
          </div>
        )}
        {link === 'live' && !compact && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center px-2">
            <div className="dome-glass-strong dome-glass-float inline-flex items-center gap-2 rounded-full px-3 py-1">
              <span aria-hidden="true" className={cn('size-[7px] rounded-full', human ? 'bg-warning' : 'bg-success')} />
              <span className="text-xs">{human ? (focused ? t('manys.computer.screen.typing') : t('manys.computer.screen.clickToType')) : t('manys.computer.screen.readOnly')}</span>
            </div>
          </div>
        )}
      </div>
      {notice && !compact && <p className="text-muted-foreground" role="status">{t(`manys.computer.notice.${notice}`, { defaultValue: t('manys.computer.notice.generic') })}</p>}
    </div>
  );
}
