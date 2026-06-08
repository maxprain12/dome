import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard } from '@/types';
import { previewIntervals, formatInterval } from '@/lib/learn/fsrs';

interface FlashSrsButtonsProps {
  card: Flashcard;
  onReview: (quality: number) => void;
}

const BUTTONS = [
  { quality: 1 as const, cls: 'again', labelKey: 'flashcard.again', fallback: 'Again' },
  { quality: 2 as const, cls: 'hard', labelKey: 'flashcard.difficult', fallback: 'Hard' },
  { quality: 3 as const, cls: 'good', labelKey: 'flashcard.good', fallback: 'Good' },
  { quality: 4 as const, cls: 'easy', labelKey: 'flashcard.easy', fallback: 'Easy' },
] as const;

export default function FlashSrsButtons({ card, onReview }: FlashSrsButtonsProps) {
  const { t } = useTranslation();

  const units = useMemo(
    () => ({
      min: t('flashcard.unit_min', 'min'),
      h: t('flashcard.unit_hour', 'h'),
      d: t('flashcard.unit_day', 'd'),
      mo: t('flashcard.unit_month', 'mo'),
      y: t('flashcard.unit_year', 'y'),
    }),
    [t],
  );

  // FSRS next-interval preview for each rating, computed from the card's memory state.
  const previews = useMemo(() => previewIntervals(card), [card]);

  return (
    <div className="lr-flash-srs">
      {BUTTONS.map((btn) => (
        <button
          key={btn.quality}
          type="button"
          className={`lr-flash-srs-btn ${btn.cls}`}
          onClick={() => onReview(btn.quality)}
          title={t(btn.labelKey, btn.fallback)}
        >
          <span className="lbl">{t(btn.labelKey, btn.fallback)}</span>
          <span className="next">{formatInterval(previews[btn.quality], units)}</span>
        </button>
      ))}
    </div>
  );
}
