'use client';

interface FlashcardCardProps {
  question: string;
  answer: string;
  isFlipped: boolean;
  onFlip: () => void;
}

export default function FlashcardCard({ question, answer, isFlipped, onFlip }: FlashcardCardProps) {
  return (
    <div
      className="flashcard-container w-full"
      style={{ height: '320px' }}
      onClick={onFlip}
    >
      <div className={`flashcard-flip ${isFlipped ? 'flipped' : ''}`}>
        <div className="flashcard-face flashcard-front">
          <div className="text-center">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-4"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Pregunta
            </p>
            <p
              className="text-lg font-medium leading-relaxed"
              style={{ color: 'var(--primary-text)' }}
            >
              {question}
            </p>
            <p
              className="text-xs mt-6"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Toca para ver la respuesta
            </p>
          </div>
        </div>
        <div className="flashcard-face flashcard-back">
          <div className="text-center">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-4"
              style={{ color: 'var(--accent)' }}
            >
              Respuesta
            </p>
            <p
              className="text-lg font-medium leading-relaxed"
              style={{ color: 'var(--primary-text)' }}
            >
              {answer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
