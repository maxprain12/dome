import { useTranslation } from 'react-i18next';
import type { FlashcardStudySession } from '@/types';
import type { QuizRunRecord } from '@/lib/learn/types';

interface DeckHistoryTabProps {
  sessions: FlashcardStudySession[];
  quizRuns: QuizRunRecord[];
}

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DeckHistoryTab({ sessions, quizRuns }: DeckHistoryTabProps) {
  const { t } = useTranslation();

  if (sessions.length === 0 && quizRuns.length === 0) {
    return (
      <p className="lr-tab-empty">
        {t('learn.deck_no_history', 'No study history yet.')}
      </p>
    );
  }

  // Interleave flashcard sessions and quiz runs into one chronological timeline
  type Entry = { id: string; kind: 'fc' | 'qz'; ts: number; text: string };
  const entries: Entry[] = [
    ...sessions.map((s) => ({
      id: s.id,
      kind: 'fc' as const,
      ts: s.completed_at ?? s.started_at,
      text: t('learn.history_flash_session', '{{studied}} cards · {{correct}} correct', {
        studied: s.cards_studied,
        correct: s.cards_correct,
      }),
    })),
    ...quizRuns.map((run) => ({
      id: run.id,
      kind: 'qz' as const,
      ts: run.completed_at,
      text: t('learn.history_quiz_run', '{{correct}}/{{total}} correct', {
        correct: run.correct,
        total: run.total,
      }),
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="lr-body" style={{ paddingTop: 16 }}>
      <div className="lr-q-list">
        {entries.map((e) => (
          <div key={`${e.kind}-${e.id}`} className="lr-q-row">
            <span className="lr-q-num">{e.kind === 'fc' ? 'FC' : 'QZ'}</span>
            <div className="lr-q-content">
              <div className="lr-q-text">{e.text}</div>
              <div className="lr-q-meta">{formatWhen(e.ts)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
