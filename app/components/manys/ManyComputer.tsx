import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Maximize02Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { request, type CloudMany } from '@/lib/manys/api';
import { useComputerControl } from '@/lib/manys/useComputerControl';
import { useComputerPower } from '@/lib/manys/useComputerPower';
import { cn } from '@/lib/utils';
import ManyComputerDesktop from './ManyComputerDesktop';
import ManyComputerViewer from './ManyComputerViewer';
import ManyComputerWheel from './ManyComputerWheel';
import { computerEnabled, withComputerOn } from './computerPermissions';

/**
 * A Many's computer: its whole desktop, live whenever the computer is on. Taking the wheel pauses
 * the Many and hands the machine (browser, terminal, files, any app) to the person until they give it back.
 */
export default function ManyComputer({ manyId, many, control, perform }: { manyId: string; many: CloudMany; control: string; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const wheel = useComputerControl(manyId, control);
  const enabled = computerEnabled(many.grants);
  const power = useComputerPower(manyId, enabled);
  const [expanded, setExpanded] = useState(false);

  const turnOn = () => { void perform(() => request(`/${manyId}`, 'PATCH', { name: many.name, instructions: many.instructions, grants: withComputerOn(many.grants, true) })); };
  const take = async () => {
    if (await wheel.take()) {
      void power.refresh();
      setExpanded(true);
    }
  };
  const release = () => { void wheel.release(); };
  const running = power.power === 'running';

  const card = (title: string, hint: string, action?: { label: string; busy: boolean; onClick: () => void }) => (
    <div className="dome-card dome-card-plain flex flex-col items-start gap-2 p-4">
      <strong className="text-sm font-semibold">{title}</strong>
      <p className="text-muted-foreground">{hint}</p>
      {action && <Button type="button" size="sm" disabled={action.busy} onClick={action.onClick}>{action.label}</Button>}
    </div>
  );

  let screen;
  if (!enabled) screen = card(t('manys.computer.off.title'), t('manys.computer.off.hint'), { label: t('manys.computer.off.turnOn'), busy: wheel.busy, onClick: turnOn });
  else if (power.power === null) {
    screen = power.failed ? (
      <div className="dome-card dome-card-err flex flex-col items-start gap-2 p-4">
        <p>{t('manys.computer.power.unreachable')}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => { void power.refresh(); }}>{t('manys.computer.screen.reconnect')}</Button>
      </div>
    ) : <Skeleton className="aspect-[1440/960] w-full rounded-[14px]" />;
  } else if (!running) {
    screen = card(t('manys.computer.power.offTitle'), t('manys.computer.power.offHint'), {
      label: power.working ? t('manys.computer.power.starting') : t('manys.computer.power.start'),
      busy: power.working,
      onClick: () => { void power.start(); },
    });
  } else if (expanded) {
    screen = (
      <div className="dome-card dome-card-plain flex aspect-[1440/960] w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <span className="text-muted-foreground">{t('manys.computer.viewer.open')}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(false)}>{t('manys.computer.viewer.close')}</Button>
      </div>
    );
  } else {
    screen = <ManyComputerDesktop manyId={manyId} human={wheel.human} onExpand={() => setExpanded(true)} onResync={wheel.resync} />;
  }

  return (
    <section className="flex flex-col gap-3">
      {wheel.error && <Alert variant="destructive"><AlertDescription>{t(`manys.errors.${wheel.error}`, { defaultValue: t('manys.errors.service_unavailable') })}</AlertDescription></Alert>}

      {enabled && (
        <header className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', running ? 'bg-success' : 'bg-muted-foreground')} />
          <span className="grow text-xs text-muted-foreground">
            {power.failed ? t('manys.computer.power.unknown') : power.power ? t(`manys.computer.power.${power.power}`) : t('manys.computer.power.checking')}
          </span>
          <Button type="button" size="icon" variant="ghost" disabled={!running} aria-label={t('manys.computer.expand')} title={t('manys.computer.expand')} onClick={() => setExpanded(true)}>
            <HugeiconsIcon icon={Maximize02Icon} size={16} />
          </Button>
          {running && (
            <Button type="button" size="xs" variant="outline" disabled={power.working} title={t('manys.computer.power.stopHint')} onClick={() => { void power.stop(); }}>
              {t('manys.computer.power.stop')}
            </Button>
          )}
        </header>
      )}

      {enabled && <ManyComputerWheel wheel={wheel.wheel} busy={wheel.busy} disabled={!running} onTake={() => { void take(); }} onRelease={release} />}

      {screen}

      <ManyComputerViewer open={expanded && running} onOpenChange={setExpanded} manyId={manyId} name={many.name} wheel={wheel.wheel} busy={wheel.busy} onTake={() => { void take(); }} onRelease={release} onResync={wheel.resync} />
    </section>
  );
}
