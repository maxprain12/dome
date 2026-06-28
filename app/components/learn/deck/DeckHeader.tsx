import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { titleGlyph } from '@/lib/learn/deckItems';

const EMPTY_SOURCE_TITLES: string[] = [];

interface DeckHeaderProps {
  title: string;
  typeLabel: string;
  description?: string;
  sourceTitles?: string[];
  onBack: () => void;
  onStudy?: () => void;
  onGenerate?: () => void;
  onAddMore?: () => void;
}

export default function DeckHeader({
  title,
  typeLabel,
  description,
  sourceTitles = EMPTY_SOURCE_TITLES,
  onBack,
  onStudy,
  onGenerate,
  onAddMore,
}: DeckHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="lr-deck-hd">
      <button type="button" className="lr-deck-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden />
        {t('learn.back_to_library', 'Back to library')}
      </button>
      <div className="lr-deck-row">
        <div className="lr-deck-visual">{titleGlyph(title)}</div>
        <div className="lr-deck-info">
          <span className="lr-deck-info-eyebrow">{typeLabel}</span>
          <h1 className="lr-deck-info-title">{title}</h1>
          {description ? <p className="lr-deck-info-desc">{description}</p> : null}
          {sourceTitles.length > 0 ? (
            <div className="lr-deck-info-sources">
              {sourceTitles.slice(0, 4).map((s) => (
                <span key={s} className="lr-source-chip">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="lr-deck-actions">
          {onStudy ? (
            <button type="button" className="lr-btn lr-btn-primary" onClick={onStudy}>
              {t('flashcard.study', 'Study')}
            </button>
          ) : null}
          {onAddMore ? (
            <button type="button" className="lr-btn lr-btn-ghost lr-btn-sm" onClick={onAddMore}>
              {t('learn.add_more_questions', 'Add more questions')}
            </button>
          ) : null}
          {onGenerate ? (
            <button type="button" className="lr-btn" onClick={onGenerate}>
              {t('learn.generate', 'Generate')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
