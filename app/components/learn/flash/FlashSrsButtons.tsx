import { useTranslation } from 'react-i18next';
import type { Flashcard } from '@/types';
import { previewNextInterval } from '@/lib/learn/srs';

interface FlashSrsButtonsProps {
  card: Flashcard;
  onReview: (quality: number) => void;
}

const BUTTONS = [
  { quality: 1, cls: 'again', labelKey: 'flashcard.again', fallback: 'Again' },
  { quality: 2, cls: 'hard', labelKey: 'flashcard.difficult', fallback: 'Hard' },
  { quality: 3, cls: 'good', labelKey: 'flashcard.good', fallback: 'Good' },
  { quality: 4, cls: 'easy', labelKey: 'flashcard.easy', fallback: 'Easy' },
] as const;

export default function FlashSrsButtons({ card, onReview }: FlashSrsButtonsProps) {
  const { t } = useTranslation();

  return (
    <div className="lr-flash-srs">
      {BUTTONS.map((btn) => {
        const preview = previewNextInterval(
          {
            ease_factor: card.ease_factor,
            interval: card.interval,
            repetitions: card.repetitions,
          },
          btn.quality,
        );
        return (
          <button
            key={btn.quality}
            type="button"
            className={`lr-flash-srs-btn ${btn.cls}`}
            onClick={() => onReview(btn.quality)}
          >
            <span className="lbl">{t(btn.labelKey, btn.fallback)}</span>
            <span className="next">{preview.label}</span>
          </button>
        );
      })}
    </div>
  );
}
