import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DictationMode from '@/components/transcription/DictationMode';
import TranscriptionHubChrome from '@/components/transcription/TranscriptionHubChrome';
import CallMode from '@/components/transcription/modes/CallMode';
import StreamingMode from '@/components/transcription/modes/StreamingMode';

export type HubMode = 'dictation' | 'call' | 'streaming';

const STORAGE_KEY = 'dome:hub-mode-v1';

const modeStripStyle = {
  borderColor: 'color-mix(in srgb, var(--dome-border) 55%, transparent)',
  background: 'color-mix(in srgb, var(--dome-surface) 96%, transparent)',
} as const;

type Props = {
  onRequestCloseDock: () => void;
};

export default function HubOverlay({ onRequestCloseDock }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<HubMode>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'call' || raw === 'streaming' || raw === 'dictation') return raw;
    } catch {
      /* */
    }
    return 'dictation';
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await window.electron?.transcription?.getSettings?.();
      if (cancelled) return;
      const m = res?.data?.hubDefaultMode;
      if (m && m !== 'remember' && (m === 'dictation' || m === 'call' || m === 'streaming')) {
        setMode(m);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* */
    }
  }, [mode]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1.5 pointer-events-none sm:gap-2">
      <TranscriptionHubChrome onRequestCloseDock={onRequestCloseDock} />
      <div
        className="pointer-events-auto flex w-full max-w-[min(96vw,920px)] flex-wrap items-center justify-center gap-0.5 rounded-xl border px-1 py-0.5 sm:justify-start sm:gap-1 sm:px-1.5 sm:py-1"
        style={modeStripStyle}
      >
        {(['dictation', 'call', 'streaming'] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="min-h-[32px] min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors sm:flex-none sm:px-2.5 sm:text-[11px]"
              style={{
                background: active ? 'color-mix(in srgb, var(--dome-accent) 18%, transparent)' : 'transparent',
                color: active ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                border: active
                  ? '1px solid color-mix(in srgb, var(--dome-accent) 35%, transparent)'
                  : '1px solid transparent',
              }}
            >
              {m === 'dictation'
                ? t('hub.mode.dictation')
                : m === 'call'
                  ? t('hub.mode.call')
                  : t('hub.mode.streaming')}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 w-full min-w-0 max-w-[min(96vw,920px)] justify-center">
        {mode === 'dictation' && <DictationMode isActive hubMode="dictation" />}
        {mode === 'call' && <CallMode isActive />}
        {mode === 'streaming' && <StreamingMode isActive />}
      </div>
    </div>
  );
}
