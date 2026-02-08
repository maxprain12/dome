'use client';

interface FlashcardProgressProps {
  current: number;
  total: number;
  correct: number;
  incorrect: number;
}

export default function FlashcardProgress({ current, total, correct, incorrect }: FlashcardProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  const remaining = total - current;

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div
        className="h-2 rounded-full overflow-hidden mb-3"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: 'var(--accent)',
          }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs font-medium">
        <span style={{ color: 'var(--secondary-text)' }}>
          {current} / {total}
        </span>
        <div className="flex items-center gap-4">
          <span style={{ color: 'var(--success, #10b981)' }}>
            {correct} correctas
          </span>
          <span style={{ color: 'var(--error, #ef4444)' }}>
            {incorrect} incorrectas
          </span>
          <span style={{ color: 'var(--tertiary-text)' }}>
            {remaining} restantes
          </span>
        </div>
      </div>
    </div>
  );
}
