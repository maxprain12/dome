import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnStreak } from '@/lib/hooks/useLearnStreak';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { buildLearnDeckItems } from '@/lib/learn/deckItems';
import { showToast } from '@/lib/store/useToastStore';

export default function LearnStreakStrip() {
  const { t } = useTranslation();
  const { streak } = useLearnStreak();
  const decks = useLearnStore((s) => s.decks);
  const studioOutputs = useLearnStore((s) => s.studioOutputs);
  const deckStats = useLearnStore((s) => s.deckStats);
  const startStudy = useLearnStore((s) => s.startStudy);

  const streakDays = streak?.streakDays ?? 0;
  const dueToday = streak?.dueToday ?? 0;
  const days = streak?.days ?? [];

  const handleReview = () => {
    const items = buildLearnDeckItems(decks, studioOutputs, deckStats);
    const withDue = items.filter((i) => i.kind === 'flashcard_deck' && (i.dueCount ?? 0) > 0);
    const firstDue = withDue[0];
    if (firstDue) {
      void startStudy(firstDue.id);
      return;
    }

    const recentDeck = items
      .filter((i) => i.kind === 'flashcard_deck')
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (recentDeck) {
      void startStudy(recentDeck.id);
      return;
    }

    showToast('info', t('learn.nothing_to_review', 'Nothing to review right now.'));
  };

  return (
    <div className="lr-streak lr-streak-strip">
      <div className="lr-streak-icon">
        <Flame size={18} aria-hidden />
      </div>
      <div className="lr-streak-text">
        <div className="lr-streak-title">
          {t('learn.streak_title', { days: streakDays, due: dueToday })}
        </div>
        <div className="lr-streak-sub">
          {dueToday > 0
            ? t('learn.streak_due_sub', { count: dueToday })
            : t('learn.streak_clear_sub')}
        </div>
      </div>
      <div className="lr-streak-days" aria-hidden>
        {days.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className={`lr-streak-day${d.done ? ' done' : ''}${d.today ? ' today' : ''}`}
          >
            {d.label}
          </div>
        ))}
      </div>
      <button type="button" className="lr-btn lr-btn-primary lr-btn-sm" onClick={handleReview}>
        {t('learn.streak_review')}
      </button>
    </div>
  );
}
