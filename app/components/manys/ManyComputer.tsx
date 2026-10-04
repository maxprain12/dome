import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ComputerIcon, Maximize02Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request, type CloudMany } from '@/lib/manys/api';
import { stepDetail, stepKey, useManySteps } from '@/lib/manys/steps';
import { useComputerControl } from '@/lib/manys/useComputerControl';
import { useComputerPower } from '@/lib/manys/useComputerPower';
import { cn } from '@/lib/utils';
import ManyComputerDesktop from './ManyComputerDesktop';
import ManyComputerFiles from './ManyComputerFiles';
import { PermissionOff } from './PermissionOff';
import ManyComputerScreen from './ManyComputerScreen';
import ManyComputerTerminal from './ManyComputerTerminal';
import ManyComputerViewer from './ManyComputerViewer';
import ManyComputerWheel from './ManyComputerWheel';
import { computerAllows, computerEnabled, withComputerEnabled, withComputerKind, type ComputerKind } from './computerPermissions';

type Drawer = 'terminal' | 'files' | 'browser' | 'activity';
const DRAWERS: readonly Drawer[] = ['terminal', 'files', 'browser', 'activity'];

/**
 * A Many's computer. Its whole desktop comes first and is live whenever the computer is on; taking
 * the wheel pauses the Many and hands the machine (browser, terminal, files, any app) to the person
 * until they give it back. The terminal, the files and the browser on their own sit below it.
 * Permissions and power live behind the gear, not in the way.
 */
export default function ManyComputer({ manyId, many, control, perform }: { manyId: string; many: CloudMany; control: string; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const wheel = useComputerControl(manyId, control);
  const enabled = computerEnabled(many.grants);
  const power = useComputerPower(manyId, enabled);
  const steps = useManySteps(manyId);
  const [drawer, setDrawer] = useState<Drawer>('terminal');
  const [expanded, setExpanded] = useState(false);

  const save = (grants: CloudMany['grants']) => perform(() => request(`/${manyId}`, 'PATCH', { name: many.name, instructions: many.instructions, grants }));
  const allow = (kind: ComputerKind) => { void save(withComputerKind(withComputerEnabled(many.grants, true), kind, true)); };
  const take = async () => {
    if (await wheel.take()) {
      void power.refresh();
      setExpanded(true);
    }
  };
  const release = () => { void wheel.release(); };
  const shell = computerAllows(many.grants, 'shell');
  const running = power.power === 'running';

  const offered = (kind: ComputerKind) => !computerAllows(many.grants, kind) && <PermissionOff kind={kind} busy={wheel.busy} onAllow={allow} />;
  const poweredOff = (
    <div className="dome-card dome-card-plain flex flex-col items-start gap-2 p-4">
      <strong className="text-sm font-semibold">{t('manys.computer.power.offTitle')}</strong>
      <p className="text-muted-foreground">{t('manys.computer.power.offHint')}</p>
      <Button type="button" size="sm" disabled={power.working} onClick={() => { void power.start(); }}>
        {power.working ? t('manys.computer.power.starting') : t('manys.computer.power.start')}
      </Button>
    </div>
  );

  let screen;
  if (!shell) screen = offered('shell');
  else if (power.power === null) {
    screen = power.failed ? (
      <div className="dome-card dome-card-err flex flex-col items-start gap-2 p-4">
        <p>{t('manys.computer.power.unreachable')}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => { void power.refresh(); }}>{t('manys.computer.screen.reconnect')}</Button>
      </div>
    ) : <Skeleton className="aspect-[1440/960] w-full rounded-[14px]" />;
  } else if (!running) screen = poweredOff;
  else if (expanded) {
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

      <header className="flex items-center gap-2">
        <HugeiconsIcon icon={ComputerIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <strong className="grow truncate text-sm font-semibold">{t('manys.computer.title')}</strong>
        {enabled && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={cn('size-[7px] rounded-full', running ? 'bg-success' : 'bg-muted-foreground')} />
            {power.failed ? t('manys.computer.power.unknown') : power.power ? t(`manys.computer.power.${power.power}`) : t('manys.computer.power.checking')}
          </span>
        )}
        <Button type="button" size="icon" variant="ghost" disabled={!running || !shell} aria-label={t('manys.computer.expand')} title={t('manys.computer.expand')} onClick={() => setExpanded(true)}>
          <HugeiconsIcon icon={Maximize02Icon} size={16} />
        </Button>
        {running && (
          <Button type="button" size="xs" variant="outline" disabled={power.working} title={t('manys.computer.power.stopHint')} onClick={() => { void power.stop(); }}>
            {t('manys.computer.power.stop')}
          </Button>
        )}
      </header>

      <ManyComputerWheel wheel={wheel.wheel} busy={wheel.busy} disabled={!running || !shell} onTake={() => { void take(); }} onRelease={release} />

      {screen}

      {running && (
        <>
        <Tabs value={drawer} onValueChange={(value) => setDrawer(value as Drawer)}>
          <TabsList className="h-8 w-full">
            {DRAWERS.map((id) => (
              <TabsTrigger key={id} value={id} className="h-[26px] grow text-xs">{t(`manys.computer.tabs.${id}`)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {drawer === 'terminal' && (offered('shell') || <ManyComputerTerminal manyId={manyId} human={wheel.human} busy={wheel.busy} onTakeControl={() => { void take(); }} />)}
        {drawer === 'files' && (offered('files') || <ManyComputerFiles manyId={manyId} />)}
        {drawer === 'browser' && (offered('browser') || <ManyComputerScreen manyId={manyId} human={wheel.human} onResync={wheel.resync} />)}
        {drawer === 'activity' && (
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
        </>
      )}

      <ManyComputerViewer open={expanded && running && shell} onOpenChange={setExpanded} manyId={manyId} name={many.name} wheel={wheel.wheel} busy={wheel.busy} onTake={() => { void take(); }} onRelease={release} onResync={wheel.resync} />
    </section>
  );
}
