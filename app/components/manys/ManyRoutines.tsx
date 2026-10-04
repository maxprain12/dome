import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { RepeatIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request, type ManyDetail } from '@/lib/manys/api';

type Repeat = 'daily' | 'weekly' | 'other';
const REPEAT_SECONDS: Record<'daily' | 'weekly', number> = { daily: 86400, weekly: 604800 };
const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

export default function ManyRoutines({ detail, busy, perform }: { detail: ManyDetail; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const many = detail.many.id;

  const everyLabel = (seconds: number) => {
    if (seconds === REPEAT_SECONDS.daily) return t('manys.daily');
    if (seconds === REPEAT_SECONDS.weekly) return t('manys.weekly');
    return t('manys.everyMinutes', { count: Math.max(1, Math.round(seconds / 60)) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className={`${labelClass} mb-0`}>{t('manys.activeRoutines', { count: detail.recurrences.length })}</div>
        {detail.recurrences.map((recurrence) => (
          <div key={recurrence.id} className="dome-card flex items-center gap-2.5 px-3 py-2.5">
            <HugeiconsIcon icon={RepeatIcon} className="size-[18px] shrink-0" aria-hidden />
            <div className="flex min-w-0 grow flex-col">
              <span className="truncate">{recurrence.prompt}</span>
              <span className="truncate text-muted-foreground">{everyLabel(recurrence.interval_seconds)} · {t('manys.nextRun', { when: new Date(recurrence.next_at).toLocaleString() })}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => { void perform(() => request(`/${many}/recurrences/${recurrence.id}`, 'DELETE')); }}
            >
              {t('manys.remove')}
            </Button>
          </div>
        ))}
      </div>
      <div className="h-px bg-[var(--hairline)]" />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const intervalSeconds = repeat === 'other' ? Number(form.get('interval')) : REPEAT_SECONDS[repeat];
          void perform(() => request(`/${many}/recurrences`, 'POST', {
            conversationId: detail.conversations[0].id,
            prompt: form.get('prompt'),
            intervalSeconds,
            nextAt: new Date(Date.now() + 300000).toISOString(),
          }));
        }}
      >
        <div className={`${labelClass} mb-0`}>{t('manys.newRoutine')}</div>
        <div>
          <label htmlFor="many-routine-prompt" className={labelClass}>{t('manys.whatToDo')}</label>
          <Textarea id="many-routine-prompt" name="prompt" required rows={3} placeholder={t('manys.routinePlaceholder')} />
        </div>
        <div>
          <span className={labelClass}>{t('manys.repeat')}</span>
          <Tabs value={repeat} onValueChange={(value) => setRepeat(value as Repeat)}>
            <TabsList className="w-full">
              {(['daily', 'weekly', 'other'] as const).map((value) => (
                <TabsTrigger key={value} value={value} className="flex-1 text-xs">{t(`manys.${value === 'other' ? 'otherInterval' : value}`)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {repeat === 'other' && (
            <Input name="interval" type="number" min={300} max={31536000} defaultValue={3600} aria-label={t('manys.interval')} className="mt-2" />
          )}
          <p className="mt-1.5 text-muted-foreground">{t('manys.intervalHint')}</p>
        </div>
        <Button type="submit" disabled={busy} className="self-start">{t('manys.createRoutine')}</Button>
      </form>
    </div>
  );
}
