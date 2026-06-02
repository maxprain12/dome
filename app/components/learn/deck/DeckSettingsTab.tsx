import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface DeckSettings {
  shuffleByDefault?: boolean;
  timeboxedSessions?: boolean;
}

interface DeckSettingsTabProps {
  title: string;
  deckId?: string;
  settings?: DeckSettings;
  onEdit?: () => void;
  onDelete?: () => void;
  onSettingsChange?: (settings: DeckSettings) => void;
}

export default function DeckSettingsTab({
  title,
  deckId,
  settings,
  onEdit,
  onDelete,
  onSettingsChange,
}: DeckSettingsTabProps) {
  const { t } = useTranslation();
  const [shuffle, setShuffle] = useState(settings?.shuffleByDefault ?? false);
  const [timeboxed, setTimeboxed] = useState(settings?.timeboxedSessions ?? false);

  useEffect(() => {
    setShuffle(settings?.shuffleByDefault ?? false);
    setTimeboxed(settings?.timeboxedSessions ?? false);
  }, [settings]);

  const persist = async (next: DeckSettings) => {
    onSettingsChange?.(next);
    if (!deckId) return;
    await window.electron.db.flashcards.updateDeck({
      id: deckId,
      settings: JSON.stringify(next),
    });
  };

  return (
    <div className="lr-body" style={{ paddingTop: 16, maxWidth: 480 }}>
      <div className="lr-field">
        <span className="lr-field-label">{t('learn.deck_settings_name', 'Deck name')}</span>
        <div className="lr-input" style={{ background: 'var(--bg-secondary)' }}>
          {title}
        </div>
      </div>

      {deckId ? (
        <>
          <label className="lr-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => {
                const next = { shuffleByDefault: e.target.checked, timeboxedSessions: timeboxed };
                setShuffle(e.target.checked);
                void persist(next);
              }}
            />
            <span>{t('learn.settings_shuffle', 'Shuffle by default')}</span>
          </label>
          <label className="lr-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={timeboxed}
              onChange={(e) => {
                const next = { shuffleByDefault: shuffle, timeboxedSessions: e.target.checked };
                setTimeboxed(e.target.checked);
                void persist(next);
              }}
            />
            <span>{t('learn.settings_timeboxed', 'Time-boxed sessions')}</span>
          </label>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {onEdit ? (
          <button type="button" className="lr-btn" onClick={onEdit}>
            {t('ui.edit', 'Edit')}
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" className="lr-btn" onClick={onDelete}>
            {t('ui.delete', 'Delete')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
