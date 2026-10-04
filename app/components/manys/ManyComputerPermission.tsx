import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Grants } from '@/lib/manys/api';
import type { ComputerPower } from '@/lib/manys/useComputerPower';
import { cn } from '@/lib/utils';
import { COMPUTER_KINDS, computerAllows, computerEnabled, withComputerEnabled, withComputerKind, type ComputerKind } from './computerPermissions';

/** What the owner has switched off, said where they would have used it, with the way to switch it back on. */
export function PermissionOff({ kind, busy, onAllow }: { kind: ComputerKind; busy: boolean; onAllow: (kind: ComputerKind) => void }) {
  const { t } = useTranslation();
  return (
    <div className="dome-card dome-card-plain flex flex-col items-start gap-2 p-4">
      <strong className="text-sm font-semibold">{t(`manys.computer.permissions.off.${kind}Title`)}</strong>
      <p className="text-muted-foreground">{t('manys.computer.permissions.offHint')}</p>
      <Button type="button" size="sm" disabled={busy} onClick={() => onAllow(kind)}>{t('manys.computer.permissions.allow')}</Button>
    </div>
  );
}

interface Props {
  grants: Grants;
  busy: boolean;
  power: ComputerPower;
  onChange: (next: Grants) => void;
}

/** Owner-only switches for the Many's computer, and its power. Every switch applies to the agent and to the person. */
export default function ManyComputerPermission({ grants, busy, power: computer, onChange }: Props) {
  const { t } = useTranslation();
  const enabled = computerEnabled(grants);
  const { power, working, failed, start, stop } = computer;
  return (
    <section aria-label={t('manys.computer.permissions.title')} className="dome-card dome-card-plain flex flex-col gap-3 p-3.5">
      <header className="flex items-center justify-end gap-2">
        {enabled && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={cn('size-[7px] rounded-full', power === 'running' ? 'bg-success' : 'bg-muted-foreground')} />
            {failed ? t('manys.computer.power.unknown') : power ? t(`manys.computer.power.${power}`) : t('manys.computer.power.checking')}
          </span>
        )}
      </header>
      <p className="text-muted-foreground">{t('manys.computer.permissions.hint')}</p>
      <label className="flex items-center gap-2.5">
        <Checkbox checked={enabled} disabled={busy} onCheckedChange={(checked) => onChange(withComputerEnabled(grants, checked === true))} />
        <span>{t('manys.computer.permissions.enabled')}</span>
      </label>
      {COMPUTER_KINDS.map((kind) => (
        <label key={kind} className={cn('ml-6 flex items-center gap-2.5', !enabled && 'opacity-50')}>
          <Checkbox checked={computerAllows(grants, kind)} disabled={busy || !enabled} onCheckedChange={(checked) => onChange(withComputerKind(grants, kind, checked === true))} />
          <span>{t(`manys.computer.permissions.${kind}`)}</span>
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{t('manys.computer.permissions.pausesWork')}</p>
      {enabled && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={working || power === 'running' || !computerAllows(grants, 'browser')} onClick={() => { void start(); }}>{t('manys.computer.power.start')}</Button>
          <Button type="button" size="sm" variant="outline" disabled={working || power !== 'running'} onClick={() => { void stop(); }}>{t('manys.computer.power.stop')}</Button>
        </div>
      )}
      {enabled && <p className="text-xs text-muted-foreground">{t('manys.computer.power.stopHint')}</p>}
    </section>
  );
}
