import { useTranslation } from 'react-i18next';

interface FlashDeckKpisProps {
  variant?: 'flash';
  total: number;
  due: number;
  mastered: number;
  masteryPct: number;
}

interface QuizDeckKpisProps {
  variant: 'quiz';
  total: number;
  lastScorePct: number | null;
  masteryPct: number;
  hardestLabel: string | null;
  avgTimeSec: number | null;
}

type DeckKpisProps = FlashDeckKpisProps | QuizDeckKpisProps;

function formatAvgTime(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

export default function DeckKpis(props: DeckKpisProps) {
  const { t } = useTranslation();

  if (props.variant === 'quiz') {
    const { total, lastScorePct, masteryPct, hardestLabel, avgTimeSec } = props;
    return (
      <div className="lr-stats lr-stats-deck lr-stats-quiz">
        <div className="lr-stat">
          <span className="lr-stat-label">{t('learn.deck_kpi_total', 'Total')}</span>
          <span className="lr-stat-value">{total}</span>
        </div>
        <div className="lr-stat">
          <span className="lr-stat-label">{t('learn.deck_last_score', 'Last score')}</span>
          <span className="lr-stat-value">{lastScorePct != null ? `${lastScorePct}%` : '—'}</span>
        </div>
        <div className="lr-stat">
          <span className="lr-stat-label">{t('learn.deck_kpi_mastery', 'Mastery')}</span>
          <span className="lr-stat-value">{masteryPct}%</span>
        </div>
        <div className="lr-stat">
          <span className="lr-stat-label">{t('learn.deck_hardest', 'Hardest')}</span>
          <span className="lr-stat-value truncate">{hardestLabel ?? '—'}</span>
        </div>
        <div className="lr-stat">
          <span className="lr-stat-label">{t('learn.deck_avg_time', 'Avg time')}</span>
          <span className="lr-stat-value">{formatAvgTime(avgTimeSec)}</span>
        </div>
      </div>
    );
  }

  const { total, due, mastered, masteryPct } = props;
  return (
    <div className="lr-stats lr-stats-deck">
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.deck_kpi_total', 'Total')}</span>
        <span className="lr-stat-value">{total}</span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.deck_kpi_due', 'Due')}</span>
        <span className="lr-stat-value">{due}</span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.deck_kpi_mastered', 'Mastered')}</span>
        <span className="lr-stat-value">{mastered}</span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.deck_kpi_mastery', 'Mastery')}</span>
        <span className="lr-stat-value">{masteryPct}%</span>
      </div>
    </div>
  );
}
