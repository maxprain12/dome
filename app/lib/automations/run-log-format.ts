import i18n, { getDateTimeLocaleTag } from '@/lib/i18n';

export function formatRunDate(ts?: number | null) {
  if (!ts) return i18n.t('runLog.em_dash');
  return new Date(ts).toLocaleString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(startedAt?: number, finishedAt?: number | null): string {
  if (!startedAt) return i18n.t('runLog.em_dash');
  const end = finishedAt || Date.now();
  const secs = Math.round((end - startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}
