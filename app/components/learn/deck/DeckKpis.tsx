import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FlashDeckKpisProps { variant?: 'flash'; total: number; due: number; mastered: number; masteryPct: number; }
interface QuizDeckKpisProps { variant: 'quiz'; total: number; lastScorePct: number | null; masteryPct: number; hardestLabel: string | null; avgTimeSec: number | null; }
type DeckKpisProps = FlashDeckKpisProps | QuizDeckKpisProps;
function formatAvgTime(sec: number | null) { if (sec == null) return '—'; if (sec < 60) return `${sec}s`; const mins = Math.floor(sec / 60); const rem = sec % 60; return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`; }
export default function DeckKpis(props: DeckKpisProps) {
  const { t } = useTranslation();
  const metrics = props.variant === 'quiz' ? [
    [t('learn.deck_kpi_total', 'Total'), props.total], [t('learn.deck_last_score', 'Last score'), props.lastScorePct != null ? `${props.lastScorePct}%` : '—'], [t('learn.deck_kpi_mastery', 'Mastery'), `${props.masteryPct}%`], [t('learn.deck_hardest', 'Hardest'), props.hardestLabel ?? '—'], [t('learn.deck_avg_time', 'Avg time'), formatAvgTime(props.avgTimeSec)],
  ] : [[t('learn.deck_kpi_total', 'Total'), props.total], [t('learn.deck_kpi_due', 'Due'), props.due], [t('learn.deck_kpi_mastered', 'Mastered'), props.mastered], [t('learn.deck_kpi_mastery', 'Mastery'), `${props.masteryPct}%`]];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <Card key={String(label)} size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="truncate text-2xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}</div>;
}
