import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/lib/manys/api';
import { stepDetail, stepKey, useManySteps } from '@/lib/manys/steps';
import { cn } from '@/lib/utils';
import ManyComputerFiles from './ManyComputerFiles';
import ManyComputerScreen from './ManyComputerScreen';
import ManyComputerTerminal from './ManyComputerTerminal';

type View = 'screen' | 'terminal' | 'files' | 'activity';
const VIEWS: readonly View[] = ['screen', 'terminal', 'files', 'activity'];

/**
 * A Many's computer. Everyone can watch its screen; taking control pauses the Many's task and
 * hands the browser, the terminal and the files to the person until they give it back.
 */
export default function ManyComputer({ manyId, control, live }: { manyId: string; control: string; live: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('screen');
  const [held, setHeld] = useState(control);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const steps = useManySteps(manyId);

  useEffect(() => {
    setHeld(control);
  }, [control]);
  const human = held === 'human';

  const change = async (action: 'enter' | 'leave') => {
    setBusy(true);
    try {
      await request(`/${manyId}/computer`, 'POST', { operation: action, parameters: {} });
      setHeld(action === 'enter' ? 'human' : 'snapshot_required');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    } finally {
      setBusy(false);
    }
  };
  const take = () => { void change('enter'); };
  const state = human ? 'human' : held === 'snapshot_required' ? 'snapshot' : 'agent';

  return (
    <section className="flex flex-col gap-3">
      {error && <Alert variant="destructive"><AlertDescription>{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.service_unavailable') })}</AlertDescription></Alert>}

      <div className="flex items-start gap-2.5 rounded-[14px] bg-muted px-3 py-2.5">
        <span aria-hidden="true" className={cn('mt-1.5 size-[7px] shrink-0 rounded-full', human ? 'bg-warning' : 'bg-success')} />
        <div className="min-w-0 grow">
          <strong className="font-semibold">{t(`manys.computer.${state}Title`)}</strong>
          <p className="text-muted-foreground">{t(`manys.computer.${state}Hint`)}</p>
        </div>
        <Button type="button" size="sm" variant={human ? 'outline' : 'default'} disabled={busy} onClick={() => { void change(human ? 'leave' : 'enter'); }}>
          {t(human ? 'manys.computer.release' : 'manys.computer.take')}
        </Button>
      </div>

      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <TabsList className="h-8 w-full">
          {VIEWS.map((id) => (
            <TabsTrigger key={id} value={id} className="h-[26px] grow text-xs">{t(`manys.computer.tabs.${id}`)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {view === 'screen' && <ManyComputerScreen manyId={manyId} human={human} autoConnect={live || human} busy={busy} onTakeControl={take} />}
      {view === 'terminal' && <ManyComputerTerminal manyId={manyId} human={human} busy={busy} onTakeControl={take} />}
      {view === 'files' && <ManyComputerFiles manyId={manyId} />}
      {view === 'activity' && (
        <ul className="dome-card dome-card-plain flex flex-col gap-1.5 p-3" aria-label={t('manys.computer.tabs.activity')}>
          {steps.length === 0 && <li className="text-muted-foreground">{t('manys.computer.activity.empty')}</li>}
          {[...steps].reverse().map((step) => (
            <li key={step.id} className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', !step.done ? 'bg-warning' : step.ok === false ? 'bg-destructive' : 'bg-success')} />
              <span className="min-w-0 truncate">{t(`manys.steps.${stepKey(step.tool)}`, { detail: stepDetail(step) })}</span>
              {step.ok === false && <span className="text-muted-foreground">{t('manys.steps.failed')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
