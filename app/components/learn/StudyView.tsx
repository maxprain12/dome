import { useEffect } from 'react';
import { X, Flame, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/store/useLearnStore';

export default function StudyView() {
  const { t } = useTranslation();
  const {
    dueCards,
    currentCardIndex,
    isCardFlipped,
    sessionCorrect,
    sessionIncorrect,
    sessionStreak,
    maxStreak: _maxStreak,
    flipCard,
    reviewCard,
    endStudy,
  } = useLearnStore();

  const currentCard = dueCards[currentCardIndex];
  const isComplete = currentCardIndex >= dueCards.length;
  const totalCards = dueCards.length;
  const progress = totalCards > 0 ? (currentCardIndex / totalCards) * 100 : 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComplete) return;

      if (!isCardFlipped) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          flipCard();
        }
      } else {
        if (e.key >= '1' && e.key <= '4') {
          e.preventDefault();
          reviewCard(parseInt(e.key));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCardFlipped, isComplete, flipCard, reviewCard]);

  if (isComplete) {
    const accuracy = sessionCorrect + sessionIncorrect > 0
      ? Math.round((sessionCorrect / (sessionCorrect + sessionIncorrect)) * 100)
      : 0;

    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-4 z-50"
        style={{ background: 'var(--dome-bg)' }}
      >
        <div className="max-w-md w-full text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <CheckCircle size={40} style={{ color: 'var(--dome-accent)' }} />
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--dome-text)' }}>
            {t('flashcard.session_complete', 'Sesión completada')}
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--dome-text-muted)' }}>
            {t('flashcard.studied_cards_count', 'Has estudiado {{count}} tarjetas', { count: totalCards })}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-lg" style={{ background: 'var(--dome-surface)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{sessionCorrect}</div>
              <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('flashcard.correct', 'Correctas')}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'var(--dome-surface)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--error)' }}>{sessionIncorrect}</div>
              <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('flashcard.incorrect', 'Incorrectas')}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'var(--dome-surface)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--dome-accent)' }}>{accuracy}%</div>
              <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('flashcard.accuracy', 'Precisión')}</div>
            </div>
          </div>

          <button
            onClick={endStudy}
            className="w-full py-3 rounded-lg font-medium"
            style={{ background: 'var(--dome-accent)', color: 'white' }}
          >
            {t('flashcard.back_to_deck', 'Volver al deck')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col z-50"
      style={{ background: 'var(--dome-bg)' }}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--dome-border)' }}>
        <button
          onClick={endStudy}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {currentCardIndex + 1} / {totalCards}
          </span>
          {sessionStreak > 0 && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{ background: 'var(--warning-bg)' }}>
              <Flame size={16} style={{ color: 'var(--warning)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>{sessionStreak}</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div
            className="mb-4 h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--dome-border)' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${progress}%`, background: 'var(--dome-accent)' }}
            />
          </div>

          <div
            onClick={flipCard}
            className="relative aspect-[3/2] rounded-xl cursor-pointer transition-all duration-300"
            style={{
              background: 'var(--dome-surface)',
              border: `2px solid ${isCardFlipped ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
              transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
              transformStyle: 'preserve-3d',
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              {!isCardFlipped ? (
                <>
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('flashcard.question', 'Pregunta')}
                  </p>
                  <p className="text-xl font-medium" style={{ color: 'var(--dome-text)' }}>
                    {currentCard?.question}
                  </p>
                  <p className="text-sm mt-4" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('flashcard.tap_to_answer', 'Toca para ver la respuesta')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--dome-accent)' }}>
                    {t('flashcard.answer', 'Respuesta')}
                  </p>
                  <p className="text-xl font-medium" style={{ color: 'var(--dome-text)' }}>
                    {currentCard?.answer}
                  </p>
                </>
              )}
            </div>
          </div>

          {isCardFlipped && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-center mb-4" style={{ color: 'var(--dome-text-muted)' }}>
                {t('flashcard.how_well_remembered', '¿Qué tan bien recordaste?')}
              </p>
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => reviewCard(1)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'var(--error)',
                  }}
                >
                  <span className="text-xs">{t('flashcard.again', 'Otra vez')}</span>
                  <span className="text-sm font-medium">1</span>
                </button>
                <button
                  onClick={() => reviewCard(2)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all"
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: 'var(--warning)',
                  }}
                >
                  <span className="text-xs">{t('flashcard.difficult', 'Difícil')}</span>
                  <span className="text-sm font-medium">2</span>
                </button>
                <button
                  onClick={() => reviewCard(3)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all"
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    color: 'var(--success)',
                  }}
                >
                  <span className="text-xs">{t('flashcard.good', 'Bien')}</span>
                  <span className="text-sm font-medium">3</span>
                </button>
                <button
                  onClick={() => reviewCard(4)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--success)',
                  }}
                >
                  <span className="text-xs">{t('flashcard.easy', 'Fácil')}</span>
                  <span className="text-sm font-medium">4</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
