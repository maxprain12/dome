
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
          <div className="flex flex-col items-center justify-center w-full h-full max-h-full overflow-hidden">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-4 shrink-0"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Pregunta
            </p>
            <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-2 flex items-center justify-center">
              <p
                className="text-lg font-medium leading-relaxed break-words text-center w-full"
                style={{ color: 'var(--primary-text)', wordBreak: 'break-word' }}
              >
                {question}
              </p>
            </div>
            <p
              className="text-xs mt-4 shrink-0"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Toca para ver la respuesta
            </p>
          </div>
        </div>
        <div className="flashcard-face flashcard-back">
          <div className="flex flex-col items-center justify-center w-full h-full max-h-full overflow-hidden">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-4 shrink-0"
              style={{ color: 'var(--accent)' }}
            >
              Respuesta
            </p>
            <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-2 flex items-center justify-center">
              <p
                className="text-lg font-medium leading-relaxed break-words text-center w-full"
                style={{ color: 'var(--primary-text)', wordBreak: 'break-word' }}
              >
                {answer}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
