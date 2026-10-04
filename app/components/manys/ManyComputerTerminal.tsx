import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { openComputerChannel, type ComputerChannel } from '@/lib/manys/computerChannel';

type Link = 'connecting' | 'live' | 'ended';

const decode = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

interface Props {
  manyId: string;
  /** The shell belongs to whoever holds the wheel. */
  human: boolean;
  busy: boolean;
  onTakeControl: () => void;
}

/** A real shell inside the Many's computer: the same bash in /workspace, kept while the computer runs. */
export default function ManyComputerTerminal({ manyId, human, busy, onTakeControl }: Props) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement | null>(null);
  const [link, setLink] = useState<Link>('connecting');
  const [reason, setReason] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!human || !element) return undefined;
    // The terminal keeps the look of the product's dark code surface in both themes.
    const look = getComputedStyle(element.parentElement ?? element);
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: look.fontFamily,
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 4000,
      allowProposedApi: false,
      theme: { background: look.backgroundColor, foreground: look.color, cursor: look.color },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(element);
    const refit = () => {
      try {
        fit.fit();
      } catch {
        /* the panel is not laid out yet */
      }
    };
    refit();
    setLink('connecting');
    setReason('');
    let cancelled = false;
    let channel: ComputerChannel | null = null;
    const input = terminal.onData((data) => channel?.send({ type: 'input', data }));
    const resize = terminal.onResize(({ cols, rows }) => channel?.send({ type: 'resize', cols, rows }));
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    void openComputerChannel(manyId, 'terminal', {
      onMessage: (message) => {
        if (message.type === 'ready') {
          setLink('live');
          refit();
          channel?.send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
          terminal.focus();
        } else if (message.type === 'output' && typeof message.data === 'string') {
          terminal.write(decode(message.data));
        } else if (message.type === 'exit') {
          setReason('exited');
          setLink('ended');
        } else if (message.type === 'error') {
          setReason(typeof message.error === 'string' ? message.error : 'error');
          setLink('ended');
        }
      },
      onClose: () => {
        if (!cancelled) setLink((current) => (current === 'live' || current === 'connecting' ? 'ended' : current));
      },
    }).then((created) => {
      if (cancelled) created.close();
      else {
        channel = created;
        created.send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
      }
    }).catch(() => {
      if (!cancelled) {
        setReason('unavailable');
        setLink('ended');
      }
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      channel?.close();
      terminal.dispose();
    };
  }, [manyId, human, attempt]);

  if (!human) {
    return (
      <div className="dome-card dome-card-plain flex flex-col items-start gap-2 p-4">
        <strong className="text-sm font-semibold">{t('manys.computer.terminal.needControl')}</strong>
        <p className="text-muted-foreground">{t('manys.computer.terminal.needControlHint')}</p>
        <Button type="button" size="sm" disabled={busy} onClick={onTakeControl}>{t('manys.computer.take')}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="dome-term relative h-[min(52vh,420px)] overflow-hidden p-2">
        <div ref={host} className="size-full" />
        {link === 'connecting' && <div className="pointer-events-none absolute right-3 bottom-2 text-xs opacity-70">{t('manys.computer.terminal.connecting')}</div>}
      </div>
      {link === 'ended' && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="grow">{t(`manys.computer.terminal.ended.${reason}`, { defaultValue: t('manys.computer.terminal.ended.error') })}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('manys.computer.terminal.reconnect')}</Button>
        </div>
      )}
      {link === 'live' && <p className="text-xs text-muted-foreground">{t('manys.computer.terminal.hint')}</p>}
    </div>
  );
}
