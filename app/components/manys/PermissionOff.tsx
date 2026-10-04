import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ComputerKind } from './computerPermissions';

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
