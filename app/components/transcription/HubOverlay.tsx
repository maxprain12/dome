import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeatureFlagEnabled } from '@/lib/analytics/useFeatureFlag';
import DictationMode from '@/components/transcription/DictationMode';
import CallMode from '@/components/transcription/modes/CallMode';
import StreamingMode from '@/components/transcription/modes/StreamingMode';
import { useHubUi } from '@/lib/transcription/hubUiContext';

export type HubMode = 'dictation' | 'call' | 'streaming';

const STORAGE_KEY = 'dome:hub-mode-v1';

const chromeBarStyle = {
  borderColor: 'color-mix(in srgb, var(--dome-border) 55%, transparent)',
  background: 'color-mix(in srgb, var(--dome-bg) 90%, transparent)',
  boxShadow: '0 4px 24px color-mix(in srgb, black 10%, transparent)',
} as const;

export default function HubOverlay() {
  const { t } = useTranslation();
  const hubUi = useHubUi();
  const hubMinimized = hubUi?.hubMinimized ?? false;
  const callsV2 = useFeatureFlagEnabled('dome-calls-v2');
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
    if (!callsV2) return undefined;
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
  }, [callsV2]);

  useEffect(() => {
    if (!callsV2) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* */
    }
  }, [callsV2, mode]);

  const showPicker = callsV2;

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:gap-2.5 pointer-events-none">
      <div
        className="pointer-events-auto flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border px-1.5 py-1.5 sm:gap-2 sm:rounded-2xl sm:px-2 sm:py-1.5"
        style={chromeBarStyle}
      >
        {showPicker ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1">
            {(['dictation', 'call', 'streaming'] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="min-h-[36px] min-w-0 flex-1 rounded-xl px-2.5 py-2 text-[10px] font-medium transition-colors sm:flex-none sm:px-3 sm:py-1.5 sm:text-[11px]"
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
        ) : (
          <span
            className="min-h-[36px] flex flex-1 items-center px-2 text-[10px] font-medium sm:text-[11px]"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            {t('hub.mode.dictation')}
          </span>
        )}

        {hubUi ? (
          <div className="ml-auto flex shrink-0 items-center">
            {hubMinimized ? (
              <button
                type="button"
                onClick={() => hubUi.expandHub()}
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl transition-colors"
                style={{
                  color: 'var(--dome-accent)',
                  background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--dome-accent) 28%, transparent)',
                }}
                title={t('hub.expand_panel')}
                aria-label={t('hub.expand_panel')}
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => hubUi.toggleHubMinimized()}
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl transition-colors"
                style={{
                  color: 'var(--dome-text-muted)',
                  background: 'var(--dome-surface)',
                  border: '1px solid color-mix(in srgb, var(--dome-border) 65%, transparent)',
                }}
                title={t('hub.minimize_panel')}
                aria-label={t('hub.minimize_panel')}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 w-full min-w-0 justify-center">
        {(!callsV2 || mode === 'dictation') && <DictationMode isActive={!callsV2 || mode === 'dictation'} hubMode="dictation" />}
        {callsV2 && mode === 'call' && <CallMode isActive />}
        {callsV2 && mode === 'streaming' && <StreamingMode isActive />}
      </div>
    </div>
  );
}
