import { FlameIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLearnStreak } from '@/lib/hooks/useLearnStreak';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { buildLearnDeckItems } from '@/lib/learn/deckItems';
import { showToast } from '@/lib/store/useToastStore';

export default function LearnStreakStrip() {
  const { t } = useTranslation();
  const { streak } = useLearnStreak();
  const { decks, studioOutputs, deckStats, startStudy } = useLearnStore();
  const streakDays = streak?.streakDays ?? 0;
  const dueToday = streak?.dueToday ?? 0;

  const handleReview = () => {
    const items = buildLearnDeckItems(decks, studioOutputs, deckStats).filter((item) => item.kind === 'flashcard_deck');
    const target = items.find((item) => (item.dueCount ?? 0) > 0) ?? items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (target) void startStudy(target.id);
    else showToast('info', t('learn.nothing_to_review', 'Nothing to review right now.'));
  };

  return <Card size="sm"><CardHeader>
    <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={FlameIcon} />{t('learn.streak_title', { days: streakDays, due: dueToday })}</CardTitle>
    <CardDescription>{dueToday > 0 ? t('learn.streak_due_sub', { count: dueToday }) : t('learn.streak_clear_sub')}</CardDescription>
    <CardAction className="flex items-center gap-2">
      <div className="hidden gap-1 md:flex" aria-label={t('learn.kpi_streak')}>{(streak?.days ?? []).map((day, index) => <Badge key={`${day.label}-${index}`} variant={day.today ? 'default' : day.done ? 'secondary' : 'outline'}>{day.label}</Badge>)}</div>
      <Button type="button" size="sm" onClick={handleReview}>{t('learn.streak_review')}</Button>
    </CardAction>
  </CardHeader></Card>;
}
