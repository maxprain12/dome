import { useEffect, useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/store/useLearnStore';
import FlashSrsButtons from './FlashSrsButtons';

interface FlashPlayerProps {
  onSessionEnd?: () => void;
}

export default function FlashPlayer({ onSessionEnd }: FlashPlayerProps) {
  const { t } = useTranslation();
  const {
    dueCards,
    currentCardIndex,
    isCardFlipped,
    studyStartTime,
    sessionCorrect,
    sessionIncorrect,
    flipCard,
    reviewCard,
    skipCard,
    endStudy,
  } = useLearnStore();

  const currentCard = dueCards[currentCardIndex];
  const isComplete = currentCardIndex >= dueCards.length;
  const totalCards = dueCards.length;
  const [elapsedSec, setElapsedSec] = useState(0);

  const handleEnd = async () => {
    await endStudy();
    onSessionEnd?.();
  };

  useEffect(() => {
    if (!studyStartTime) return;
    const tick = () => setElapsedSec(Math.floor((Date.now() - studyStartTime) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [studyStartTime]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComplete) return;
      if (!isCardFlipped) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          flipCard();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          skipCard();
        }
      } else if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        reviewCard(parseInt(e.key, 10));
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        skipCard();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCardFlipped, isComplete, flipCard, reviewCard, skipCard]);

  if (isComplete) {
    const accuracy =
      sessionCorrect + sessionIncorrect > 0
        ? Math.round((sessionCorrect / (sessionCorrect + sessionIncorrect)) * 100)
        : 0;

    return (
      <div className="lr-frame">
        <div className="lr-empty">
          <div className="lr-empty-art">
            <CheckCircle size={36} aria-hidden />
          </div>
          <h2>{t('flashcard.session_complete', 'Session complete')}</h2>
          <p>
            {t('flashcard.studied_cards_count', 'You studied {{count}} cards', { count: totalCards })}
            {' · '}
            {accuracy}%
          </p>
          <button type="button" className="lr-btn lr-btn-primary" onClick={() => void handleEnd()}>
            {t('flashcard.back_to_deck', 'Back to library')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lr-frame lr-flash">
      <div className="lr-quiz-hd">
        <button type="button" className="lr-btn lr-btn-ghost" onClick={() => void handleEnd()} aria-label={t('ui.close', 'Close')}>
          <X size={16} />
        </button>
        <span className="lr-quiz-hd-name">{t('flashcard.study', 'Study')}</span>
        <span className="lr-quiz-hd-count">
          {currentCardIndex + 1}/{totalCards}
        </span>
        <div className="lr-quiz-hd-bar">
          <div
            className="fill"
            style={{ width: `${totalCards > 0 ? ((currentCardIndex + 1) / totalCards) * 100 : 0}%` }}
          />
        </div>
        <span className="timer">{elapsedSec}s</span>
      </div>

      <div className="lr-flash-body">
        <div
          className="lr-flash-card"
          role="button"
          tabIndex={0}
          onClick={flipCard}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              flipCard();
            }
          }}
        >
          <span className="lr-flash-side">
            {isCardFlipped ? t('flashcard.answer', 'Answer') : t('flashcard.question', 'Question')}
          </span>
          <span className="lr-flash-tag">{currentCard?.difficulty ?? '—'}</span>
          <div className="lr-flash-content">
            {isCardFlipped ? (
              <p className="lr-flash-a">{currentCard?.answer}</p>
            ) : (
              <p className="lr-flash-q">{currentCard?.question}</p>
            )}
          </div>
          {!isCardFlipped ? (
            <div className="lr-flash-hint">
              {t('flashcard.press_space_flip', 'Press Space to flip')}
            </div>
          ) : null}
        </div>
      </div>

      {isCardFlipped && currentCard ? (
        <FlashSrsButtons card={currentCard} onReview={reviewCard} />
      ) : null}
    </div>
  );
}
