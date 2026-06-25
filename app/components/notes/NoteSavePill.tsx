import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, es, fr, ptBR } from 'date-fns/locale';

export type NoteSavePillState = 'saved' | 'dirty' | 'saving' | 'error';

function pickLocale(language: string) {
  switch (language.split('-')[0]) {
    case 'es':
      return es;
    case 'fr':
      return fr;
    case 'pt':
      return ptBR;
    default:
      return enUS;
  }
}

interface NoteSavePillProps {
  state: NoteSavePillState;
  /** Timestamp ms cuando se persistió bien en disco. */
  lastSavedAt: number | null;
  dirtyHintCmdS?: boolean;
  onClickSave?: () => void;
}

export default function NoteSavePill({
  state,
  lastSavedAt,
  dirtyHintCmdS = true,
  onClickSave,
}: NoteSavePillProps) {
  const { i18n, t } = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const timeLabel =
    state === 'saved' && lastSavedAt
      ? formatDistanceToNowStrict(lastSavedAt, {
          addSuffix: true,
          locale: pickLocale(i18n.language),
        })
      : null;

  /** Copy tipo prototipo antes de que el distancia temporal sea muy legible — nota nueva. */
  const veryFreshSaved =
    state === 'saved' && typeof lastSavedAt === 'number' && Date.now() - lastSavedAt < 90_000;

  const savedText = veryFreshSaved
    ? t('notes.save_saved_fresh')
    : timeLabel !== null
      ? t('notes.save_saved_at', { time: timeLabel })
      : t('notes.save_saved_all');

  const text =
    state === 'dirty'
      ? t('notes.save_dirty')
      : state === 'saving'
        ? t('notes.save_saving')
        : state === 'error'
          ? t('notes.save_error')
          : savedText;

  const mod = navigator.platform?.toUpperCase()?.includes('MAC') ? '⌘S' : 'Ctrl+S';

  return (
    <button
      type="button"
      className={`save-pill note-save-pill ${state}`}
      title={
        state === 'dirty' || state === 'error'
          ? t('notes.save_hint_cmd_s', { kbd: `${mod}` })
          : state === 'saving'
            ? t('notes.save_saving')
            : savedText
      }
      onClick={() => {
        if (state === 'dirty' || state === 'error') onClickSave?.();
      }}
      disabled={state === 'saving'}
      style={{ opacity: state === 'saving' ? 0.85 : undefined }}
    >
      <span className="note-save-dot" aria-hidden />
      <span>{text}</span>
      {state === 'dirty' && dirtyHintCmdS ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.7 }}>{mod}</span>
      ) : null}
    </button>
  );
}
