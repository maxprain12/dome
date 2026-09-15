import { localDayKey } from '@/lib/hooks/dashboardGamification';
import type { DashboardChartPoint, DashboardChartRange } from './DashboardAreaChart';

const DAY_MS = 24 * 60 * 60 * 1000;

export function rangeDayCount(range: DashboardChartRange): number {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 90;
}

export function buildActivityChartPoints(
  counts: Record<string, number>,
  range: DashboardChartRange,
  now = Date.now(),
): DashboardChartPoint[] {
  const days = rangeDayCount(range);
  const points: DashboardChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDayKey(now - i * DAY_MS);
    points.push({ date, value: counts[date] ?? 0 });
  }
  return points;
}
