import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, RepeatIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { request, type ManyDetail } from '@/lib/manys/api';

const DAY = 86400;
const WEEK = 604800;

/**
 * The routines a Many runs on its own. It schedules them itself when it sees it is worth it; here they
 * are only seen and removed.
 */
export default function ManyRoutines({ detail, busy, perform }: { detail: ManyDetail; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const many = detail.many.id;
  const every = (seconds: number) => {
    if (seconds === DAY) return t('manys.daily');
    if (seconds === WEEK) return t('manys.weekly');
    if (seconds % 3600 === 0) return t('manys.everyHours', { count: seconds / 3600 });
    return t('manys.everyMinutes', { count: Math.max(1, Math.round(seconds / 60)) });
  };
  if (detail.recurrences.length === 0) return <p className="text-xs text-muted-foreground">{t('manys.routinesNone')}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {detail.recurrences.map((recurrence) => (
        <li key={recurrence.id} className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2">
          <HugeiconsIcon icon={RepeatIcon} className="size-4 shrink-0" aria-hidden />
          <div className="flex min-w-0 grow flex-col">
            <span className="line-clamp-2">{recurrence.prompt}</span>
            <span className="truncate text-xs text-muted-foreground">{every(recurrence.interval_seconds)} · {t('manys.nextRun', { when: new Date(recurrence.next_at).toLocaleString() })}</span>
          </div>
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.remove')} title={t('manys.remove')} onClick={() => { void perform(() => request(`/${many}/recurrences/${recurrence.id}`, 'DELETE')); }}>
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </li>
      ))}
    </ul>
  );
}
