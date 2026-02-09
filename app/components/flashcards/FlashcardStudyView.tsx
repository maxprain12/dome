
import { useEffect, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useFlashcardStore } from '@/lib/store/useFlashcardStore';
import FlashcardCard from './FlashcardCard';
import FlashcardSwipeContainer from './FlashcardSwipeContainer';
import FlashcardProgress from './FlashcardProgress';
import FlashcardStats from './FlashcardStats';

interface FlashcardStudyViewProps {
  deckId: string;
  onClose: () => void;
}

export default function FlashcardStudyView({ deckId, onClose }: FlashcardStudyViewProps) {
  const {
    currentDeck,
    dueCards,
    isStudying,
    currentCardIndex,
    isCardFlipped,
    sessionCorrect,
    sessionIncorrect,
    sessionStreak,
    maxStreak,
    studyStartTime,
    startStudy,
    flipCard,
    reviewCard,
    endStudy,
  } = useFlashcardStore();

  // Start study session
  useEffect(() => {
    startStudy(deckId);
  }, [deckId, startStudy]);

  const currentCard = dueCards[currentCardIndex] || null;
  const isSessionComplete = isStudying && currentCardIndex >= dueCards.length && dueCards.length > 0;
  const totalCards = dueCards.length;

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!currentCard || isSessionComplete) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        flipCard();
        break;
      case 'ArrowLeft':
        if (isCardFlipped) {
          e.preventDefault();
          reviewCard(1); // Incorrect
        }
        break;
      case 'ArrowRight':
        if (isCardFlipped) {
          e.preventDefault();
          reviewCard(4); // Correct
        }
        break;
      case '1':
        if (isCardFlipped) reviewCard(1); // Again
        break;
      case '2':
        if (isCardFlipped) reviewCard(2); // Hard
        break;
      case '3':
        if (isCardFlipped) reviewCard(3); // Good
        break;
      case '4':
        if (isCardFlipped) reviewCard(4); // Easy
        break;
      case '5':
        if (isCardFlipped) reviewCard(5); // Very easy
        break;
      case 'Escape':
        handleClose();
        break;
    }
  }, [currentCard, isSessionComplete, isCardFlipped, flipCard, reviewCard]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleClose = useCallback(async () => {
    if (isStudying && currentCardIndex > 0) {
      await endStudy();
    }
    onClose();
  }, [isStudying, currentCardIndex, endStudy, onClose]);

  const handleStudyAgain = useCallback(() => {
    startStudy(deckId);
  }, [deckId, startStudy]);

  const handleSwipeLeft = useCallback(() => {
    if (isCardFlipped) {
      reviewCard(1); // Incorrect
    }
  }, [isCardFlipped, reviewCard]);

  const handleSwipeRight = useCallback(() => {
    if (isCardFlipped) {
      reviewCard(4); // Correct
    }
  }, [isCardFlipped, reviewCard]);

  const durationMs = studyStartTime ? Date.now() - studyStartTime : 0;

  // No due cards state
  if (isStudying && dueCards.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: 'var(--bg)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--primary-text)' }}>
            {currentDeck?.title || 'Flashcards'}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost p-2 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" style={{ color: 'var(--secondary-text)' }} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: 'rgba(123, 118, 208, 0.1)' }}
          >
            <RotateCcw className="w-10 h-10" style={{ color: 'var(--accent)' }} />
          </div>
          <h3
            className="text-xl font-semibold mb-2"
            style={{ color: 'var(--primary-text)' }}
          >
            No hay tarjetas pendientes
          </h3>
          <p
            className="text-sm mb-6"
            style={{ color: 'var(--secondary-text)' }}
          >
            Todas las tarjetas han sido revisadas. Vuelve mas tarde para repasar.
          </p>
          <button onClick={onClose} className="btn btn-primary px-6 py-2.5">
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Session complete - show stats
  if (isSessionComplete) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: 'var(--bg)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--primary-text)' }}>
            {currentDeck?.title || 'Flashcards'}
          </h2>
          <button
            onClick={handleClose}
            className="btn btn-ghost p-2 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" style={{ color: 'var(--secondary-text)' }} />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <FlashcardStats
            cardsStudied={sessionCorrect + sessionIncorrect}
            correct={sessionCorrect}
            incorrect={sessionIncorrect}
            maxStreak={maxStreak}
            durationMs={durationMs}
            onClose={handleClose}
            onStudyAgain={handleStudyAgain}
          />
        </div>
      </div>
    );
  }

  // Main study view
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--primary-text)' }}>
            {currentDeck?.title || 'Flashcards'}
          </h2>
          {sessionStreak >= 3 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--warning, #f59e0b)',
              }}
            >
              Racha: {sessionStreak}
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="btn btn-ghost p-2 rounded-lg"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" style={{ color: 'var(--secondary-text)' }} />
        </button>
      </div>

      {/* Progress */}
      <div className="px-6 pt-4">
        <FlashcardProgress
          current={currentCardIndex}
          total={totalCards}
          correct={sessionCorrect}
          incorrect={sessionIncorrect}
        />
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          {currentCard && (
            <FlashcardSwipeContainer
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              disabled={!isCardFlipped}
            >
              <FlashcardCard
                question={currentCard.question}
                answer={currentCard.answer}
                isFlipped={isCardFlipped}
                onFlip={flipCard}
              />
            </FlashcardSwipeContainer>
          )}
        </div>
      </div>

      {/* Answer buttons */}
      <div
        className="px-6 py-5"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {!isCardFlipped ? (
          <div className="flex justify-center">
            <button
              onClick={flipCard}
              className="btn btn-primary px-8 py-3 text-sm font-medium"
            >
              Mostrar respuesta
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => reviewCard(1)}
              className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl transition-all duration-200 hover:scale-105"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--error, #ef4444)',
              }}
            >
              <span className="text-sm font-semibold">Otra vez</span>
              <span className="text-[10px] opacity-70">1</span>
            </button>
            <button
              onClick={() => reviewCard(2)}
              className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl transition-all duration-200 hover:scale-105"
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                color: 'var(--warning, #f59e0b)',
              }}
            >
              <span className="text-sm font-semibold">Dificil</span>
              <span className="text-[10px] opacity-70">2</span>
            </button>
            <button
              onClick={() => reviewCard(4)}
              className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl transition-all duration-200 hover:scale-105"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                color: 'var(--success, #10b981)',
              }}
            >
              <span className="text-sm font-semibold">Bien</span>
              <span className="text-[10px] opacity-70">3</span>
            </button>
            <button
              onClick={() => reviewCard(5)}
              className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl transition-all duration-200 hover:scale-105"
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: 'var(--success, #10b981)',
              }}
            >
              <span className="text-sm font-semibold">Facil</span>
              <span className="text-[10px] opacity-70">4</span>
            </button>
          </div>
        )}

        {/* Keyboard hint */}
        <p
          className="text-center text-[11px] mt-3"
          style={{ color: 'var(--tertiary-text)' }}
        >
          {!isCardFlipped
            ? 'Pulsa Espacio para voltear'
            : 'Desliza o usa las teclas 1-4 para responder'}
        </p>
      </div>
    </div>
  );
}
