'use client';

import { Trophy, Target, Zap, Clock } from 'lucide-react';

interface FlashcardStatsProps {
  cardsStudied: number;
  correct: number;
  incorrect: number;
  maxStreak: number;
  durationMs: number;
  onClose: () => void;
  onStudyAgain: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export default function FlashcardStats({
  cardsStudied,
  correct,
  incorrect,
  maxStreak,
  durationMs,
  onClose,
  onStudyAgain,
}: FlashcardStatsProps) {
  const accuracy = cardsStudied > 0 ? Math.round((correct / cardsStudied) * 100) : 0;

  // Performance message
  let message = 'Sigue practicando';
  let messageColor = 'var(--secondary-text)';
  if (accuracy >= 90) {
    message = 'Excelente!';
    messageColor = 'var(--success, #10b981)';
  } else if (accuracy >= 70) {
    message = 'Buen trabajo!';
    messageColor = 'var(--accent)';
  } else if (accuracy >= 50) {
    message = 'Vas mejorando';
    messageColor = 'var(--warning, #f59e0b)';
  }

  return (
    <div className="flex flex-col items-center text-center px-6 py-8">
      {/* Trophy icon */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: accuracy >= 70
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))'
            : 'linear-gradient(135deg, rgba(123, 118, 208, 0.15), rgba(123, 118, 208, 0.05))',
        }}
      >
        <Trophy
          className="w-10 h-10"
          style={{ color: accuracy >= 70 ? 'var(--success, #10b981)' : 'var(--accent)' }}
        />
      </div>

      {/* Performance message */}
      <h2
        className="text-2xl font-bold mb-2"
        style={{ color: messageColor }}
      >
        {message}
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--secondary-text)' }}>
        Sesion completada
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Precision"
          value={`${accuracy}%`}
          color="var(--accent)"
        />
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label="Mejor racha"
          value={`${maxStreak}`}
          color="var(--warning, #f59e0b)"
        />
        <StatCard
          icon={
            <span className="text-lg font-bold" style={{ color: 'var(--success, #10b981)' }}>
              {correct}
            </span>
          }
          label="Correctas"
          value={`de ${cardsStudied}`}
          color="var(--success, #10b981)"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Duracion"
          value={formatDuration(durationMs)}
          color="var(--secondary-text)"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="btn btn-ghost px-6 py-2.5"
        >
          Cerrar
        </button>
        <button
          onClick={onStudyAgain}
          className="btn btn-primary px-6 py-2.5"
        >
          Estudiar de nuevo
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 p-4 rounded-xl"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ color }}>{icon}</div>
      <span
        className="text-lg font-bold"
        style={{ color: 'var(--primary-text)' }}
      >
        {value}
      </span>
      <span
        className="text-xs font-medium"
        style={{ color: 'var(--tertiary-text)' }}
      >
        {label}
      </span>
    </div>
  );
}
