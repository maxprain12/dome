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

  return (
    <div className="lr-body" style={{ paddingTop: 16 }}>
      <div className="lr-q-list">
        {sessions.map((s) => (
          <div key={s.id} className="lr-q-row">
            <span className="lr-q-num">FC</span>
            <div className="lr-q-content">
              <div className="lr-q-text">
                {t('learn.history_flash_session', '{{studied}} cards · {{correct}} correct', {
                  studied: s.cards_studied,
                  correct: s.cards_correct,
                })}
              </div>
              <div className="lr-q-meta">{formatWhen(s.completed_at ?? s.started_at)}</div>
            </div>
          </div>
        ))}
        {quizRuns.map((run) => (
          <div key={run.id} className="lr-q-row">
            <span className="lr-q-num">QZ</span>
            <div className="lr-q-content">
              <div className="lr-q-text">
                {t('learn.history_quiz_run', '{{correct}}/{{total}} correct', {
                  correct: run.correct,
                  total: run.total,
                })}
              </div>
              <div className="lr-q-meta">{formatWhen(run.completed_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
